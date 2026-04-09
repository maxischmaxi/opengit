import type { ScrollBoxRenderable, SelectRenderable } from "@opentui/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createPreviewSyntaxStyle,
  getPreviewTreeSitterClient,
  resolvePreviewHighlightFiletype,
} from "../app/syntax";
import { useTheme } from "../app/theme";
import {
  getProject,
  getProjectReadme,
  getRepositoryFileRaw,
  listRepositoryTree,
  type RepositoryTreeEntry,
} from "../api";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ChangeRequestList } from "../components/ChangeRequestList";
import { type ExplorerEntry } from "../components/FileExplorer";
import { Loader } from "../components/Loader";
import { ProjectOverview } from "../components/ProjectOverview";
import {
  ProjectSidebar,
  type ProjectSection,
  type ProjectSectionId,
} from "../components/ProjectSidebar";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useProviderKind } from "../hooks/useProviderKind";
import { useAppState } from "../state/AppContext";
import { formatDate } from "../util/format";
import {
  isTabBackward,
  isTabForward,
  matchesKey,
  type KeymapItem,
} from "../util/keys";

export const projectDetailKeymap: KeymapItem[] = [
  { key: "Tab", description: "Cycle panes" },
  { key: "Up / Down / j / k", description: "Navigate" },
  { key: "Enter / l", description: "Open" },
  { key: "h", description: "Parent folder" },
  { key: "r", description: "Reload overview" },
];

type FocusArea = "sidebar" | "files" | "preview" | "content";

const getProjectSections = (isGitHub: boolean): ProjectSection[] => [
  {
    id: "overview",
    label: "Project",
    description: "Files and README",
  },
  {
    id: "mergeRequests",
    label: isGitHub ? "Pull requests" : "Merge requests",
    description: isGitHub ? "Open pull requests" : "Open merge requests",
  },
  {
    id: "pipelines",
    label: "Pipelines",
    description: "Coming soon",
  },
  {
    id: "repository",
    label: "Repository",
    description: "Coming soon",
  },
  {
    id: "packageRegistry",
    label: "Package registry",
    description: "Coming soon",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Coming soon",
  },
];

const getParentPath = (path: string) => {
  const lastSlashIndex = path.lastIndexOf("/");

  if (lastSlashIndex <= 0) {
    return "";
  }

  return path.slice(0, lastSlashIndex);
};

const cycleFocusArea = (
  order: FocusArea[],
  current: FocusArea,
  direction: 1 | -1,
) => {
  const currentIndex = Math.max(0, order.indexOf(current));
  const nextIndex = (currentIndex + direction + order.length) % order.length;

  return order[nextIndex] ?? order[0] ?? current;
};

const ProjectPlaceholder = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <box flexDirection="column" gap={1}>
    <text>
      <strong>{title}</strong>
    </text>
    <EmptyState title="Coming soon" description={description} />
  </box>
);

export const ProjectDetail = ({ projectId }: { projectId: number }) => {
  const theme = useTheme();
  const providerKind = useProviderKind();
  const projectSections = useMemo(
    () => getProjectSections(providerKind === "github"),
    [providerKind],
  );
  const { dialog } = useAppState();
  const dialogOpen = dialog !== null;
  const sidebarRef = useRef<SelectRenderable>(null);
  const filesRef = useRef<ScrollBoxRenderable>(null);
  const previewRef = useRef<ScrollBoxRenderable>(null);

  const [focusArea, setFocusArea] = useState<FocusArea>("sidebar");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [repositoryPath, setRepositoryPath] = useState("");
  const [fileSelectionIndex, setFileSelectionIndex] = useState(0);
  const [openedFilePath, setOpenedFilePath] = useState<string | null>(null);

  const projectResult = useAsync(
    async () => getProject(projectId),
    [projectId],
  );
  const currentSection = projectSections[sectionIndex] ?? projectSections[0]!;
  const treeSitterClient = useMemo(() => getPreviewTreeSitterClient(), []);
  const previewSyntaxStyle = useMemo(
    () => createPreviewSyntaxStyle(theme),
    [theme],
  );

  useEffect(() => () => previewSyntaxStyle.destroy(), [previewSyntaxStyle]);

  const defaultRef = projectResult.data?.defaultBranch ?? "HEAD";
  const isOverview = currentSection.id === "overview";

  const treeResult = useAsync(async () => {
    if (!projectResult.data || !isOverview) {
      return [] as RepositoryTreeEntry[];
    }

    return listRepositoryTree(projectId, {
      ref: defaultRef,
      path: repositoryPath || undefined,
    });
  }, [projectId, currentSection.id, defaultRef, repositoryPath]);

  const readmeResult = useAsync(async () => {
    if (!projectResult.data || !isOverview) {
      return null;
    }

    return getProjectReadme(projectId, { ref: defaultRef });
  }, [projectId, currentSection.id, defaultRef]);

  const filePreviewResult = useAsync(async () => {
    if (!projectResult.data || !isOverview || !openedFilePath) {
      return null;
    }

    const content = await getRepositoryFileRaw(projectId, openedFilePath, {
      ref: defaultRef,
    });

    return {
      path: openedFilePath,
      content,
    };
  }, [projectId, currentSection.id, defaultRef, openedFilePath]);

  const explorerEntries = useMemo<ExplorerEntry[]>(() => {
    const entries: ExplorerEntry[] = [];

    if (repositoryPath) {
      entries.push({
        kind: "parent",
        key: "parent",
        name: "..",
        path: getParentPath(repositoryPath),
        displayName: "..",
      });
    }

    for (const entry of treeResult.data ?? []) {
      entries.push({
        kind: entry.type,
        key: entry.path,
        name: entry.name,
        path: entry.path,
        displayName: `${entry.name}${entry.type === "tree" ? "/" : ""}`,
      });
    }

    return entries;
  }, [treeResult.data, repositoryPath]);

  const selectedExplorerEntry = explorerEntries[fileSelectionIndex] ?? null;
  const activePreviewPath =
    openedFilePath ??
    (!repositoryPath ? (readmeResult.data?.path ?? null) : null);
  const previewHighlightFiletype = useMemo(
    () =>
      activePreviewPath
        ? resolvePreviewHighlightFiletype(activePreviewPath)
        : null,
    [activePreviewPath],
  );

  const previewParserResult = useAsync(async () => {
    if (!previewHighlightFiletype) {
      return null;
    }

    const parserAvailable = await treeSitterClient.preloadParser(
      previewHighlightFiletype,
    );

    return parserAvailable ? previewHighlightFiletype : null;
  }, [previewHighlightFiletype]);

  useEffect(() => {
    if (isOverview) {
      setFocusArea((current) => (current === "content" ? "files" : current));
      return;
    }

    setFocusArea((current) =>
      current === "files" || current === "preview" ? "content" : current,
    );
  }, [isOverview]);

  useEffect(() => {
    if (dialogOpen) {
      sidebarRef.current?.blur();
      filesRef.current?.blur();
      previewRef.current?.blur();
      return;
    }

    if (focusArea === "sidebar") {
      sidebarRef.current?.focus();
      filesRef.current?.blur();
      previewRef.current?.blur();
      return;
    }

    if (focusArea === "files") {
      sidebarRef.current?.blur();
      filesRef.current?.focus();
      previewRef.current?.blur();
      return;
    }

    if (focusArea === "preview") {
      sidebarRef.current?.blur();
      filesRef.current?.blur();
      previewRef.current?.focus();
      return;
    }

    sidebarRef.current?.blur();
    filesRef.current?.blur();
    previewRef.current?.blur();
  }, [focusArea, dialogOpen]);

  useEffect(() => {
    if (explorerEntries.length === 0) {
      setFileSelectionIndex(0);
      return;
    }

    setFileSelectionIndex((current) =>
      Math.min(current, explorerEntries.length - 1),
    );
  }, [explorerEntries.length]);

  useEffect(() => {
    setFileSelectionIndex(0);
  }, [repositoryPath]);

  useEffect(() => {
    if (focusArea !== "files") {
      return;
    }

    const selectedIndex = Math.max(
      0,
      Math.min(fileSelectionIndex, explorerEntries.length - 1),
    );
    filesRef.current?.scrollChildIntoView(`explorer-row-${selectedIndex}`);
  }, [focusArea, fileSelectionIndex, explorerEntries.length]);

  useEffect(() => {
    previewRef.current?.scrollTo(0);
  }, [openedFilePath, repositoryPath, readmeResult.data?.path]);

  const openExplorerEntry = (entry: ExplorerEntry | null) => {
    if (!entry) {
      return;
    }

    if (entry.kind === "parent") {
      setRepositoryPath(entry.path);
      setOpenedFilePath(null);
      setFileSelectionIndex(0);
      return;
    }

    if (entry.kind === "tree") {
      setRepositoryPath(entry.path);
      setOpenedFilePath(null);
      setFileSelectionIndex(0);
      return;
    }

    setOpenedFilePath(entry.path);
  };

  useDialogAwareKeyboard((key) => {
    if (isTabForward(key) || isTabBackward(key)) {
      key.preventDefault();
      key.stopPropagation();

      const order = isOverview
        ? (["sidebar", "files", "preview"] as FocusArea[])
        : (["sidebar", "content"] as FocusArea[]);

      setFocusArea((current) =>
        cycleFocusArea(order, current, isTabBackward(key) ? -1 : 1),
      );

      return;
    }

    if (focusArea === "sidebar") {
      if (matchesKey(key, { name: "up" }) || matchesKey(key, { name: "k" })) {
        key.preventDefault();
        key.stopPropagation();
        setSectionIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (matchesKey(key, { name: "down" }) || matchesKey(key, { name: "j" })) {
        key.preventDefault();
        key.stopPropagation();
        setSectionIndex((current) =>
          Math.min(projectSections.length - 1, current + 1),
        );
        return;
      }
    }

    if (isOverview && focusArea === "files") {
      if (matchesKey(key, { name: "up" }) || matchesKey(key, { name: "k" })) {
        key.preventDefault();
        key.stopPropagation();
        setFileSelectionIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (matchesKey(key, { name: "down" }) || matchesKey(key, { name: "j" })) {
        key.preventDefault();
        key.stopPropagation();
        setFileSelectionIndex((current) =>
          Math.min(explorerEntries.length - 1, current + 1),
        );
        return;
      }

      if (
        matchesKey(key, { name: "return" }) ||
        matchesKey(key, { name: "l" }) ||
        matchesKey(key, { name: "right" })
      ) {
        key.preventDefault();
        key.stopPropagation();
        openExplorerEntry(selectedExplorerEntry);
        return;
      }

      if (matchesKey(key, { name: "h" }) || matchesKey(key, { name: "left" })) {
        if (!repositoryPath) {
          return;
        }

        key.preventDefault();
        key.stopPropagation();
        setRepositoryPath(getParentPath(repositoryPath));
        setOpenedFilePath(null);
        setFileSelectionIndex(0);
        return;
      }
    }

    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      projectResult.reload();
      treeResult.reload();
      readmeResult.reload();
      filePreviewResult.reload();
    }
  });

  if (projectResult.loading) return <Loader label="Loading project…" />;
  if (projectResult.error)
    return <ErrorBanner error={projectResult.error as Error} />;
  if (!projectResult.data) {
    return (
      <EmptyState
        title="Project missing"
        description="The project could not be loaded."
      />
    );
  }

  const project = projectResult.data;
  const previewFocused = focusArea === "preview" && !dialogOpen;
  const filesBoxHeight = previewFocused
    ? Math.max(5, Math.min(8, explorerEntries.length + 2))
    : Math.max(10, Math.min(20, explorerEntries.length + 2));
  const filesPaneBackgroundColor =
    focusArea === "files" && !dialogOpen
      ? theme.colors.surfaceAlt
      : theme.colors.surface;
  const previewPaneBackgroundColor =
    focusArea === "preview" && !dialogOpen
      ? theme.colors.surfaceAlt
      : theme.colors.surface;
  const highlightFiletype = previewParserResult.data ?? undefined;
  const previewTreeSitterClient = highlightFiletype
    ? treeSitterClient
    : undefined;

  const filesFocused = focusArea === "files" && !dialogOpen;
  const previewPaneFocused = focusArea === "preview" && !dialogOpen;

  const renderPlaceholderContent = () => {
    switch (currentSection.id) {
      case "pipelines":
        return (
          <ProjectPlaceholder
            title="Pipelines"
            description="Project pipelines page will be implemented later."
          />
        );
      case "repository":
        return (
          <ProjectPlaceholder
            title="Repository"
            description="Repository details page will be implemented later."
          />
        );
      case "packageRegistry":
        return (
          <ProjectPlaceholder
            title="Package registry"
            description="Package registry page will be implemented later."
          />
        );
      case "settings":
        return (
          <ProjectPlaceholder
            title="Settings"
            description="Project settings page will be implemented later."
          />
        );
      default:
        return null;
    }
  };

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        flexShrink={0}
        height={6}
        gap={0}
      >
        <text wrapMode="none" truncate>
          <strong>{project.fullName}</strong>
        </text>
        <text fg={theme.colors.muted} wrapMode="none" truncate>
          {project.description ?? "No description"}
        </text>
        <text fg={theme.colors.muted} wrapMode="none" truncate>
          {`${project.visibility} · ${project.defaultBranch ?? "no default branch"} · Updated ${formatDate(project.lastActivityAt)}`}
        </text>
        <text fg={theme.colors.muted} wrapMode="none" truncate>
          {`${project.webUrl} · ${project.openIssuesCount} open issues · ${project.starCount} stars`}
        </text>
      </box>

      <box flexDirection="row" gap={1} flexGrow={1}>
        <ProjectSidebar
          sections={projectSections}
          selectedIndex={sectionIndex}
          focused={focusArea === "sidebar" && !dialogOpen}
          sidebarRef={sidebarRef}
          onChange={setSectionIndex}
        />

        <ProjectOverview
          visible={isOverview}
          explorerEntries={explorerEntries}
          fileSelectionIndex={fileSelectionIndex}
          filesFocused={filesFocused}
          filesLoading={treeResult.loading}
          filesError={treeResult.error}
          filesBoxHeight={filesBoxHeight}
          filesPaneBackgroundColor={filesPaneBackgroundColor}
          filesRef={filesRef}
          openedFilePath={openedFilePath}
          fileData={filePreviewResult.data}
          fileLoading={filePreviewResult.loading}
          fileError={filePreviewResult.error}
          readmeData={readmeResult.data}
          readmeLoading={readmeResult.loading}
          readmeError={readmeResult.error}
          repositoryPath={repositoryPath}
          previewFocused={previewPaneFocused}
          previewPaneBackgroundColor={previewPaneBackgroundColor}
          syntaxStyle={previewSyntaxStyle}
          treeSitterClient={previewTreeSitterClient}
          highlightFiletype={highlightFiletype}
          previewRef={previewRef}
          theme={theme}
        />
        <ChangeRequestList
          projectId={projectId}
          visible={currentSection.id === "mergeRequests"}
          focused={focusArea === "content" && !dialogOpen}
        />
        {!isOverview && currentSection.id !== "mergeRequests" ? (
          <box
            backgroundColor={theme.colors.surface}
            padding={1}
            flexGrow={1}
            flexDirection="column"
            gap={1}
          >
            <box flexDirection="column">
              <text>
                <strong>{currentSection.label}</strong>
              </text>
              <text fg={theme.colors.muted}>{currentSection.description}</text>
            </box>
            <box flexGrow={1}>{renderPlaceholderContent()}</box>
          </box>
        ) : null}
      </box>
    </box>
  );
};

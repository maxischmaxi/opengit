import type { ScrollBoxRenderable, SelectRenderable } from "@opentui/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createPreviewSyntaxStyle,
  getPreviewTreeSitterClient,
  resolvePreviewHighlightFiletype,
} from "../app/syntax";
import { getSelectThemeProps, useTheme } from "../app/theme";
import {
  getProject,
  getProjectReadme,
  getRepositoryFileRaw,
  listRepositoryTree,
  type RepositoryTreeEntry,
} from "../api/gitlab";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Loader } from "../components/Loader";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
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

type ProjectSectionId =
  | "overview"
  | "mergeRequests"
  | "pipelines"
  | "repository"
  | "packageRegistry"
  | "settings";

type ProjectSection = {
  id: ProjectSectionId;
  label: string;
  description: string;
};

type FocusArea = "sidebar" | "files" | "preview" | "content";

type ExplorerEntry = {
  kind: "parent" | "tree" | "blob";
  key: string;
  name: string;
  path: string;
  displayName: string;
};

const projectSections: ProjectSection[] = [
  {
    id: "overview",
    label: "Project",
    description: "Files and README",
  },
  {
    id: "mergeRequests",
    label: "Merge requests",
    description: "Coming soon",
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

const textFileExtensions = new Set([
  "c",
  "cc",
  "cpp",
  "css",
  "csv",
  "env",
  "go",
  "graphql",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "lock",
  "log",
  "lua",
  "md",
  "markdown",
  "mjs",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const getParentPath = (path: string) => {
  const lastSlashIndex = path.lastIndexOf("/");

  if (lastSlashIndex <= 0) {
    return "";
  }

  return path.slice(0, lastSlashIndex);
};

const isMarkdownPath = (path: string) =>
  /(?:^|\/)readme(?:\.[a-z0-9._-]+)?$/i.test(path) || /\.mdx?$/i.test(path);

const guessFiletype = (path: string) => {
  const fileName = path.split("/").pop()?.toLowerCase() ?? "";

  if (fileName === "dockerfile") return "dockerfile";
  if (fileName === "makefile") return "makefile";
  if (fileName === ".gitignore") return "gitignore";

  const extension = fileName.includes(".")
    ? fileName.split(".").pop()
    : undefined;
  return extension || undefined;
};

const isPreviewableTextFile = (path: string, content: string) => {
  if (content.includes("\u0000")) {
    return false;
  }

  if (isMarkdownPath(path)) {
    return true;
  }

  const filetype = guessFiletype(path);

  if (filetype && textFileExtensions.has(filetype)) {
    return true;
  }

  for (const character of content.slice(0, 4000)) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (
      codePoint === 0x0009 ||
      codePoint === 0x000a ||
      codePoint === 0x000d ||
      (codePoint >= 0x0020 && codePoint <= 0x007e) ||
      (codePoint >= 0x00a0 && codePoint <= 0x024f)
    ) {
      continue;
    }

    return false;
  }

  return true;
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

  const defaultRef = projectResult.data?.default_branch ?? "HEAD";
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
  const filesBoxHeight = Math.max(8, Math.min(14, explorerEntries.length + 2));
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

  const renderFilesPane = () => {
    if (treeResult.loading) {
      return <Loader label="Loading files…" />;
    }

    if (treeResult.error) {
      return <ErrorBanner error={treeResult.error as Error} />;
    }

    if (explorerEntries.length === 0) {
      return (
        <EmptyState
          title="Empty repository root"
          description="This project has no files or folders in the selected location."
        />
      );
    }

    return (
      <scrollbox
        ref={filesRef}
        focused={focusArea === "files" && !dialogOpen}
        flexGrow={1}
      >
        <box flexDirection="column" gap={0}>
          {explorerEntries.map((entry, index) => {
            const isSelected = index === fileSelectionIndex;
            const backgroundColor =
              focusArea === "files" && !isSelected
                ? theme.colors.surfaceAlt
                : theme.colors.surface;

            return (
              <box
                id={`explorer-row-${index}`}
                key={entry.key}
                backgroundColor={backgroundColor}
                paddingLeft={1}
                paddingRight={1}
                flexDirection="column"
              >
                <text
                  fg={
                    entry.kind === "tree"
                      ? theme.colors.accent
                      : entry.kind === "parent"
                        ? theme.colors.accentSoft
                        : theme.colors.text
                  }
                  wrapMode="none"
                  truncate
                >
                  {entry.displayName}
                </text>
              </box>
            );
          })}
        </box>
      </scrollbox>
    );
  };

  const renderPreviewPane = () => {
    if (openedFilePath) {
      if (filePreviewResult.loading) {
        return <Loader label="Loading file preview…" />;
      }

      if (filePreviewResult.error) {
        return <ErrorBanner error={filePreviewResult.error as Error} />;
      }

      if (!filePreviewResult.data) {
        return (
          <EmptyState
            title="Preview unavailable"
            description="The selected file could not be loaded."
          />
        );
      }

      if (isMarkdownPath(openedFilePath)) {
        return (
          <scrollbox
            ref={previewRef}
            focused={focusArea === "preview" && !dialogOpen}
            flexGrow={1}
          >
            <markdown
              content={filePreviewResult.data.content}
              syntaxStyle={previewSyntaxStyle}
              fg={theme.colors.text}
              bg={previewPaneBackgroundColor}
              tableOptions={{ borders: false, outerBorder: false }}
              treeSitterClient={previewTreeSitterClient}
            />
          </scrollbox>
        );
      }

      if (
        isPreviewableTextFile(openedFilePath, filePreviewResult.data.content)
      ) {
        return (
          <scrollbox
            ref={previewRef}
            focused={focusArea === "preview" && !dialogOpen}
            flexGrow={1}
          >
            <code
              content={filePreviewResult.data.content}
              filetype={highlightFiletype}
              syntaxStyle={previewSyntaxStyle}
              fg={theme.colors.text}
              bg={previewPaneBackgroundColor}
              treeSitterClient={previewTreeSitterClient}
            />
          </scrollbox>
        );
      }

      return (
        <EmptyState
          title="Unsupported preview"
          description="This file cannot be rendered in the terminal preview yet."
        />
      );
    }

    if (!repositoryPath) {
      if (readmeResult.loading) {
        return <Loader label="Loading README…" />;
      }

      if (readmeResult.error) {
        return <ErrorBanner error={readmeResult.error as Error} />;
      }

      if (readmeResult.data) {
        return (
          <scrollbox
            ref={previewRef}
            focused={focusArea === "preview" && !dialogOpen}
            flexGrow={1}
          >
            <markdown
              content={readmeResult.data.content}
              syntaxStyle={previewSyntaxStyle}
              fg={theme.colors.text}
              bg={previewPaneBackgroundColor}
              tableOptions={{ borders: false, outerBorder: false }}
              treeSitterClient={previewTreeSitterClient}
            />
          </scrollbox>
        );
      }

      return (
        <EmptyState
          title="No README"
          description="This project does not have a README in the repository root."
        />
      );
    }

    return (
      <EmptyState
        title="No file selected"
        description="Open a file to preview it here."
      />
    );
  };

  const renderOverview = () => (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box
        backgroundColor={filesPaneBackgroundColor}
        padding={1}
        height={filesBoxHeight}
        flexDirection="column"
      >
        {renderFilesPane()}
      </box>
      <box
        backgroundColor={previewPaneBackgroundColor}
        padding={1}
        flexGrow={1}
        flexDirection="column"
      >
        {renderPreviewPane()}
      </box>
    </box>
  );

  const renderSectionContent = () => {
    switch (currentSection.id) {
      case "overview":
        return renderOverview();
      case "mergeRequests":
        return (
          <ProjectPlaceholder
            title="Merge requests"
            description="Project merge requests page will be implemented later."
          />
        );
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
        gap={0}
      >
        <text wrapMode="none" truncate>
          <strong>{project.name_with_namespace}</strong>
        </text>
        <text fg={theme.colors.muted} wrapMode="none" truncate>
          {project.description ?? "No description"}
        </text>
        <text fg={theme.colors.muted} wrapMode="none" truncate>
          {`${project.visibility} · ${project.default_branch ?? "no default branch"} · Updated ${formatDate(project.last_activity_at)}`}
        </text>
        <text fg={theme.colors.muted} wrapMode="none" truncate>
          {`${project.web_url} · ${project.open_issues_count} open issues · ${project.star_count} stars`}
        </text>
      </box>

      <box flexDirection="row" gap={1} flexGrow={1}>
        <box
          width={28}
          backgroundColor={theme.colors.surface}
          padding={1}
          flexDirection="column"
          gap={1}
        >
          <text fg={theme.colors.muted}>Project</text>
          <select
            ref={sidebarRef}
            focused={focusArea === "sidebar" && !dialogOpen}
            flexGrow={1}
            selectedIndex={sectionIndex}
            options={projectSections.map((section) => ({
              name: section.label,
              description: section.description,
              value: section.id,
            }))}
            onChange={(index) => setSectionIndex(index)}
            onSelect={(index) => setSectionIndex(index)}
            {...getSelectThemeProps(theme)}
            backgroundColor={theme.colors.surface}
            focusedBackgroundColor={theme.colors.surfaceElevated}
          />
        </box>

        {isOverview ? (
          <box flexGrow={1}>{renderSectionContent()}</box>
        ) : (
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
            <box flexGrow={1}>{renderSectionContent()}</box>
          </box>
        )}
      </box>
    </box>
  );
};

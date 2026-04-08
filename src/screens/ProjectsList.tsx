import type { InputRenderable, SelectRenderable } from "@opentui/core";
import type { ProjectSchema } from "@gitbeaker/rest";
import { useEffect, useMemo, useRef, useState } from "react";

import { listProjects } from "../api/gitlab";
import {
  getInputThemeProps,
  getSelectThemeProps,
  useTheme,
} from "../app/theme";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Loader } from "../components/Loader";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useInputFocus } from "../hooks/useInputFocus";
import { useNavigation } from "../navigation/useNavigation";
import { useAppState } from "../state/AppContext";
import { truncate } from "../util/format";
import {
  isTabBackward,
  isTabForward,
  matchesKey,
  type KeymapItem,
} from "../util/keys";

export const projectsListKeymap: KeymapItem[] = [
  { key: "Tab", description: "Search/list focus" },
  { key: "Esc", description: "Instances" },
  { key: "/", description: "Focus search" },
  { key: "Enter", description: "Open project" },
  { key: "Up / Down / j / k", description: "Move" },
  { key: "r", description: "Reload" },
  { key: "n / p", description: "Next / previous page" },
];

type ProjectTreeNode = {
  name: string;
  path: string;
  projectCount: number;
  children: Map<string, ProjectTreeNode>;
  projects: ProjectSchema[];
};

type ProjectListEntry =
  | {
      kind: "group";
      key: string;
      label: string;
      description: string;
    }
  | {
      kind: "project";
      key: string;
      label: string;
      description: string;
      project: ProjectSchema;
    };

const createTreeNode = (name: string, path: string): ProjectTreeNode => ({
  name,
  path,
  projectCount: 0,
  children: new Map(),
  projects: [],
});

const isProjectEntry = (
  entry: ProjectListEntry | undefined,
): entry is Extract<ProjectListEntry, { kind: "project" }> =>
  entry?.kind === "project";

const getFirstProjectIndex = (entries: ProjectListEntry[]) =>
  entries.findIndex((entry) => entry.kind === "project");

const getSelectableIndex = (
  entries: ProjectListEntry[],
  index: number,
  preferredDirection: 1 | -1 = 1,
) => {
  if (entries.length === 0) return 0;
  if (isProjectEntry(entries[index])) return index;

  for (
    let candidateIndex = index + preferredDirection;
    candidateIndex >= 0 && candidateIndex < entries.length;
    candidateIndex += preferredDirection
  ) {
    if (isProjectEntry(entries[candidateIndex])) {
      return candidateIndex;
    }
  }

  for (
    let candidateIndex = index - preferredDirection;
    candidateIndex >= 0 && candidateIndex < entries.length;
    candidateIndex -= preferredDirection
  ) {
    if (isProjectEntry(entries[candidateIndex])) {
      return candidateIndex;
    }
  }

  return index;
};

const moveProjectSelection = (
  entries: ProjectListEntry[],
  currentIndex: number,
  direction: 1 | -1,
) => {
  for (
    let candidateIndex = currentIndex + direction;
    candidateIndex >= 0 && candidateIndex < entries.length;
    candidateIndex += direction
  ) {
    if (isProjectEntry(entries[candidateIndex])) {
      return candidateIndex;
    }
  }

  return currentIndex;
};

const compressGroupNode = (node: ProjectTreeNode) => {
  const labels = [node.name];
  let current = node;

  while (current.projects.length === 0 && current.children.size === 1) {
    const next = [...current.children.values()][0];

    if (!next) {
      break;
    }

    labels.push(next.name);
    current = next;
  }

  return {
    label: labels.join("/"),
    node: current,
  };
};

const buildProjectTreeEntries = (projects: ProjectSchema[]) => {
  const root = createTreeNode("", "");

  for (const project of [...projects].sort((left, right) =>
    left.path_with_namespace.localeCompare(right.path_with_namespace),
  )) {
    const segments = project.path_with_namespace.split("/").filter(Boolean);
    const groupSegments = segments.slice(0, -1);

    let node = root;
    node.projectCount += 1;

    for (const segment of groupSegments) {
      const nextPath = node.path ? `${node.path}/${segment}` : segment;
      const existing =
        node.children.get(segment) ?? createTreeNode(segment, nextPath);

      existing.projectCount += 1;
      node.children.set(segment, existing);
      node = existing;
    }

    node.projects.push(project);
  }

  const entries: ProjectListEntry[] = [];

  const visit = (node: ProjectTreeNode, prefix: string) => {
    const childGroups = [...node.children.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    const compressedGroups = childGroups.map(compressGroupNode);

    const directProjects = [...node.projects].sort((left, right) =>
      left.path.localeCompare(right.path),
    );

    const items = [
      ...compressedGroups.map((group) => ({
        kind: "group" as const,
        ...group,
      })),
      ...directProjects.map((project) => ({
        kind: "project" as const,
        project,
      })),
    ];

    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      const branchPrefix = prefix
        ? `${prefix}${isLast ? "+- " : "|- "}`
        : `${isLast ? "+- " : "|- "}`;
      const childPrefix = prefix
        ? `${prefix}${isLast ? "   " : "|  "}`
        : `${isLast ? "   " : "|  "}`;

      if (item.kind === "group") {
        entries.push({
          kind: "group",
          key: `group:${item.node.path}`,
          label: `${branchPrefix}${item.label}/`,
          description: `${item.node.projectCount} repositories`,
        });

        visit(item.node, childPrefix);
        return;
      }

      entries.push({
        kind: "project",
        key: `project:${item.project.id}`,
        label: `${branchPrefix}${item.project.path}`,
        description: truncate(
          item.project.description ?? item.project.path_with_namespace,
          120,
        ),
        project: item.project,
      });
    });
  };

  visit(root, "");

  return entries;
};

const fuzzyScore = (query: string, value: string) => {
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedValue = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const squashedQuery = normalizedQuery.replace(/ /g, "");
  const squashedValue = normalizedValue.replace(/ /g, "");

  if (!squashedQuery) return 0;
  if (!squashedValue) return -1;

  let score = 0;
  let searchIndex = 0;
  let consecutive = 0;

  for (const character of squashedQuery) {
    const foundIndex = squashedValue.indexOf(character, searchIndex);

    if (foundIndex === -1) {
      return -1;
    }

    const isConsecutive = foundIndex === searchIndex;
    consecutive = isConsecutive ? consecutive + 1 : 0;
    score += isConsecutive ? 4 + consecutive : 1;
    searchIndex = foundIndex + 1;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    score += 16;
  }

  if (squashedValue.includes(squashedQuery)) {
    score += 24;
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    score += 12;
  }

  if (squashedValue.startsWith(squashedQuery)) {
    score += 20;
  }

  return score;
};

export const ProjectsList = () => {
  const theme = useTheme();
  const { dialog } = useAppState();
  const navigation = useNavigation();
  const searchRef = useRef<InputRenderable>(null);
  const listRef = useRef<SelectRenderable>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusArea, setFocusArea] = useState<"search" | "list">("list");
  const dialogOpen = dialog !== null;
  const listFocused = focusArea === "list" && !dialogOpen;
  const listBackgroundColor = listFocused
    ? theme.colors.surfaceElevated
    : theme.colors.surface;

  useInputFocus(focusArea === "search" && !dialogOpen);

  const result = useAsync(
    async () =>
      listProjects({
        page,
        perPage: 100,
        membership: true,
      }),
    [page],
  );

  const filteredProjects = useMemo(() => {
    const items = result.data?.items ?? [];
    const normalizedSearch = search.trim();

    if (!normalizedSearch) {
      return items;
    }

    return items
      .map((project) => {
        const fields = [
          project.name_with_namespace,
          project.path_with_namespace,
          project.description ?? "",
          project.web_url,
        ];

        const score = Math.max(
          ...fields.map((field) => fuzzyScore(normalizedSearch, field)),
        );

        return { project, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.project);
  }, [result.data?.items, search]);

  const treeEntries = useMemo(
    () => buildProjectTreeEntries(filteredProjects),
    [filteredProjects],
  );

  const selectedProject = useMemo(() => {
    const entry = treeEntries[selectedIndex];
    return isProjectEntry(entry) ? entry.project : null;
  }, [treeEntries, selectedIndex]);

  useEffect(() => {
    if (treeEntries.length === 0) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((value) =>
      getSelectableIndex(treeEntries, Math.min(value, treeEntries.length - 1)),
    );
  }, [treeEntries]);

  useEffect(() => {
    const firstProjectIndex = getFirstProjectIndex(treeEntries);
    setSelectedIndex(firstProjectIndex >= 0 ? firstProjectIndex : 0);
  }, [search, treeEntries]);

  useEffect(() => {
    listRef.current?.setSelectedIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (dialogOpen) {
      searchRef.current?.blur();
      listRef.current?.blur();
      return;
    }

    if (focusArea === "search") {
      listRef.current?.blur();
      searchRef.current?.focus();
      return;
    }

    searchRef.current?.blur();
    listRef.current?.focus();
  }, [focusArea, dialogOpen]);

  useDialogAwareKeyboard((key) => {
    if (isTabForward(key) || isTabBackward(key)) {
      key.preventDefault();
      key.stopPropagation();
      setFocusArea((value) => (value === "list" ? "search" : "list"));
      return;
    }

    if (focusArea === "search" && matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      setFocusArea("list");
      return;
    }

    if (focusArea === "search") {
      return;
    }

    if (matchesKey(key, { name: "escape" })) {
      key.preventDefault();
      navigation.push({ kind: "instancePicker" });
      return;
    }

    if (matchesKey(key, { name: "/" })) {
      key.preventDefault();
      setFocusArea("search");
      return;
    }

    if (matchesKey(key, { name: "up" }) || matchesKey(key, { name: "k" })) {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIndex((value) => moveProjectSelection(treeEntries, value, -1));
      return;
    }

    if (matchesKey(key, { name: "down" }) || matchesKey(key, { name: "j" })) {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIndex((value) => moveProjectSelection(treeEntries, value, 1));
      return;
    }

    if (matchesKey(key, { name: "return" })) {
      key.preventDefault();
      key.stopPropagation();
      openSelected(selectedIndex);
      return;
    }

    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      result.reload();
      return;
    }

    if (matchesKey(key, { name: "n" }) && result.data?.pageInfo.next) {
      key.preventDefault();
      setPage(result.data.pageInfo.next);
      return;
    }

    if (matchesKey(key, { name: "p" }) && result.data?.pageInfo.previous) {
      key.preventDefault();
      setPage(result.data.pageInfo.previous);
    }
  });

  const openSelected = (index: number) => {
    const entry = treeEntries[index];
    const project = isProjectEntry(entry) ? entry.project : null;
    if (!project) return;

    navigation.push({ kind: "projectDetail", projectId: project.id });
  };

  return (
    <box flexDirection="column" gap={1} flexGrow={1}>
      <box backgroundColor={theme.colors.surface} padding={1}>
        <input
          ref={searchRef}
          value={search}
          onInput={setSearch}
          onSubmit={() => openSelected(selectedIndex)}
          focused={focusArea === "search" && !dialogOpen}
          placeholder="Search projects"
          {...getInputThemeProps(theme)}
        />
      </box>

      {result.loading ? <Loader label="Loading projects…" /> : null}
      {!result.loading && result.error ? (
        <ErrorBanner error={result.error as Error} />
      ) : null}
      {!result.loading && !result.error && filteredProjects.length === 0 ? (
        <EmptyState
          title={search.trim() ? "No matching projects" : "No projects"}
          description={
            search.trim()
              ? "Try a different fuzzy search or clear the search input."
              : "Try another search or switch the active instance."
          }
        />
      ) : null}

      {!result.loading && !result.error && result.data ? (
        <box
          backgroundColor={listBackgroundColor}
          flexGrow={1}
          flexDirection="column"
        >
          <select
            ref={listRef}
            focused={listFocused}
            flexGrow={1}
            selectedIndex={selectedIndex}
            options={treeEntries.map((entry) => ({
              name: truncate(entry.label, 96),
              description: entry.description,
              value: entry.key,
            }))}
            onChange={(index) =>
              setSelectedIndex(getSelectableIndex(treeEntries, index))
            }
            onSelect={(index) => openSelected(index)}
            {...getSelectThemeProps(theme)}
            backgroundColor={listBackgroundColor}
            focusedBackgroundColor={theme.colors.surfaceElevated}
            showDescription={false}
            itemSpacing={0}
          />
          <box
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
            backgroundColor={listBackgroundColor}
            flexDirection="column"
          >
            <text fg={theme.colors.muted} wrapMode="none" truncate>
              {selectedProject?.path_with_namespace ??
                "Select a repository to see its full path"}
            </text>
            <text fg={theme.colors.muted} wrapMode="none" truncate>
              {search.trim()
                ? `${filteredProjects.length}/${result.data.items.length} projects on page ${result.data.pageInfo.current}/${result.data.pageInfo.totalPages}`
                : `Page ${result.data.pageInfo.current}/${result.data.pageInfo.totalPages} · ${result.data.items.length} projects`}
            </text>
          </box>
        </box>
      ) : null}
    </box>
  );
};

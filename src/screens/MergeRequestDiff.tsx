import { useEffect, useMemo, useState } from "react";

import {
  getMergeRequestDiff,
  type MergeRequestDiffChange,
} from "../api/gitlab";
import { getSelectThemeProps, useTheme } from "../app/theme";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Loader } from "../components/Loader";
import { useAsync } from "../hooks/useAsync";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useAppState } from "../state/AppContext";
import { truncate } from "../util/format";
import { matchesKey, type KeymapItem } from "../util/keys";

export const mergeRequestDiffKeymap: KeymapItem[] = [
  { key: "Tab", description: "Toggle pane" },
  { key: "[ / ]", description: "Previous / next file" },
  { key: "u / s", description: "Unified / split" },
  { key: "r", description: "Reload" },
];

const buildDiffText = (change: MergeRequestDiffChange) => {
  const headerOld = change.newFile ? "/dev/null" : `a/${change.oldPath}`;
  const headerNew = change.deleted ? "/dev/null" : `b/${change.newPath}`;

  return `diff --git a/${change.oldPath} b/${change.newPath}\n--- ${headerOld}\n+++ ${headerNew}\n${change.diffText}`;
};

const guessFiletype = (path: string) => {
  const extension = path.split(".").pop();
  return extension && extension !== path ? extension : undefined;
};

export const MergeRequestDiff = ({
  projectId,
  iid,
}: {
  projectId: number;
  iid: number;
}) => {
  const theme = useTheme();
  const { dialog } = useAppState();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pane, setPane] = useState<"files" | "diff">("files");
  const [view, setView] = useState<"unified" | "split">("unified");
  const dialogOpen = dialog !== null;

  const result = useAsync(
    async () => getMergeRequestDiff(projectId, iid),
    [projectId, iid],
  );

  useEffect(() => {
    const maxIndex = Math.max(0, (result.data?.changes.length ?? 1) - 1);
    setSelectedIndex((value) => Math.min(value, maxIndex));
  }, [result.data?.changes.length]);

  useDialogAwareKeyboard((key) => {
    if (matchesKey(key, { name: "tab" })) {
      key.preventDefault();
      key.stopPropagation();
      setPane((value) => (value === "files" ? "diff" : "files"));
      return;
    }

    if (matchesKey(key, { name: "[" })) {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIndex((value) => Math.max(0, value - 1));
      return;
    }

    if (matchesKey(key, { name: "]" })) {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIndex((value) =>
        Math.min((result.data?.changes.length ?? 1) - 1, value + 1),
      );
      return;
    }

    if (matchesKey(key, { name: "u" })) {
      key.preventDefault();
      key.stopPropagation();
      setView("unified");
      return;
    }

    if (matchesKey(key, { name: "s" })) {
      key.preventDefault();
      key.stopPropagation();
      setView("split");
      return;
    }

    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      key.stopPropagation();
      result.reload();
    }
  });

  const selectedChange = result.data?.changes[selectedIndex];
  const diffText = useMemo(
    () => (selectedChange ? buildDiffText(selectedChange) : ""),
    [selectedChange],
  );

  if (result.loading) return <Loader label="Loading diff…" />;
  if (result.error) return <ErrorBanner error={result.error as Error} />;
  if (!result.data || result.data.changes.length === 0) {
    return (
      <EmptyState
        title="No diff"
        description="GitLab returned no changes for this merge request."
      />
    );
  }

  return (
    <box flexDirection="row" gap={1} flexGrow={1}>
      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        width="30%"
        flexDirection="column"
        gap={1}
      >
        <text fg={theme.colors.muted}>
          {pane === "files" ? "Files" : "Files (inactive)"}
        </text>
        <select
          focused={pane === "files" && !dialogOpen}
          flexGrow={1}
          selectedIndex={selectedIndex}
          options={result.data.changes.map((change) => ({
            name: truncate(change.newPath, 36),
            description:
              [
                change.newFile ? "new" : null,
                change.deleted ? "deleted" : null,
                change.renamed ? "renamed" : null,
              ]
                .filter(Boolean)
                .join(" · ") || change.oldPath,
            value: change.newPath,
          }))}
          onChange={(index) => setSelectedIndex(index)}
          {...getSelectThemeProps(theme)}
        />
      </box>

      <box
        backgroundColor={theme.colors.surface}
        padding={1}
        flexGrow={1}
        flexDirection="column"
        gap={1}
      >
        <text
          fg={theme.colors.muted}
        >{`${selectedChange?.newPath ?? ""} · ${view} view`}</text>
        {!selectedChange?.diffText.trim() ? (
          <EmptyState
            title="Empty diff"
            description="This file has no textual diff to render."
          />
        ) : (
          <scrollbox focused={pane === "diff" && !dialogOpen} flexGrow={1}>
            <diff
              diff={diffText}
              view={view}
              showLineNumbers
              filetype={guessFiletype(selectedChange?.newPath ?? "")}
            />
          </scrollbox>
        )}
      </box>
    </box>
  );
};

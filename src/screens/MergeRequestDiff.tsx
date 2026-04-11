import { useEffect, useMemo, useRef, useState } from "react";

import type { DiffRenderable, ScrollBoxRenderable } from "@opentui/core";

import { getChangeRequestDiff, getRepositoryFileRaw, listInlineComments, type DiffChange, type DiffPosition, type InlineComment } from "../api";
import { getSelectThemeProps, useTheme } from "../app/theme";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { Loader } from "../components/Loader";
import { useAsync } from "../hooks/useAsync";
import { formatDate } from "../util/format";
import { useDialogAwareKeyboard } from "../hooks/useDialogAwareKeyboard";
import { useInputFocus } from "../hooks/useInputFocus";
import { useApp } from "../state/AppContext";
import { useReview } from "../state/ReviewContext";
import { truncate } from "../util/format";
import { matchesKey, type KeymapItem } from "../util/keys";
import {
  buildDiffLineMap,
  buildSingleHunkDiff,
  computeGaps,
  findLineIndexInHunk,
  parseHunks,
  rebuildHunkWithContext,
  splitHunkAtPoints,
  type Hunk,
} from "../util/diff";

export const mergeRequestDiffKeymap: KeymapItem[] = [
  { key: "Tab", description: "Toggle pane" },
  { key: "[ / ]", description: "Previous / next file" },
  { key: "u / s", description: "Unified / split view" },
  { key: "+ / -", description: "Expand / collapse context" },
  { key: "Ctrl+D / Ctrl+U", description: "Half page down / up" },
  { key: "c", description: "Enter comment mode" },
  { key: "S", description: "Submit review (when drafts exist)" },
];

export const commentModeKeymap: KeymapItem[] = [
  { key: "j / k", description: "Move cursor up / down" },
  { key: "Ctrl+D / Ctrl+U", description: "Jump 10 lines down / up" },
  { key: "Space", description: "Start / end multi-line selection" },
  { key: "Enter", description: "Write comment on selected line(s)" },
  { key: "Esc", description: "Exit comment mode" },
];

const guessFiletype = (path: string) => {
  const extension = path.split(".").pop();
  return extension && extension !== path ? extension : undefined;
};

type FileContent = { old: string[]; new: string[] };

export const MergeRequestDiff = ({
  projectId,
  iid,
  sourceBranch,
  targetBranch,
}: {
  projectId: number;
  iid: number;
  sourceBranch: string;
  targetBranch: string;
}) => {
  const theme = useTheme();
  const { state: appState, dispatch } = useApp();
  const review = useReview();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pane, setPane] = useState<"files" | "diff">("files");
  const [view, setView] = useState<"unified" | "split">("unified");
  const [contextLines, setContextLines] = useState(3);
  const [expandLoading, setExpandLoading] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [cursorLine, setCursorLine] = useState(0);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const fileCacheRef = useRef(new Map<string, FileContent>());
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  const diffRefsMap = useRef(new Map<number, DiffRenderable>());
  const dialogOpen = appState.dialog !== null;

  // Block global keys (Escape/q back navigation) when in comment mode, but not when a dialog is open
  useInputFocus(commentMode && !dialogOpen);

  const result = useAsync(
    async () => getChangeRequestDiff(projectId, iid),
    [projectId, iid],
  );

  const inlineCommentsResult = useAsync(
    async () => listInlineComments(projectId, iid),
    [projectId, iid],
  );

  useEffect(() => {
    const maxIndex = Math.max(0, (result.data?.changes.length ?? 1) - 1);
    setSelectedIndex((value) => Math.min(value, maxIndex));
  }, [result.data?.changes.length]);

  // Reset context and comment mode when switching files
  useEffect(() => {
    setContextLines(3);
    setCommentMode(false);
    setCursorLine(0);
    setSelectionStart(null);
  }, [selectedIndex]);

  // Exit comment mode when dialog closes (e.g. after submitting a draft)
  useEffect(() => {
    if (!dialogOpen && commentMode) {
      setCommentMode(false);
      setCursorLine(0);
      setSelectionStart(null);
    }
  }, [dialogOpen]);

  const selectedChange = result.data?.changes[selectedIndex];

  const parsedHunks = useMemo(() => {
    if (!selectedChange?.diffText.trim()) return [];
    return parseHunks(selectedChange.diffText);
  }, [selectedChange?.diffText]);

  const expandedHunks = useMemo((): Hunk[] => {
    if (contextLines <= 3) return parsedHunks;

    const cached = selectedChange
      ? fileCacheRef.current.get(selectedChange.newPath)
      : undefined;
    if (!cached) return parsedHunks;

    const extra = contextLines - 3;
    return parsedHunks.map((hunk) =>
      rebuildHunkWithContext(hunk, cached.old, cached.new, extra),
    );
  }, [parsedHunks, contextLines, selectedChange?.newPath]);

  const expandedGaps = useMemo(
    () => computeGaps(expandedHunks),
    [expandedHunks],
  );

  const hunkDiffs = useMemo(() => {
    if (!selectedChange) return [];
    return expandedHunks.map((hunk) => buildSingleHunkDiff(selectedChange, hunk));
  }, [selectedChange, expandedHunks]);

  const diffLineMap = useMemo(
    () => buildDiffLineMap(expandedHunks),
    [expandedHunks],
  );

  // Highlight the cursor/selection in comment mode
  useEffect(() => {
    for (const diffRef of diffRefsMap.current.values()) {
      diffRef.clearAllLineColors();
    }

    if (!commentMode || diffLineMap.length === 0) return;

    const start = selectionStart !== null
      ? Math.min(selectionStart, cursorLine)
      : cursorLine;
    const end = selectionStart !== null
      ? Math.max(selectionStart, cursorLine)
      : cursorLine;

    for (let i = start; i <= end; i++) {
      const line = diffLineMap[i];
      if (!line) continue;

      const diffRef = diffRefsMap.current.get(line.hunkIndex);
      if (!diffRef) continue;

      diffRef.setLineColor(line.lineIndexInHunk, {
        content: theme.colors.accent,
        gutter: theme.colors.accent,
      });
    }
  }, [commentMode, cursorLine, selectionStart, diffLineMap, theme.colors.accent]);

  const buildPositionFromSelection = (): DiffPosition | null => {
    if (!selectedChange || diffLineMap.length === 0) return null;

    const start = selectionStart !== null
      ? Math.min(selectionStart, cursorLine)
      : cursorLine;
    const end = selectionStart !== null
      ? Math.max(selectionStart, cursorLine)
      : cursorLine;

    const startLine = diffLineMap[start];
    const endLine = diffLineMap[end];
    if (!startLine || !endLine) return null;

    const position: DiffPosition = {
      path: selectedChange.newPath,
      oldPath: selectedChange.oldPath,
    };

    // Use the end line as the primary position (API convention)
    if (endLine.newLineNumber !== undefined) {
      position.newLine = endLine.newLineNumber;
    } else {
      position.oldLine = endLine.oldLineNumber;
    }

    // Multi-line: set start
    if (start !== end) {
      if (startLine.newLineNumber !== undefined) {
        position.startNewLine = startLine.newLineNumber;
      } else {
        position.startOldLine = startLine.oldLineNumber;
      }
    }

    return position;
  };

  const fetchFileContent = async (change: DiffChange): Promise<FileContent> => {
    const cached = fileCacheRef.current.get(change.newPath);
    if (cached) return cached;

    setExpandLoading(true);
    try {
      const [oldContent, newContent] = await Promise.all([
        change.newFile
          ? Promise.resolve("")
          : getRepositoryFileRaw(projectId, change.oldPath, {
              ref: targetBranch,
            }),
        change.deleted
          ? Promise.resolve("")
          : getRepositoryFileRaw(projectId, change.newPath, {
              ref: sourceBranch,
            }),
      ]);

      const content: FileContent = {
        old: oldContent.split("\n"),
        new: newContent.split("\n"),
      };
      fileCacheRef.current.set(change.newPath, content);
      return content;
    } finally {
      setExpandLoading(false);
    }
  };

  const handleExpand = async () => {
    if (!selectedChange) return;

    // Fetch file content first if not cached
    await fetchFileContent(selectedChange);
    setContextLines((prev) => prev + 10);
  };

  useDialogAwareKeyboard((key) => {
    if (matchesKey(key, { name: "tab" })) {
      key.preventDefault();
      key.stopPropagation();
      setPane((value) => (value === "files" ? "diff" : "files"));
      return;
    }

    if (matchesKey(key, { name: "r" })) {
      key.preventDefault();
      key.stopPropagation();
      result.reload();
      return;
    }

    if (review.state.drafts.length > 0 && matchesKey(key, { sequence: "S" })) {
      key.preventDefault();
      key.stopPropagation();
      dispatch({ type: "DIALOG_OPEN", dialog: { kind: "reviewSubmit" } });
      return;
    }

    if (pane === "files") {
      if (
        matchesKey(key, { name: "[" }) ||
        matchesKey(key, { name: "up" }) ||
        matchesKey(key, { name: "k" })
      ) {
        key.preventDefault();
        key.stopPropagation();
        setSelectedIndex((value) => Math.max(0, value - 1));
        return;
      }

      if (
        matchesKey(key, { name: "]" }) ||
        matchesKey(key, { name: "down" }) ||
        matchesKey(key, { name: "j" })
      ) {
        key.preventDefault();
        key.stopPropagation();
        setSelectedIndex((value) =>
          Math.min((result.data?.changes.length ?? 1) - 1, value + 1),
        );
        return;
      }
    }

    if (pane === "diff" && commentMode && !dialogOpen) {
      if (matchesKey(key, { name: "escape" })) {
        key.preventDefault();
        key.stopPropagation();
        setCommentMode(false);
        setCursorLine(0);
        setSelectionStart(null);
        return;
      }

      if (matchesKey(key, { name: "j" }) || matchesKey(key, { name: "down" })) {
        key.preventDefault();
        key.stopPropagation();
        setCursorLine((prev) => Math.min(diffLineMap.length - 1, prev + 1));
        return;
      }

      if (matchesKey(key, { name: "k" }) || matchesKey(key, { name: "up" })) {
        key.preventDefault();
        key.stopPropagation();
        setCursorLine((prev) => Math.max(0, prev - 1));
        return;
      }

      if (matchesKey(key, { name: "space" })) {
        key.preventDefault();
        key.stopPropagation();
        setSelectionStart((prev) => (prev !== null ? null : cursorLine));
        return;
      }

      if (matchesKey(key, { name: "return" })) {
        key.preventDefault();
        key.stopPropagation();
        const position = buildPositionFromSelection();
        if (position) {
          dispatch({ type: "DIALOG_OPEN", dialog: { kind: "inlineComment", position } });
        }
        return;
      }

      if (matchesKey(key, { name: "d", ctrl: true })) {
        key.preventDefault();
        key.stopPropagation();
        setCursorLine((prev) => Math.min(diffLineMap.length - 1, prev + 10));
        return;
      }

      if (matchesKey(key, { name: "u", ctrl: true })) {
        key.preventDefault();
        key.stopPropagation();
        setCursorLine((prev) => Math.max(0, prev - 10));
        return;
      }

      return;
    }

    if (pane === "diff") {
      if (matchesKey(key, { name: "c" })) {
        key.preventDefault();
        key.stopPropagation();
        if (diffLineMap.length > 0) {
          setCommentMode(true);
          setCursorLine(0);
          setSelectionStart(null);
        }
        return;
      }

      if (matchesKey(key, { name: "d", ctrl: true })) {
        key.preventDefault();
        key.stopPropagation();
        scrollboxRef.current?.scrollBy(0.5, "viewport");
        return;
      }

      if (matchesKey(key, { name: "u", ctrl: true })) {
        key.preventDefault();
        key.stopPropagation();
        scrollboxRef.current?.scrollBy(-0.5, "viewport");
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

      if (matchesKey(key, { sequence: "+" })) {
        key.preventDefault();
        key.stopPropagation();
        void handleExpand();
        return;
      }

      if (matchesKey(key, { sequence: "-" })) {
        key.preventDefault();
        key.stopPropagation();
        setContextLines((prev) => Math.max(3, prev - 10));
        return;
      }
    }
  });

  const backgroundColor =
    pane === "files" ? theme.colors.surfaceAlt : theme.colors.surface;

  if (result.loading) return <Loader label="Loading diff…" />;
  if (result.error) return <ErrorBanner error={result.error as Error} />;
  if (!result.data || result.data.changes.length === 0) {
    return (
      <EmptyState
        title="No diff"
        description="No changes found for this merge request."
      />
    );
  }

  const filetype = guessFiletype(selectedChange?.newPath ?? "");
  const contextLabel = contextLines > 3 ? ` · context: ±${contextLines}` : "";
  const modeLabel = commentMode ? " · COMMENT MODE" : "";

  return (
    <box flexDirection="row" gap={1} flexGrow={1}>
      <box
        backgroundColor={backgroundColor}
        padding={1}
        width="30%"
        flexDirection="column"
        gap={1}
      >
        <text fg={theme.colors.muted}>Files</text>
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
          backgroundColor={backgroundColor}
          focusedBackgroundColor={backgroundColor}
        />
      </box>

      <box
        backgroundColor={
          pane === "diff" ? theme.colors.surfaceAlt : theme.colors.surface
        }
        padding={1}
        flexGrow={1}
        flexDirection="column"
        gap={1}
      >
        <text fg={commentMode ? theme.colors.accent : theme.colors.muted}>
          {`${selectedChange?.newPath ?? ""} · ${view} view${contextLabel}${modeLabel}`}
        </text>
        {expandLoading ? (
          <Loader label="Loading file content…" />
        ) : !selectedChange?.diffText.trim() ? (
          <EmptyState
            title="Empty diff"
            description="This file has no textual diff to render."
          />
        ) : hunkDiffs.length === 0 ? (
          <EmptyState
            title="Empty diff"
            description="No hunks found in this diff."
          />
        ) : (
          <scrollbox ref={scrollboxRef} focused={pane === "diff" && !dialogOpen} flexGrow={1}>
            <box flexDirection="column">
              {expandedHunks.map((hunk, index) => {
                const gap = expandedGaps[index];
                const showGap = gap && gap.hiddenLines > 0;
                const inlineComments = (inlineCommentsResult.data ?? []).filter((c) => {
                  if (c.resolved) return false;
                  if (c.position.path !== selectedChange?.newPath) return false;
                  if (c.position.newLine !== undefined) {
                    return c.position.newLine >= hunk.newStart && c.position.newLine < hunk.newStart + hunk.newCount;
                  }
                  if (c.position.oldLine !== undefined) {
                    return c.position.oldLine >= hunk.oldStart && c.position.oldLine < hunk.oldStart + hunk.oldCount;
                  }
                  return false;
                });
                const hunkDrafts = review.state.drafts.filter((d) => {
                  if (d.position.path !== selectedChange?.newPath) return false;
                  if (d.position.newLine !== undefined) {
                    return d.position.newLine >= hunk.newStart && d.position.newLine < hunk.newStart + hunk.newCount;
                  }
                  if (d.position.oldLine !== undefined) {
                    return d.position.oldLine >= hunk.oldStart && d.position.oldLine < hunk.oldStart + hunk.oldCount;
                  }
                  return false;
                });

                // Collect all comments (existing + drafts) with their split points
                type CommentItem =
                  | { kind: "inline"; comment: InlineComment }
                  | { kind: "draft"; draft: (typeof hunkDrafts)[number] };

                const allComments: { item: CommentItem; splitPoint: number }[] = [];

                for (const c of inlineComments) {
                  const sp = findLineIndexInHunk(hunk, c.position.newLine, c.position.oldLine);
                  if (sp !== null) allComments.push({ item: { kind: "inline", comment: c }, splitPoint: sp });
                }
                for (const d of hunkDrafts) {
                  const sp = findLineIndexInHunk(hunk, d.position.newLine, d.position.oldLine);
                  if (sp !== null) allComments.push({ item: { kind: "draft", draft: d }, splitPoint: sp });
                }

                const splitPoints = [...new Set(allComments.map((c) => c.splitPoint))].sort((a, b) => a - b);
                const subHunks = splitHunkAtPoints(hunk, splitPoints);

                // Interleave sub-hunks with comments
                type Segment =
                  | { type: "diff"; subHunk: Hunk }
                  | { type: "comment"; item: CommentItem };

                const segments: Segment[] = [];

                for (let s = 0; s < subHunks.length; s++) {
                  segments.push({ type: "diff", subHunk: subHunks[s]! });

                  const sp = splitPoints[s];
                  if (sp !== undefined) {
                    for (const c of allComments) {
                      if (c.splitPoint === sp) {
                        segments.push({ type: "comment", item: c.item });
                      }
                    }
                  }
                }

                return (
                  <box key={index} flexDirection="column">
                    {showGap ? (
                      <box paddingLeft={2} paddingRight={2} height={1}>
                        <text fg={theme.colors.muted} wrapMode="none">
                          {index === 0
                            ? `··· ${gap.hiddenLines} lines above (1–${gap.toLine}) ···`
                            : `··· ${gap.hiddenLines} lines hidden (${gap.fromLine}–${gap.toLine}) ···`}
                        </text>
                      </box>
                    ) : null}
                    {segments.map((seg, segIdx) =>
                      seg.type === "diff" ? (
                        <diff
                          key={`d${segIdx}`}
                          ref={(el: DiffRenderable | null) => {
                            if (el) {
                              diffRefsMap.current.set(index, el);
                            } else {
                              diffRefsMap.current.delete(index);
                            }
                          }}
                          diff={selectedChange ? buildSingleHunkDiff(selectedChange, seg.subHunk) : ""}
                          view={view}
                          showLineNumbers
                          filetype={filetype}
                        />
                      ) : seg.item.kind === "draft" ? (
                        <box
                          key={seg.item.draft.localId}
                          backgroundColor={theme.colors.surfaceElevated}
                          borderStyle="single"
                          borderColor={theme.colors.warning}
                          padding={1}
                          flexDirection="column"
                          gap={1}
                        >
                          <text fg={theme.colors.warning}>
                            {`✎ Draft · L${seg.item.draft.position.newLine ?? seg.item.draft.position.oldLine}`}
                          </text>
                          <text>{seg.item.draft.body}</text>
                        </box>
                      ) : (
                        <box
                          key={seg.item.comment.id}
                          backgroundColor={theme.colors.surfaceElevated}
                          borderStyle="single"
                          borderColor={theme.colors.accent}
                          padding={1}
                          flexDirection="column"
                          gap={1}
                        >
                          <text fg={theme.colors.accent}>
                            {`${seg.item.comment.authorName ?? "unknown"} · L${seg.item.comment.position.newLine ?? seg.item.comment.position.oldLine} · ${formatDate(seg.item.comment.createdAt)}`}
                          </text>
                          <text>{seg.item.comment.body}</text>
                          {seg.item.comment.replies.length > 0 ? (
                            <box flexDirection="column" gap={1} paddingLeft={2}>
                              {seg.item.comment.replies.map((reply) => (
                                <box
                                  key={reply.id}
                                  backgroundColor={theme.colors.surfaceAlt}
                                  padding={1}
                                  flexDirection="column"
                                >
                                  <text fg={theme.colors.muted}>
                                    {`${reply.authorName ?? "unknown"} · ${formatDate(reply.createdAt)}`}
                                  </text>
                                  <text>{reply.body}</text>
                                </box>
                              ))}
                            </box>
                          ) : null}
                        </box>
                      ),
                    )}
                  </box>
                );
              })}
              {(() => {
                const lastGap = expandedGaps[expandedGaps.length - 1];
                if (!lastGap || lastGap.hiddenLines === -1) return null;
                if (lastGap.hiddenLines <= 0) return null;
                return (
                  <box paddingLeft={2} paddingRight={2} height={1}>
                    <text fg={theme.colors.muted} wrapMode="none">
                      {`··· ${lastGap.hiddenLines} lines below (${lastGap.fromLine}–${lastGap.toLine}) ···`}
                    </text>
                  </box>
                );
              })()}
            </box>
          </scrollbox>
        )}
      </box>
    </box>
  );
};

import type { DiffChange } from "../api/types";

export type Hunk = {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
};

export type GapInfo = {
  hiddenLines: number;
  fromLine: number;
  toLine: number;
};

const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

export const parseHunks = (diffText: string): Hunk[] => {
  const hunks: Hunk[] = [];
  const lines = diffText.split("\n");

  let current: Hunk | null = null;

  for (const line of lines) {
    const match = line.match(HUNK_HEADER_RE);

    if (match) {
      if (current) hunks.push(current);

      current = {
        header: line,
        oldStart: Number(match[1]),
        oldCount: match[2] !== undefined ? Number(match[2]) : 1,
        newStart: Number(match[3]),
        newCount: match[4] !== undefined ? Number(match[4]) : 1,
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) hunks.push(current);

  // Trim trailing empty line from last hunk (artifact of split)
  for (const hunk of hunks) {
    if (hunk.lines.length > 0 && hunk.lines[hunk.lines.length - 1] === "") {
      hunk.lines.pop();
    }
  }

  return hunks;
};

export const computeGaps = (hunks: Hunk[]): GapInfo[] => {
  if (hunks.length === 0) return [];

  const gaps: GapInfo[] = [];

  // Gap before first hunk
  const firstHunk = hunks[0]!;
  const beforeFrom = 1;
  const beforeTo = firstHunk.oldStart - 1;
  gaps.push({
    hiddenLines: Math.max(0, beforeTo - beforeFrom + 1),
    fromLine: beforeFrom,
    toLine: beforeTo,
  });

  // Gaps between consecutive hunks
  for (let i = 1; i < hunks.length; i++) {
    const prev = hunks[i - 1]!;
    const curr = hunks[i]!;
    const from = prev.oldStart + prev.oldCount;
    const to = curr.oldStart - 1;
    gaps.push({
      hiddenLines: Math.max(0, to - from + 1),
      fromLine: from,
      toLine: to,
    });
  }

  // Gap after last hunk (unknown total lines, use -1)
  const lastHunk = hunks[hunks.length - 1]!;
  gaps.push({
    hiddenLines: -1,
    fromLine: lastHunk.oldStart + lastHunk.oldCount,
    toLine: -1,
  });

  return gaps;
};

export const rebuildHunkWithContext = (
  hunk: Hunk,
  oldFileLines: string[],
  _newFileLines: string[],
  extraContext: number,
): Hunk => {
  if (extraContext <= 0) return hunk;

  // Identify the changed region within the hunk
  // Walk through hunk lines to find first and last change (non-context line)
  let firstChangeIdx = -1;
  let lastChangeIdx = -1;

  for (let i = 0; i < hunk.lines.length; i++) {
    const line = hunk.lines[i]!;
    if (line.startsWith("+") || line.startsWith("-")) {
      if (firstChangeIdx === -1) firstChangeIdx = i;
      lastChangeIdx = i;
    }
  }

  // No changes found (pure context hunk) — return as-is
  if (firstChangeIdx === -1) return hunk;

  // Count existing context lines before/after the changes
  const existingContextBefore = firstChangeIdx;
  const existingContextAfter = hunk.lines.length - 1 - lastChangeIdx;

  // How many additional context lines to add
  const addBefore = Math.min(
    extraContext,
    hunk.oldStart - 1 - existingContextBefore,
  );
  const addBeforeClamped = Math.max(0, addBefore);

  // Calculate old-file end line of this hunk
  const oldEnd = hunk.oldStart + hunk.oldCount - 1;
  const addAfter = Math.min(
    extraContext,
    oldFileLines.length - oldEnd - existingContextAfter,
  );
  const addAfterClamped = Math.max(0, addAfter);

  if (addBeforeClamped === 0 && addAfterClamped === 0) return hunk;

  // Build new lines array
  const newLines: string[] = [];

  // Prepend context from old file
  const prependStart = hunk.oldStart - 1 - existingContextBefore - addBeforeClamped;
  for (let i = prependStart; i < prependStart + addBeforeClamped; i++) {
    newLines.push(` ${oldFileLines[i] ?? ""}`);
  }

  // Original hunk lines
  newLines.push(...hunk.lines);

  // Append context from old file
  const appendStart = oldEnd + existingContextAfter;
  for (let i = appendStart; i < appendStart + addAfterClamped; i++) {
    newLines.push(` ${oldFileLines[i] ?? ""}`);
  }

  // Calculate new header values
  const newOldStart = hunk.oldStart - addBeforeClamped;
  const newOldCount = hunk.oldCount + addBeforeClamped + addAfterClamped;
  const newNewStart = hunk.newStart - addBeforeClamped;
  const newNewCount = hunk.newCount + addBeforeClamped + addAfterClamped;

  const header = `@@ -${newOldStart},${newOldCount} +${newNewStart},${newNewCount} @@`;

  return {
    header,
    oldStart: newOldStart,
    oldCount: newOldCount,
    newStart: newNewStart,
    newCount: newNewCount,
    lines: newLines,
  };
};

export type DiffLine = {
  virtualIndex: number;
  hunkIndex: number;
  lineIndexInHunk: number;
  type: "add" | "remove" | "context";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
};

export const buildDiffLineMap = (hunks: Hunk[]): DiffLine[] => {
  const lines: DiffLine[] = [];

  for (let hunkIdx = 0; hunkIdx < hunks.length; hunkIdx++) {
    const hunk = hunks[hunkIdx]!;
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    for (let lineIdx = 0; lineIdx < hunk.lines.length; lineIdx++) {
      const raw = hunk.lines[lineIdx]!;
      const prefix = raw[0];

      if (prefix === "+") {
        lines.push({
          virtualIndex: lines.length,
          hunkIndex: hunkIdx,
          lineIndexInHunk: lineIdx,
          type: "add",
          newLineNumber: newLine,
          content: raw.slice(1),
        });
        newLine++;
      } else if (prefix === "-") {
        lines.push({
          virtualIndex: lines.length,
          hunkIndex: hunkIdx,
          lineIndexInHunk: lineIdx,
          type: "remove",
          oldLineNumber: oldLine,
          content: raw.slice(1),
        });
        oldLine++;
      } else {
        // Context line (space prefix or no-newline marker)
        if (raw.startsWith("\\")) continue;
        lines.push({
          virtualIndex: lines.length,
          hunkIndex: hunkIdx,
          lineIndexInHunk: lineIdx,
          type: "context",
          oldLineNumber: oldLine,
          newLineNumber: newLine,
          content: raw.slice(1),
        });
        oldLine++;
        newLine++;
      }
    }
  }

  return lines;
};

/**
 * Find the index in hunk.lines where the given new-side or old-side line number falls.
 * Returns the index AFTER that line (the split point for inserting a comment).
 */
export const findLineIndexInHunk = (
  hunk: Hunk,
  newLine?: number,
  oldLine?: number,
): number | null => {
  let currentOld = hunk.oldStart;
  let currentNew = hunk.newStart;

  for (let i = 0; i < hunk.lines.length; i++) {
    const raw = hunk.lines[i]!;
    const prefix = raw[0];

    if (prefix === "+") {
      if (newLine !== undefined && currentNew === newLine) return i + 1;
      currentNew++;
    } else if (prefix === "-") {
      if (oldLine !== undefined && currentOld === oldLine) return i + 1;
      currentOld++;
    } else if (!raw.startsWith("\\")) {
      if (newLine !== undefined && currentNew === newLine) return i + 1;
      if (oldLine !== undefined && currentOld === oldLine) return i + 1;
      currentOld++;
      currentNew++;
    }
  }

  return null;
};

/**
 * Split a hunk's lines at given split points, producing sub-hunks.
 * splitPoints is a sorted array of line indices (into hunk.lines) where to split.
 */
export const splitHunkAtPoints = (
  hunk: Hunk,
  splitPoints: number[],
): Hunk[] => {
  if (splitPoints.length === 0) return [hunk];

  const unique = [...new Set(splitPoints)].sort((a, b) => a - b);
  const subHunks: Hunk[] = [];

  let prevEnd = 0;
  let runningOld = hunk.oldStart;
  let runningNew = hunk.newStart;

  for (const splitAt of unique) {
    if (splitAt <= prevEnd || splitAt > hunk.lines.length) continue;

    const slice = hunk.lines.slice(prevEnd, splitAt);
    const { oldCount, newCount } = countLines(slice);

    subHunks.push({
      header: `@@ -${runningOld},${oldCount} +${runningNew},${newCount} @@`,
      oldStart: runningOld,
      oldCount,
      newStart: runningNew,
      newCount,
      lines: slice,
    });

    runningOld += oldCount;
    runningNew += newCount;
    prevEnd = splitAt;
  }

  // Remaining lines
  if (prevEnd < hunk.lines.length) {
    const slice = hunk.lines.slice(prevEnd);
    const { oldCount, newCount } = countLines(slice);

    subHunks.push({
      header: `@@ -${runningOld},${oldCount} +${runningNew},${newCount} @@`,
      oldStart: runningOld,
      oldCount,
      newStart: runningNew,
      newCount,
      lines: slice,
    });
  }

  return subHunks;
};

const countLines = (lines: string[]): { oldCount: number; newCount: number } => {
  let oldCount = 0;
  let newCount = 0;

  for (const line of lines) {
    const prefix = line[0];
    if (prefix === "-") {
      oldCount++;
    } else if (prefix === "+") {
      newCount++;
    } else if (!line.startsWith("\\")) {
      oldCount++;
      newCount++;
    }
  }

  return { oldCount, newCount };
};

export const buildSingleHunkDiff = (
  change: DiffChange,
  hunk: Hunk,
): string => {
  const headerOld = change.newFile ? "/dev/null" : `a/${change.oldPath}`;
  const headerNew = change.deleted ? "/dev/null" : `b/${change.newPath}`;

  return `diff --git a/${change.oldPath} b/${change.newPath}\n--- ${headerOld}\n+++ ${headerNew}\n${hunk.header}\n${hunk.lines.join("\n")}`;
};

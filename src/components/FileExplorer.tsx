import type { ScrollBoxRenderable } from "@opentui/core";
import type { RefObject } from "react";

import type { AppTheme } from "../app/theme";
import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { Loader } from "./Loader";

export type ExplorerEntry = {
  kind: "parent" | "tree" | "blob";
  key: string;
  name: string;
  path: string;
  displayName: string;
};

type FileExplorerProps = {
  entries: ExplorerEntry[];
  selectedIndex: number;
  focused: boolean;
  loading: boolean;
  error: unknown;
  theme: AppTheme;
  filesRef: RefObject<ScrollBoxRenderable | null>;
};

export const FileExplorer = ({
  entries,
  selectedIndex,
  focused,
  loading,
  error,
  theme,
  filesRef,
}: FileExplorerProps) => {
  if (loading) {
    return <Loader label="Loading files…" />;
  }

  if (error) {
    return <ErrorBanner error={error as Error} />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Empty repository root"
        description="This project has no files or folders in the selected location."
      />
    );
  }

  return (
    <scrollbox ref={filesRef} focused={focused} flexGrow={1}>
      <box flexDirection="column" gap={0}>
        {entries.map((entry, index) => {
          const isSelected = index === selectedIndex;
          const backgroundColor =
            focused && !isSelected
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

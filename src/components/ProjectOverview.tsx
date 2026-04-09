import type { ScrollBoxRenderable, SyntaxStyle, TreeSitterClient } from "@opentui/core";
import type { RefObject } from "react";

import type { AppTheme } from "../app/theme";
import type { ExplorerEntry } from "./FileExplorer";
import { FileExplorer } from "./FileExplorer";
import { FilePreview } from "./FilePreview";

type ProjectOverviewProps = {
  visible: boolean;
  explorerEntries: ExplorerEntry[];
  fileSelectionIndex: number;
  filesFocused: boolean;
  filesLoading: boolean;
  filesError: unknown;
  filesBoxHeight: number;
  filesPaneBackgroundColor: string;
  filesRef: RefObject<ScrollBoxRenderable | null>;
  openedFilePath: string | null;
  fileData: { path: string; content: string } | null | undefined;
  fileLoading: boolean;
  fileError: unknown;
  readmeData: { path: string; content: string } | null | undefined;
  readmeLoading: boolean;
  readmeError: unknown;
  repositoryPath: string;
  previewFocused: boolean;
  previewPaneBackgroundColor: string;
  syntaxStyle: SyntaxStyle;
  treeSitterClient: TreeSitterClient | undefined;
  highlightFiletype: string | undefined;
  previewRef: RefObject<ScrollBoxRenderable | null>;
  theme: AppTheme;
};

export const ProjectOverview = ({
  visible,
  explorerEntries,
  fileSelectionIndex,
  filesFocused,
  filesLoading,
  filesError,
  filesBoxHeight,
  filesPaneBackgroundColor,
  filesRef,
  openedFilePath,
  fileData,
  fileLoading,
  fileError,
  readmeData,
  readmeLoading,
  readmeError,
  repositoryPath,
  previewFocused,
  previewPaneBackgroundColor,
  syntaxStyle,
  treeSitterClient,
  highlightFiletype,
  previewRef,
  theme,
}: ProjectOverviewProps) => (
  <box
    flexDirection="column"
    gap={1}
    flexGrow={visible ? 1 : 0}
    maxWidth={visible ? undefined : 0}
    maxHeight={visible ? undefined : 0}
    overflow="hidden"
  >
    <box
      backgroundColor={filesPaneBackgroundColor}
      padding={1}
      height={filesBoxHeight}
      flexShrink={0}
      flexDirection="column"
    >
      <FileExplorer
        entries={explorerEntries}
        selectedIndex={fileSelectionIndex}
        focused={filesFocused}
        loading={filesLoading}
        error={filesError}
        theme={theme}
        filesRef={filesRef}
      />
    </box>
    <box
      backgroundColor={previewPaneBackgroundColor}
      padding={1}
      flexGrow={1}
      flexDirection="column"
    >
      <FilePreview
        openedFilePath={openedFilePath}
        fileData={fileData}
        fileLoading={fileLoading}
        fileError={fileError}
        readmeData={readmeData}
        readmeLoading={readmeLoading}
        readmeError={readmeError}
        repositoryPath={repositoryPath}
        focused={previewFocused}
        backgroundColor={previewPaneBackgroundColor}
        syntaxStyle={syntaxStyle}
        treeSitterClient={treeSitterClient}
        highlightFiletype={highlightFiletype}
        theme={theme}
        previewRef={previewRef}
      />
    </box>
  </box>
);

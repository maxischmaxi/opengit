import type { ScrollBoxRenderable, SyntaxStyle, TreeSitterClient } from "@opentui/core";
import type { RefObject } from "react";

import type { AppTheme } from "../app/theme";
import { EmptyState } from "./EmptyState";
import { ErrorBanner } from "./ErrorBanner";
import { Loader } from "./Loader";

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

type FilePreviewProps = {
  openedFilePath: string | null;
  fileData: { path: string; content: string } | null | undefined;
  fileLoading: boolean;
  fileError: unknown;
  readmeData: { path: string; content: string } | null | undefined;
  readmeLoading: boolean;
  readmeError: unknown;
  repositoryPath: string;
  focused: boolean;
  backgroundColor: string;
  syntaxStyle: SyntaxStyle;
  treeSitterClient: TreeSitterClient | undefined;
  highlightFiletype: string | undefined;
  theme: AppTheme;
  previewRef: RefObject<ScrollBoxRenderable | null>;
};

export const FilePreview = ({
  openedFilePath,
  fileData,
  fileLoading,
  fileError,
  readmeData,
  readmeLoading,
  readmeError,
  repositoryPath,
  focused,
  backgroundColor,
  syntaxStyle,
  treeSitterClient,
  highlightFiletype,
  theme,
  previewRef,
}: FilePreviewProps) => {
  if (openedFilePath) {
    if (fileLoading) {
      return <Loader label="Loading file preview…" />;
    }

    if (fileError) {
      return <ErrorBanner error={fileError as Error} />;
    }

    if (!fileData) {
      return (
        <EmptyState
          title="Preview unavailable"
          description="The selected file could not be loaded."
        />
      );
    }

    if (isMarkdownPath(openedFilePath)) {
      return (
        <scrollbox ref={previewRef} focused={focused} flexGrow={1}>
          <markdown
            content={fileData.content}
            syntaxStyle={syntaxStyle}
            fg={theme.colors.text}
            bg={backgroundColor}
            tableOptions={{ borders: false, outerBorder: false }}
            treeSitterClient={treeSitterClient}
          />
        </scrollbox>
      );
    }

    if (isPreviewableTextFile(openedFilePath, fileData.content)) {
      return (
        <scrollbox ref={previewRef} focused={focused} flexGrow={1}>
          <code
            content={fileData.content}
            filetype={highlightFiletype}
            syntaxStyle={syntaxStyle}
            fg={theme.colors.text}
            bg={backgroundColor}
            treeSitterClient={treeSitterClient}
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
    if (readmeLoading) {
      return <Loader label="Loading README…" />;
    }

    if (readmeError) {
      return <ErrorBanner error={readmeError as Error} />;
    }

    if (readmeData) {
      return (
        <scrollbox ref={previewRef} focused={focused} flexGrow={1}>
          <markdown
            content={readmeData.content}
            syntaxStyle={syntaxStyle}
            fg={theme.colors.text}
            bg={backgroundColor}
            tableOptions={{ borders: false, outerBorder: false }}
            treeSitterClient={treeSitterClient}
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

import {
  SyntaxStyle,
  getTreeSitterClient,
  type FiletypeParserOptions,
} from "@opentui/core";
import { fileURLToPath } from "node:url";

import type { AppTheme } from "./theme";

const assetPath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const extraPreviewParsers: FiletypeParserOptions[] = [
  {
    filetype: "json",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-json/queries/highlights.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-json/tree-sitter-json.wasm",
    ),
  },
  {
    filetype: "yaml",
    queries: {
      highlights: [
        assetPath(
          "../../node_modules/@tree-sitter-grammars/tree-sitter-yaml/queries/highlights.scm",
        ),
      ],
    },
    wasm: assetPath(
      "../../node_modules/@tree-sitter-grammars/tree-sitter-yaml/tree-sitter-yaml.wasm",
    ),
  },
  {
    filetype: "css",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-css/queries/highlights.scm"),
      ],
    },
    wasm: assetPath("../../node_modules/tree-sitter-css/tree-sitter-css.wasm"),
  },
  {
    filetype: "html",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-html/queries/highlights.scm"),
      ],
      injections: [
        assetPath("../../node_modules/tree-sitter-html/queries/injections.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-html/tree-sitter-html.wasm",
    ),
  },
  {
    filetype: "bash",
    aliases: ["sh", "shell", "zsh"],
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-bash/queries/highlights.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-bash/tree-sitter-bash.wasm",
    ),
  },
  {
    filetype: "toml",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-toml/queries/highlights.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-wasms/out/tree-sitter-toml.wasm",
    ),
  },
  {
    filetype: "python",
    queries: {
      highlights: [
        assetPath(
          "../../node_modules/tree-sitter-python/queries/highlights.scm",
        ),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-python/tree-sitter-python.wasm",
    ),
  },
  {
    filetype: "go",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-go/queries/highlights.scm"),
      ],
    },
    wasm: assetPath("../../node_modules/tree-sitter-go/tree-sitter-go.wasm"),
  },
  {
    filetype: "java",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-java/queries/highlights.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-java/tree-sitter-java.wasm",
    ),
  },
  {
    filetype: "rust",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-rust/queries/highlights.scm"),
      ],
      injections: [
        assetPath("../../node_modules/tree-sitter-rust/queries/injections.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-rust/tree-sitter-rust.wasm",
    ),
  },
  {
    filetype: "properties",
    aliases: ["ini", "dotenv"],
    queries: {
      highlights: [
        assetPath(
          "../../node_modules/tree-sitter-properties/queries/highlights.scm",
        ),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-properties/tree-sitter-properties.wasm",
    ),
  },
  {
    filetype: "ruby",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-ruby/queries/highlights.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-ruby/tree-sitter-ruby.wasm",
    ),
  },
  {
    filetype: "php",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-php/queries/highlights.scm"),
      ],
      injections: [
        assetPath("../../node_modules/tree-sitter-php/queries/injections.scm"),
      ],
    },
    wasm: assetPath("../../node_modules/tree-sitter-php/tree-sitter-php.wasm"),
  },
  {
    filetype: "c",
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-c/queries/highlights.scm"),
      ],
    },
    wasm: assetPath("../../node_modules/tree-sitter-c/tree-sitter-c.wasm"),
  },
  {
    filetype: "cpp",
    aliases: ["cxx"],
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-cpp/queries/highlights.scm"),
      ],
      injections: [
        assetPath("../../node_modules/tree-sitter-cpp/queries/injections.scm"),
      ],
    },
    wasm: assetPath("../../node_modules/tree-sitter-cpp/tree-sitter-cpp.wasm"),
  },
  {
    filetype: "powershell",
    aliases: ["ps1", "pwsh"],
    queries: {
      highlights: [
        assetPath(
          "../../node_modules/tree-sitter-powershell/queries/highlights.scm",
        ),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-powershell/tree-sitter-powershell.wasm",
    ),
  },
  {
    filetype: "make",
    aliases: ["makefile"],
    queries: {
      highlights: [
        assetPath("../../node_modules/tree-sitter-make/queries/highlights.scm"),
      ],
    },
    wasm: assetPath(
      "../../node_modules/tree-sitter-make/tree-sitter-make.wasm",
    ),
  },
];

let previewParsersRegistered = false;

const previewStyleEntries = (theme: AppTheme) => [
  {
    scope: ["comment", "comment.documentation"],
    style: { foreground: theme.colors.muted, dim: true },
  },
  {
    scope: ["keyword", "keyword.function", "keyword.operator"],
    style: { foreground: theme.colors.accent, bold: true },
  },
  {
    scope: ["string", "string.special"],
    style: { foreground: theme.colors.success },
  },
  {
    scope: ["number", "number.float", "boolean"],
    style: { foreground: theme.colors.warning, bold: true },
  },
  {
    scope: ["constant", "constant.builtin"],
    style: { foreground: theme.colors.warning, bold: true },
  },
  {
    scope: ["function", "function.builtin", "method", "constructor"],
    style: { foreground: theme.colors.accentSoft, bold: true },
  },
  {
    scope: ["function.macro", "macro", "constant.macro"],
    style: { foreground: theme.colors.accentSoft, bold: true },
  },
  {
    scope: ["type", "type.builtin", "class", "interface", "struct", "enum"],
    style: { foreground: theme.colors.warning, bold: true },
  },
  {
    scope: ["type.qualifier", "storageclass", "modifier", "lifetime"],
    style: { foreground: theme.colors.warning, bold: true },
  },
  {
    scope: ["property", "field", "variable", "parameter"],
    style: { foreground: theme.colors.text },
  },
  {
    scope: ["variable.builtin", "self", "self.builtin", "this", "super"],
    style: { foreground: theme.colors.accentSoft, bold: true },
  },
  {
    scope: ["operator", "punctuation", "delimiter"],
    style: { foreground: theme.colors.muted },
  },
  {
    scope: ["preproc", "keyword.directive", "include"],
    style: { foreground: theme.colors.accent, bold: true },
  },
  {
    scope: ["tag", "attribute", "namespace", "label", "module", "title"],
    style: { foreground: theme.colors.accentSoft, bold: true },
  },
  {
    scope: ["markup.heading"],
    style: { foreground: theme.colors.accent, bold: true },
  },
  {
    scope: ["markup.strong"],
    style: { foreground: theme.colors.text, bold: true },
  },
  {
    scope: ["markup.italic"],
    style: { foreground: theme.colors.text, italic: true },
  },
  {
    scope: ["markup.strikethrough"],
    style: { foreground: theme.colors.muted, dim: true },
  },
  {
    scope: ["markup.raw"],
    style: { foreground: theme.colors.warning },
  },
  {
    scope: ["markup.link", "markup.link.label"],
    style: { foreground: theme.colors.accentSoft },
  },
  {
    scope: ["markup.link.url"],
    style: { foreground: theme.colors.accentSoft, underline: true },
  },
  {
    scope: ["markup.list"],
    style: { foreground: theme.colors.accentSoft },
  },
  {
    scope: ["markup.quote"],
    style: { foreground: theme.colors.muted, dim: true },
  },
  {
    scope: ["escape"],
    style: { foreground: theme.colors.warning },
  },
  {
    scope: ["error"],
    style: { foreground: theme.colors.error, bold: true },
  },
];

export const createPreviewSyntaxStyle = (theme: AppTheme) =>
  SyntaxStyle.fromTheme(previewStyleEntries(theme));

export const getPreviewTreeSitterClient = () => {
  const client = getTreeSitterClient();

  if (!previewParsersRegistered) {
    for (const parser of extraPreviewParsers) {
      client.addFiletypeParser(parser);
    }

    previewParsersRegistered = true;
  }

  return client;
};

export const resolvePreviewHighlightFiletype = (path: string) => {
  const fileName = path.split("/").pop()?.toLowerCase() ?? "";

  if (
    /(?:^|\/)readme(?:\.[a-z0-9._-]+)?$/i.test(path) ||
    /\.mdx?$/i.test(fileName)
  ) {
    return "markdown";
  }

  if (
    fileName.endsWith(".tsx") ||
    fileName.endsWith(".mtsx") ||
    fileName.endsWith(".ctsx")
  ) {
    return "typescriptreact";
  }

  if (
    fileName.endsWith(".ts") ||
    fileName.endsWith(".mts") ||
    fileName.endsWith(".cts")
  ) {
    return "typescript";
  }

  if (fileName.endsWith(".jsx")) {
    return "javascriptreact";
  }

  if (
    fileName.endsWith(".js") ||
    fileName.endsWith(".mjs") ||
    fileName.endsWith(".cjs")
  ) {
    return "javascript";
  }

  if (fileName.endsWith(".json")) {
    return "json";
  }

  if (fileName.endsWith(".py")) {
    return "python";
  }

  if (fileName.endsWith(".go")) {
    return "go";
  }

  if (fileName.endsWith(".java")) {
    return "java";
  }

  if (fileName.endsWith(".rs")) {
    return "rust";
  }

  if (
    fileName === "dockerfile" ||
    fileName.endsWith(".dockerfile") ||
    fileName === "containerfile"
  ) {
    return "bash";
  }

  if (fileName === "makefile" || fileName.endsWith(".mk")) {
    return "make";
  }

  if (fileName === "procfile") {
    return "bash";
  }

  if (fileName === "cmakelists.txt" || fileName.endsWith(".cmake")) {
    return "cpp";
  }

  if (
    fileName.endsWith(".rb") ||
    fileName === "gemfile" ||
    fileName === "rakefile"
  ) {
    return "ruby";
  }

  if (fileName.endsWith(".php") || fileName.endsWith(".phtml")) {
    return "php";
  }

  if (fileName.endsWith(".c") || fileName.endsWith(".h")) {
    return "c";
  }

  if (
    fileName.endsWith(".cc") ||
    fileName.endsWith(".cpp") ||
    fileName.endsWith(".cxx") ||
    fileName.endsWith(".hpp") ||
    fileName.endsWith(".hh") ||
    fileName.endsWith(".hxx")
  ) {
    return "cpp";
  }

  if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
    return "yaml";
  }

  if (fileName.endsWith(".css")) {
    return "css";
  }

  if (fileName.endsWith(".html") || fileName.endsWith(".htm")) {
    return "html";
  }

  if (fileName.endsWith(".vue")) {
    return "html";
  }

  if (
    fileName.endsWith(".sh") ||
    fileName.endsWith(".bash") ||
    fileName.endsWith(".zsh") ||
    fileName === "bashrc" ||
    fileName === ".bashrc" ||
    fileName === ".zshrc"
  ) {
    return "bash";
  }

  if (
    fileName.endsWith(".ps1") ||
    fileName.endsWith(".psm1") ||
    fileName.endsWith(".psd1")
  ) {
    return "powershell";
  }

  if (fileName.endsWith(".toml")) {
    return "toml";
  }

  if (
    fileName.endsWith(".ini") ||
    fileName.endsWith(".properties") ||
    fileName.endsWith(".conf") ||
    fileName.endsWith(".cfg") ||
    fileName === ".env" ||
    fileName.startsWith(".env.")
  ) {
    return "properties";
  }

  if (fileName.endsWith(".zig")) {
    return "zig";
  }

  return null;
};

import type { KeyEvent } from "@opentui/core";

export type KeymapItem = {
  key: string;
  description: string;
};

type KeyMatcher = {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
};

export const GLOBAL_KEYMAP: KeymapItem[] = [
  { key: "Ctrl+C", description: "Exit" },
  { key: "Ctrl+O", description: "Settings" },
  { key: "?", description: "Help" },
  { key: "Esc / q", description: "Back" },
  { key: "Ctrl+I", description: "Instances" },
];

export const matchesKey = (key: KeyEvent, matcher: KeyMatcher) => {
  if (matcher.name && key.name !== matcher.name) return false;
  if (matcher.sequence && key.sequence !== matcher.sequence) return false;
  if (matcher.ctrl !== undefined && key.ctrl !== matcher.ctrl) return false;
  if (matcher.shift !== undefined && key.shift !== matcher.shift) return false;
  if (matcher.meta !== undefined && key.meta !== matcher.meta) return false;
  return true;
};

export const isEnter = (key: KeyEvent) => matchesKey(key, { name: "return" });

export const isQuestionMark = (key: KeyEvent) =>
  key.sequence === "?" || (key.name === "/" && key.shift) || key.name === "?";

export const isTabForward = (key: KeyEvent) =>
  matchesKey(key, { name: "tab", shift: false, ctrl: false, meta: false });

export const isTabBackward = (key: KeyEvent) =>
  matchesKey(key, { name: "tab", shift: true, ctrl: false, meta: false });

export const getPrintableCharacter = (key: KeyEvent) => {
  if (key.ctrl || key.meta || key.sequence.length !== 1) {
    return null;
  }

  const codePoint = key.sequence.codePointAt(0);

  if (!codePoint || codePoint < 32 || codePoint === 127) {
    return null;
  }

  return key.sequence;
};

export const formatKeymapHint = (items: KeymapItem[]) =>
  items.map((item) => `${item.key} ${item.description}`).join("  •  ");

import { access, chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getConfigDir } from "../config/paths";
import type { Screen } from "./screens";

const getSessionPath = () => join(getConfigDir(), "session.json");

const EPHEMERAL_KINDS: Set<Screen["kind"]> = new Set([
  "wizard",
  "commentCompose",
]);

const filterPersistableStack = (stack: Screen[]): Screen[] =>
  stack.filter((screen) => !EPHEMERAL_KINDS.has(screen.kind));

export const loadSession = async (): Promise<Screen[] | null> => {
  const filePath = getSessionPath();

  try {
    await access(filePath);
  } catch {
    return null;
  }

  try {
    const raw = await Bun.file(filePath).text();
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const valid = parsed.every(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "kind" in item &&
        typeof (item as Record<string, unknown>).kind === "string",
    );

    if (!valid) return null;

    // Migration: "comments" tab was merged into "overview"
    for (const screen of parsed as Record<string, unknown>[]) {
      if (screen.kind === "mrDetail" && screen.tab === "comments") {
        screen.tab = "overview";
      }
    }

    return parsed as Screen[];
  } catch {
    return null;
  }
};

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

const writeSessionToDisk = async (stack: Screen[]): Promise<void> => {
  const persistable = filterPersistableStack(stack);
  if (persistable.length === 0) return;

  try {
    const filePath = getSessionPath();
    const body = JSON.stringify(persistable, null, 2) + "\n";
    await writeFile(filePath, body, { mode: 0o600 });
    await chmod(filePath, 0o600);
  } catch {
    // best-effort — silently ignore write failures
  }
};

export const saveSession = (stack: Screen[]): void => {
  if (pendingTimer) clearTimeout(pendingTimer);

  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void writeSessionToDisk(stack);
  }, 300);
};

export const flushSession = (): void => {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
};

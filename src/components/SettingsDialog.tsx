import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";

import {
  getInputThemeProps,
  getSelectThemeProps,
  getTheme,
  useTheme,
  type ThemeName,
} from "../app/theme";
import { useInputFocus } from "../hooks/useInputFocus";
import {
  getPrintableCharacter,
  isTabBackward,
  isTabForward,
  matchesKey,
  type KeymapItem,
} from "../util/keys";
import { DialogFrame } from "./DialogFrame";

type SettingsEntry = {
  id: "theme";
  title: string;
  description: string;
  keywords: string[];
};

export const settingsDialogKeymap: KeymapItem[] = [
  { key: "Type", description: "Focus search" },
  { key: "Up / Down", description: "Move" },
  { key: "Tab", description: "Search/list focus" },
  { key: "Enter", description: "Open" },
  { key: "Esc", description: "Close" },
];

const baseEntries: SettingsEntry[] = [
  {
    id: "theme",
    title: "Theme",
    description: "Choose the active color theme",
    keywords: ["theme", "appearance", "colors", "palette", "ui"],
  },
];

export const SettingsDialog = ({
  currentThemeName,
  onOpenTheme,
}: {
  currentThemeName: ThemeName;
  onOpenTheme: () => void;
}) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusMode, setFocusMode] = useState<"list" | "search">("list");

  useInputFocus(focusMode === "search");

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const currentTheme = getTheme(currentThemeName);

    const entries = baseEntries.map((entry) => ({
      ...entry,
      description: `${entry.description} · Current: ${currentTheme.label}`,
    }));

    if (!normalizedSearch) {
      return entries;
    }

    return entries.filter((entry) =>
      [entry.title, entry.description, ...entry.keywords].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [search, currentThemeName]);

  useEffect(() => {
    const maxIndex = Math.max(0, filteredEntries.length - 1);
    setSelectedIndex((value) => Math.min(value, maxIndex));
  }, [filteredEntries.length]);

  const activateSelected = (index = selectedIndex) => {
    const selected = filteredEntries[index];

    if (!selected) {
      return;
    }

    if (selected.id === "theme") {
      onOpenTheme();
    }
  };

  useKeyboard((key) => {
    if (isTabForward(key) || isTabBackward(key)) {
      key.preventDefault();
      key.stopPropagation();
      setFocusMode((value) => (value === "list" ? "search" : "list"));
      return;
    }

    if (focusMode === "list") {
      const character = getPrintableCharacter(key);

      if (character) {
        key.preventDefault();
        key.stopPropagation();
        setSearch((value) => `${value}${character}`);
        setFocusMode("search");
      }

      return;
    }

    if (matchesKey(key, { name: "down" }) || matchesKey(key, { name: "up" })) {
      key.preventDefault();
      key.stopPropagation();
      setFocusMode("list");
      return;
    }

    if (matchesKey(key, { name: "return" })) {
      key.preventDefault();
      key.stopPropagation();
      activateSelected();
    }
  });

  return (
    <DialogFrame
      title="Settings"
      subtitle="Search and change app preferences"
      footer={
        focusMode === "list"
          ? "Start typing to jump into search"
          : "Arrow down returns to the list"
      }
      preferredWidth={76}
      preferredHeight={18}
    >
      <box backgroundColor={theme.colors.surfaceAlt} padding={1}>
        <input
          value={search}
          onInput={(value) => {
            setSearch(value);
            setFocusMode("search");
          }}
          onSubmit={() => activateSelected()}
          focused={focusMode === "search"}
          placeholder="Search settings"
          {...getInputThemeProps(theme)}
        />
      </box>

      {filteredEntries.length === 0 ? (
        <box backgroundColor={theme.colors.surfaceAlt} padding={1} flexGrow={1}>
          <text fg={theme.colors.muted}>{`No settings match "${search}"`}</text>
        </box>
      ) : (
        <box backgroundColor={theme.colors.surfaceAlt} padding={1} flexGrow={1}>
          <select
            focused={focusMode === "list"}
            flexGrow={1}
            selectedIndex={selectedIndex}
            options={filteredEntries.map((entry) => ({
              name: entry.title,
              description: entry.description,
              value: entry.id,
            }))}
            onChange={(index) => setSelectedIndex(index)}
            onSelect={(index) => activateSelected(index)}
            {...getSelectThemeProps(theme)}
          />
        </box>
      )}
    </DialogFrame>
  );
};

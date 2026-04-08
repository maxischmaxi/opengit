import { useEffect, useMemo, useState } from "react";

import {
  THEME_OPTIONS,
  getSelectThemeProps,
  getTheme,
  useTheme,
  type ThemeName,
} from "../app/theme";
import type { KeymapItem } from "../util/keys";
import { DialogFrame } from "./DialogFrame";

export const themeDialogKeymap: KeymapItem[] = [
  { key: "Up / Down", description: "Move" },
  { key: "Enter", description: "Apply theme" },
  { key: "Esc", description: "Close" },
];

export const ThemeDialog = ({
  currentThemeName,
  onSelectTheme,
}: {
  currentThemeName: ThemeName;
  onSelectTheme: (themeName: ThemeName) => void;
}) => {
  const theme = useTheme();
  const currentIndex = Math.max(
    0,
    THEME_OPTIONS.findIndex((option) => option.name === currentThemeName),
  );
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);

  useEffect(() => {
    setSelectedIndex(currentIndex);
  }, [currentIndex]);

  const selectedThemeName =
    THEME_OPTIONS[selectedIndex]?.name ?? currentThemeName;
  const selectedTheme = useMemo(
    () => getTheme(selectedThemeName),
    [selectedThemeName],
  );

  return (
    <DialogFrame
      title="Theme"
      subtitle="Choose one of the supported standard themes"
      footer="Enter saves the selected theme immediately"
      preferredWidth={68}
      preferredHeight={18}
    >
      <box
        backgroundColor={theme.colors.surfaceAlt}
        padding={1}
        flexDirection="column"
        gap={1}
      >
        <text>
          <strong>{selectedTheme.label}</strong>
        </text>
        <text fg={theme.colors.muted}>{selectedTheme.description}</text>
        <box flexDirection="row" gap={1}>
          <box
            width={6}
            height={1}
            backgroundColor={selectedTheme.colors.surfaceAlt}
          />
          <box
            width={6}
            height={1}
            backgroundColor={selectedTheme.colors.accent}
          />
          <box
            width={6}
            height={1}
            backgroundColor={selectedTheme.colors.accentSoft}
          />
          <box
            width={6}
            height={1}
            backgroundColor={selectedTheme.colors.success}
          />
          <box
            width={6}
            height={1}
            backgroundColor={selectedTheme.colors.error}
          />
        </box>
      </box>

      <box backgroundColor={theme.colors.surfaceAlt} padding={1} flexGrow={1}>
        <select
          focused
          flexGrow={1}
          selectedIndex={selectedIndex}
          options={THEME_OPTIONS.map((option) => ({
            name: option.label,
            description: option.description,
            value: option.name,
          }))}
          onChange={(index) => setSelectedIndex(index)}
          onSelect={(index) => {
            const nextThemeName = THEME_OPTIONS[index]?.name;

            if (nextThemeName) {
              onSelectTheme(nextThemeName);
            }
          }}
          {...getSelectThemeProps(theme)}
        />
      </box>
    </DialogFrame>
  );
};

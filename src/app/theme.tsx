import { createContext, useContext, useMemo } from "react";

export type ThemeName = "tokyo-night" | "dracula" | "nord" | "gruvbox-dark" | "catppuccin-mocha";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  overlay: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  success: string;
  error: string;
  warning: string;
};

export type AppTheme = {
  name: ThemeName;
  label: string;
  description: string;
  colors: ThemeColors;
};

const themes: Record<ThemeName, AppTheme> = {
  "tokyo-night": {
    name: "tokyo-night",
    label: "Tokyo Night",
    description: "Cool blue developer theme with deep contrast",
    colors: {
      background: "#1a1b26",
      surface: "#1f2335",
      surfaceAlt: "#24283b",
      surfaceElevated: "#292e42",
      overlay: "#16161f",
      border: "#414868",
      borderStrong: "#7aa2f7",
      accent: "#7aa2f7",
      accentSoft: "#2ac3de",
      text: "#c0caf5",
      muted: "#a9b1d6",
      success: "#9ece6a",
      error: "#f7768e",
      warning: "#e0af68",
    },
  },
  dracula: {
    name: "dracula",
    label: "Dracula",
    description: "Purple neon classic with strong highlights",
    colors: {
      background: "#1e1f29",
      surface: "#282a36",
      surfaceAlt: "#343746",
      surfaceElevated: "#44475a",
      overlay: "#171821",
      border: "#6272a4",
      borderStrong: "#bd93f9",
      accent: "#bd93f9",
      accentSoft: "#8be9fd",
      text: "#f8f8f2",
      muted: "#b6b6c3",
      success: "#50fa7b",
      error: "#ff5555",
      warning: "#ffb86c",
    },
  },
  nord: {
    name: "nord",
    label: "Nord",
    description: "Arctic dark palette with soft blue accents",
    colors: {
      background: "#2e3440",
      surface: "#3b4252",
      surfaceAlt: "#434c5e",
      surfaceElevated: "#4c566a",
      overlay: "#262c37",
      border: "#5e81ac",
      borderStrong: "#88c0d0",
      accent: "#88c0d0",
      accentSoft: "#81a1c1",
      text: "#eceff4",
      muted: "#d8dee9",
      success: "#a3be8c",
      error: "#bf616a",
      warning: "#ebcb8b",
    },
  },
  "gruvbox-dark": {
    name: "gruvbox-dark",
    label: "Gruvbox Dark",
    description: "Warm retro terminal colors with earthy contrast",
    colors: {
      background: "#282828",
      surface: "#32302f",
      surfaceAlt: "#3c3836",
      surfaceElevated: "#504945",
      overlay: "#1d2021",
      border: "#665c54",
      borderStrong: "#83a598",
      accent: "#83a598",
      accentSoft: "#fabd2f",
      text: "#ebdbb2",
      muted: "#d5c4a1",
      success: "#b8bb26",
      error: "#fb4934",
      warning: "#fe8019",
    },
  },
  "catppuccin-mocha": {
    name: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    description: "Modern pastel dark theme with soft surfaces",
    colors: {
      background: "#1e1e2e",
      surface: "#181825",
      surfaceAlt: "#313244",
      surfaceElevated: "#45475a",
      overlay: "#11111b",
      border: "#585b70",
      borderStrong: "#89b4fa",
      accent: "#89b4fa",
      accentSoft: "#cba6f7",
      text: "#cdd6f4",
      muted: "#bac2de",
      success: "#a6e3a1",
      error: "#f38ba8",
      warning: "#f9e2af",
    },
  },
};

export const DEFAULT_THEME_NAME: ThemeName = "tokyo-night";

export const THEME_OPTIONS = Object.values(themes).map(({ name, label, description }) => ({
  name,
  label,
  description,
}));

export const isThemeName = (value: string): value is ThemeName => value in themes;

export const getTheme = (themeName?: ThemeName | null) =>
  (themeName ? themes[themeName] : null) ?? themes[DEFAULT_THEME_NAME];

const ThemeContext = createContext<AppTheme | null>(null);

export const ThemeProvider = ({
  themeName,
  children,
}: {
  themeName: ThemeName;
  children: React.ReactNode;
}) => {
  const theme = useMemo(() => getTheme(themeName), [themeName]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
};

export const getInputThemeProps = (theme: AppTheme) => ({
  backgroundColor: theme.colors.surfaceAlt,
  focusedBackgroundColor: theme.colors.surfaceElevated,
  textColor: theme.colors.text,
  focusedTextColor: theme.colors.text,
  placeholderColor: theme.colors.muted,
});

export const getTextareaThemeProps = getInputThemeProps;

export const getSelectThemeProps = (theme: AppTheme) => ({
  backgroundColor: theme.colors.surfaceAlt,
  focusedBackgroundColor: theme.colors.surfaceElevated,
  textColor: theme.colors.text,
  focusedTextColor: theme.colors.text,
  selectedBackgroundColor: theme.colors.accent,
  selectedTextColor: theme.colors.background,
  descriptionColor: theme.colors.muted,
  selectedDescriptionColor: theme.colors.background,
  showScrollIndicator: true,
});

export const getTabSelectThemeProps = (theme: AppTheme) => ({
  backgroundColor: theme.colors.surfaceAlt,
  focusedBackgroundColor: theme.colors.surfaceElevated,
  textColor: theme.colors.text,
  focusedTextColor: theme.colors.text,
  selectedBackgroundColor: theme.colors.accent,
  selectedTextColor: theme.colors.background,
  selectedDescriptionColor: theme.colors.background,
  showUnderline: false,
});

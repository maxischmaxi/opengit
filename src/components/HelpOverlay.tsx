import { useTheme } from "../app/theme";
import type { KeymapItem } from "../util/keys";

const renderKeymaps = (accentColor: string, items: KeymapItem[]) =>
  items.map((item) => (
    <box key={`${item.key}-${item.description}`} flexDirection="row" gap={2}>
      <text fg={accentColor}>{item.key}</text>
      <text>{item.description}</text>
    </box>
  ));

export const HelpOverlay = ({
  title,
  screenKeymap,
  globalKeymap,
}: {
  title: string;
  screenKeymap: KeymapItem[];
  globalKeymap: KeymapItem[];
}) => {
  const theme = useTheme();

  return (
    <box
      backgroundColor={theme.colors.surface}
      padding={1}
      flexDirection="column"
      gap={1}
      flexGrow={1}
    >
      <text>
        <strong>Help</strong>
        {`  ${title}`}
      </text>
      <text fg={theme.colors.muted}>Press ? again to close</text>
      <box flexDirection="column" gap={1}>
        <text fg={theme.colors.accent}>Global</text>
        {renderKeymaps(theme.colors.accent, globalKeymap)}
      </box>
      <box flexDirection="column" gap={1}>
        <text fg={theme.colors.accent}>Current Screen</text>
        {renderKeymaps(theme.colors.accent, screenKeymap)}
      </box>
    </box>
  );
};

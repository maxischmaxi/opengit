import { useTheme } from "../app/theme";
import { useInputFocus } from "../hooks/useInputFocus";
import type { KeymapItem } from "../util/keys";
import { DialogFrame } from "./DialogFrame";

export type KeymapSection = {
  title: string;
  items: KeymapItem[];
};

const renderKeymaps = (accentColor: string, textColor: string, items: KeymapItem[]) =>
  items.map((item) => (
    <box key={`${item.key}-${item.description}`} flexDirection="row" gap={2}>
      <text fg={accentColor}>{item.key.padEnd(20)}</text>
      <text fg={textColor}>{item.description}</text>
    </box>
  ));

export const HelpOverlay = ({
  title,
  sections,
  globalKeymap,
}: {
  title: string;
  sections: KeymapSection[];
  globalKeymap: KeymapItem[];
}) => {
  const theme = useTheme();

  useInputFocus(true);

  return (
    <DialogFrame
      title="Help"
      subtitle={title}
      footer="Esc to close"
      preferredWidth={60}
      preferredHeight={30}
    >
      <scrollbox focused flexGrow={1}>
        <box flexDirection="column" gap={1}>
          {sections.map((section) => (
            <box key={section.title} flexDirection="column">
              <text fg={theme.colors.muted}>{section.title}</text>
              {renderKeymaps(theme.colors.accent, theme.colors.text, section.items)}
            </box>
          ))}
          <box flexDirection="column">
            <text fg={theme.colors.muted}>Global</text>
            {renderKeymaps(theme.colors.accent, theme.colors.text, globalKeymap)}
          </box>
        </box>
      </scrollbox>
    </DialogFrame>
  );
};

import { RGBA } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";

import { useTheme } from "../app/theme";

export const DialogFrame = ({
  title,
  subtitle,
  footer,
  preferredWidth,
  preferredHeight,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: string;
  preferredWidth: number;
  preferredHeight: number;
  children: React.ReactNode;
}) => {
  const theme = useTheme();
  const { width, height } = useTerminalDimensions();

  const dialogWidth = Math.max(
    32,
    Math.min(Math.max(32, width - 4), preferredWidth),
  );
  const dialogHeight = Math.max(
    10,
    Math.min(Math.max(10, height - 4), preferredHeight),
  );

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={100}
      alignItems="center"
      justifyContent="center"
      backgroundColor={RGBA.fromInts(0, 0, 0, 77)}
    >
      <box
        width={dialogWidth}
        height={dialogHeight}
        backgroundColor={theme.colors.surface}
        padding={1}
        flexDirection="column"
        gap={1}
      >
        <box flexDirection="column">
          <text>
            <strong>{title}</strong>
          </text>
          {subtitle ? <text fg={theme.colors.muted}>{subtitle}</text> : null}
        </box>
        <box flexGrow={1} flexDirection="column" gap={1}>
          {children}
        </box>
        {footer ? <text fg={theme.colors.muted}>{footer}</text> : null}
      </box>
    </box>
  );
};

import { RGBA } from "@opentui/core";

import { useTheme } from "../app/theme";

type ConfirmDialogProps = {
  title: string;
  message: string;
  detail?: string;
};

export const ConfirmDialog = ({ title, message, detail }: ConfirmDialogProps) => {
  const theme = useTheme();

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={200}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      alignItems="center"
      justifyContent="center"
    >
      <box
        width={54}
        backgroundColor={theme.colors.surfaceElevated}
        padding={1}
        flexDirection="column"
        gap={1}
        alignItems="center"
      >
        <text>
          <strong>{title}</strong>
        </text>
        <text fg={theme.colors.muted}>{message}</text>
        {detail ? <text fg={theme.colors.warning}>{detail}</text> : null}
        <box flexDirection="row" gap={2} paddingTop={1}>
          <text fg={theme.colors.error}>
            <strong>[y] Delete</strong>
          </text>
          <text fg={theme.colors.muted}>[n] Cancel</text>
        </box>
      </box>
    </box>
  );
};

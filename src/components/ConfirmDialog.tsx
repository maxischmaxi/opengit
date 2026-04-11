import { useTheme } from "../app/theme";
import { DialogFrame } from "./DialogFrame";

type ConfirmDialogProps = {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
};

export const ConfirmDialog = ({ title, message, detail, confirmLabel = "Delete" }: ConfirmDialogProps) => {
  const theme = useTheme();

  return (
    <DialogFrame title={title} preferredWidth={54} preferredHeight={10}>
      <text fg={theme.colors.muted}>{message}</text>
      {detail ? <text fg={theme.colors.warning}>{detail}</text> : null}
      <box flexDirection="row" gap={2} paddingTop={1}>
        <text fg={theme.colors.success}>
          <strong>{`[y] ${confirmLabel}`}</strong>
        </text>
        <text fg={theme.colors.muted}>[n] Cancel</text>
      </box>
    </DialogFrame>
  );
};

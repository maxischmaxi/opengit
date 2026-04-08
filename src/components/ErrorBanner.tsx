import type { AppError } from "../api/errors";
import { useTheme } from "../app/theme";

export const ErrorBanner = ({ error }: { error: AppError | Error | null }) => {
  if (!error) return null;

  const theme = useTheme();
  const message = "message" in error ? error.message : String(error);

  return (
    <box
      backgroundColor={theme.colors.surface}
      padding={1}
      flexDirection="column"
    >
      <text fg={theme.colors.error}>Error</text>
      <text>{message}</text>
      <text fg={theme.colors.muted}>press r to retry</text>
    </box>
  );
};

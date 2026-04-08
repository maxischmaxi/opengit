import type { Toast } from "../state/reducer";
import { formatDurationMs } from "../util/format";
import { useTheme } from "../app/theme";

export const StatusBar = ({
  hint,
  toast,
  instanceName,
  username,
  blockedUntil,
}: {
  hint: string;
  toast: Toast | null;
  instanceName: string | null;
  username: string | null;
  blockedUntil: number | null;
}) => {
  const theme = useTheme();
  const blockedText =
    blockedUntil && blockedUntil > Date.now()
      ? `Rate limit: ${formatDurationMs(blockedUntil - Date.now())}`
      : null;

  const toastColor = (kind: Toast["kind"] | undefined) => {
    switch (kind) {
      case "success":
        return theme.colors.success;
      case "error":
        return theme.colors.error;
      default:
        return theme.colors.muted;
    }
  };

  return (
    <box
      backgroundColor={theme.colors.surface}
      paddingLeft={1}
      paddingRight={1}
      height={3}
      flexDirection="row"
      alignItems="center"
    >
      <box flexGrow={1} flexShrink={1} paddingRight={1}>
        <text fg={theme.colors.muted} wrapMode="none" truncate>
          {hint}
        </text>
      </box>
      <box
        flexShrink={0}
        paddingRight={1}
        alignItems="center"
        justifyContent="center"
      >
        <text
          fg={blockedText ? theme.colors.warning : toastColor(toast?.kind)}
          wrapMode="none"
          truncate
        >
          {blockedText ?? toast?.text ?? ""}
        </text>
      </box>
      <box flexShrink={0} alignItems="flex-end">
        <text wrapMode="none" truncate>
          {instanceName
            ? `${instanceName}${username ? ` · ${username}` : ""}`
            : "No instance"}
        </text>
      </box>
    </box>
  );
};

import { useTheme } from "../app/theme";

export const Header = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) => {
  const theme = useTheme();

  return (
    <box
      backgroundColor={theme.colors.surface}
      paddingLeft={1}
      paddingRight={1}
      height={3}
      flexDirection="row"
      alignItems="center"
    >
      <text>
        <strong>gl-tui</strong>
        {`  ${title}`}
      </text>
      <box flexGrow={1} />
      {subtitle ? <text fg={theme.colors.muted}>{subtitle}</text> : null}
    </box>
  );
};

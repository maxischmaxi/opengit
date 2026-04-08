import { useTheme } from "../app/theme";

export const EmptyState = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  const theme = useTheme();

  return (
    <box
      backgroundColor={theme.colors.surface}
      padding={1}
      flexDirection="column"
    >
      <text>{title}</text>
      <text fg={theme.colors.muted}>{description}</text>
    </box>
  );
};

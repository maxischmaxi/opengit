export const truncate = (value: string | null | undefined, length: number) => {
  if (!value) return "";
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1))}…`;
};

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const formatDurationMs = (value: number | null | undefined) => {
  if (!value || value <= 0) return "0s";

  const totalSeconds = Math.ceil(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

export const lines = (value: string | null | undefined) =>
  (value ?? "").split("\n").filter(Boolean);

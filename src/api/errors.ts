import { formatDurationMs } from "../util/format";

export type AppError = {
  kind: "auth" | "rate_limit" | "not_found" | "network" | "unknown";
  message: string;
  retryAfter?: number;
  status?: number;
};

let blockedUntil: number | null = null;

const readHeader = (headers: unknown, key: string) => {
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(key);
  }

  if (typeof headers === "object") {
    const record = headers as Record<string, unknown>;
    const match = Object.entries(record).find(([name]) => name.toLowerCase() === key.toLowerCase());
    return typeof match?.[1] === "string"
      ? match[1]
      : typeof match?.[1] === "number"
        ? String(match[1])
        : null;
  }

  return null;
};

const extractStatus = (error: unknown) => {
  if (!error || typeof error !== "object") return undefined;
  const source = error as Record<string, unknown>;
  const nested =
    source.response && typeof source.response === "object"
      ? (source.response as Record<string, unknown>)
      : null;

  if (typeof source.statusCode === "number") return source.statusCode;
  if (typeof source.status === "number") return source.status;
  if (typeof nested?.status === "number") return nested.status;

  return undefined;
};

const extractHeaders = (error: unknown) => {
  if (!error || typeof error !== "object") return undefined;
  const source = error as Record<string, unknown>;
  const nested =
    source.response && typeof source.response === "object"
      ? (source.response as Record<string, unknown>)
      : null;
  return nested?.headers ?? source.headers;
};

const toRetryAfterMs = (error: unknown) => {
  const headers = extractHeaders(error);
  const retryAfter = readHeader(headers, "retry-after");
  const rateLimitReset = readHeader(headers, "ratelimit-reset");

  if (retryAfter) {
    const asNumber = Number(retryAfter);
    if (Number.isFinite(asNumber)) return asNumber * 1000;

    const asDate = new Date(retryAfter).getTime();
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  }

  if (rateLimitReset) {
    const seconds = Number(rateLimitReset);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000 - Date.now());
  }

  return undefined;
};

export const getBlockedUntil = () =>
  blockedUntil && blockedUntil > Date.now() ? blockedUntil : null;

export const getRateLimitError = (): AppError | null => {
  const nextBlockedUntil = getBlockedUntil();

  if (!nextBlockedUntil) return null;

  const retryAfter = nextBlockedUntil - Date.now();

  return {
    kind: "rate_limit",
    message: `GitLab rate limit aktiv, erneut in ${formatDurationMs(retryAfter)}`,
    retryAfter,
    status: 429,
  };
};

export const normalizeError = (error: unknown): AppError => {
  const status = extractStatus(error);

  if (status === 429) {
    const retryAfter = toRetryAfterMs(error) ?? 60_000;
    blockedUntil = Date.now() + retryAfter;

    return {
      kind: "rate_limit",
      message: `GitLab rate limit erreicht, erneut in ${formatDurationMs(retryAfter)}`,
      retryAfter,
      status,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      message: "Authentifizierung bei GitLab fehlgeschlagen",
      status,
    };
  }

  if (status === 404) {
    return {
      kind: "not_found",
      message: "GitLab-Ressource nicht gefunden",
      status,
    };
  }

  if (error instanceof Error) {
    return {
      kind: "network",
      message: error.message,
      status,
    };
  }

  return {
    kind: "unknown",
    message: "Unbekannter GitLab-Fehler",
    status,
  };
};

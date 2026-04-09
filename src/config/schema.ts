import { DEFAULT_THEME_NAME, isThemeName, type ThemeName } from "../app/theme";

export type InstanceProvider = "gitlab" | "github";

export type Instance = {
  provider: InstanceProvider;
  name: string;
  host: string;
  token: string;
  username?: string;
  default?: boolean;
};

export type AppSettings = {
  theme: ThemeName;
};

export type Config = {
  version: 1;
  instances: Instance[];
  settings: AppSettings;
};

export const defaultSettings: AppSettings = {
  theme: DEFAULT_THEME_NAME,
};

export const createConfig = ({
  instances = [],
  settings = defaultSettings,
}: {
  instances?: Instance[];
  settings?: AppSettings;
} = {}): Config => ({
  version: 1,
  instances,
  settings: {
    ...defaultSettings,
    ...settings,
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeHost = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
};

export const normalizeInstance = (instance: Instance): Instance => ({
  provider: instance.provider ?? "gitlab",
  name: instance.name.trim(),
  host:
    instance.provider === "github"
      ? "https://github.com"
      : normalizeHost(instance.host),
  token: instance.token.trim(),
  username: instance.username?.trim(),
  default: instance.default === true,
});

export const sameInstance = (left: Instance | null, right: Instance | null) => {
  if (!left || !right) return left === right;
  return (
    left.provider === right.provider &&
    left.name === right.name &&
    normalizeHost(left.host) === normalizeHost(right.host)
  );
};

const isInstanceProvider = (value: unknown): value is InstanceProvider =>
  value === "gitlab" || value === "github";

export const validateInstance = (value: unknown): Instance => {
  if (!isRecord(value)) {
    throw new Error("Instance must be an object");
  }

  const provider: InstanceProvider = isInstanceProvider(value.provider)
    ? value.provider
    : "gitlab";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const token = typeof value.token === "string" ? value.token.trim() : "";
  const username = typeof value.username === "string" ? value.username.trim() : undefined;

  if (!name) throw new Error("Instance name is required");
  if (!token) throw new Error("Instance token is required");

  if (provider === "github") {
    if (!username) throw new Error("GitHub username is required");
    return {
      provider,
      name,
      host: "https://github.com",
      token,
      username,
      default: value.default === true,
    };
  }

  const host = typeof value.host === "string" ? normalizeHost(value.host) : "";
  if (!host) throw new Error("Instance host is required");

  return {
    provider,
    name,
    host,
    token,
    username,
    default: value.default === true,
  };
};

export const validateSettings = (value: unknown): AppSettings => {
  if (!isRecord(value)) {
    return defaultSettings;
  }

  const theme =
    typeof value.theme === "string" && isThemeName(value.theme)
      ? value.theme
      : defaultSettings.theme;

  return {
    theme,
  };
};

export const validateConfig = (value: unknown): Config => {
  if (!isRecord(value)) {
    throw new Error("Config must be an object");
  }

  if (value.version !== 1) {
    throw new Error("Unsupported config version");
  }

  if (!Array.isArray(value.instances)) {
    throw new Error("Config instances must be an array");
  }

  const instances = value.instances.map(validateInstance);
  const settings = validateSettings(value.settings);
  const withSingleDefault = instances.map((instance, index) => ({
    ...instance,
    default:
      index === 0
        ? instances.some((candidate) => candidate.default)
          ? instance.default === true
          : true
        : instance.default === true,
  }));

  const firstDefaultIndex = withSingleDefault.findIndex((instance) => instance.default);

  return createConfig({
    instances: withSingleDefault.map((instance, index) => ({
      ...instance,
      default: index === firstDefaultIndex,
    })),
    settings,
  });
};

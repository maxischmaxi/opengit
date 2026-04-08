import { access, chmod, mkdir, writeFile } from "node:fs/promises";

import { getConfigDir, getConfigPath } from "./paths";
import { type ThemeName } from "../app/theme";
import {
  createConfig,
  defaultSettings,
  type AppSettings,
  type Config,
  type Instance,
  sameInstance,
  validateConfig,
} from "./schema";

const ensureConfigDir = async () => {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  return dir;
};

export const loadConfig = async (): Promise<Config | null> => {
  await ensureConfigDir();

  const filePath = getConfigPath();

  try {
    await access(filePath);
  } catch {
    return null;
  }

  const raw = await Bun.file(filePath).text();
  return validateConfig(JSON.parse(raw));
};

export const saveConfig = async (config: Config) => {
  await ensureConfigDir();

  const filePath = getConfigPath();
  const body = `${JSON.stringify(validateConfig(config), null, 2)}\n`;

  await writeFile(filePath, body, { mode: 0o600 });
  await chmod(filePath, 0o600);
};

export const getDefaultInstance = (config: Config) =>
  config.instances.find((instance) => instance.default) ??
  config.instances[0] ??
  null;

export const addInstance = (
  config: Config | null,
  instance: Instance,
): Config => {
  const base = config ?? createConfig();
  const deduped = base.instances.filter(
    (candidate) =>
      !sameInstance(candidate, instance) && candidate.name !== instance.name,
  );
  const nextInstances = [
    ...deduped,
    {
      ...instance,
      default: deduped.length === 0 ? true : instance.default === true,
    },
  ];

  return setDefault(
    createConfig({ instances: nextInstances, settings: base.settings }),
    getDefaultInstance(
      createConfig({ instances: nextInstances, settings: base.settings }),
    )?.name ?? instance.name,
  );
};

export const removeInstance = (config: Config, name: string): Config => {
  const remaining = config.instances.filter(
    (instance) => instance.name !== name,
  );

  if (remaining.length === 0) {
    return createConfig({ settings: config.settings });
  }

  const defaultName =
    remaining.find((instance) => instance.default)?.name ??
    remaining[0]?.name ??
    "";

  return setDefault(
    createConfig({ instances: remaining, settings: config.settings }),
    defaultName,
  );
};

export const updateInstance = (
  config: Config,
  originalName: string,
  nextInstance: Instance,
): Config => {
  const original = config.instances.find(
    (instance) => instance.name === originalName,
  );

  if (!original) {
    return addInstance(config, nextInstance);
  }

  const replacedInstances = config.instances.map((instance) =>
    instance.name === originalName
      ? {
          ...nextInstance,
          default: original.default === true,
        }
      : instance,
  );

  return createConfig({
    instances: replacedInstances,
    settings: config.settings,
  });
};

export const setDefault = (config: Config, name: string): Config => ({
  version: 1,
  instances: config.instances.map((instance) => ({
    ...instance,
    default: instance.name === name,
  })),
  settings: config.settings,
});

export const updateSettings = (
  config: Config | null,
  settings: Partial<AppSettings>,
): Config => {
  const base = config ?? createConfig({ settings: defaultSettings });

  return createConfig({
    instances: base.instances,
    settings: {
      ...base.settings,
      ...settings,
    },
  });
};

export const setTheme = (config: Config | null, theme: ThemeName): Config =>
  updateSettings(config, { theme });

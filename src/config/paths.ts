import { homedir } from "node:os";
import { join } from "node:path";

export const getConfigDir = () =>
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "gl-tui");

export const getConfigPath = () => join(getConfigDir(), "config.json");

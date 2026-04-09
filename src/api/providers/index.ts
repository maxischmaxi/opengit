import type { Instance } from "../../config/schema";
import type { Provider } from "../provider";
import { GitHubProvider } from "./github";
import { GitLabProvider } from "./gitlab";

export const createProvider = (instance: Instance): Provider => {
  if (instance.provider === "github") {
    return new GitHubProvider(instance);
  }

  return new GitLabProvider(instance);
};

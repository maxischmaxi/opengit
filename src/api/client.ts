import type { Instance } from "../config/schema";
import type { Provider } from "./provider";
import { createProvider } from "./providers";

let active: { instance: Instance; provider: Provider } | null = null;

export const setActiveInstance = (instance: Instance | null) => {
  if (!instance) {
    active = null;
    return;
  }

  active = {
    instance,
    provider: createProvider(instance),
  };
};

export const getActiveInstance = () => active?.instance ?? null;

export const getProvider = () => {
  if (!active) {
    throw new Error("no active instance");
  }

  return active.provider;
};

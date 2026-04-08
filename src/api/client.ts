import { Gitlab } from "@gitbeaker/rest";

import type { Instance } from "../config/schema";

export type GitlabClient = Gitlab<false>;

let active: { instance: Instance; api: GitlabClient } | null = null;

export const setActiveInstance = (instance: Instance | null) => {
  if (!instance) {
    active = null;
    return;
  }

  active = {
    instance,
    api: new Gitlab({ host: instance.host, token: instance.token }),
  };
};

export const getActiveInstance = () => active?.instance ?? null;

export const getApi = () => {
  if (!active) {
    throw new Error("no active instance");
  }

  return active.api;
};

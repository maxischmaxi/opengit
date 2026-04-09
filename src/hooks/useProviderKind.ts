import { getActiveInstance } from "../api/client";
import type { ProviderKind } from "../api/types";

export const useProviderKind = (): ProviderKind =>
  getActiveInstance()?.provider ?? "gitlab";

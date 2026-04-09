import type { Config, Instance } from "../config/schema";

export type Toast = {
  kind: "info" | "error" | "success";
  text: string;
  id: number;
};

export type AppState = {
  config: Config | null;
  activeInstance: Instance | null;
  toast: Toast | null;
  helpOpen: boolean;
  dialog:
    | { kind: "settings" | "theme" }
    | { kind: "confirm"; title: string; message: string; detail?: string }
    | null;
};

export type AppAction =
  | { type: "CONFIG_LOADED"; config: Config | null }
  | { type: "CONFIG_UPDATED"; config: Config | null }
  | { type: "INSTANCE_ACTIVATED"; instance: Instance | null }
  | { type: "TOAST_SHOW"; toast: Toast }
  | { type: "TOAST_CLEAR" }
  | { type: "HELP_TOGGLE" }
  | { type: "HELP_SET"; open: boolean }
  | {
      type: "DIALOG_OPEN";
      dialog:
        | { kind: "settings" | "theme" }
        | { kind: "confirm"; title: string; message: string; detail?: string };
    }
  | { type: "DIALOG_CLOSE" };

export const initialState: AppState = {
  config: null,
  activeInstance: null,
  toast: null,
  helpOpen: false,
  dialog: null,
};

export const reducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case "CONFIG_LOADED":
      return {
        ...state,
        config: action.config,
      };
    case "CONFIG_UPDATED":
      return {
        ...state,
        config: action.config,
      };
    case "INSTANCE_ACTIVATED":
      return {
        ...state,
        activeInstance: action.instance,
      };
    case "TOAST_SHOW":
      return {
        ...state,
        toast: action.toast,
      };
    case "TOAST_CLEAR":
      return {
        ...state,
        toast: null,
      };
    case "HELP_TOGGLE":
      return {
        ...state,
        helpOpen: !state.helpOpen,
      };
    case "HELP_SET":
      return {
        ...state,
        helpOpen: action.open,
      };
    case "DIALOG_OPEN":
      return {
        ...state,
        dialog: action.dialog,
      };
    case "DIALOG_CLOSE":
      return {
        ...state,
        dialog: null,
      };
    default:
      return state;
  }
};

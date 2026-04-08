import { createContext, useContext, useMemo, useReducer } from "react";

import { initialState, reducer, type AppAction, type AppState, type Toast } from "./reducer";

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<React.Dispatch<AppAction> | null>(null);

let toastId = 0;

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const memoState = useMemo(() => state, [state]);

  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStateContext.Provider value={memoState}>{children}</AppStateContext.Provider>
    </AppDispatchContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error("useAppState must be used within AppProvider");
  }

  return context;
};

export const useAppDispatch = () => {
  const context = useContext(AppDispatchContext);

  if (!context) {
    throw new Error("useAppDispatch must be used within AppProvider");
  }

  return context;
};

export const useApp = () => ({
  state: useAppState(),
  dispatch: useAppDispatch(),
});

export const showToast = (
  dispatch: React.Dispatch<AppAction>,
  kind: Toast["kind"],
  text: string,
) => {
  toastId += 1;

  dispatch({
    type: "TOAST_SHOW",
    toast: { kind, text, id: toastId },
  });
};

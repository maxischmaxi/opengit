import { createContext, useContext, useEffect, useMemo, useState } from "react";

type InputFocusContextValue = {
  focusedCount: number;
  increment: () => void;
  decrement: () => void;
};

const InputFocusContext = createContext<InputFocusContextValue | null>(null);

export const InputFocusProvider = ({ children }: { children: React.ReactNode }) => {
  const [focusedCount, setFocusedCount] = useState(0);

  const value = useMemo<InputFocusContextValue>(
    () => ({
      focusedCount,
      increment: () => setFocusedCount((value) => value + 1),
      decrement: () => setFocusedCount((value) => Math.max(0, value - 1)),
    }),
    [focusedCount],
  );

  return <InputFocusContext.Provider value={value}>{children}</InputFocusContext.Provider>;
};

const useInputFocusContext = () => {
  const context = useContext(InputFocusContext);

  if (!context) {
    throw new Error("useInputFocus must be used within InputFocusProvider");
  }

  return context;
};

export const useInputFocus = (active: boolean) => {
  const context = useInputFocusContext();

  useEffect(() => {
    if (!active) return;

    context.increment();

    return () => {
      context.decrement();
    };
  }, [active, context]);
};

export const useInputFocusState = () => {
  const context = useInputFocusContext();

  return {
    focusedCount: context.focusedCount,
    hasFocusedInput: context.focusedCount > 0,
  };
};

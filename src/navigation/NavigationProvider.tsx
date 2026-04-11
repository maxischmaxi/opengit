import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Screen } from "./screens";

type NavigationContextValue = {
  current: Screen;
  stack: Screen[];
  push: (screen: Screen) => void;
  replace: (screen: Screen) => void;
  pop: () => void;
  reset: (stack: Screen[]) => void;
  canPop: boolean;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

type NavigationProviderProps = {
  children: React.ReactNode;
  initialStack?: Screen[];
  onStackChange?: (stack: Screen[]) => void;
};

export const NavigationProvider = ({
  children,
  initialStack,
  onStackChange,
}: NavigationProviderProps) => {
  const [stack, setStack] = useState<Screen[]>(
    initialStack && initialStack.length > 0 ? initialStack : [{ kind: "wizard" }],
  );

  useEffect(() => {
    onStackChange?.(stack);
  }, [stack]);

  const push = useCallback((screen: Screen) => {
    setStack((current) => [...current, screen]);
  }, []);

  const replace = useCallback((screen: Screen) => {
    setStack((current) => [...current.slice(0, -1), screen]);
  }, []);

  const pop = useCallback(() => {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const reset = useCallback((nextStack: Screen[]) => {
    setStack(nextStack.length > 0 ? nextStack : [{ kind: "wizard" }]);
  }, []);

  const value = useMemo<NavigationContextValue>(
    () => ({
      current: stack[stack.length - 1] ?? { kind: "wizard" },
      stack,
      push,
      replace,
      pop,
      reset,
      canPop: stack.length > 1,
    }),
    [stack, push, replace, pop, reset],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigationContext = () => {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error("useNavigationContext must be used within NavigationProvider");
  }

  return context;
};

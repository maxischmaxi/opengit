import { useEffect, useRef, useState } from "react";

type AsyncState<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
};

export const useAsync = <T>(factory: () => Promise<T>, deps: React.DependencyList) => {
  const factoryRef = useRef(factory);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    error: null,
    loading: true,
  });

  useEffect(() => {
    factoryRef.current = factory;
  }, [factory]);

  useEffect(() => {
    let cancelled = false;

    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    void factoryRef
      .current()
      .then((data) => {
        if (cancelled) return;
        setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ data: undefined, error, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, ...deps]);

  return {
    ...state,
    reload: () => setReloadToken((value) => value + 1),
  };
};

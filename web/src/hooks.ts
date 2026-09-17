import { useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Fetch `fn()` on mount and whenever `deps` change; ignores results from a
 * stale in-flight call if deps change again before it resolves. */
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => {
        if (requestId.current === id) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (requestId.current === id) setState({ data: null, loading: false, error: String(err) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

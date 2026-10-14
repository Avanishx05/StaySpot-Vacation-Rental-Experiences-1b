import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort } from "../api.js";

/**
 * Runs `loader(signal)` whenever `deps` change (or reload() is called) and ignores stale results:
 * an older request is aborted as soon as a newer one starts or the component unmounts.
 * The previous `data` is kept while reloading so screens can dim it instead of flashing a spinner.
 */
export function useAsync(loader, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) { setState({ data: null, error: null, loading: false }); return undefined; }
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => loaderRef.current(ctl.signal))
      .then(
        (data) => { if (!ctl.signal.aborted) setState({ data, error: null, loading: false }); },
        (error) => { if (!ctl.signal.aborted && !isAbort(error)) setState((s) => ({ ...s, error, loading: false })); },
      );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

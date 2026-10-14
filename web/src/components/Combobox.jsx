import { useEffect, useRef, useState } from "react";
import { useDebounced } from "../hooks/useDebounced.js";

/**
 * Search-as-you-type picker backed by the API (properties on the booking form, the actor switcher).
 * fetchOptions(query, signal) -> Promise<option[]>; renderOption(option) -> node; onPick(option).
 */
export function Combobox({ id, placeholder, fetchOptions, renderOption, onPick }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ status: "idle", options: [], error: null });
  const [retry, setRetry] = useState(0);
  const boxRef = useRef(null);
  const fetchRef = useRef(fetchOptions);
  fetchRef.current = fetchOptions;
  const query = useDebounced(text.trim(), 250);

  useEffect(() => {
    if (!open) return undefined;
    const ctl = new AbortController();
    setState((s) => ({ ...s, status: "loading" }));
    Promise.resolve()
      .then(() => fetchRef.current(query, ctl.signal))
      .then(
        (options) => { if (!ctl.signal.aborted) setState({ status: "done", options, error: null }); },
        (error) => { if (!ctl.signal.aborted && error.name !== "AbortError") setState({ status: "error", options: [], error }); },
      );
    return () => ctl.abort();
  }, [open, query, retry]);

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const { status, options, error } = state;
  return (
    <div className="combobox" ref={boxRef}>
      <input
        id={id} type="search" autoComplete="off" placeholder={placeholder} value={text}
        aria-expanded={open ? "true" : "false"} role="combobox" aria-controls={id ? `${id}-list` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <ul className="combo-list" role="listbox" id={id ? `${id}-list` : undefined} hidden={!open}>
        {status === "loading" && <li className="combo-note">Searching…</li>}
        {status === "error" && (
          <li className="combo-note error-text">{error.message} <button type="button" className="link" onClick={() => setRetry((n) => n + 1)}>Retry</button></li>
        )}
        {status === "done" && options.length === 0 && <li className="combo-note">No matches</li>}
        {status === "done" && options.map((o, i) => (
          <li role="option" aria-selected="false" key={o.id ?? i}>
            <button type="button" className="combo-option" onClick={() => { setText(""); setOpen(false); onPick(o); }}>{renderOption(o)}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

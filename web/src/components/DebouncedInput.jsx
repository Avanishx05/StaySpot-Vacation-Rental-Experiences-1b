import { useEffect, useRef, useState } from "react";
import { useDebounced } from "../hooks/useDebounced.js";

/** Text/number input that reports its value to onCommit(value) after the user stops typing. */
export function DebouncedInput({ value, onCommit, ms = 300, trim = false, ...rest }) {
  const norm = (v) => (trim ? v.trim() : v);
  const [text, setText] = useState(value);
  const debounced = useDebounced(text, ms);
  const debouncedRef = useRef(debounced);
  debouncedRef.current = debounced;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // User typed something and paused: tell the parent.
  useEffect(() => { if (norm(debounced) !== value) commitRef.current(norm(debounced)); /* eslint-disable-next-line */ }, [debounced]);
  // The value changed from outside (e.g. "Clear"): follow it. A change that is just our own commit is ignored,
  // so keystrokes typed after the pause are never overwritten.
  useEffect(() => { if (value !== norm(debouncedRef.current)) setText(value); /* eslint-disable-next-line */ }, [value]);

  return <input {...rest} value={text} onChange={(e) => setText(e.target.value)} />;
}

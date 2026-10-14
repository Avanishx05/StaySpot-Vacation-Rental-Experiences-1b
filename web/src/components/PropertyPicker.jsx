// Property search + select shared by Analytics and Reviews, backed by GET /api/properties (Postgres id = Mongo property_id).
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useDebounced } from "../hooks/useDebounced.js";

/**
 * Controlled: `value` is the selected property id ("" = all, when allLabel is given), `label` its title if the
 * parent already knows it. onChange(id, title) fires for user picks.
 */
export function PropertyPicker({ value, label, allLabel, onChange }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const [items, setItems] = useState(null); // null = loading, false = failed
  const [fetched, setFetched] = useState({}); // id -> title for a selection that is not in the first 20

  useEffect(() => {
    let alive = true;
    api("/properties", { params: { limit: 20, q: dq } })
      .then((r) => alive && setItems(r.items))
      .catch(() => alive && setItems(false));
    return () => { alive = false; };
  }, [dq]);

  const inList = Array.isArray(items) && items.some((p) => p.id === value);
  useEffect(() => {
    if (!value || label || inList || fetched[value] || items === null) return undefined;
    let alive = true;
    api(`/properties/${encodeURIComponent(value)}`)
      .then((p) => p.title && alive && setFetched((f) => ({ ...f, [value]: p.title })))
      .catch(() => {});
    return () => { alive = false; };
  }, [value, label, inList, fetched, items]);

  const list = Array.isArray(items) ? items : [];
  const extra = value && !inList ? { id: value, title: label || fetched[value] || "Selected property" } : null;
  return (
    <div className="picker">
      <input type="search" placeholder="Search properties" aria-label="Search properties" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Property" value={value || ""} onChange={(e) => {
        const p = [...list, ...(extra ? [extra] : [])].find((x) => x.id === e.target.value);
        onChange(e.target.value, p && p.title);
      }}>
        {items === false && <option value="">Properties unavailable</option>}
        {allLabel && <option value="">{allLabel}</option>}
        {extra && <option value={extra.id}>{extra.title}</option>}
        {list.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
    </div>
  );
}

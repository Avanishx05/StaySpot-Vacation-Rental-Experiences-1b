// Property search + select shared by Analytics and Reviews, backed by GET /api/properties (Postgres id = Mongo property_id).
import { h } from "../dom.js";
import { api } from "../api.js";

export function propertyPicker({ id, allLabel, onChange }) {
  const q = h("input", { type: "search", placeholder: "Search properties", "aria-label": "Search properties" });
  const sel = h("select", { "aria-label": "Property", onChange: () => onChange && onChange(sel.value) });
  const opt = (v, t) => h("option", { value: v }, t);
  const set = (v, label) => {
    const have = [...sel.options].find((o) => o.value === v);
    if (v && !have) sel.append(opt(v, label || "Selected property"));
    else if (have && label) have.textContent = label;
    sel.value = v || "";
  };
  // Pre-select synchronously so a property from the URL (?property=) is already the value when the screen first reads it.
  if (allLabel) sel.append(opt("", allLabel));
  if (id) set(id);
  let t;
  async function load() {
    const keep = sel.value || id || "";
    try {
      const { items } = await api("/properties", { params: { limit: 20, q: q.value.trim() } });
      sel.replaceChildren(...(allLabel ? [opt("", allLabel)] : []), ...items.map((p) => opt(p.id, p.title)));
    } catch (_) { sel.replaceChildren(opt("", "Properties unavailable")); }
    set(keep);
    if (keep && sel.selectedOptions[0] && sel.selectedOptions[0].textContent === "Selected property") { // not in the first 20: fetch its title
      api(`/properties/${encodeURIComponent(keep)}`).then((p) => p.title && set(keep, p.title)).catch(() => {});
    }
  }
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(load, 300); });
  load();
  return { el: h("div", { class: "picker" }, q, sel), set, get value() { return sel.value; }, destroy: () => clearTimeout(t) };
}

// Minimal DOM helpers + the reusable components (the design system's building blocks).
// Everything is built with createElement/textContent, never innerHTML, so API data can't inject markup.
import { api, isAbort } from "./api.js";
import { money, shortId } from "./format.js";

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const replace = (el, ...children) => { clear(el); append(el, children); return el; };

export function debounce(fn, ms = 300) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** Runs loader(signal) and ignores the result if a newer call started (or the view was left). */
export function latest() {
  let ctl = null;
  return async (loader) => {
    if (ctl) ctl.abort();
    const mine = (ctl = new AbortController());
    try {
      const data = await loader(mine.signal);
      return mine.signal.aborted ? { stale: true } : { data };
    } catch (error) {
      if (isAbort(error) || mine.signal.aborted) return { stale: true };
      return { error };
    }
  };
}

// ---------- components ----------
export const spinner = (big) => h("span", { class: "spinner" + (big ? " lg" : ""), "aria-hidden": "true" });

export function button(label, { variant = "primary", onClick, disabled, type = "button", ariaLabel } = {}) {
  return h("button", { class: `btn btn-${variant}`, type, onClick, disabled, "aria-label": ariaLabel }, label);
}
export function setBusy(btn, busy, busyLabel) {
  btn.disabled = busy;
  btn.toggleAttribute("aria-busy", busy);
  if (busy) { btn.dataset.label = btn.textContent; replace(btn, spinner(), busyLabel || btn.dataset.label); }
  else replace(btn, btn.dataset.label || btn.textContent);
}
export const linkButton = (label, href, variant = "secondary") => h("a", { class: `btn btn-${variant}`, href }, label);

export const card = (title, body, actions) =>
  h("section", { class: "card" },
    (title || actions) && h("header", { class: "card-head" }, h("h2", null, title), h("div", { class: "card-actions" }, actions)),
    body);

const STATUS = { CONFIRMED: "Confirmed", CHECKED_IN: "Checked in", COMPLETED: "Completed", DEBIT: "Debit", CREDIT: "Credit" };
export const badge = (v) => h("span", { class: `badge badge-${String(v).toLowerCase()}` }, STATUS[v] || v);

export const loading = (label = "Loading…") => h("div", { class: "state", role: "status", "aria-live": "polite" }, spinner(true), " ", label);
export const empty = (title, text, ...extra) => h("div", { class: "state empty" }, h("strong", null, title), text && h("p", null, text), ...extra);
export function errorState(error, onRetry) {
  return h("div", { class: "state error", role: "alert" },
    h("strong", null, error && error.code === "NETWORK" ? "Can't reach the server" : "Something went wrong"),
    h("p", null, (error && error.message) || "Unknown error."),
    onRetry && button("Try again", { variant: "secondary", onClick: onRetry }));
}
export const banner = (kind, title, ...body) =>
  h("div", { class: `banner banner-${kind}`, role: kind === "error" ? "alert" : "status" }, title && h("strong", null, title), h("div", null, ...body));
export const tableWrap = (t) => h("div", { class: "table-wrap" }, t);
export const idLink = (href, id) => h("a", { class: "mono", href, title: id }, shortId(id));
export const dl = (rows) => h("dl", { class: "dl" }, rows.map(([k, v]) => h("div", null, h("dt", null, k), h("dd", null, v))));

export function field(label, input, { error, hint, id } = {}) {
  return h("div", { class: "field" + (error ? " has-error" : "") },
    h("label", { for: id }, label), input,
    hint && !error && h("small", { class: "hint" }, hint),
    error && h("small", { class: "error-text", role: "alert" }, error));
}

export function pagination({ page, limit, total, onPage, disabled }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const b = (label, p, off, aria) => button(label, { variant: "secondary", disabled: disabled || off, ariaLabel: aria, onClick: () => onPage(p) });
  return h("nav", { class: "pagination", "aria-label": "Pagination" },
    h("span", { class: "muted" }, total === 0 ? "No results" : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`),
    h("div", { class: "pager-buttons" },
      b("«", 1, page <= 1, "First page"), b("Prev", page - 1, page <= 1),
      h("span", { class: "page-indicator" }, `Page ${page.toLocaleString()} / ${pages.toLocaleString()}`),
      b("Next", page + 1, page >= pages), b("»", pages, page >= pages, "Last page")));
}

/** Search-as-you-type picker backed by the API (properties on the booking form, the actor switcher). */
export function combobox({ id, placeholder, fetchOptions, renderOption, onPick }) {
  const input = h("input", { id, type: "search", autocomplete: "off", placeholder, "aria-expanded": "false" });
  const list = h("ul", { class: "combo-list", role: "listbox", hidden: true });
  const box = h("div", { class: "combobox" }, input, list);
  const run = latest();
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const search = async () => {
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    replace(list, h("li", { class: "combo-note" }, "Searching…"));
    const r = await run((signal) => fetchOptions(input.value.trim(), signal));
    if (r.stale) return;
    if (r.error) return replace(list, h("li", { class: "combo-note error-text" }, r.error.message, " ", h("button", { type: "button", class: "link", onClick: search }, "Retry")));
    if (!r.data.length) return replace(list, h("li", { class: "combo-note" }, "No matches"));
    replace(list, r.data.map((o) => h("li", { role: "option" },
      h("button", { type: "button", class: "combo-option", onClick: () => { input.value = ""; close(); onPick(o); } }, renderOption(o)))));
  };
  const deb = debounce(search, 250);
  input.addEventListener("focus", search);
  input.addEventListener("input", deb);
  input.addEventListener("keydown", (e) => e.key === "Escape" && close());
  document.addEventListener("mousedown", (e) => { if (!box.contains(e.target)) close(); });
  return box;
}

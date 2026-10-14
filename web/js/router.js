import { empty } from "./dom.js";

// Hash router: "#/browse/guests?page=2". No build step, no server-side fallback needed.
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, "") || "/";
  const i = raw.indexOf("?");
  const path = i === -1 ? raw : raw.slice(0, i);
  const query = new URLSearchParams(i === -1 ? "" : raw.slice(i + 1));
  return { path: path.replace(/\/+$/, "") || "/", query };
}

export const navigate = (to) => { location.hash = to; };

/** Update the query string in place (no re-render, no history entry) - used by filters/pagination. */
export function replaceQuery(patch) {
  const { path, query } = parseHash();
  Object.entries(patch).forEach(([k, v]) => (v === "" || v === undefined || v === null ? query.delete(k) : query.set(k, v)));
  const qs = query.toString();
  history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
}

export function startRouter(screens, view, onRoute) {
  let cleanup = null;
  let ctl = null;
  const run = () => {
    if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const { path, query } = parseHash();
    const screen = screens.find((s) => path === s.path || path.startsWith(s.path + "/"));
    view.replaceChildren();
    if (!screen) {
      view.append(empty("Page not found", "That page doesn't exist. Use the menu above."));
    } else {
      cleanup = screen.render({ view, path, rest: path.slice(screen.path.length).split("/").filter(Boolean), query, signal: ctl.signal }) || null;
    }
    onRoute && onRoute(screen);
    view.focus({ preventScroll: true });
  };
  window.addEventListener("hashchange", run);
  run();
  return run;
}

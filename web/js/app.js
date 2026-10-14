import { h, replace, combobox } from "./dom.js";
import { api } from "./api.js";
import { money } from "./format.js";
import { getActor, initActor, isReady, setActor, subscribe } from "./state.js";
import { startRouter, navigate, parseHash } from "./router.js";
import * as browse from "./pages/browse.js";
import * as transaction from "./pages/transaction.js";
import * as audit from "./pages/audit.js";
import * as analytics from "./pages/analytics.js";
import * as map from "./pages/map.js";
import * as reviews from "./pages/reviews.js";

// Teammates: add your screen with ONE entry here - the navigation builds itself.
// Each page module exports render({ view, rest, query, signal }) and may return a cleanup function.
export const SCREENS = [
  { path: "/browse", to: "#/browse/guests", label: "Browse", render: browse.render },
  { path: "/book", to: "#/book", label: "Book a stay", render: transaction.render, actorAware: true },
  { path: "/audit", to: "#/audit", label: "Audit trail", render: audit.render, actorAware: true },
  { path: "/analytics", to: "#/analytics", label: "Analytics", render: analytics.render },
  { path: "/map", to: "#/map", label: "Map", render: map.render },
  { path: "/reviews", to: "#/reviews", label: "Reviews", render: reviews.render },
];

const nav = document.getElementById("mainnav");
function paintNav() {
  const { path } = parseHash();
  replace(nav, SCREENS.map((s) => h("a", { href: s.to, "aria-current": path === s.path || path.startsWith(s.path + "/") ? "page" : null }, s.label)));
}

const actorBox = document.getElementById("actor");
const current = h("div", { class: "actor-current" });
const picker = combobox({
  id: "actor-switch",
  placeholder: "Switch guest…",
  fetchOptions: (q, signal) => api("/actors", { params: { q, limit: 8 }, signal }),
  renderOption: (g) => [h("span", null, g.name), h("span", { class: "muted" }, money(g.wallet_balance))],
  onPick: (g) => setActor(g),
});
replace(actorBox, h("span", { class: "actor-label" }, "Acting as"), current, picker);
subscribe((a, ready) => replace(current, !ready ? "…" : a ? [h("strong", null, a.name), h("span", { class: "muted" }, ` · ${money(a.wallet_balance)}`)] : h("em", null, "nobody — pick a guest")));

if (!location.hash) navigate("#/browse/guests");
const rerender = startRouter(SCREENS, document.getElementById("view"), paintNav);

// Screens that depend on the acting guest re-render when it changes (but not on every balance refresh).
let lastId = getActor() && getActor().id;
subscribe((a) => {
  const id = a && a.id;
  if (id !== lastId) { lastId = id; if (SCREENS.find((s) => s.actorAware && parseHash().path.startsWith(s.path))) rerender(); }
});

initActor().then(() => { lastId = getActor() && getActor().id; if (isReady() && lastId) rerender(); });

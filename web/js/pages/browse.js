import { api } from "../api.js";
import { getActor, setActor } from "../state.js";
import { replaceQuery, navigate } from "../router.js";
import { dateTime, money, shortId } from "../format.js";
import { h, replace, debounce, latest, badge, banner, button, card, dl, empty, errorState, idLink, linkButton, loading, pagination, tableWrap } from "../dom.js";

const SIZES = [10, 25, 50, 100];
const link = (href, text) => h("a", { href }, text);

// One config per entity keeps the three list screens identical in behaviour and look.
const ENTITIES = {
  guests: {
    label: "Guests", defaultSort: "name", searchHint: "Search by name or paste an ID", filters: [],
    columns: [
      { label: "Name", sort: "name", cell: (r) => link(`#/browse/guests/${r.id}`, r.name) },
      { label: "Wallet balance", sort: "wallet_balance", num: true, cell: (r) => money(r.wallet_balance) },
      { label: "ID", cell: (r) => idLink(`#/browse/guests/${r.id}`, r.id) },
    ],
  },
  properties: {
    label: "Properties", defaultSort: "title", searchHint: "Search by title or paste an ID", filters: ["price"],
    columns: [
      { label: "Title", sort: "title", cell: (r) => link(`#/browse/properties/${r.id}`, r.title) },
      { label: "Price / night", sort: "base_price", num: true, cell: (r) => money(r.base_price) },
      { label: "Location", cell: (r) => h("span", { class: "mono" }, `${Number(r.latitude).toFixed(3)}, ${Number(r.longitude).toFixed(3)}`) },
    ],
  },
  bookings: {
    label: "Bookings", defaultSort: "created_at", searchHint: "Search guest name, property title or an ID", filters: ["status"],
    columns: [
      { label: "Booking", cell: (r) => idLink(`#/browse/bookings/${r.id}`, r.id) },
      { label: "Guest", cell: (r) => link(`#/browse/guests/${r.guest.id}`, r.guest.name) },
      { label: "Property", cell: (r) => link(`#/browse/properties/${r.property.id}`, r.property.title) },
      { label: "Nights", num: true, cell: (r) => r.nights },
      { label: "Total", sort: "total_cost", num: true, cell: (r) => money(r.total_cost) },
      { label: "Status", cell: (r) => badge(r.status) },
      { label: "Created", sort: "created_at", cell: (r) => dateTime(r.created_at) },
    ],
  },
};

// ---------- list ----------
function renderList(view, entity, query) {
  const cfg = ENTITIES[entity];
  const q = (k) => query.get(k) || "";
  const st = {
    page: Math.max(1, parseInt(q("page"), 10) || 1),
    limit: SIZES.includes(Number(q("limit"))) ? Number(q("limit")) : 25,
    q: q("q"), sort: q("sort") || cfg.defaultSort, order: q("order"),
    status: q("status"), guestId: q("guestId"), propertyId: q("propertyId"), minPrice: q("minPrice"), maxPrice: q("maxPrice"),
  };
  const run = latest();
  const body = h("div");
  const chips = h("p", { class: "chips" });

  const set = (patch, resetPage = true) => {
    Object.assign(st, patch);
    if (resetPage && !("page" in patch)) st.page = 1;
    replaceQuery({ ...patch, ...(resetPage && !("page" in patch) ? { page: "" } : {}), page: st.page === 1 ? "" : st.page });
    load();
  };
  const filtered = () => st.q || st.status || st.guestId || st.propertyId || st.minPrice || st.maxPrice;

  const search = h("input", { type: "search", class: "grow", placeholder: cfg.searchHint, value: st.q, maxlength: "100", "aria-label": "Search" });
  search.addEventListener("input", debounce(() => { if (search.value.trim() !== st.q) set({ q: search.value.trim() }); }, 300));
  const select = (label, value, opts, key) => {
    const s = h("select", { "aria-label": label }, opts.map(([v, t]) => h("option", { value: v, selected: String(v) === String(value) }, t)));
    s.addEventListener("change", () => set({ [key]: s.value }));
    return s;
  };
  const num = (ph, key) => {
    const i = h("input", { type: "number", min: "0", class: "narrow", placeholder: ph, value: st[key], "aria-label": ph });
    i.addEventListener("input", debounce(() => set({ [key]: i.value }), 400));
    return i;
  };
  const clearBtn = button("Clear", { variant: "ghost", onClick: () => { Object.assign(st, { q: "", status: "", guestId: "", propertyId: "", minPrice: "", maxPrice: "", page: 1 }); search.value = ""; replaceQuery({ q: "", status: "", guestId: "", propertyId: "", minPrice: "", maxPrice: "", page: "", sort: "", order: "" }); view.replaceChildren(); renderList(view, entity, new URLSearchParams()); } });
  const toolbar = h("div", { class: "toolbar" }, search,
    cfg.filters.includes("status") && select("Status", st.status, [["", "All statuses"], ["CONFIRMED", "Confirmed"], ["CHECKED_IN", "Checked in"], ["COMPLETED", "Completed"]], "status"),
    cfg.filters.includes("price") && [num("Min ₹", "minPrice"), num("Max ₹", "maxPrice")],
    select("Rows per page", st.limit, SIZES.map((s) => [s, `${s} / page`]), "limit"));
  view.append(card(null, [toolbar, chips, body]));

  const paintChips = () => replace(chips, [["guestId", "Guest"], ["propertyId", "Property"]].filter(([k]) => st[k]).map(([k, t]) =>
    h("span", { class: "chip" }, `${t} ${shortId(st[k])} `, h("button", { class: "link", "aria-label": `Remove ${t} filter`, onClick: () => set({ [k]: "" }) }, "✕"))),
    filtered() ? clearBtn : null);

  const sortHeader = (c) => {
    if (!c.sort) return c.label;
    const asc = st.sort === c.sort && (st.order ? st.order === "asc" : ["name", "title"].includes(c.sort));
    return h("button", { class: "th-sort", onClick: () => set({ sort: c.sort, order: st.sort === c.sort ? (asc ? "desc" : "asc") : "" }) },
      c.label, st.sort === c.sort ? (asc ? " ▲" : " ▼") : "");
  };

  let last = null;
  async function load() {
    paintChips();
    if (!last) replace(body, loading());
    else body.classList.add("dim");
    const params = { page: st.page, limit: st.limit, q: st.q, sort: st.sort, order: st.order, status: st.status, guestId: st.guestId, propertyId: st.propertyId, minPrice: st.minPrice, maxPrice: st.maxPrice };
    const r = await run((signal) => api(`/${entity}`, { signal, params }));
    if (r.stale) return;
    body.classList.remove("dim");
    if (r.error) { if (!last) return replace(body, errorState(r.error, load)); return body.prepend(banner("error", "Couldn't refresh", r.error.message)); }
    last = r.data;
    const { items, total } = r.data;
    const lastPage = Math.max(1, Math.ceil(total / st.limit));
    let main;
    if (!items.length && total > 0) main = empty("That page doesn't exist", `There are only ${lastPage.toLocaleString()} pages.`, button("Go to the last page", { variant: "secondary", onClick: () => set({ page: lastPage }, false) }));
    else if (!items.length) main = empty(filtered() ? "No matches" : `No ${cfg.label.toLowerCase()} yet`, filtered() ? "Try a different search or clear the filters." : "Run the seeders to add demo data.");
    else main = tableWrap(h("table", null,
      h("thead", null, h("tr", null, cfg.columns.map((c) => h("th", { class: c.num ? "num" : "" }, sortHeader(c))))),
      h("tbody", null, items.map((row) => h("tr", null, cfg.columns.map((c) => h("td", { class: c.num ? "num" : "", "data-label": c.label }, c.cell(row))))))));
    replace(body, main, pagination({ page: st.page, limit: st.limit, total, onPage: (p) => set({ page: p }, false) }));
  }
  load();
}

// ---------- details ----------
async function detail(view, signal, { title, path, back, draw }) {
  replace(view, h("p", null, link(back, "← Back to list")), loading());
  try {
    const data = await api(path, { signal });
    replace(view, h("p", null, link(back, "← Back to list")), draw(data));
  } catch (err) {
    if (signal.aborted || err.name === "AbortError") return;
    replace(view, h("p", null, link(back, "← Back to list")),
      err.status === 404 ? empty(`${title} not found`, "It may have been removed.", linkButton("Return to the list", back)) : errorState(err, () => detail(view, signal, { title, path, back, draw })));
  }
}

function bookingsMini(bookings, count, filterParam, other) {
  if (!bookings.length) return empty("No bookings", "Nothing has been booked yet.");
  return h("div", null,
    tableWrap(h("table", null,
      h("thead", null, h("tr", null, ["Booking", other === "property" ? "Property" : "Guest", "Nights", "Total", "Status", "Created"].map((t, i) => h("th", { class: i === 2 || i === 3 ? "num" : "" }, t)))),
      h("tbody", null, bookings.map((b) => h("tr", null,
        h("td", null, idLink(`#/browse/bookings/${b.id}`, b.id)),
        h("td", null, other === "property" ? link(`#/browse/properties/${b.property.id}`, b.property.title) : link(`#/browse/guests/${b.guest.id}`, b.guest.name)),
        h("td", { class: "num" }, b.nights), h("td", { class: "num" }, money(b.total_cost)), h("td", null, badge(b.status)), h("td", null, dateTime(b.created_at))))))),
    count > bookings.length && h("p", { class: "muted" }, `Showing the latest ${bookings.length} of ${count.toLocaleString()}. `, link(`#/browse/bookings?${filterParam}`, "See all")));
}

const detailViews = {
  guests: (id) => ({ title: "Guest", path: `/guests/${id}`, back: "#/browse/guests", draw: (g) => h("div", null,
    card(g.name, dl([["Wallet balance", h("strong", null, money(g.wallet_balance))], ["Guest ID", h("span", { class: "mono" }, g.id)], ["Bookings", g.bookingCount.toLocaleString()]]),
      [button("Act as this guest", { variant: "secondary", onClick: () => { setActor(g); navigate("#/book"); } }), linkButton("Audit trail", `#/audit?guest=${g.id}`)]),
    card("Bookings", bookingsMini(g.bookings, g.bookingCount, `guestId=${g.id}`, "property"))) }),
  properties: (id) => ({ title: "Property", path: `/properties/${id}`, back: "#/browse/properties", draw: (p) => h("div", null,
    card(p.title, dl([["Price per night", h("strong", null, money(p.base_price))], ["Location", h("span", { class: "mono" }, `${p.latitude}, ${p.longitude}`)], ["Property ID", h("span", { class: "mono" }, p.id)], ["Bookings", p.bookingCount.toLocaleString()]]),
      [linkButton("Book this property", `#/book?property=${p.id}`), linkButton("Revenue analytics", `#/analytics?property=${p.id}`), linkButton("Reviews", `#/reviews?property=${p.id}`), linkButton("Search hotspots", "#/map")]),
    card("Latest bookings", bookingsMini(p.bookings, p.bookingCount, `propertyId=${p.id}`, "guest"))) }),
  bookings: (id) => ({ title: "Booking", path: `/bookings/${id}`, back: "#/browse/bookings", draw: (b) =>
    card(`Booking ${shortId(b.id)}`, dl([
      ["Guest", link(`#/browse/guests/${b.guest.id}`, b.guest.name)], ["Property", link(`#/browse/properties/${b.property.id}`, b.property.title)],
      ["Nights", b.nights], ["Price per night", money(b.property.base_price)], ["Total cost", h("strong", null, money(b.total_cost))],
      ["Created", dateTime(b.created_at)], ["Booking ID", h("span", { class: "mono" }, b.id)]]), badge(b.status)) }),
};

export function render({ view, rest, query, signal }) {
  const [entity, id] = rest;
  const tabs = h("nav", { class: "tabs", "aria-label": "Entities" }, Object.entries(ENTITIES).map(([k, v]) => h("a", { href: `#/browse/${k}`, "aria-current": k === entity ? "page" : null }, v.label)));
  const content = h("div");
  view.append(h("h1", null, "Browse"), tabs, content);
  if (!ENTITIES[entity]) return void content.append(empty("Unknown section", "Pick Guests, Properties or Bookings above."));
  if (rest.length > 2) return void content.append(empty("Page not found", "That page doesn't exist."));
  if (id) return void detail(content, signal, detailViews[entity](encodeURIComponent(id)));
  renderList(content, entity, query);
}

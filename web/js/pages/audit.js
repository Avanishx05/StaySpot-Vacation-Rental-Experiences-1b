import { api } from "../api.js";
import { getActor } from "../state.js";
import { replaceQuery } from "../router.js";
import { dateTime, localDayToIso, money, shortId, signedMoney, toDateInput } from "../format.js";
import { h, replace, latest, badge, banner, button, card, empty, errorState, idLink, loading, pagination, tableWrap, dl } from "../dom.js";

const LIMIT = 25;

export function render({ view, query }) {
  const guestId = query.get("guest") || (getActor() && getActor().id);
  view.append(h("h1", null, "Wallet audit trail"));
  if (!guestId) return void view.append(banner("info", "Choose who you are first", "Use “Acting as” in the header to pick a guest, or open a guest from Browse and click “Audit trail”."));

  const st = { page: Math.max(1, parseInt(query.get("page"), 10) || 1), from: query.get("from") || "", to: query.get("to") || "", order: query.get("order") === "asc" ? "asc" : "desc" };
  const run = latest();
  const head = h("div");
  const body = h("div");
  const msg = h("div", { "aria-live": "polite" });

  const from = h("input", { type: "date", id: "from", value: st.from, "aria-label": "From date" });
  const to = h("input", { type: "date", id: "to", value: st.to, "aria-label": "To date" });
  const apply = () => {
    if (from.value && to.value && from.value > to.value) return replace(msg, banner("error", "Check the dates", "“From” must be on or before “To”."));
    replace(msg);
    st.from = from.value; st.to = to.value; st.page = 1; sync(); load();
  };
  const preset = (days) => () => { const t = new Date(); const f = new Date(); f.setDate(f.getDate() - days + 1); from.value = toDateInput(f); to.value = toDateInput(t); apply(); };
  const toolbar = h("div", { class: "toolbar" },
    h("label", { for: "from" }, "From"), from, h("label", { for: "to" }, "To"), to,
    button("Apply", { onClick: apply }), button("Last 7 days", { variant: "ghost", onClick: preset(7) }), button("Last 30 days", { variant: "ghost", onClick: preset(30) }),
    button("All time", { variant: "ghost", onClick: () => { from.value = ""; to.value = ""; apply(); } }));
  const sync = () => replaceQuery({ guest: query.get("guest") || "", from: st.from, to: st.to, page: st.page === 1 ? "" : st.page, order: st.order === "asc" ? "asc" : "" });

  view.append(card(null, [head, toolbar, msg, body]));

  async function load() {
    if (!body.firstChild) replace(body, loading()); else body.classList.add("dim");
    const params = { page: st.page, limit: LIMIT, order: st.order, from: localDayToIso(st.from), to: localDayToIso(st.to, 1) };
    const r = await run((signal) => api(`/guests/${encodeURIComponent(guestId)}/audit`, { signal, params }));
    if (r.stale) return;
    body.classList.remove("dim");
    if (r.error) {
      if (r.error.status === 404) return replace(head, empty("Guest not found", "That guest may have been removed.")), replace(body);
      return replace(body, errorState(r.error, load));
    }
    const { guest, items, total, summary } = r.data;
    replace(head, h("div", { class: "audit-head" },
      h("div", null, h("h2", null, guest.name), h("p", { class: "muted" }, "Guest ", h("a", { class: "mono", href: `#/browse/guests/${guest.id}` }, shortId(guest.id)))),
      h("div", { class: "audit-balance" }, h("span", { class: "muted" }, "Current balance"), h("strong", null, money(guest.wallet_balance)))));
    const lastPage = Math.max(1, Math.ceil(total / LIMIT));
    let main;
    if (!items.length && total > 0) {
      main = empty("That page doesn't exist", `There are only ${lastPage} pages.`, button("Go to the last page", { variant: "secondary", onClick: () => { st.page = lastPage; sync(); load(); } }));
    } else if (!items.length) {
      main = empty(st.from || st.to ? "No wallet activity in this period" : "No wallet activity yet", st.from || st.to ? "Try a wider date range." : "Every deduction or top-up will be listed here, written automatically by the database.");
    } else {
      main = h("div", null,
        dl([["Entries", total.toLocaleString()], ["Opening balance", money(summary.openingBalance)], ["Total credits", h("span", { class: "pos" }, money(summary.totalCredits))], ["Total debits", h("span", { class: "neg" }, money(summary.totalDebits))], ["Closing balance", h("strong", null, money(summary.closingBalance))]]),
        tableWrap(h("table", null,
          h("thead", null, h("tr", null, [h("th", null, h("button", { class: "th-sort", onClick: () => { st.order = st.order === "asc" ? "desc" : "asc"; st.page = 1; sync(); load(); } }, `When ${st.order === "asc" ? "▲" : "▼"}`)), h("th", null, "Type"), h("th", { class: "num" }, "Amount"), h("th", { class: "num" }, "Running balance"), h("th", null, "Booking")])),
          h("tbody", null, items.map((a) => h("tr", null,
            h("td", { "data-label": "When" }, dateTime(a.timestamp)), h("td", { "data-label": "Type" }, badge(a.action_type)),
            h("td", { class: "num " + (Number(a.amount_changed) < 0 ? "neg" : "pos"), "data-label": "Amount" }, signedMoney(a.amount_changed)),
            h("td", { class: "num", "data-label": "Running balance" }, money(a.balance_after)),
            h("td", { "data-label": "Booking" }, a.booking_id ? idLink(`#/browse/bookings/${a.booking_id}`, a.booking_id) : h("span", { class: "muted" }, "—"))))))),
        pagination({ page: st.page, limit: LIMIT, total, onPage: (p) => { st.page = p; sync(); load(); } }));
    }
    replace(body, main);
  }
  load();
}

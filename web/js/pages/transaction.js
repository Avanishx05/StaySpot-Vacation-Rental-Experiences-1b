import { api } from "../api.js";
import { getActor, refreshActor } from "../state.js";
import { dateTime, estimateTotal, money, signedMoney, shortId } from "../format.js";
import { h, replace, latest, badge, banner, button, card, combobox, dl, empty, errorState, field, idLink, linkButton, loading, setBusy, tableWrap } from "../dom.js";

const MAX_NIGHTS = 365;

/** Turn an API error into something a guest can act on. */
export function friendlyError(err) {
  const d = err.details || {};
  switch (err.code) {
    case "INSUFFICIENT_BALANCE":
      return { title: "Not enough money in your wallet",
        text: d.required ? `This stay costs ${money(d.required)} but your wallet holds ${money(d.available)} — you're short by ${money(d.shortBy)}. Nothing was booked and nothing was charged.` : "Nothing was booked and nothing was charged." };
    case "ACTIVE_STAY_EXISTS":
      return { title: "You already have a stay in progress",
        text: `A guest can only be checked in to one property at a time.${d.activePropertyTitle ? ` Complete your stay at “${d.activePropertyTitle}” first.` : ""}` };
    case "INVALID_TRANSITION": return { title: "That step isn't allowed", text: err.message };
    case "NOT_FOUND": return { title: "We couldn't find that", text: `${err.message} It may have been removed — pick again.` };
    case "AMOUNT_TOO_LARGE": return { title: "Amount too large", text: err.message };
    case "VALIDATION_ERROR": return { title: "Please check the form", text: err.message };
    case "BUSY": return { title: "The system is busy", text: "Nothing was changed. Please try again in a moment." };
    case "DB_UNAVAILABLE": case "NETWORK": return { title: "Can't reach the service", text: `${err.message} Nothing was changed.` };
    default: return { title: "Something went wrong", text: `${err.message} If you were booking, check “Your bookings” below before retrying.` };
  }
}

export function render({ view, query, signal }) {
  const actor = getActor();
  view.append(h("h1", null, "Book a stay"));
  if (!actor) return void view.append(banner("info", "Choose who you are first", "Use “Acting as” in the header to search for and pick a guest."));

  let property = null;
  let busy = false;

  // ---- booking form ----
  const resultBox = h("div", { "aria-live": "polite" });
  const propChosen = h("div", { class: "chosen" });
  const nights = h("input", { id: "nights", type: "number", min: "1", max: String(MAX_NIGHTS), step: "1", value: "1", inputmode: "numeric", required: true });
  const nightsField = h("div");
  const propField = h("div");
  const estimate = h("div", { class: "estimate", "aria-live": "polite" });
  const balanceLine = h("p", { class: "balance-line" });
  const submit = button("Book stay", { variant: "primary", type: "submit" });

  const paintBalance = () => { const a = getActor(); replace(balanceLine, "Wallet balance: ", h("strong", null, money(a && a.wallet_balance))); paintEstimate(); };
  const readNights = () => (/^\d+$/.test(nights.value.trim()) ? parseInt(nights.value, 10) : NaN);
  function nightsError() {
    const n = readNights();
    return Number.isInteger(n) && n >= 1 && n <= MAX_NIGHTS ? null : `Enter a whole number of nights between 1 and ${MAX_NIGHTS}.`;
  }
  function paintEstimate() {
    const n = readNights();
    if (!property || nightsError()) return replace(estimate, h("span", { class: "muted" }, "Pick a property and number of nights to see the total."));
    const total = estimateTotal(property.base_price, n);
    const bal = getActor().wallet_balance;
    const short = Number(total) > Number(bal);
    replace(estimate, dl([["Price", `${money(property.base_price)} × ${n} night${n > 1 ? "s" : ""}`], ["Estimated total", h("strong", null, money(total))], ["Balance after", h("strong", { class: short ? "neg" : "" }, short ? "Not enough funds" : money((Number(bal) - Number(total)).toFixed(2)))]]));
  }
  function paintProperty() {
    replace(propChosen, property ? [h("strong", null, property.title), " · ", money(property.base_price), " / night ", h("a", { href: `#/browse/properties/${property.id}` }, "details")] : h("span", { class: "muted" }, "No property selected"));
    paintEstimate();
  }
  const picker = combobox({
    id: "property-search", placeholder: "Search properties by title…",
    fetchOptions: (q, s) => api("/properties", { params: { q, limit: 8 }, signal: s }).then((r) => r.items),
    renderOption: (p) => [h("span", null, p.title), h("span", { class: "muted" }, money(p.base_price))],
    onPick: (p) => { property = p; replace(propField, field("Property", [picker, propChosen], { id: "property-search" })); paintProperty(); },
  });
  replace(propField, field("Property", [picker, propChosen], { id: "property-search" }));
  nights.addEventListener("input", () => { const e = nightsField.querySelector(".error-text"); if (e) e.remove(); paintEstimate(); }); // never re-create the input: it would lose focus
  replace(nightsField, field("Nights", nights, { id: "nights", hint: `1–${MAX_NIGHTS}` }));
  paintProperty(); paintBalance();

  if (query.get("property")) {
    api(`/properties/${encodeURIComponent(query.get("property"))}`, { signal }).then((p) => { property = p; paintProperty(); })
      .catch((err) => { if (!signal.aborted) replace(resultBox, banner("info", "Couldn't load the selected property", "Search for it below instead.")); });
  }

  const form = h("form", { class: "form", novalidate: true }, balanceLine, propField, nightsField, estimate, h("div", { class: "form-actions" }, submit));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return; // double-click / Enter spam guard
    const errs = {};
    if (!property) errs.property = "Choose a property.";
    const ne = nightsError(); if (ne) errs.nights = ne;
    replace(propField, field("Property", [picker, propChosen], { id: "property-search", error: errs.property }));
    replace(nightsField, field("Nights", nights, { id: "nights", hint: `1–${MAX_NIGHTS}`, error: errs.nights }));
    if (Object.keys(errs).length) return replace(resultBox, banner("error", "Please correct the form", Object.values(errs).join(" ")));
    busy = true; setBusy(submit, true, "Booking…"); replace(resultBox);
    try {
      const out = await api("/bookings", { method: "POST", body: { guestId: actor.id, propertyId: property.id, nights: readNights() } });
      replace(resultBox, banner("success", "Booking confirmed 🎉", dl([
        ["Booking", idLink(`#/browse/bookings/${out.booking.id}`, out.booking.id)], ["Property", out.booking.property.title],
        ["Total charged", h("strong", null, money(out.booking.total_cost))],
        ["Wallet before → after", `${money(out.balanceBefore)} → ${money(out.balanceAfter)}`],
        out.auditEntry && ["Audit entry (written by the database)", `${out.auditEntry.action_type} ${signedMoney(out.auditEntry.amount_changed)} · balance ${money(out.auditEntry.balance_after)}`]].filter(Boolean)),
        h("p", null, linkButton("View audit trail", `#/audit?guest=${actor.id}`, "secondary"))));
      await Promise.all([refreshActor(), loadBookings()]);
      paintBalance();
    } catch (err) {
      const f = friendlyError(err);
      if (err.details && err.code === "VALIDATION_ERROR") {
        if (err.details.nights) replace(nightsField, field("Nights", nights, { id: "nights", error: err.details.nights }));
      }
      replace(resultBox, banner("error", f.title, f.text));
      await refreshActor().then(paintBalance); // shows the balance is unchanged
    } finally { busy = false; setBusy(submit, false); }
  });

  view.append(card("New booking", [form, resultBox]));

  // ---- the guest's bookings with status actions ----
  const listBox = h("div");
  const statusMsg = h("div", { "aria-live": "polite" });
  const runList = latest();
  async function loadBookings() {
    if (!listBox.firstChild) replace(listBox, loading());
    const r = await runList((s) => api("/bookings", { params: { guestId: actor.id, limit: 10 }, signal: s }));
    if (r.stale) return;
    if (r.error) return replace(listBox, errorState(r.error, loadBookings));
    const { items, total } = r.data;
    if (!items.length) return replace(listBox, empty("No bookings yet", "Book a stay above and it will appear here."));
    const act = (b, status, label) => {
      const btn = button(label, { variant: "secondary", onClick: async () => {
        setBusy(btn, true);
        try {
          await api(`/bookings/${b.id}/status`, { method: "PATCH", body: { status } });
          replace(statusMsg, banner("success", `Booking ${shortId(b.id)} is now ${status === "CHECKED_IN" ? "checked in" : "completed"}`));
        } catch (err) { const f = friendlyError(err); replace(statusMsg, banner("error", f.title, f.text)); }
        await loadBookings();
      } });
      return btn;
    };
    replace(listBox, tableWrap(h("table", null,
      h("thead", null, h("tr", null, ["Booking", "Property", "Nights", "Total", "Status", "Next step"].map((t, i) => h("th", { class: i === 2 || i === 3 ? "num" : "" }, t)))),
      h("tbody", null, items.map((b) => h("tr", null,
        h("td", null, idLink(`#/browse/bookings/${b.id}`, b.id)), h("td", null, b.property.title), h("td", { class: "num" }, b.nights), h("td", { class: "num" }, money(b.total_cost)),
        h("td", null, badge(b.status)),
        h("td", null, b.status === "CONFIRMED" ? act(b, "CHECKED_IN", "Check in") : b.status === "CHECKED_IN" ? act(b, "COMPLETED", "Complete stay") : h("span", { class: "muted" }, "—"))))))),
      total > items.length && h("p", { class: "muted" }, `Latest ${items.length} of ${total.toLocaleString()}. `, h("a", { href: `#/browse/bookings?guestId=${actor.id}` }, "See all")));
  }
  view.append(card("Your bookings", [h("p", { class: "muted" }, "A guest can have only one stay checked in at a time: check in one booking, then try to check in another to see the database refuse it."), statusMsg, listBox]));
  loadBookings();

  // ---- demo tool: top up ----
  const amount = h("input", { id: "topup", type: "number", min: "1", step: "0.01", placeholder: "Amount in ₹", inputmode: "decimal" });
  const topMsg = h("div", { "aria-live": "polite" });
  const topBtn = button("Add money", { variant: "secondary", type: "submit" });
  const topForm = h("form", { class: "toolbar", novalidate: true }, amount, topBtn);
  topForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (topBtn.disabled) return;
    setBusy(topBtn, true, "Adding…");
    try {
      const out = await api(`/guests/${actor.id}/topup`, { method: "POST", body: { amount: amount.value.trim() } });
      replace(topMsg, banner("success", "Money added", `Balance ${money(out.balanceBefore)} → ${money(out.balanceAfter)}. The database logged a CREDIT audit entry.`));
      amount.value = ""; await refreshActor(); paintBalance();
    } catch (err) { const f = friendlyError(err); replace(topMsg, banner("error", f.title, err.code === "VALIDATION_ERROR" ? "Enter a positive amount (max ₹10,00,000, up to 2 decimals)." : f.text)); }
    finally { setBusy(topBtn, false); }
  });
  view.append(card("Demo tools · top up wallet", [topForm, topMsg]));
}

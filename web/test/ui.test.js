const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./harness");

let t;
const RICH = "00000000-0000-4000-8000-000000000002", LOW = "00000000-0000-4000-8000-000000000001", ACTIVE = "00000000-0000-4000-8000-000000000003";
const P1 = "00000000-0000-4000-8000-0000000010a1";
const XSS = `<img src=x onerror="window.__pwned=1">`;

before(async () => {
  t = await boot();
  await t.addProperty(t.db, P1, "Beach House", 1000);
  await t.addGuest(t.db, RICH, "Rich Tester", "50000.00");
  await t.addGuest(t.db, LOW, "Poor Tester", "500.00");
  await t.addGuest(t.db, ACTIVE, "Active Tester", "50000.00");
  await t.addGuest(t.db, t.uid(50), XSS, "1.00");
  for (let i = 1; i <= 30; i++) await t.addGuest(t.db, t.uid(100 + i), `Filler ${String(i).padStart(2, "0")}`, "10.00");
});
after(async () => { await t.stop(); });

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
const actor = (id, name, bal) => ({ id, name, wallet_balance: bal });

test("booking succeeds: shows confirmation, before -> after balance and the trigger-written audit entry", async () => {
  await t.mount("transaction", `#/book?property=${P1}`, actor(RICH, "Rich Tester", "50000.00"));
  await t.waitFor(() => $(".chosen") && $(".chosen").textContent.includes("Beach House"), "property prefilled");
  type($("#nights"), "3");
  assert.match(t.text(), /Estimated total.*3,000\.00/);
  submit($("form.form"));
  await t.waitFor(() => t.text().includes("Booking confirmed"), "success banner");
  assert.match(t.text(), /₹50,000\.00 → ₹47,000\.00/);
  assert.match(t.text(), /DEBIT −₹3,000\.00/);
  await t.waitFor(() => t.text().includes("Check in"), "new booking listed with next action");
});

test("insufficient balance: friendly message with the shortfall, nothing booked, balance untouched", async () => {
  await t.mount("transaction", `#/book?property=${P1}`, actor(LOW, "Poor Tester", "500.00"));
  await t.waitFor(() => $(".chosen") && $(".chosen").textContent.includes("Beach House"), "property prefilled");
  submit($("form.form"));
  await t.waitFor(() => t.text().includes("Not enough money in your wallet"), "error banner");
  assert.match(t.text(), /costs ₹1,000\.00 but your wallet holds ₹500\.00.*short by ₹500\.00/);
  assert.match(t.text(), /Nothing was booked and nothing was charged/);
  assert.equal(Number((await t.db.query("select count(*) from bookings where guest_id=$1", [LOW])).rows[0].count), 0);
  assert.equal((await t.db.query("select wallet_balance from guests where id=$1", [LOW])).rows[0].wallet_balance, "500.00");
});

test("client-side validation blocks bad nights without calling the server", async () => {
  await t.mount("transaction", `#/book?property=${P1}`, actor(RICH, "Rich Tester", "47000.00"));
  await t.waitFor(() => $(".chosen") && $(".chosen").textContent.includes("Beach House"), "property prefilled");
  const before = t.calls.filter((c) => c.method === "POST").length;
  for (const bad of ["0", "-3", "1.5", "abc", "", "366", "1e3"]) {
    type($("#nights"), bad);
    submit($("form.form"));
    assert.match(t.text(), /Enter a whole number of nights between 1 and 365/, `nights=${JSON.stringify(bad)}`);
  }
  assert.equal(t.calls.filter((c) => c.method === "POST").length, before);
});

test("no property chosen -> inline error, no request", async () => {
  await t.mount("transaction", `#/book`, actor(RICH, "Rich Tester", "47000.00"));
  const before = t.calls.filter((c) => c.method === "POST").length;
  submit($("form.form"));
  assert.match(t.text(), /Choose a property/);
  assert.equal(t.calls.filter((c) => c.method === "POST").length, before);
});

test("double submit (user hammering Enter) creates exactly one booking", async () => {
  const bookingsBefore = Number((await t.db.query("select count(*) from bookings where guest_id=$1", [RICH])).rows[0].count);
  await t.mount("transaction", `#/book?property=${P1}`, actor(RICH, "Rich Tester", "47000.00"));
  await t.waitFor(() => $(".chosen") && $(".chosen").textContent.includes("Beach House"), "property prefilled");
  const f = $("form.form");
  submit(f); submit(f); submit(f);
  await t.waitFor(() => t.text().includes("Booking confirmed"));
  await new Promise((r) => setTimeout(r, 200));
  const after = Number((await t.db.query("select count(*) from bookings where guest_id=$1", [RICH])).rows[0].count);
  assert.equal(after, bookingsBefore + 1);
});

test("check-in twice for one guest: second is refused with a plain-English reason", async () => {
  await t.db.query(`insert into bookings (guest_id, property_id, nights, total_cost, status) values ($1,$2,1,1000,'CONFIRMED'),($1,$2,1,1000,'CONFIRMED')`, [ACTIVE, P1]);
  await t.mount("transaction", `#/book`, actor(ACTIVE, "Active Tester", "50000.00"));
  await t.waitFor(() => $$("button").filter((b) => b.textContent === "Check in").length === 2, "two check-in buttons");
  click($$("button").find((b) => b.textContent === "Check in"));
  await t.waitFor(() => t.text().includes("is now checked in"), "first check-in");
  await t.waitFor(() => $$("button").filter((b) => b.textContent === "Check in").length === 1, "one button left");
  click($$("button").find((b) => b.textContent === "Check in"));
  await t.waitFor(() => t.text().includes("You already have a stay in progress"), "conflict message");
  assert.match(t.text(), /only be checked in to one property at a time/);
});

test("no acting guest: Book and Audit screens ask to pick one", async () => {
  await t.mount("transaction", "#/book", null);
  assert.match(t.text(), /Choose who you are first/);
  await t.mount("audit", "#/audit", null);
  assert.match(t.text(), /Choose who you are first/);
});

test("API down: booking shows a 'can't reach' message and says nothing was changed", async () => {
  await t.mount("transaction", `#/book?property=${P1}`, actor(RICH, "Rich Tester", "40000.00"));
  await t.waitFor(() => $(".chosen") && $(".chosen").textContent.includes("Beach House"), "property prefilled");
  globalThis.fakeFetchError = true;
  try {
    submit($("form.form"));
    await t.waitFor(() => t.text().includes("Can't reach the service"));
    assert.match(t.text(), /Nothing was changed/);
  } finally { globalThis.fakeFetchError = false; }
});

test("browse: table, search, no-match empty state, out-of-range page, server error + retry", async () => {
  await t.mount("browse", "#/browse/guests", null);
  // browse.render expects rest=['guests']; mount passes [] so call directly:
  document.getElementById("view").replaceChildren();
  const { parseHash } = await import("../js/router.js");
  const mod = await import("../js/pages/browse.js");
  const view = document.getElementById("view");
  const go = (hash, rest) => { window.history.replaceState(null, "", hash); view.replaceChildren(); mod.render({ view, rest, query: parseHash().query, signal: new AbortController().signal }); };

  go("#/browse/guests?limit=10", ["guests"]);
  await t.waitFor(() => $$("tbody tr").length === 10, "10 rows");
  assert.match(t.text(), /1–10 of 34/);

  const search = $("input[type=search]");
  type(search, "filler 07");
  await t.waitFor(() => $$("tbody tr").length === 1, "search filtered");
  type(search, "zzzzzz");
  await t.waitFor(() => t.text().includes("No matches"));

  go("#/browse/guests?page=999&limit=10", ["guests"]);
  await t.waitFor(() => t.text().includes("That page doesn't exist"));
  click($$("button").find((b) => b.textContent === "Go to the last page"));
  await t.waitFor(() => $$("tbody tr").length > 0, "last page rows");

  globalThis.fakeFetchError = true;
  try {
    go("#/browse/guests", ["guests"]);
    await t.waitFor(() => t.text().includes("Can't reach the server"));
  } finally { globalThis.fakeFetchError = false; }
  click($$("button").find((b) => b.textContent === "Try again"));
  await t.waitFor(() => $$("tbody tr").length > 0, "recovered after retry");
});

test("hostile data is rendered as text, never as HTML (XSS)", async () => {
  const { parseHash } = await import("../js/router.js");
  const mod = await import("../js/pages/browse.js");
  const view = document.getElementById("view");
  window.history.replaceState(null, "", "#/browse/guests?q=img");
  view.replaceChildren();
  mod.render({ view, rest: ["guests"], query: parseHash().query, signal: new AbortController().signal });
  await t.waitFor(() => t.text().includes("onerror"), "hostile name shown as text");
  assert.equal($$("img").length, 0);
  assert.equal(window.__pwned, undefined);
});

test("audit: rows, running balance, filtered-empty state, bad range", async () => {
  await t.mount("audit", `#/audit`, actor(RICH, "Rich Tester", "40000.00"));
  await t.waitFor(() => $$("tbody tr").length >= 1, "audit rows");
  assert.match(t.text(), /Running balance/);
  assert.match(t.text(), /Closing balance/);
  const from = $("#from"), to = $("#to");
  from.value = "2001-01-01"; to.value = "2001-01-31";
  click($$("button").find((b) => b.textContent === "Apply"));
  await t.waitFor(() => t.text().includes("No wallet activity in this period"));
  from.value = "2026-05-02"; to.value = "2026-05-01";
  click($$("button").find((b) => b.textContent === "Apply"));
  await t.waitFor(() => t.text().includes("“From” must be on or before “To”"));
});

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { resetDatabase, uid, addGuest, addProperty } = require("./helpers");

let db, app, pool;
before(async () => {
  db = await resetDatabase();
  app = require("../src/app").createApp();
  pool = require("../src/db").pool;
  await addProperty(db, uid(1001), "Beach House", 1000);
});
after(async () => { await pool.end(); await db.end(); });

const audit = (id, qs = "") => request(app).get(`/api/guests/${id}/audit${qs}`);

test("rows written in ONE transaction get distinct timestamps (clock_timestamp) - order and running balance stay correct", async () => {
  const g = uid(1);
  await addGuest(db, g, "Ordering Guest", "1000.00");
  // 6 wallet changes in a single transaction => identical current_timestamp-style times
  await db.query(`do $$ begin
      update guests set wallet_balance = wallet_balance + 500 where id='${g}';
      update guests set wallet_balance = wallet_balance - 200 where id='${g}';
      update guests set wallet_balance = wallet_balance + 50  where id='${g}';
      update guests set wallet_balance = wallet_balance - 700 where id='${g}';
      update guests set wallet_balance = wallet_balance + 1   where id='${g}';
      update guests set wallet_balance = wallet_balance - 1   where id='${g}';
    end $$`);
  const r = await audit(g, "?order=asc").expect(200);
  assert.equal(r.body.total, 6);
  // distinct at the database's microsecond precision (JSON/JS dates only keep milliseconds)
  assert.equal(Number((await db.query("select count(distinct timestamp) from wallet_audit_logs where guest_id=$1", [g])).rows[0].count), 6);
  assert.deepEqual(r.body.items.map((i) => i.balance_after), ["1500.00", "1300.00", "1350.00", "650.00", "651.00", "650.00"]);
  // each row's balance_after must equal previous balance_after + amount_changed
  let prev = 1000;
  for (const it of r.body.items) {
    assert.equal(Number(it.balance_after), prev + Number(it.amount_changed));
    prev = Number(it.balance_after);
  }
  assert.equal(r.body.summary.openingBalance, "1000.00");
  assert.equal(r.body.summary.closingBalance, "650.00");
  assert.equal(r.body.summary.totalCredits, "551.00");
  assert.equal(r.body.summary.totalDebits, "901.00");
  // newest first is the exact reverse
  const d = await audit(g).expect(200);
  assert.deepEqual(d.body.items.map((i) => i.id), r.body.items.map((i) => i.id).reverse());
  // last running balance == the wallet's real balance
  assert.equal(r.body.guest.wallet_balance, "650.00");
});

test("zero-change updates and no-op updates write no audit row", async () => {
  const g = uid(2);
  await addGuest(db, g, "Quiet Guest", "10.00");
  await db.query("update guests set wallet_balance = wallet_balance where id=$1", [g]);
  await db.query("update guests set name = 'Renamed' where id=$1", [g]);
  const r = await audit(g).expect(200);
  assert.equal(r.body.total, 0);
  assert.deepEqual(r.body.items, []);
  assert.equal(r.body.summary.openingBalance, null);
  assert.equal(r.body.summary.closingBalance, null);
  assert.equal(r.body.summary.totalCredits, "0");
});

test("a guest never sees another guest's audit rows", async () => {
  const a = uid(3), b = uid(4);
  await addGuest(db, a, "A", "10.00"); await addGuest(db, b, "B", "10.00");
  await db.query("update guests set wallet_balance = wallet_balance + 5 where id=$1", [a]);
  await db.query("update guests set wallet_balance = wallet_balance + 7 where id=$1", [b]);
  assert.equal((await audit(a)).body.items[0].amount_changed, "5.00");
  assert.equal((await audit(b)).body.items[0].amount_changed, "7.00");
});

test("date filter: whole UTC days, both ends inclusive, plus ISO timestamps (to exclusive)", async () => {
  const g = uid(5);
  await addGuest(db, g, "Dated Guest", "0.00");
  // create 4 rows then back-date them (as table owner, trigger disabled) to known instants
  await db.query(`do $$ begin
      update guests set wallet_balance = wallet_balance + 1 where id='${g}';
      update guests set wallet_balance = wallet_balance + 1 where id='${g}';
      update guests set wallet_balance = wallet_balance + 1 where id='${g}';
      update guests set wallet_balance = wallet_balance + 1 where id='${g}';
    end $$`);
  await db.query("alter table wallet_audit_logs disable trigger audit_log_immutable");
  const stamps = ["2026-03-10T23:59:59Z", "2026-03-11T00:00:00Z", "2026-03-12T12:00:00Z", "2026-03-13T00:00:00Z"];
  const rows = (await db.query("select id from wallet_audit_logs where guest_id=$1 order by timestamp, id", [g])).rows;
  for (let i = 0; i < 4; i++) await db.query("update wallet_audit_logs set timestamp=$1 where id=$2", [stamps[i], rows[i].id]);
  await db.query("alter table wallet_audit_logs enable trigger audit_log_immutable");

  const day = (await audit(g, "?from=2026-03-11&to=2026-03-12&order=asc")).body;
  assert.equal(day.total, 2); // 03-11 00:00 and 03-12 12:00 ; 03-10 23:59 and 03-13 00:00 are outside
  assert.deepEqual(day.items.map((i) => i.balance_after), ["2.00", "3.00"]);
  assert.equal(day.summary.openingBalance, "1.00"); // balance before the first row in the window
  assert.equal(day.summary.closingBalance, "3.00");

  assert.equal((await audit(g, "?from=2026-03-13")).body.total, 1);
  assert.equal((await audit(g, "?to=2026-03-10")).body.total, 1);
  assert.equal((await audit(g, "?from=2026-03-11T00:00:00Z&to=2026-03-13T00:00:00Z")).body.total, 2); // 'to' exclusive
  assert.equal((await audit(g, "?from=2030-01-01")).body.total, 0);        // empty range -> empty state
  assert.equal((await audit(g, "?from=2026-03-11&to=2026-03-11")).body.total, 1); // single day
});

test("date filter validation: bad dates, impossible dates, from after to", async () => {
  const g = uid(5);
  for (const qs of ["from=banana", "to=2026-13-01", "from=2026-02-31", "from=2026-03-12&to=2026-03-11", "from=12/03/2026", "from=2026-03-11T00:00:00Z&to=2026-03-11T00:00:00Z"]) {
    const r = await audit(g, `?${qs}`).expect(400);
    assert.equal(r.body.error.code, "VALIDATION_ERROR", qs);
  }
  await audit(g, "?order=up").expect(400);
});

test("pagination of the audit trail keeps order across pages", async () => {
  const g = uid(6);
  await addGuest(db, g, "Many Rows", "0.00");
  await db.query(`do $$ begin for i in 1..57 loop update guests set wallet_balance = wallet_balance + i where id='${g}'; end loop; end $$`);
  const seen = [];
  for (const p of [1, 2, 3]) {
    const r = (await audit(g, `?order=asc&limit=25&page=${p}`).expect(200)).body;
    assert.equal(r.total, 57);
    seen.push(...r.items.map((i) => Number(i.balance_after)));
  }
  assert.equal(seen.length, 57);
  assert.deepEqual(seen, [...seen].sort((x, y) => x - y)); // strictly increasing running balance
  assert.equal(new Set(seen).size, 57);                     // no duplicates / gaps between pages
  assert.equal((await audit(g, "?page=4&limit=25")).body.items.length, 0);
});

test("unknown guest 404, malformed id 400", async () => {
  await audit(uid(31337)).expect(404);
  await audit("nope").expect(400);
});

test("audit rows are immutable at the database level", async () => {
  const g = uid(1);
  const row = (await db.query("select id from wallet_audit_logs where guest_id=$1 limit 1", [g])).rows[0].id;
  await assert.rejects(db.query("update wallet_audit_logs set amount_changed = 0 where id=$1", [row]), /append-only/);
  await assert.rejects(db.query("delete from wallet_audit_logs where id=$1", [row]), /append-only/);
  await assert.rejects(db.query("truncate wallet_audit_logs"), /append-only/);
  await assert.rejects(
    db.query("insert into wallet_audit_logs(guest_id, amount_changed, action_type, balance_after) values ($1, 1, 'CREDIT', 1)", [g]),
    /append-only/
  );
});

test("a booking produces a DEBIT audit row linked to that booking", async () => {
  const g = uid(7);
  await addGuest(db, g, "Booker", "3000.00");
  const b = (await request(app).post("/api/bookings").send({ guestId: g, propertyId: uid(1001), nights: 2 }).expect(201)).body;
  const r = (await audit(g)).body;
  assert.equal(r.total, 1);
  assert.equal(r.items[0].action_type, "DEBIT");
  assert.equal(r.items[0].amount_changed, "-2000.00");
  assert.equal(r.items[0].booking_id, b.booking.id);
  assert.equal(r.items[0].balance_after, r.guest.wallet_balance);
  assert.equal(r.guest.wallet_balance, "1000.00");
});

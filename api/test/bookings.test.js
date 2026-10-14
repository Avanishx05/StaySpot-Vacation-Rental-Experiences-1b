const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { resetDatabase, uid, addGuest, addProperty } = require("./helpers");

let db, app, pool;
const G = uid(1), P = uid(1001), PRICEY = uid(1002), HUGE = uid(1003);

before(async () => {
  db = await resetDatabase();
  app = require("../src/app").createApp();
  pool = require("../src/db").pool;
  await addProperty(db, P, "Beach House", 1000);
  await addProperty(db, PRICEY, "Palace", 50000);
  await addProperty(db, HUGE, "Absurd Mansion", 99999999);
});
after(async () => { await pool.end(); await db.end(); });

beforeEach(async () => {
  // fresh guest each test: bookings first (FK), audit rows cannot be deleted -> use new guest ids
});

let n = 100;
async function freshGuest(balance) {
  const id = uid(++n);
  await addGuest(db, id, `Tester ${n}`, balance);
  return id;
}
const post = (body) => request(app).post("/api/bookings").send(body);
const count = async (sql, p) => Number((await db.query(sql, p)).rows[0].count);

test("success: returns booking, balance before/after and the audit row written by the trigger", async () => {
  const g = await freshGuest("5000.00");
  const r = await post({ guestId: g, propertyId: P, nights: 3 }).expect(201);
  assert.equal(r.body.balanceBefore, "5000.00");
  assert.equal(r.body.balanceAfter, "2000.00");
  assert.equal(r.body.booking.total_cost, "3000.00");
  assert.equal(r.body.booking.status, "CONFIRMED");
  assert.equal(r.body.booking.property.title, "Beach House");
  const a = r.body.auditEntry;
  assert.equal(a.action_type, "DEBIT");
  assert.equal(a.amount_changed, "-3000.00");
  assert.equal(a.balance_after, "2000.00");
  assert.equal(a.booking_id, r.body.booking.id); // trigger linked the audit row to this booking
  assert.equal(await count("select count(*) from wallet_audit_logs where guest_id=$1", [g]), 1);
});

test("price is taken from the DB, a client-supplied cost is ignored", async () => {
  const g = await freshGuest("5000.00");
  const r = await post({ guestId: g, propertyId: P, nights: 1, total_cost: 1, price: 0 }).expect(201);
  assert.equal(r.body.booking.total_cost, "1000.00");
});

test("boundary: balance exactly equal to the cost succeeds and leaves 0.00", async () => {
  const g = await freshGuest("2000.00");
  const r = await post({ guestId: g, propertyId: P, nights: 2 }).expect(201);
  assert.equal(r.body.balanceAfter, "0.00");
});

test("boundary: one paisa short fails with INSUFFICIENT_BALANCE and numbers to explain it", async () => {
  const g = await freshGuest("1999.99");
  const r = await post({ guestId: g, propertyId: P, nights: 2 }).expect(422);
  assert.equal(r.body.error.code, "INSUFFICIENT_BALANCE");
  assert.deepEqual(r.body.error.details, { available: "1999.99", required: "2000.00", shortBy: "0.01" });
});

test("failure rolls back completely: no booking, no audit row, balance unchanged", async () => {
  const g = await freshGuest("100.00");
  await post({ guestId: g, propertyId: PRICEY, nights: 1 }).expect(422);
  assert.equal(await count("select count(*) from bookings where guest_id=$1", [g]), 0);
  assert.equal(await count("select count(*) from wallet_audit_logs where guest_id=$1", [g]), 0);
  assert.equal((await db.query("select wallet_balance from guests where id=$1", [g])).rows[0].wallet_balance, "100.00");
});

test("unknown guest / unknown property => 404 and nothing is written", async () => {
  const g = await freshGuest("9000.00");
  const before = await count("select count(*) from bookings");
  const a = await post({ guestId: uid(999999), propertyId: P, nights: 1 }).expect(404);
  assert.equal(a.body.error.code, "NOT_FOUND");
  const b = await post({ guestId: g, propertyId: uid(888888), nights: 1 }).expect(404);
  assert.equal(b.body.error.code, "NOT_FOUND");
  assert.equal(await count("select count(*) from bookings"), before);
  assert.equal((await db.query("select wallet_balance from guests where id=$1", [g])).rows[0].wallet_balance, "9000.00");
});

test("validation: missing/invalid fields give field-level messages (400)", async () => {
  const g = await freshGuest("9000.00");
  const bad = [
    [{}, ["guestId", "propertyId", "nights"]],
    [{ guestId: "nope", propertyId: P, nights: 1 }, ["guestId"]],
    [{ guestId: g, propertyId: "nope", nights: 1 }, ["propertyId"]],
    [{ guestId: g, propertyId: P, nights: 0 }, ["nights"]],
    [{ guestId: g, propertyId: P, nights: -2 }, ["nights"]],
    [{ guestId: g, propertyId: P, nights: 1.5 }, ["nights"]],
    [{ guestId: g, propertyId: P, nights: "abc" }, ["nights"]],
    [{ guestId: g, propertyId: P, nights: null }, ["nights"]],
    [{ guestId: g, propertyId: P, nights: 366 }, ["nights"]],
    [{ guestId: g, propertyId: P, nights: 1e21 }, ["nights"]],
  ];
  for (const [body, fields] of bad) {
    const r = await post(body).expect(400);
    assert.equal(r.body.error.code, "VALIDATION_ERROR", JSON.stringify(body));
    for (const f of fields) assert.ok(r.body.error.details[f], `${f} for ${JSON.stringify(body)}`);
  }
  assert.equal(await count("select count(*) from bookings where guest_id=$1", [g]), 0);
  await request(app).post("/api/bookings").set("Content-Type", "application/json").send("null").expect(400);
});

test("a nights string from a form (\"2\") is accepted", async () => {
  const g = await freshGuest("5000.00");
  await post({ guestId: g, propertyId: P, nights: "2" }).expect(201);
});

test("amount too large for decimal(10,2) is a friendly 422, not a 500", async () => {
  const g = await freshGuest("99999999.00");
  const r = await post({ guestId: g, propertyId: HUGE, nights: 2 }).expect(422);
  assert.equal(r.body.error.code, "AMOUNT_TOO_LARGE");
});

test("payload that is far too big is rejected", async () => {
  const r = await request(app).post("/api/bookings").send({ guestId: "x".repeat(20000) });
  assert.equal(r.status, 413);
});

// ---------- status machine & the partial unique index ----------
const patch = (id, status) => request(app).patch(`/api/bookings/${id}/status`).send({ status });
async function bookTwice(g) {
  const a = (await post({ guestId: g, propertyId: P, nights: 1 }).expect(201)).body.booking.id;
  const b = (await post({ guestId: g, propertyId: P, nights: 1 }).expect(201)).body.booking.id;
  return [a, b];
}

test("status: CONFIRMED -> CHECKED_IN -> COMPLETED", async () => {
  const g = await freshGuest("9000.00");
  const [a] = await bookTwice(g);
  assert.equal((await patch(a, "CHECKED_IN").expect(200)).body.booking.status, "CHECKED_IN");
  assert.equal((await patch(a, "COMPLETED").expect(200)).body.booking.status, "COMPLETED");
});

test("idx_active_stay: a second CHECKED_IN for the same guest is blocked with ACTIVE_STAY_EXISTS (409)", async () => {
  const g = await freshGuest("9000.00");
  const [a, b] = await bookTwice(g);
  await patch(a, "CHECKED_IN").expect(200);
  const r = await patch(b, "CHECKED_IN").expect(409);
  assert.equal(r.body.error.code, "ACTIVE_STAY_EXISTS");
  assert.equal(r.body.error.details.activeBookingId, a);
  assert.equal((await db.query("select status from bookings where id=$1", [b])).rows[0].status, "CONFIRMED");
  // completing the first frees the slot
  await patch(a, "COMPLETED").expect(200);
  await patch(b, "CHECKED_IN").expect(200);
});

test("different guests may be checked in at the same time", async () => {
  const g1 = await freshGuest("9000.00"), g2 = await freshGuest("9000.00");
  const a = (await post({ guestId: g1, propertyId: P, nights: 1 })).body.booking.id;
  const b = (await post({ guestId: g2, propertyId: P, nights: 1 })).body.booking.id;
  await patch(a, "CHECKED_IN").expect(200);
  await patch(b, "CHECKED_IN").expect(200);
});

test("status: illegal transitions and bad input", async () => {
  const g = await freshGuest("9000.00");
  const [a] = await bookTwice(g);
  assert.equal((await patch(a, "COMPLETED").expect(409)).body.error.code, "INVALID_TRANSITION"); // skipping a step
  await patch(a, "CHECKED_IN").expect(200);
  assert.equal((await patch(a, "CHECKED_IN").expect(409)).body.error.code, "INVALID_TRANSITION"); // repeat
  await patch(a, "COMPLETED").expect(200);
  assert.equal((await patch(a, "CHECKED_IN").expect(409)).body.error.code, "INVALID_TRANSITION"); // backwards
  await patch(a, "CONFIRMED").expect(400);
  await patch(a, "BOGUS").expect(400);
  await patch(a, undefined).expect(400);
  await patch("not-a-uuid", "CHECKED_IN").expect(400);
  await patch(uid(31337), "CHECKED_IN").expect(404);
});

test("booking detail: 200 / 404 / 400", async () => {
  const g = await freshGuest("9000.00");
  const id = (await post({ guestId: g, propertyId: P, nights: 1 })).body.booking.id;
  const r = await request(app).get(`/api/bookings/${id}`).expect(200);
  assert.equal(r.body.guest.id, g);
  await request(app).get(`/api/bookings/${uid(5)}`).expect(404);
  await request(app).get(`/api/bookings/zzz`).expect(400);
});

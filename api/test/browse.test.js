const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { resetDatabase, uid, addGuest, addProperty } = require("./helpers");

let db, app, pool;
before(async () => {
  db = await resetDatabase();
  ({ createApp: app } = require("../src/app"));
  app = app();
  pool = require("../src/db").pool;
  for (let i = 1; i <= 60; i++) await addGuest(db, uid(i), `Guest ${String(i).padStart(2, "0")}`, 1000 + i);
  await addGuest(db, uid(900), "50%_off O'Brien", 10);
  await addProperty(db, uid(1001), "Beach House", 2000);
  await addProperty(db, uid(1002), "City Loft", 4500);
  await addProperty(db, uid(1003), "Mountain Cabin", 4500.5);
  await db.query(`insert into bookings (guest_id, property_id, nights, total_cost, status)
                  select $1, $2, 1, 2000, 'COMPLETED' from generate_series(1, 30)`, [uid(1), uid(1001)]);
});
after(async () => { await pool.end(); await db.end(); });

test("guests: paginates and reports total", async () => {
  const r = await request(app).get("/api/guests?limit=25&page=3").expect(200);
  assert.equal(r.body.total, 61);
  assert.equal(r.body.items.length, 11); // 61 - 50
  assert.equal(r.body.page, 3);
});

test("guests: huge limit is clamped to 100, never returns the whole table", async () => {
  await db.query(`insert into guests (name, wallet_balance) select 'Bulk ' || g, 1 from generate_series(1, 300) g`);
  const r = await request(app).get("/api/guests?limit=100000").expect(200);
  assert.equal(r.body.limit, 100);
  assert.equal(r.body.items.length, 100);
  assert.equal(r.body.total, 361);
});

test("guests: page beyond the end gives an empty list, not an error", async () => {
  const r = await request(app).get("/api/guests?page=9999").expect(200);
  assert.deepEqual(r.body.items, []);
  assert.equal(r.body.total, 361);
});

test("guests: bad pagination input is a 400 with field details", async () => {
  for (const qs of ["page=0", "page=-1", "page=abc", "page=1.5", "limit=0", "limit=-5", "limit=x", "page=99999999999"]) {
    const r = await request(app).get(`/api/guests?${qs}`).expect(400);
    assert.equal(r.body.error.code, "VALIDATION_ERROR", qs);
  }
});

test("guests: search is case-insensitive and escapes LIKE wildcards", async () => {
  const a = await request(app).get("/api/guests?q=guest 07").expect(200);
  assert.equal(a.body.total, 1);
  // "%" and "_" typed by the user must match literally, not as wildcards
  const b = await request(app).get("/api/guests?q=" + encodeURIComponent("50%_off")).expect(200);
  assert.equal(b.body.total, 1);
  const c = await request(app).get("/api/guests?q=" + encodeURIComponent("%")).expect(200);
  assert.equal(c.body.total, 1);
  const d = await request(app).get("/api/guests?q=" + encodeURIComponent("O'Brien")).expect(200);
  assert.equal(d.body.total, 1);
});

test("guests: SQL-injection style input is treated as plain text", async () => {
  const r = await request(app).get("/api/guests?q=" + encodeURIComponent("'; drop table guests; --")).expect(200);
  assert.equal(r.body.total, 0);
  const sort = await request(app).get("/api/guests?sort=" + encodeURIComponent("name; drop table guests")).expect(400);
  assert.equal(sort.body.error.code, "VALIDATION_ERROR");
  await request(app).get("/api/guests?limit=1").expect(200); // table still there
});

test("guests: over-long search term is rejected", async () => {
  await request(app).get("/api/guests?q=" + "a".repeat(101)).expect(400);
});

test("guests: search by exact id works; sorting works", async () => {
  const r = await request(app).get(`/api/guests?q=${uid(5)}`).expect(200);
  assert.equal(r.body.total, 1);
  const s = await request(app).get("/api/guests?sort=wallet_balance&order=desc&limit=1").expect(200);
  assert.equal(s.body.items[0].name, "Guest 60");
  await request(app).get("/api/guests?order=sideways").expect(400);
});

test("guest detail: 200 with bookings, 404 unknown, 400 malformed id", async () => {
  const r = await request(app).get(`/api/guests/${uid(1)}`).expect(200);
  assert.equal(r.body.bookingCount, 30);
  assert.equal(r.body.bookings.length, 20); // most recent 20 only
  assert.equal(r.body.bookings[0].property.title, "Beach House");
  assert.equal(typeof r.body.wallet_balance, "string"); // money is never a float
  await request(app).get(`/api/guests/${uid(424242)}`).expect(404);
  await request(app).get(`/api/guests/not-a-uuid`).expect(400);
  await request(app).get(`/api/guests/1' or '1'='1`).expect(400);
});

test("properties: price filters, validation and sorting", async () => {
  const r = await request(app).get("/api/properties?minPrice=4500&maxPrice=4500.50&sort=base_price&order=desc").expect(200);
  assert.deepEqual(r.body.items.map((p) => p.title), ["Mountain Cabin", "City Loft"]);
  await request(app).get("/api/properties?minPrice=9&maxPrice=1").expect(400);
  await request(app).get("/api/properties?minPrice=abc").expect(400);
  await request(app).get("/api/properties?minPrice=-5").expect(400);
  const none = await request(app).get("/api/properties?q=zzz").expect(200);
  assert.deepEqual(none.body.items, []);
});

test("properties detail: includes booking count; unknown id 404", async () => {
  const r = await request(app).get(`/api/properties/${uid(1001)}`).expect(200);
  assert.equal(r.body.bookingCount, 30);
  await request(app).get(`/api/properties/${uid(31337)}`).expect(404);
});

test("bookings: filters by status/guest/property; validates enums and ids", async () => {
  const r = await request(app).get(`/api/bookings?status=completed&guestId=${uid(1)}&limit=5`).expect(200);
  assert.equal(r.body.total, 30);
  assert.equal(r.body.items.length, 5);
  assert.equal(r.body.items[0].guest.name, "Guest 01");
  const none = await request(app).get("/api/bookings?status=CONFIRMED").expect(200);
  assert.equal(none.body.total, 0);
  await request(app).get("/api/bookings?status=NOPE").expect(400);
  await request(app).get("/api/bookings?guestId=xyz").expect(400);
});

test("bookings: free-text search over guest name / property title", async () => {
  const r = await request(app).get("/api/bookings?q=beach").expect(200);
  assert.equal(r.body.total, 30);
  const g = await request(app).get("/api/bookings?q=" + encodeURIComponent("guest 01")).expect(200);
  assert.equal(g.body.total, 30);
});

test("unknown API route returns JSON 404; malformed JSON body returns 400", async () => {
  const r = await request(app).get("/api/does-not-exist").expect(404);
  assert.equal(r.body.error.code, "NOT_FOUND");
  const bad = await request(app).post("/api/bookings").set("Content-Type", "application/json").send("{oops").expect(400);
  assert.equal(bad.body.error.code, "VALIDATION_ERROR");
});

test("actors: bounded, name-ordered search", async () => {
  const r = await request(app).get("/api/actors").expect(200);
  assert.ok(r.body.length <= 20);
  const names = r.body.map((a) => a.name);
  assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y)));
  const q = await request(app).get("/api/actors?q=guest 0&limit=3").expect(200);
  assert.equal(q.body.length, 3);
});

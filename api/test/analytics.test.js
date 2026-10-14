// Analytics routes against the REAL schema, window-function queries and materialized view (throw-away DB, arranged data).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { resetDatabase, uid, addGuest } = require("./helpers");

let db, app, pool;
const P1 = uid(2001), P2 = uid(2002), P3 = uid(2003), G = uid(1);
const get = (p) => request(app).get("/api" + p);
const book = (property, cost, at, status = "COMPLETED") =>
  db.query("insert into bookings (guest_id, property_id, nights, total_cost, status, created_at) values ($1,$2,1,$3,$4,$5)", [G, property, cost, status, at]);

before(async () => {
  db = await resetDatabase();
  app = require("../src/app").createApp();
  pool = require("../src/db").pool;
  await addGuest(db, G, "Analytics Guest", "0.00");
  for (const [id, title] of [[P1, "Tie A"], [P2, "Tie B"], [P3, "Tie C"]]) {
    await db.query("insert into properties (id, title, base_price, latitude, longitude) values ($1,$2,1,17.4,78.4)", [id, title]);
  }
  // P1: 700 on 01-01, 1400 on 01-03, 350 on 01-10 (12:00 UTC keeps the calendar day in any realistic server time zone)
  await book(P1, 700, "2020-01-01 12:00+00"); await book(P1, 1400, "2020-01-03 12:00+00"); await book(P1, 350, "2020-01-10 12:00+00");
  await book(P2, 700, "2020-01-01 12:00+00");
  await book(P3, 350, "2020-01-01 12:00+00");
});
after(async () => { await pool.end(); await db.end(); });

test("moving average equals a hand-computed 7-calendar-day window (days without bookings count as 0)", async () => {
  const r = (await get(`/analytics/moving-average?propertyId=${P1}`).expect(200)).body;
  assert.deepEqual(r, [
    { date: "2020-01-01", dailyRevenue: "700.00", movingAvg7d: "100.00" },   // 700 / 7
    { date: "2020-01-03", dailyRevenue: "1400.00", movingAvg7d: "300.00" },  // (700 + 1400) / 7
    { date: "2020-01-10", dailyRevenue: "350.00", movingAvg7d: "50.00" },    // window 01-04..01-10 = 350 / 7
  ]);
});

test("from/to filter does not change the averages (the 6 days before `from` still count)", async () => {
  const r = (await get(`/analytics/moving-average?propertyId=${P1}&from=2020-01-03&to=2020-01-05`).expect(200)).body;
  assert.deepEqual(r.map((x) => [x.date, x.movingAvg7d]), [["2020-01-03", "300.00"]]);
});

test("moving average: validation and unknown property", async () => {
  await get("/analytics/moving-average").expect(400);
  await get("/analytics/moving-average?propertyId=nope").expect(400);
  const bad = await get(`/analytics/moving-average?propertyId=${P1}&from=13/10/2026`).expect(400);
  assert.equal(bad.body.error.code, "VALIDATION_ERROR");
  await get(`/analytics/moving-average?propertyId=${P1}&from=2020-02-01&to=2020-01-01`).expect(400);
  assert.deepEqual((await get(`/analytics/moving-average?propertyId=${uid(9999)}`).expect(200)).body, []);
});

test("ranking: DENSE_RANK - ties share a rank and the next rank is not skipped; limit is clamped", async () => {
  const r = (await get("/analytics/ranking?date=2020-01-01").expect(200)).body;
  assert.deepEqual(r.map((x) => x.rank), [1, 1, 2]);
  assert.deepEqual(r.map((x) => x.title), ["Tie A", "Tie B", "Tie C"]);
  assert.equal(r[0].movingAvg7d, "100.00"); assert.equal(r[2].movingAvg7d, "50.00"); assert.equal(r[0].date, "2020-01-01");
  assert.equal((await get("/analytics/ranking?date=2020-01-01&limit=2")).body.length, 2);
  assert.equal((await get("/analytics/ranking?date=2020-01-01&limit=1000")).body.length, 3);
  assert.deepEqual((await get("/analytics/ranking?date=1999-01-01")).body, []);
  await get("/analytics/ranking?date=bad").expect(400);
  const latest = (await get("/analytics/ranking")).body; // defaults to the most recent booking date (2020-01-10)
  assert.equal(latest.length, 1); assert.equal(latest[0].date, "2020-01-10");
});

test("summary + refresh: materialized view is stale until refreshed, and lastRefreshed moves", async () => {
  const first = (await request(app).post("/api/analytics/summary/refresh").expect(200)).body;
  const s1 = (await get("/analytics/summary").expect(200)).body;
  assert.equal(s1.totals.properties, 3); assert.equal(s1.totals.bookings, 5); assert.equal(s1.totals.gross, "3500.00");
  assert.equal(s1.lastRefreshed, first.lastRefreshed);
  await book(P1, 1234, "2020-02-01 12:00+00");
  assert.equal((await get("/analytics/summary")).body.totals.gross, "3500.00"); // stale
  const r = (await request(app).post("/api/analytics/summary/refresh").expect(200)).body;
  assert.ok(Date.parse(r.lastRefreshed) > Date.parse(first.lastRefreshed));
  const s2 = (await get("/analytics/summary")).body;
  assert.equal(s2.totals.gross, "4734.00"); assert.equal(s2.rows[0].title, "Tie A"); assert.equal(s2.lastRefreshed, r.lastRefreshed);
});

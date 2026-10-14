// Concurrency + scale tests. These are the "what if many people click at once / the table is huge" checks.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { resetDatabase, uid, addGuest, addProperty } = require("./helpers");

let db, server, app, pool;
before(async () => {
  db = await resetDatabase();
  app = require("../src/app").createApp();
  server = app.listen(0);
  pool = require("../src/db").pool;
  await addProperty(db, uid(1001), "Beach House", 1000);
});
after(async () => { server.close(); await pool.end(); await db.end(); });

const book = (guestId, nights = 1) => request(server).post("/api/bookings").send({ guestId, propertyId: uid(1001), nights });

test("40 simultaneous bookings, wallet affords exactly 7: exactly 7 succeed, rest get 422, never negative", async () => {
  const g = uid(1);
  await addGuest(db, g, "Racer", "7000.00");
  const results = await Promise.all(Array.from({ length: 40 }, () => book(g)));
  const ok = results.filter((r) => r.status === 201);
  const refused = results.filter((r) => r.status === 422);
  assert.equal(ok.length, 7);
  assert.equal(refused.length, 33);
  assert.ok(refused.every((r) => r.body.error.code === "INSUFFICIENT_BALANCE"));
  assert.equal(results.length, ok.length + refused.length, "no 500s / timeouts");

  assert.equal((await db.query("select wallet_balance from guests where id=$1", [g])).rows[0].wallet_balance, "0.00");
  assert.equal(Number((await db.query("select count(*) from bookings where guest_id=$1", [g])).rows[0].count), 7);
  // audit trail: exactly one DEBIT per successful booking and an unbroken balance chain
  const a = (await db.query("select amount_changed, balance_after from wallet_audit_logs where guest_id=$1 order by timestamp, id", [g])).rows;
  assert.equal(a.length, 7);
  let bal = 7000;
  for (const r of a) { bal += Number(r.amount_changed); assert.equal(Number(r.balance_after), bal); }
  // each response's before/after is consistent with the serialised order (no two share a "before")
  assert.equal(new Set(ok.map((r) => r.body.balanceBefore)).size, 7);
});

test("20 guests booking in parallel do not block or corrupt each other", async () => {
  const ids = Array.from({ length: 20 }, (_, i) => uid(100 + i));
  for (const id of ids) await addGuest(db, id, `Parallel ${id.slice(-3)}`, "5000.00");
  const rs = await Promise.all(ids.flatMap((id) => [book(id, 2), book(id, 1)]));
  assert.ok(rs.every((r) => r.status === 201));
  const bad = await db.query("select count(*) from guests where wallet_balance <> 2000.00 and id = any($1)", [ids]);
  assert.equal(Number(bad.rows[0].count), 0);
});

test("two bookings of the SAME guest checked in simultaneously: exactly one wins (idx_active_stay)", async () => {
  const g = uid(300);
  await addGuest(db, g, "Double Checkin", "9000.00");
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push((await book(g)).body.booking.id);
  const rs = await Promise.all(ids.map((id) => request(server).patch(`/api/bookings/${id}/status`).send({ status: "CHECKED_IN" })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409 && r.body.error.code === "ACTIVE_STAY_EXISTS").length, 5);
  assert.equal(Number((await db.query("select count(*) from bookings where guest_id=$1 and status='CHECKED_IN'", [g])).rows[0].count), 1);
});

test("same booking checked in twice at once: one success, one INVALID_TRANSITION, no 500", async () => {
  const g = uid(301);
  await addGuest(db, g, "Double Click", "9000.00");
  const id = (await book(g)).body.booking.id;
  const rs = await Promise.all([1, 2, 3, 4].map(() => request(server).patch(`/api/bookings/${id}/status`).send({ status: "CHECKED_IN" })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.status === 409));
});

test("a burst of 300 reads is served without errors", async () => {
  const rs = await Promise.all(Array.from({ length: 300 }, (_, i) => request(server).get(`/api/guests?limit=10&page=${(i % 5) + 1}`)));
  assert.ok(rs.every((r) => r.status === 200));
});

// ---------------- scale ----------------
test("at scale (50k bookings, 100k audit rows): browse + audit stay fast and bounded", { timeout: 110000 }, async () => {
  await db.query(`insert into guests (id, name, wallet_balance)
                  select gen_random_uuid(), 'Scale ' || g || ' ' || md5(g::text), 100000 from generate_series(1, 5000) g`);
  await db.query(`insert into properties (id, title, base_price, latitude, longitude)
                  select gen_random_uuid(), 'Villa ' || g || ' ' || md5(g::text), 1000 + g, 17, 78 from generate_series(1, 1000) g`);
  await db.query(`insert into bookings (guest_id, property_id, nights, total_cost, status, created_at)
                  select (select id from guests where name like 'Scale %' offset (g % 5000) limit 1),
                         (select id from properties where title like 'Villa %' offset (g % 1000) limit 1),
                         1 + g % 7, 1000, (array['CONFIRMED','COMPLETED'])[1 + g % 2],
                         now() - (g % 90) * interval '1 day'
                    from generate_series(1, 50000) g`).catch(async () => {
    // fallback (faster, no correlated subqueries)
    await db.query(`with gs as (select id, row_number() over () rn from guests where name like 'Scale %'),
                         ps as (select id, row_number() over () rn from properties where title like 'Villa %')
                    insert into bookings (guest_id, property_id, nights, total_cost, status, created_at)
                    select gs.id, ps.id, 1 + g % 7, 1000, (array['CONFIRMED','COMPLETED'])[1 + g % 2], now() - (g % 90) * interval '1 day'
                      from generate_series(1, 50000) g
                      join gs on gs.rn = 1 + g % 5000 join ps on ps.rn = 1 + g % 1000`);
  });
  // 20 wallet movements for each of 5000 guests => 100k trigger-written audit rows
  await db.query(`do $$ begin for i in 1..20 loop
                    update guests set wallet_balance = wallet_balance + (case when i % 2 = 0 then 3 else 5 end) where name like 'Scale %';
                  end loop; end $$`);
  await db.query("analyze");

  const total = Number((await db.query("select count(*) from bookings")).rows[0].count);
  const audits = Number((await db.query("select count(*) from wallet_audit_logs")).rows[0].count);
  assert.ok(total >= 50000, `bookings=${total}`);
  assert.ok(audits >= 100000, `audit=${audits}`);

  const timed = async (label, p, maxMs) => {
    const t = Date.now(); const r = await p; const ms = Date.now() - t;
    console.log(`    ${label}: ${ms} ms`);
    assert.equal(r.status, 200, label);
    assert.ok(ms < maxMs, `${label} took ${ms} ms (limit ${maxMs})`);
    return r.body;
  };
  const one = (await db.query("select id as guest_id from guests where name like 'Scale %' limit 1")).rows[0].guest_id;

  const list = await timed("bookings page 1", request(server).get("/api/bookings?limit=25"), 800);
  assert.equal(list.items.length, 25); assert.ok(list.total >= 50000);
  await timed("bookings deep page 1500", request(server).get("/api/bookings?limit=25&page=1500"), 800);
  await timed("bookings by status", request(server).get("/api/bookings?status=COMPLETED&limit=25"), 800);
  await timed("bookings text search", request(server).get("/api/bookings?q=Villa 12&limit=25"), 1500);
  await timed("guests search (trigram)", request(server).get("/api/guests?q=scale 4&limit=25"), 800);
  await timed("properties price filter", request(server).get("/api/properties?minPrice=1500&maxPrice=1700"), 800);
  const a = await timed("audit trail of one guest", request(server).get(`/api/guests/${one}/audit?limit=25`), 800);
  assert.equal(a.total, 20);
  await timed("audit trail with date filter", request(server).get(`/api/guests/${one}/audit?from=2020-01-01&to=2099-01-01`), 800);

  // the audit lookup must use the (guest_id, timestamp, id) index, not scan 100k rows
  const plan = (await db.query(`explain select * from wallet_audit_logs where guest_id='${one}' order by timestamp desc, id desc limit 25`)).rows
    .map((r) => r["QUERY PLAN"]).join("\n");
  assert.match(plan, /idx_audit_guest_ts/);
  assert.doesNotMatch(plan, /Seq Scan on wallet_audit_logs/);
});

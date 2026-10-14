import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { query, pool } from '../src/db.js';
after(() => pool.end());
const get = (p) => request(app).get('/api' + p);
// the busiest properties by number of booking days (works with any seed)
const busy = async (n) => (await query(`select property_id id from bookings group by 1 order by count(distinct date(created_at)) desc, 1 limit 3`)).rows[n];

async function dailyRev(pid) {
  const { rows } = await query(`select to_char(date(created_at),'YYYY-MM-DD') d, sum(total_cost)::float r from bookings where property_id=$1 group by 1 order by 1`, [pid]);
  return rows;
}
const avgAt = (days, d) => { const t = Date.parse(d); return days.filter(x => Date.parse(x.d) <= t && Date.parse(x.d) >= t - 6 * 864e5).reduce((s, x) => s + x.r, 0) / 7; };

test('moving average equals a hand-computed 7-day calendar window', async () => {
  const p = await busy(0);
  const days = await dailyRev(p.id);
  const res = await get('/analytics/moving-average?propertyId=' + p.id).expect(200);
  assert.equal(res.body.length, days.length);
  for (const row of res.body) {
    assert.equal(Number(row.movingAvg7d), Math.round(avgAt(days, row.date) * 100) / 100, row.date);
    assert.match(row.dailyRevenue, /^\d+\.\d{2}$/);
  }
});

test('from/to filter does not change the averages', async () => {
  const p = await busy(1);
  const full = (await get('/analytics/moving-average?propertyId=' + p.id)).body;
  const i = Math.max(0, Math.floor(full.length / 2) - 2), from = full[i].date, to = full[Math.min(full.length - 1, i + 5)].date;
  const part = (await get(`/analytics/moving-average?propertyId=${p.id}&from=${from}&to=${to}`).expect(200)).body;
  assert.ok(part.length >= 1);
  assert.deepEqual(part, full.filter(r => r.date >= from && r.date <= to));
});

test('moving average validation and unknown property', async () => {
  await get('/analytics/moving-average').expect(400);
  await get('/analytics/moving-average?propertyId=nope').expect(400);
  const { rows: [p] } = await query('select id from properties limit 1');
  const r = await get(`/analytics/moving-average?propertyId=${p.id}&from=13/10/2026`).expect(400);
  assert.equal(r.body.error.code, 'INVALID_INPUT');
  assert.deepEqual((await get('/analytics/moving-average?propertyId=00000000-0000-0000-0000-000000000000').expect(200)).body, []);
});

test('ranking: dense ranks, ties share a rank, default date, limit', async () => {
  const ins = await query(`insert into properties(title,base_price,latitude,longitude) values ('Tie A',1,0,0),('Tie B',1,0,0),('Tie C',1,0,0) returning id,title`);
  const [a, b, c] = ins.rows.map(x => x.id);
  const { rows: [g] } = await query('select id from guests limit 1');
  try {
    for (const [pid, cost] of [[a, 700], [b, 700], [c, 350]])
      await query(`insert into bookings(guest_id,property_id,nights,total_cost,status,created_at) values ($1,$2,1,$3,'COMPLETED','2020-01-01 12:00+00')`, [g.id, pid, cost]);
    const r = (await get('/analytics/ranking?date=2020-01-01').expect(200)).body;
    assert.deepEqual(r.map(x => x.rank), [1, 1, 2]);           // tie shares rank 1, next rank is 2 (dense)
    assert.equal(r[0].movingAvg7d, '100.00'); assert.equal(r[2].movingAvg7d, '50.00');
    assert.equal(r[0].date, '2020-01-01');
    assert.equal((await get('/analytics/ranking?date=2020-01-01&limit=2')).body.length, 2);
    assert.equal((await get('/analytics/ranking?date=2020-01-01&limit=1000')).body.length, 3); // clamped, not an error
    const latest = (await get('/analytics/ranking')).body;     // defaults to the most recent booking date
    assert.ok(latest.length > 0 && latest.every((x, i) => i === 0 || x.rank >= latest[i - 1].rank));
    assert.deepEqual((await get('/analytics/ranking?date=1999-01-01')).body, []);
    await get('/analytics/ranking?date=bad').expect(400);
  } finally {
    await query('delete from bookings where property_id = any($1)', [[a, b, c]]);
    await query('delete from properties where id = any($1)', [[a, b, c]]);
  }
});

test('summary + refresh: lastRefreshed moves and new bookings appear only after refresh', async () => {
  const s1 = (await get('/analytics/summary').expect(200)).body;
  assert.ok(s1.rows.length > 0 && s1.totals.properties > 0 && s1.lastRefreshed);
  const p = await busy(0);
  const { rows: [g] } = await query('select id from guests limit 1');
  await query(`insert into bookings(guest_id,property_id,nights,total_cost,status) values ($1,$2,1,1234.00,'COMPLETED')`, [g.id, p.id]);
  try {
    const stale = (await get('/analytics/summary')).body;
    assert.equal(stale.totals.gross, s1.totals.gross);          // materialized view is stale until refreshed
    const r = (await request(app).post('/api/analytics/summary/refresh').expect(200)).body;
    assert.ok(Date.parse(r.lastRefreshed) > Date.parse(s1.lastRefreshed));
    const fresh = (await get('/analytics/summary')).body;
    assert.equal(Number(fresh.totals.gross) - Number(s1.totals.gross), 1234);
    assert.equal(fresh.lastRefreshed, r.lastRefreshed);
  } finally {
    await query('delete from bookings where total_cost = 1234.00 and property_id = $1', [p.id]);
    await request(app).post('/api/analytics/summary/refresh');
  }
});

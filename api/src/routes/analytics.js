// Screen 4. Mount with app.use('/api', router). Needs ../db.js (query) and ../http.js (HttpError, wrap).
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, wrap } from '../http.js';
const r = Router();
const bad = (m) => new HttpError(400, 'INVALID_INPUT', m);
const day = (v, n) => { if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${n} must be YYYY-MM-DD`); return v; };
const lim = (v) => Math.min(Math.max(parseInt(v) || 10, 1), 100);

// Property filter goes in the first CTE, date filter in the final select, so the 6 days before `from` still count.
r.get('/analytics/moving-average', wrap(async (req, res) => {
  const { propertyId } = req.query;
  if (!/^[0-9a-f-]{36}$/i.test(propertyId || '')) throw bad('propertyId is required');
  const { rows } = await query(`
    with daily as (select date(created_at) d, sum(total_cost) rev from bookings where property_id = $1 group by 1),
    ma as (select d, rev, sum(rev) over (order by d range between interval '6 days' preceding and current row) / 7.0 avg7 from daily)
    select to_char(d,'YYYY-MM-DD') as "date", round(rev,2)::text as "dailyRevenue", round(avg7,2)::text as "movingAvg7d"
    from ma where ($2::date is null or d >= $2::date) and ($3::date is null or d <= $3::date) order by d`,
    [propertyId, day(req.query.from, 'from'), day(req.query.to, 'to')]);
  res.json(rows);
}));

// One day's DENSE_RANK() (ties share a rank). Defaults to the latest booking date. Each item also carries `date`.
r.get('/analytics/ranking', wrap(async (req, res) => {
  let d = day(req.query.date, 'date');
  if (!d) d = (await query(`select to_char(max(date(created_at)),'YYYY-MM-DD') d from bookings`)).rows[0].d;
  if (!d) return res.json([]);
  const { rows } = await query(`
    with daily as (select property_id, date(created_at) d, sum(total_cost) rev from bookings
                   where created_at >= $1::date - 6 and created_at < $1::date + 1 group by 1, 2),
    ma as (select property_id, d, sum(rev) over (partition by property_id order by d range between interval '6 days' preceding and current row) / 7.0 avg7 from daily),
    rk as (select property_id, d, avg7, dense_rank() over (partition by d order by avg7 desc) as rnk from ma)
    select rk.rnk::int as rank, rk.property_id as "propertyId", p.title, round(rk.avg7,2)::text as "movingAvg7d", to_char($1::date,'YYYY-MM-DD') as "date"
    from rk join properties p on p.id = rk.property_id where rk.d = $1::date order by rk.rnk, p.title limit $2`, [d, lim(req.query.limit)]);
  res.json(rows);
}));

r.get('/analytics/summary', wrap(async (req, res) => {
  const [rows, tot, log] = await Promise.all([
    query(`select propertyid as "propertyId", title, totalnightsbooked::int as "totalNightsBooked", totalbookings::int as "totalBookings",
           round(grossrevenue,2)::text as "grossRevenue" from property_summary order by grossrevenue desc limit $1`, [lim(req.query.limit)]),
    query(`select round(sum(grossrevenue),2)::text as gross, sum(totalnightsbooked)::int as nights, sum(totalbookings)::int as bookings, count(*)::int as properties from property_summary`),
    query(`select refreshed_at from mv_refresh_log where view_name = 'property_summary'`),
  ]);
  res.json({ rows: rows.rows, totals: tot.rows[0], lastRefreshed: log.rows[0]?.refreshed_at?.toISOString() ?? null });
}));

r.post('/analytics/summary/refresh', wrap(async (req, res) => {
  const { rows } = await query('select refresh_property_summary() as ts');
  res.json({ lastRefreshed: rows[0].ts.toISOString() });
}));
export default r;

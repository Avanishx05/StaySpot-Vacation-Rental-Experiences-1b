// Screen 3.4 - Analytics. Window-function queries (sql/06_window_analytics.sql, per property) + the materialized view.
const router = require("express").Router();
const { query } = require("../db");
const { badRequest } = require("../errors");
const { uuidParam } = require("../validate");

const day = (v, name) => {
  if (v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) {
    throw badRequest(`"${name}" must be YYYY-MM-DD.`, { [name]: "Use YYYY-MM-DD." });
  }
  return v;
};
const topN = (v) => Math.min(Math.max(parseInt(v, 10) || 10, 1), 100);

// GET /api/analytics/moving-average?propertyId&from&to -> [{ date, dailyRevenue, movingAvg7d }]
// Property filter is in the first CTE and the date filter in the last select, so the 6 days before `from` still count.
router.get("/moving-average", async (req, res, next) => {
  try {
    if (!req.query.propertyId) throw badRequest('"propertyId" is required.', { propertyId: "Required." });
    const propertyId = uuidParam(req.query.propertyId, "propertyId");
    const from = day(req.query.from, "from");
    const to = day(req.query.to, "to");
    if (from && to && from > to) throw badRequest('"from" must be on or before "to".', { from: "Must be <= to." });
    const { rows } = await query(
      `with daily as (
         select date(created_at) d, sum(total_cost) rev from bookings where property_id = $1 group by 1),
       ma as (
         select d, rev, sum(rev) over (order by d range between interval '6 days' preceding and current row) / 7.0 avg7 from daily)
       select to_char(d,'YYYY-MM-DD') as "date", round(rev,2)::text as "dailyRevenue", round(avg7,2)::text as "movingAvg7d"
         from ma
        where ($2::date is null or d >= $2::date) and ($3::date is null or d <= $3::date)
        order by d`,
      [propertyId, from, to]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/analytics/ranking?date&limit -> [{ rank, propertyId, title, movingAvg7d, date }]  (DENSE_RANK per day; ties share a rank)
router.get("/ranking", async (req, res, next) => {
  try {
    let d = day(req.query.date, "date");
    if (!d) d = (await query(`select to_char(max(date(created_at)),'YYYY-MM-DD') as d from bookings`)).rows[0].d;
    if (!d) return res.json([]);
    const { rows } = await query(
      `with daily as (
         select property_id, date(created_at) d, sum(total_cost) rev from bookings
          where created_at >= $1::date - 6 and created_at < $1::date + 1 group by 1, 2),
       ma as (
         select property_id, d, sum(rev) over (partition by property_id order by d range between interval '6 days' preceding and current row) / 7.0 avg7 from daily),
       rk as (
         select property_id, d, avg7, dense_rank() over (partition by d order by avg7 desc) as rnk from ma)
       select rk.rnk::int as rank, rk.property_id as "propertyId", p.title, round(rk.avg7,2)::text as "movingAvg7d", to_char($1::date,'YYYY-MM-DD') as "date"
         from rk join properties p on p.id = rk.property_id
        where rk.d = $1::date order by rk.rnk, p.title limit $2`,
      [d, topN(req.query.limit)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/analytics/summary -> { rows, totals, lastRefreshed }   (read from the materialized view; stale until refreshed)
router.get("/summary", async (req, res, next) => {
  try {
    const [rows, tot, log] = await Promise.all([
      query(`select propertyid as "propertyId", title, totalnightsbooked::int as "totalNightsBooked", totalbookings::int as "totalBookings",
                    round(grossrevenue,2)::text as "grossRevenue"
               from property_summary order by grossrevenue desc limit $1`, [topN(req.query.limit)]),
      query(`select round(coalesce(sum(grossrevenue),0),2)::text as gross, coalesce(sum(totalnightsbooked),0)::int as nights,
                    coalesce(sum(totalbookings),0)::int as bookings, count(*)::int as properties from property_summary`),
      query(`select refreshed_at from mv_refresh_log where view_name = 'property_summary'`),
    ]);
    const at = log.rows[0] && log.rows[0].refreshed_at;
    res.json({ rows: rows.rows, totals: tot.rows[0], lastRefreshed: at ? new Date(at).toISOString() : null });
  } catch (err) { next(err); }
});

// POST /api/analytics/summary/refresh -> { lastRefreshed }   (REFRESH MATERIALIZED VIEW CONCURRENTLY via sql/05 function)
router.post("/summary/refresh", async (req, res, next) => {
  try {
    const { rows } = await query("select refresh_property_summary() as ts");
    res.json({ lastRefreshed: new Date(rows[0].ts).toISOString() });
  } catch (err) { next(err); }
});

module.exports = router;

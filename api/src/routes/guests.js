const router = require("express").Router();
const { query, withTransaction } = require("../db");
const { notFound, badRequest } = require("../errors");
const config = require("../config");
const {
  pagination, searchTerm, likePattern, sortParam, uuidParam, isUuid, moneyString, parseDateBound,
} = require("../validate");

const SORTS = {
  name: { column: "name", dir: "asc" },
  wallet_balance: { column: "wallet_balance", dir: "desc" },
};

// GET /api/guests?page&limit&q&sort&order
router.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset } = pagination(req.query);
    const q = searchTerm(req.query.q);
    const sort = sortParam(req.query, SORTS, "name");
    const params = [];
    let w = "";
    if (q) {
      params.push(likePattern(q));
      w = `where name ilike $1`;
      if (isUuid(q)) {
        params.push(q);
        w = `where (name ilike $1 or id = $2::uuid)`;
      }
    }
    const [list, count] = await Promise.all([
      query(
        `select id, name, wallet_balance from guests ${w}
          order by ${sort.column} ${sort.dir}, id limit ${limit} offset ${offset}`,
        params
      ),
      query(`select count(*)::int as n from guests ${w}`, params),
    ]);
    res.json({ items: list.rows, page, limit, total: count.rows[0].n });
  } catch (err) {
    next(err);
  }
});

// GET /api/guests/:id -> guest + their most recent bookings
router.get("/:id", async (req, res, next) => {
  try {
    const id = uuidParam(req.params.id);
    const g = await query("select id, name, wallet_balance from guests where id = $1", [id]);
    if (!g.rowCount) throw notFound("Guest");
    const [b, c] = await Promise.all([
      query(
        `select b.id, b.nights, b.total_cost, b.status, b.created_at,
                p.id as property_id, p.title as property_title
           from bookings b join properties p on p.id = b.property_id
          where b.guest_id = $1
          order by b.created_at desc, b.id limit 20`,
        [id]
      ),
      query("select count(*)::int as n from bookings where guest_id = $1", [id]),
    ]);
    res.json({
      ...g.rows[0],
      bookingCount: c.rows[0].n,
      bookings: b.rows.map((r) => ({
        id: r.id, nights: r.nights, total_cost: r.total_cost, status: r.status, created_at: r.created_at,
        property: { id: r.property_id, title: r.property_title },
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/guests/:id/audit?from&to&page&limit&order
//   from/to: YYYY-MM-DD (whole UTC days, both inclusive) or ISO timestamps (from inclusive, to exclusive)
//   items[].balance_after is the running balance at that row. Ordering is by timestamp (then id as a tie-break); the column default is clock_timestamp(),
//   NOT by timestamp: several rows can be written in one transaction and share a timestamp.
router.get("/:id/audit", async (req, res, next) => {
  try {
    const id = uuidParam(req.params.id);
    const { page, limit, offset } = pagination(req.query);
    const from = parseDateBound(req.query.from, "from", false);
    const to = parseDateBound(req.query.to, "to", true);
    if (from && to && new Date(from) >= new Date(to)) {
      throw badRequest('"from" must be earlier than "to".', { from: "Must be before 'to'." });
    }
    const order = String(req.query.order || "desc").toLowerCase();
    if (order !== "asc" && order !== "desc") throw badRequest('"order" must be "asc" or "desc".');

    const g = await query("select id, name, wallet_balance from guests where id = $1", [id]);
    if (!g.rowCount) throw notFound("Guest");

    const params = [id];
    let w = "where guest_id = $1";
    if (from) { params.push(from); w += ` and timestamp >= $${params.length}::timestamptz`; }
    if (to) { params.push(to); w += ` and timestamp < $${params.length}::timestamptz`; }

    const [rows, summary, first, last] = await Promise.all([
      query(
        `select id, timestamp, action_type, amount_changed, balance_after, booking_id
           from wallet_audit_logs ${w}
          order by timestamp ${order}, id ${order} limit ${limit} offset ${offset}`,
        params
      ),
      query(
        `select count(*)::int as n,
                coalesce(sum(amount_changed) filter (where action_type = 'CREDIT'), 0) as total_credits,
                coalesce(-sum(amount_changed) filter (where action_type = 'DEBIT'), 0) as total_debits
           from wallet_audit_logs ${w}`,
        params
      ),
      query(`select balance_after - amount_changed as opening from wallet_audit_logs ${w} order by timestamp asc, id asc limit 1`, params),
      query(`select balance_after as closing from wallet_audit_logs ${w} order by timestamp desc, id desc limit 1`, params),
    ]);

    const s = summary.rows[0];
    res.json({
      guest: g.rows[0],
      items: rows.rows,
      page,
      limit,
      total: s.n,
      summary: {
        totalCredits: s.total_credits,
        totalDebits: s.total_debits,
        openingBalance: first.rowCount ? first.rows[0].opening : null,
        closingBalance: last.rowCount ? last.rows[0].closing : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/guests/:id/topup { amount }  -> { balanceBefore, balanceAfter, auditEntry }
// Demo utility: adds money to the wallet so the trigger's CREDIT path can be shown and a
// guest who ran out of money can book again. The audit row is written by the DB trigger.
router.post("/:id/topup", async (req, res, next) => {
  try {
    const id = uuidParam(req.params.id);
    const amount = moneyString((req.body || {}).amount, "amount", { max: config.limits.maxTopUp });
    const out = await withTransaction(async (c) => {
      const before = await c.query("select wallet_balance from guests where id = $1 for update", [id]);
      if (!before.rowCount) throw notFound("Guest");
      const after = await c.query(
        "update guests set wallet_balance = wallet_balance + $2::numeric where id = $1 returning wallet_balance",
        [id, amount]
      );
      const audit = await c.query(
        `select id, timestamp, action_type, amount_changed, balance_after, booking_id
           from wallet_audit_logs where guest_id = $1 order by timestamp desc, id desc limit 1`,
        [id]
      );
      return {
        balanceBefore: before.rows[0].wallet_balance,
        balanceAfter: after.rows[0].wallet_balance,
        auditEntry: audit.rows[0] || null,
      };
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const router = require("express").Router();
const { query, withTransaction } = require("../db");
const { ApiError, notFound, badRequest, fromPgError } = require("../errors");
const config = require("../config");
const {
  pagination, searchTerm, likePattern, sortParam, uuidParam, optionalUuid, isUuid, parseIntStrict,
} = require("../validate");

const STATUSES = ["CONFIRMED", "CHECKED_IN", "COMPLETED"];
const SORTS = {
  created_at: { column: "b.created_at", dir: "desc" },
  total_cost: { column: "b.total_cost", dir: "desc" },
};

const BOOKING_SELECT = `
  select b.id, b.nights, b.total_cost, b.status, b.created_at,
         g.id as guest_id, g.name as guest_name,
         p.id as property_id, p.title as property_title, p.base_price as property_base_price
    from bookings b
    join guests g on g.id = b.guest_id
    join properties p on p.id = b.property_id`;

const shape = (r) => ({
  id: r.id,
  nights: r.nights,
  total_cost: r.total_cost,
  status: r.status,
  created_at: r.created_at,
  guest: { id: r.guest_id, name: r.guest_name },
  property: { id: r.property_id, title: r.property_title, base_price: r.property_base_price },
});

const AUDIT_COLS = "id, timestamp, action_type, amount_changed, balance_after, booking_id";

// GET /api/bookings?page&limit&status&guestId&propertyId&q&sort&order
router.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset } = pagination(req.query);
    const status = req.query.status === undefined || req.query.status === "" ? undefined : String(req.query.status).toUpperCase();
    if (status && !STATUSES.includes(status)) {
      throw badRequest(`"status" must be one of ${STATUSES.join(", ")}.`, { status: "Unknown status." });
    }
    const guestId = optionalUuid(req.query.guestId, "guestId");
    const propertyId = optionalUuid(req.query.propertyId, "propertyId");
    const q = searchTerm(req.query.q);
    const sort = sortParam(req.query, SORTS, "created_at");

    const where = [];
    const params = [];
    const add = (v) => { params.push(v); return `$${params.length}`; };
    if (status) where.push(`b.status = ${add(status)}`);
    if (guestId) where.push(`b.guest_id = ${add(guestId)}`);
    if (propertyId) where.push(`b.property_id = ${add(propertyId)}`);
    if (q) {
      if (isUuid(q)) {
        const u = add(q.toLowerCase());
        where.push(`(b.id = ${u}::uuid or b.guest_id = ${u}::uuid or b.property_id = ${u}::uuid)`);
      } else {
        const p = add(likePattern(q));
        where.push(
          `(b.guest_id in (select id from guests where name ilike ${p}) or b.property_id in (select id from properties where title ilike ${p}))`
        );
      }
    }
    const w = where.length ? `where ${where.join(" and ")}` : "";

    const [list, count] = await Promise.all([
      query(`${BOOKING_SELECT} ${w} order by ${sort.column} ${sort.dir}, b.id limit ${limit} offset ${offset}`, params),
      query(`select count(*)::int as n from bookings b ${w}`, params),
    ]);
    res.json({ items: list.rows.map(shape), page, limit, total: count.rows[0].n });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/:id
router.get("/:id", async (req, res, next) => {
  try {
    const id = uuidParam(req.params.id);
    const { rows } = await query(`${BOOKING_SELECT} where b.id = $1`, [id]);
    if (!rows.length) throw notFound("Booking");
    res.json(shape(rows[0]));
  } catch (err) {
    next(err);
  }
});

function validateBookingBody(body) {
  const b = body || {};
  const details = {};
  let guestId, propertyId;
  try { guestId = uuidParam(b.guestId, "guestId"); } catch (e) { details.guestId = "A guest is required."; }
  try { propertyId = uuidParam(b.propertyId, "propertyId"); } catch (e) { details.propertyId = "A property is required."; }
  const nights = parseIntStrict(b.nights);
  if (!Number.isInteger(nights) || nights < 1 || nights > config.limits.maxNights) {
    details.nights = `Nights must be a whole number between 1 and ${config.limits.maxNights}.`;
  }
  if (Object.keys(details).length) throw badRequest("Please correct the highlighted fields.", details);
  return { guestId, propertyId, nights };
}

// POST /api/bookings { guestId, propertyId, nights }
//  -> 201 { booking, balanceBefore, balanceAfter, auditEntry }
// Everything (lock, before-balance, CALL create_booking, after-balance, audit lookup) runs in ONE
// transaction, so the before/after numbers are exactly the ones this booking changed, even
// when many bookings for the same guest are in flight.
router.post("/", async (req, res, next) => {
  let input;
  try {
    input = validateBookingBody(req.body);
    const out = await withTransaction(async (c) => {
      const g = await c.query("select wallet_balance from guests where id = $1 for update", [input.guestId]);
      if (!g.rowCount) throw notFound("Guest");
      const before = g.rows[0].wallet_balance;

      const call = await c.query("call create_booking($1::uuid, $2::uuid, $3::int, null::uuid)", [
        input.guestId, input.propertyId, input.nights,
      ]);
      const bookingId = call.rows[0].p_booking_id;

      // Sequential on purpose: one transaction = one connection, which runs one query at a time.
      const booking = await c.query(`${BOOKING_SELECT} where b.id = $1`, [bookingId]);
      const after = await c.query("select wallet_balance from guests where id = $1", [input.guestId]);
      const audit = await c.query(`select ${AUDIT_COLS} from wallet_audit_logs where booking_id = $1 order by timestamp desc, id desc limit 1`, [bookingId]);
      return {
        booking: shape(booking.rows[0]),
        balanceBefore: before,
        balanceAfter: after.rows[0].wallet_balance,
        auditEntry: audit.rows[0] || null,
      };
    });
    res.status(201).json(out);
  } catch (err) {
    // For "insufficient balance" the UI wants numbers to explain it.
    if (input && fromPgError(err)?.code === "INSUFFICIENT_BALANCE") {
      try {
        const { rows } = await query(
          `select g.wallet_balance as available, p.base_price * $3::int as required
             from guests g, properties p where g.id = $1 and p.id = $2`,
          [input.guestId, input.propertyId, input.nights]
        );
        if (rows.length) {
          const available = rows[0].available;
          const required = rows[0].required;
          const e = new ApiError(422, "INSUFFICIENT_BALANCE", "Your wallet balance is too low for this booking.", {
            available, required, shortBy: (Number(required) - Number(available)).toFixed(2),
          });
          return next(e);
        }
      } catch (_) { /* fall through to the generic mapping */ }
    }
    next(err);
  }
});

// PATCH /api/bookings/:id/status { status } -> { booking }
// CONFIRMED -> CHECKED_IN -> COMPLETED, via CALL change_booking_status().
// A second CHECKED_IN for the same guest is rejected by idx_active_stay -> 409 ACTIVE_STAY_EXISTS.
router.patch("/:id/status", async (req, res, next) => {
  try {
    const id = uuidParam(req.params.id);
    const status = String((req.body || {}).status || "").toUpperCase();
    if (!["CHECKED_IN", "COMPLETED"].includes(status)) {
      throw badRequest('"status" must be CHECKED_IN or COMPLETED.', { status: "Use CHECKED_IN or COMPLETED." });
    }
    try {
      await query("call change_booking_status($1::uuid, $2::varchar)", [id, status]);
    } catch (err) {
      if (err.hint === "ACTIVE_STAY_EXISTS") {
        // tell the UI which stay is blocking
        const { rows } = await query(
          `select b.id, p.title from bookings b join properties p on p.id = b.property_id
            where b.status = 'CHECKED_IN'
              and b.guest_id = (select guest_id from bookings where id = $1)
            limit 1`,
          [id]
        );
        const blocker = rows[0] ? { activeBookingId: rows[0].id, activePropertyTitle: rows[0].title } : undefined;
        return next(new ApiError(409, "ACTIVE_STAY_EXISTS", "This guest already has a stay in progress (CHECKED_IN).", blocker));
      }
      throw err;
    }
    const { rows } = await query(`${BOOKING_SELECT} where b.id = $1`, [id]);
    res.json({ booking: shape(rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const router = require("express").Router();
const { query } = require("../db");
const { notFound, badRequest } = require("../errors");
const { pagination, searchTerm, likePattern, sortParam, uuidParam, isUuid } = require("../validate");

const SORTS = {
  title: { column: "title", dir: "asc" },
  base_price: { column: "base_price", dir: "asc" },
};

function priceParam(v, field) {
  if (v === undefined || v === "") return undefined;
  if (typeof v !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(v.trim())) {
    throw badRequest(`"${field}" must be a non-negative number.`, { [field]: "Invalid price." });
  }
  return v.trim();
}

// GET /api/properties?page&limit&q&minPrice&maxPrice&sort&order
router.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset } = pagination(req.query);
    const q = searchTerm(req.query.q);
    const min = priceParam(req.query.minPrice, "minPrice");
    const max = priceParam(req.query.maxPrice, "maxPrice");
    if (min !== undefined && max !== undefined && Number(min) > Number(max)) {
      throw badRequest("minPrice cannot be greater than maxPrice.", { minPrice: "Must be <= maxPrice." });
    }
    const sort = sortParam(req.query, SORTS, "title");

    const where = [];
    const params = [];
    if (q) {
      params.push(likePattern(q));
      let c = `title ilike $${params.length}`;
      if (isUuid(q)) {
        params.push(q);
        c = `(${c} or id = $${params.length}::uuid)`;
      }
      where.push(c);
    }
    if (min !== undefined) { params.push(min); where.push(`base_price >= $${params.length}`); }
    if (max !== undefined) { params.push(max); where.push(`base_price <= $${params.length}`); }
    const w = where.length ? `where ${where.join(" and ")}` : "";

    const [list, count] = await Promise.all([
      query(
        `select id, title, base_price, latitude, longitude from properties ${w}
          order by ${sort.column} ${sort.dir}, id
          limit ${limit} offset ${offset}`,
        params
      ),
      query(`select count(*)::int as n from properties ${w}`, params),
    ]);
    res.json({ items: list.rows, page, limit, total: count.rows[0].n });
  } catch (err) {
    next(err);
  }
});

// GET /api/properties/:id -> property + its most recent bookings
router.get("/:id", async (req, res, next) => {
  try {
    const id = uuidParam(req.params.id);
    const p = await query("select id, title, base_price, latitude, longitude from properties where id = $1", [id]);
    if (!p.rowCount) throw notFound("Property");
    const [b, c] = await Promise.all([
      query(
        `select b.id, b.nights, b.total_cost, b.status, b.created_at,
                g.id as guest_id, g.name as guest_name
           from bookings b join guests g on g.id = b.guest_id
          where b.property_id = $1
          order by b.created_at desc, b.id limit 20`,
        [id]
      ),
      query("select count(*)::int as n from bookings where property_id = $1", [id]),
    ]);
    res.json({
      ...p.rows[0],
      bookingCount: c.rows[0].n,
      bookings: b.rows.map((r) => ({
        id: r.id, nights: r.nights, total_cost: r.total_cost, status: r.status, created_at: r.created_at,
        guest: { id: r.guest_id, name: r.guest_name },
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

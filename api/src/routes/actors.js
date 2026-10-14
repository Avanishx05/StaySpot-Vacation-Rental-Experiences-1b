const router = require("express").Router();
const { query } = require("../db");
const { searchTerm, likePattern, pagination, isUuid } = require("../validate");

// GET /api/actors?q=&limit=  -> [{ id, name, wallet_balance }]
// "Acting as" switcher. There are 10k+ guests, so this is a bounded search (default 20),
// never the full list.
router.get("/", async (req, res, next) => {
  try {
    const q = searchTerm(req.query.q);
    const { limit } = pagination({ limit: req.query.limit ?? 20 });
    const params = [];
    let where = "";
    if (q) {
      params.push(likePattern(q));
      where = `where name ilike $1`;
      if (isUuid(q)) {
        params.push(q);
        where = `where name ilike $1 or id = $2::uuid`;
      }
    }
    params.push(limit);
    const { rows } = await query(
      `select id, name, wallet_balance
         from guests ${where}
        order by name, id
        limit $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

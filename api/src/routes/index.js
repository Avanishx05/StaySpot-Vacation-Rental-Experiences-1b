const router = require("express").Router();

// --- Screens 3.1 - 3.3 (Browse, Transaction, Audit trail) ---
router.use("/actors", require("./actors"));
router.use("/guests", require("./guests")); // includes /guests/:id/audit
router.use("/properties", require("./properties"));
router.use("/bookings", require("./bookings"));

// --- Screens 3.4 - 3.6 (Analytics, Map, Reviews + catalog) ---
router.use("/analytics", require("./analytics"));
router.use("/map", require("./map"));
router.use("/reviews", require("./reviews"));
router.use("/amenities", require("./amenities"));

module.exports = router;

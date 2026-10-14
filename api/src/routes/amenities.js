// The "flexible catalog document" (PropertyAmenities) for one property.
const router = require("express").Router();
const { getDb } = require("../mongo");
const { notFound } = require("../errors");

// GET /api/amenities/:propertyId -> { title, amenities, house_rules, accessibility_features }
router.get("/:propertyId", async (req, res, next) => {
  try {
    const d = await (await getDb()).collection("PropertyAmenities").findOne({ property_id: req.params.propertyId });
    if (!d) throw notFound("Amenities catalog");
    res.json({ title: d.title, amenities: d.amenities || [], house_rules: d.house_rules || [], accessibility_features: d.accessibility_features || [] });
  } catch (err) { next(err); }
});

module.exports = router;

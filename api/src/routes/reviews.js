// Screen 3.6 - Reviews: $facet pipeline (same stages as mongo/03_workflow4_facet.js, plus an optional property $match).
const router = require("express").Router();
const { getDb } = require("../mongo");

// GET /api/reviews/facets?propertyId -> { ratingDistribution, topTags, averageRating, reviewCount }
router.get("/facets", async (req, res, next) => {
  try {
    const propertyId = typeof req.query.propertyId === "string" && req.query.propertyId ? req.query.propertyId : null;
    const [out] = await (await getDb()).collection("PropertyReviews").aggregate([
      ...(propertyId ? [{ $match: { property_id: propertyId } }] : []),
      { $facet: {
        ratingDistribution: [{ $group: { _id: "$rating", count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        topTags: [{ $unwind: "$location_tags" }, { $group: { _id: "$location_tags", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }],
        overallAverage: [{ $group: { _id: null, avgRating: { $avg: "$rating" }, n: { $sum: 1 } } }],
      } },
    ]).toArray();
    const avg = out.overallAverage[0];
    res.json({
      ratingDistribution: out.ratingDistribution.map((x) => ({ rating: Number(x._id), count: x.count })).sort((a, b) => a.rating - b.rating),
      topTags: out.topTags.map((x) => ({ tag: x._id, count: x.count })),
      averageRating: avg ? +avg.avgRating.toFixed(2) : null,
      reviewCount: avg ? avg.n : 0,
    });
  } catch (err) { next(err); }
});

module.exports = router;

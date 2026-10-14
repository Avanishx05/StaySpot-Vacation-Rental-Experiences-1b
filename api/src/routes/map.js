// Screen 3.5 - Map. Reuses trendingHotspots() ($geoNear pipeline) from mongo/02_workflow3_geonear.js unchanged.
// (Needs the repo-root `npm install`, which provides dotenv/mongodb for that script.)
const path = require("path");
const router = require("express").Router();
const { getDb } = require("../mongo");
const { badRequest } = require("../errors");
const { trendingHotspots } = require(path.resolve(__dirname, "../../../mongo/02_workflow3_geonear.js"));

function num(v, name, lo, hi, def) {
  if (v === undefined || v === "") {
    if (def === undefined) throw badRequest(`"${name}" is required.`, { [name]: "Required." });
    return def;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw badRequest(`"${name}" must be between ${lo} and ${hi}.`, { [name]: `Must be ${lo}-${hi}.` });
  return n;
}

// GET /api/map/origins?q&limit -> [{ propertyId, title, lng, lat }]
router.get("/origins", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    const filter = q ? { title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {};
    const limit = num(req.query.limit, "limit", 1, 200, 50);
    const docs = await (await getDb()).collection("PropertyAmenities").find(filter).project({ property_id: 1, title: 1, location: 1 }).limit(limit).toArray();
    res.json(docs.map((d) => ({ propertyId: d.property_id, title: d.title, lng: d.location.coordinates[0], lat: d.location.coordinates[1] })));
  } catch (err) { next(err); }
});

// GET /api/map/hotspots?lng&lat&radiusKm=5&recentMinutes=120 -> [{ lat, lng, searchCount, distanceKm }] sorted by distance
router.get("/hotspots", async (req, res, next) => {
  try {
    const lng = num(req.query.lng, "lng", -180, 180);
    const lat = num(req.query.lat, "lat", -90, 90);
    const radiusKm = num(req.query.radiusKm, "radiusKm", 0.1, 50, 5);
    const recentMinutes = num(req.query.recentMinutes, "recentMinutes", 1, 1440, 120);
    const rows = await trendingHotspots(await getDb(), { lng, lat, radiusMeters: radiusKm * 1000, recentMinutes });
    res.json(
      rows
        .map((x) => ({ lat: x._id.lat_bucket, lng: x._id.lng_bucket, searchCount: x.session_count, distanceKm: +(x.avg_distance / 1000).toFixed(2) }))
        .sort((a, b) => a.distanceKm - b.distanceKm) // the pipeline sorts by count; the screen lists nearest first
    );
  } catch (err) { next(err); }
});

module.exports = router;

// Groups search sessions near a given coordinate into geographic hotspots.
// Uses $geoNear with a 2dsphere index to filter by distance and time window,
// then clusters locations into grid cells using coordinate rounding.

require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "stayspot";

async function trendingHotspots(
  db,
  { lng = 78.4867, lat = 17.385, radiusMeters = 5000, recentMinutes = 120 } = {}
) {
  const since = new Date(Date.now() - recentMinutes * 60 * 1000);
  const results = await db
    .collection("SearchSessions")
    .aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distance_meters",
          maxDistance: radiusMeters,
          spherical: true,
          query: { created_at: { $gte: since } },
        },
      },
      {
        // Groups coordinates into grid buckets to identify clusters
        $group: {
          _id: {
            lat_bucket: {
              $round: [{ $arrayElemAt: ["$location.coordinates", 1] }, 2],
            },
            lng_bucket: {
              $round: [{ $arrayElemAt: ["$location.coordinates", 0] }, 2],
            },
          },
          session_count: { $sum: 1 },
          avg_distance: { $avg: "$distance_meters" },
        },
      },
      { $sort: { session_count: -1 } },
    ])
    .toArray();

  return results;
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log(`Connected to MongoDB Atlas (db: ${dbName})\n`);
    const db = client.db(dbName);

    const results = await trendingHotspots(db);
    console.log("Workflow 3 - Trending Search Hotspots:");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("02_workflow3_geonear.js failed:", err);
    process.exit(1);
  });
}

module.exports = { trendingHotspots };

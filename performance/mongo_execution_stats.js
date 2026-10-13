

require("dotenv").config();
const { MongoClient } = require("mongodb");
const fs = require("fs");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "stayspot";

async function generateExecutionStats() {
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection("SearchSessions");

    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [78.4867, 17.385],
          },
          distanceField: "distance_meters",
          maxDistance: 5000,
          spherical: true,
        },
      },
      {
        $group: {
          _id: {
            lat_bucket: {
              $round: [
                { $arrayElemAt: ["$location.coordinates", 1] },
                2,
              ],
            },
            lng_bucket: {
              $round: [
                { $arrayElemAt: ["$location.coordinates", 0] },
                2,
              ],
            },
          },
          session_count: { $sum: 1 },
          avg_distance: { $avg: "$distance_meters" },
        },
      },
      {
        $sort: {
          session_count: -1,
        },
      },
    ];

    const explainResult = await collection
      .aggregate(pipeline)
      .explain("executionStats");

    fs.writeFileSync(
      "mongo_execution_stats.json",
      JSON.stringify(explainResult, null, 2)
    );

    console.log(
      "Execution statistics saved to mongo_execution_stats.json"
    );
  } finally {
    await client.close();
  }
}

generateExecutionStats().catch((err) => {
  console.error("Failed to generate execution stats:", err);
  process.exit(1);
});
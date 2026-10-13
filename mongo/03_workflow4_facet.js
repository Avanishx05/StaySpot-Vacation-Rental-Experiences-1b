// Computes rating distribution, top review tags, and overall average rating
// in a single aggregation pass over PropertyReviews using $facet.

require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "stayspot";

async function reviewAnalytics(db) {
  const results = await db
    .collection("PropertyReviews")
    .aggregate([
      {
        $facet: {
          // Count reviews grouped by rating value
          ratingDistribution: [
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          // Unwind tags array to rank top 5 most frequent tags
          topTags: [
            { $unwind: "$location_tags" },
            { $group: { _id: "$location_tags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ],
          // Aggregate mean rating across all reviews
          overallAverage: [
            { $group: { _id: null, avgRating: { $avg: "$rating" } } },
          ],
        },
      },
    ])
    .toArray();

  return results[0];
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log(`Connected to MongoDB Atlas (db: ${dbName})\n`);
    const db = client.db(dbName);

    const results = await reviewAnalytics(db);
    console.log("Workflow 4 - Multi-Faceted Review Analytics:");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("03_workflow4_facet.js failed:", err);
    process.exit(1);
  });
}

module.exports = { reviewAnalytics };

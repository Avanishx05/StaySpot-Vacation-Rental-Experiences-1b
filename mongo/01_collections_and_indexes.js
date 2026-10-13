// Initializes PropertyAmenities, PropertyReviews, and SearchSessions collections,
// and creates geospatial (2dsphere) and TTL indexes on SearchSessions.

require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "stayspot";

async function createCollectionsAndData(db) {
  // PropertyAmenities
  await db.createCollection("PropertyAmenities").catch(() => {});
  console.log("PropertyAmenities: collection created");

  // PropertyReviews
  await db.createCollection("PropertyReviews").catch(() => {});
  console.log("PropertyReviews: collection created");

  // SearchSessions
  await db.createCollection("SearchSessions").catch(() => {});
  console.log("SearchSessions: collection created");
}

async function createIndexes(db) {
  // Geospatial index required for $geoNear proximity queries
  const geoIndexName = await db
    .collection("SearchSessions")
    .createIndex({ location: "2dsphere" }, { name: "location_2dsphere" });
  console.log(`SearchSessions: geospatial index created (${geoIndexName})`);

  // TTL index - auto-expires search sessions 2 hours (7200s) after creation
  const ttlIndexName = await db
    .collection("SearchSessions")
    .createIndex(
      { created_at: 1 },
      { expireAfterSeconds: 7200, name: "created_at_ttl_7200" }
    );
  console.log(`SearchSessions: TTL index created (${ttlIndexName}, expires after 7200s)`);

  return { geoIndexName, ttlIndexName };
}

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log(`Connected to MongoDB Atlas (db: ${dbName})\n`);
    const db = client.db(dbName);

    await createCollectionsAndData(db);
    console.log("");
    await createIndexes(db);

    console.log("\n01_collections_and_indexes.js completed successfully.");
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("01_collections_and_indexes.js failed:", err);
    process.exit(1);
  });
}

module.exports = { createCollectionsAndData, createIndexes };

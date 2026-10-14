// Lazy, shared MongoDB handle for the routes that need it (map, reviews, amenities).
// Nothing connects until the first call, so the PostgreSQL-only screens work without Mongo.
const { MongoClient } = require("mongodb");
const config = require("./config");

let clientPromise = null;
let testDb = null;
const __setDbForTests = (db) => { testDb = db; }; // lets tests swap in a fake database

function getDb() {
  if (testDb) return Promise.resolve(testDb);
  if (!clientPromise) {
    const client = new MongoClient(config.mongo.uri, { serverSelectionTimeoutMS: 4000 });
    clientPromise = client.connect().catch((err) => {
      clientPromise = null; // allow a retry on the next request
      throw err;
    });
  }
  return clientPromise.then((c) => c.db(config.mongo.dbName));
}

async function closeMongo() {
  if (clientPromise) {
    const c = await clientPromise.catch(() => null);
    clientPromise = null;
    if (c) await c.close();
  }
}

module.exports = { getDb, closeMongo, __setDbForTests };

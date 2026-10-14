import { MongoClient } from 'mongodb';
import { HttpError } from './http.js';
let client, testDb;
export const __setDbForTests = (db) => { testDb = db; }; // lets tests swap in a fake database
export async function getDb() {
  if (testDb) return testDb;
  try {
    client ??= new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017', { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    return client.db(process.env.MONGODB_DB_NAME || 'stayspot');
  } catch {
    client = undefined;
    throw new HttpError(503, 'MONGO_UNAVAILABLE', 'Search and review data is temporarily unavailable.');
  }
}

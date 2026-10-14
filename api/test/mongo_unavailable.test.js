import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1';   // nothing listens here
test('real mongo.js maps a connection failure to 503 MONGO_UNAVAILABLE', async () => {
  const { getDb } = await import('../src/mongo.js');
  await assert.rejects(getDb(), (e) => e.status === 503 && e.code === 'MONGO_UNAVAILABLE');
});

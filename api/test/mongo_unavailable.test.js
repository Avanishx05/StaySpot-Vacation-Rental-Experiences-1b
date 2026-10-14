// A dead MongoDB must become a friendly 503, and must not affect Postgres-only routes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.MONGODB_URI = "mongodb://127.0.0.1:1"; // nothing listens here
const request = require("supertest");

test("real mongo.js + error handler: connection failure -> 503 MONGO_UNAVAILABLE", async () => {
  const { createApp } = require("../src/app");
  const { closeMongo } = require("../src/mongo");
  const r = await request(createApp()).get("/api/reviews/facets").expect(503);
  assert.equal(r.body.error.code, "MONGO_UNAVAILABLE");
  await closeMongo();
});

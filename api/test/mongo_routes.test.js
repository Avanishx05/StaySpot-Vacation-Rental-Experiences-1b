// Map / reviews / amenities routes against a fake in-memory Mongo (no mongod needed).
// The fake only approximates $geoNear/$facet - run mongo/02 and mongo/03 against a real MongoDB too.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const { __setDbForTests } = require("../src/mongo");
const { store, fakeDb } = require("./support/fake_mongo");

__setDbForTests(fakeDb);
const app = createApp();
const get = (p) => request(app).get("/api" + p);
const O = { lng: 78.4867, lat: 17.385 };
const at = (dLng, dLat, minsAgo = 1) => ({ location: { type: "Point", coordinates: [O.lng + dLng, O.lat + dLat] }, created_at: new Date(Date.now() - minsAgo * 60000) });

beforeEach(() => {
  store.SearchSessions = [at(0.009, 0), at(0.009, 0), at(0.009, 0), at(0.027, 0), at(0.027, 0), at(0.09, 0) /* ~9.6 km */, at(0.01, 0, 180) /* older than 2 h */];
  store.PropertyAmenities = [
    { property_id: "p1", title: "Lake Villa", amenities: ["Pool"], house_rules: ["No pets"], accessibility_features: [], location: { type: "Point", coordinates: [78.5, 17.4] } },
    { property_id: "p2", title: "Hill Cabin", amenities: ["WiFi"], house_rules: [], accessibility_features: ["Ramp"], location: { type: "Point", coordinates: [78.4, 17.3] } }];
  store.PropertyReviews = [
    ...[5, 5, 4.5, 4, 3].map((rating, i) => ({ property_id: "p1", rating, location_tags: i < 3 ? ["quiet street", "great view"] : ["near metro"] })),
    { property_id: "p2", rating: 2, location_tags: ["near metro"] }];
});

test("hotspots: only within 5 km and last 2 h, sorted by distance, shape per contract", async () => {
  const r = (await get(`/map/hotspots?lng=${O.lng}&lat=${O.lat}&radiusKm=5`).expect(200)).body;
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.distanceKm <= 5));
  assert.ok(r[0].distanceKm < r[1].distanceKm);
  assert.deepEqual(Object.keys(r[0]).sort(), ["distanceKm", "lat", "lng", "searchCount"]);
  assert.equal(r[0].searchCount, 3); assert.equal(r[1].searchCount, 2);
});

test("hotspots: empty origin returns []; bad input returns 400 VALIDATION_ERROR", async () => {
  assert.deepEqual((await get("/map/hotspots?lng=10&lat=10").expect(200)).body, []);
  for (const q of ["lng=78&lat=91", "lng=abc&lat=17", "lat=17", "lng=78&lat=17&radiusKm=0"]) {
    const r = await get("/map/hotspots?" + q).expect(400);
    assert.equal(r.body.error.code, "VALIDATION_ERROR", q);
  }
});

test("hotspots: a new ping shows up on the next call", async () => {
  const before = (await get("/map/hotspots?lng=10&lat=10")).body;
  store.SearchSessions.push({ location: { type: "Point", coordinates: [10, 10] }, created_at: new Date() });
  const after = (await get("/map/hotspots?lng=10&lat=10")).body;
  assert.equal(before.length, 0); assert.equal(after.length, 1); assert.equal(after[0].searchCount, 1);
});

test("origins: contract shape, search and limit", async () => {
  const all = (await get("/map/origins").expect(200)).body;
  assert.deepEqual(all[0], { propertyId: "p1", title: "Lake Villa", lng: 78.5, lat: 17.4 });
  assert.equal((await get("/map/origins?q=cabin")).body.length, 1);
  assert.equal((await get("/map/origins?q=.*")).body.length, 0); // regex characters are literal
  assert.equal((await get("/map/origins?limit=1")).body.length, 1);
});

test("facets: counts add up, numeric rating order, tags, average", async () => {
  const f = (await get("/reviews/facets?propertyId=p1").expect(200)).body;
  assert.equal(f.reviewCount, 5);
  assert.equal(f.ratingDistribution.reduce((s, x) => s + x.count, 0), 5);
  assert.deepEqual(f.ratingDistribution.map((x) => x.rating), [3, 4, 4.5, 5]);
  assert.equal(f.topTags.length, 3); assert.equal(f.topTags[0].count, 3); assert.deepEqual(f.topTags[2], { tag: "near metro", count: 2 });
  assert.equal(f.averageRating, 4.3);
  assert.equal((await get("/reviews/facets")).body.reviewCount, 6);
});

test("facets: no reviews gives empty arrays and null average", async () => {
  const f = (await get("/reviews/facets?propertyId=ghost").expect(200)).body;
  assert.deepEqual(f, { ratingDistribution: [], topTags: [], averageRating: null, reviewCount: 0 });
});

test("amenities: found, and unknown id returns 404 NOT_FOUND", async () => {
  const a = (await get("/amenities/p1").expect(200)).body;
  assert.deepEqual(a.amenities, ["Pool"]); assert.deepEqual(a.accessibility_features, []);
  const r = await get("/amenities/ghost").expect(404); assert.equal(r.body.error.code, "NOT_FOUND");
});

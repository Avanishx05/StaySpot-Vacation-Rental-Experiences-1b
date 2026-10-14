# StaySpot: Screens 3.4-3.6 (Analytics, Map, Reviews)

Notes for the second half of the Assignment 2 front end, merged into the 3.1-3.3 code base.

## What is here

| Path | Purpose |
|---|---|
| `api/src/routes/analytics.js` | Moving average, ranking, summary, refresh (PostgreSQL) |
| `api/src/routes/map.js` | Origins and hotspots (MongoDB `$geoNear`, reuses `mongo/02_workflow3_geonear.js`) |
| `api/src/routes/reviews.js`, `amenities.js` | `$facet` review stats and the amenities catalog (MongoDB) |
| `api/src/mongo.js` | Lazy MongoClient; connection failures become `503 MONGO_UNAVAILABLE` (mapped in `errors.js`) |
| `web/js/pages/{analytics,map,reviews}.js` | The three screens (`render({view, query})`, return a cleanup function) |
| `web/js/pages/_picker.js`, `web/js/theme.js` | Shared property picker; chart/map colours read from the CSS tokens |
| `web/css/screens456.css` | Screen styles, built on the design-system tokens in `styles.css` |
| `api/test/`, `web/test/` | Tests (see below) |

Chart.js 4.4.4 and Leaflet 1.9.4 are loaded as browser globals from a CDN in `web/index.html`; the map also needs internet for OpenStreetMap tiles. The Properties detail page links to each screen with `?property=<id>`.

## Technical assumptions

**Data**
5. `properties.id`, `guests.id` are UUIDs, and Mongo's `property_id` holds the same UUID as a string (as the team's seeders do). The property pickers use `GET /api/properties?q=&limit=20`, so only the first 20 matches are offered; a property from the URL that is not among them is fetched by id for its label.
6. `property_summary` columns are lower-case in Postgres (`propertyid`, `totalnightsbooked`, ...); the API renames them to camelCase.
7. Money goes out as strings with 2 decimals and is formatted as `₹12,34,567.50` in the browser. Dates are `YYYY-MM-DD` or ISO timestamps.

**Analytics**
8. Moving average follows Part A: a 7-calendar-day window (`RANGE ... INTERVAL '6 days' PRECEDING`), summed and divided by 7, so days without bookings count as zero. Only days that have at least one booking produce a chart point. The property filter is in the first CTE and the date filter in the final select, so the 6 days before `from` still count.
9. Ranking is per day (`DENSE_RANK()` partitioned by booking date, ties share a rank, the next rank is not skipped). Only properties with a booking on that day appear. Default date is the latest booking date; `limit` defaults to 10 and is clamped to 1 to 100.
10. "Day" means `date(created_at)` in the database session time zone, so the server time zone decides which day a late-night booking falls on.
11. The summary comes from the materialized view and is stale until refreshed (the screen shows the last refreshed time from `mv_refresh_log`). The cards show totals over all properties. `rows` holds the top 10 by gross revenue (extra fields `totals` and `totalBookings` are additions to the contract).

**Map**
12. Hotspots reuse the Part A pipeline unchanged: sessions in the last 120 minutes (the TTL window) within `radiusKm` (default 5, allowed 0.1 to 50), grouped into 0.01 degree buckets (about 1.1 km). `distanceKm` is the average distance of the sessions in a bucket. The pipeline sorts by count; the API re-sorts by distance, as the brief asks.
13. Polling every 4 seconds, paused while the tab is hidden or the user pressed Pause, stopped on unmount. Rows whose count grew since the previous poll show a `+n`. There is no push channel.
14. Default origin is the Hyderabad point used by the plan (78.4867, 17.385). `GET /map/origins` returns up to 200 properties (50 by default); any other origin is chosen by clicking the map.

**Reviews**
15. Facets use the Part A `$facet` pipeline with a leading `$match` on `property_id` when one is selected; top tags are the top 5; ratings include half stars and are sorted numerically; the average is rounded to 2 decimals. With no property selected the numbers cover all reviews and no amenities are shown.
16. One `PropertyAmenities` document per property is the "flexible catalog document" (amenities, house rules, accessibility features), shown as chips; empty groups are hidden.

**General**
17. Evergreen browsers only. These screens do not depend on the acting guest.
18. Error codes (shared with screens 3.1-3.3, see `docs/api_endpoints.md`): `VALIDATION_ERROR` 400, `NOT_FOUND` 404, `MONGO_UNAVAILABLE` 503.

## Tests

| Suite | Count | How it runs |
|---|---|---|
| `api/test/analytics.test.js` | 5 | Real PostgreSQL: throw-away `stayspot_test` DB built from `sql/01-05`, hand-computed expectations |
| `api/test/mongo_routes.test.js` | 7 | Fake in-memory Mongo (`api/test/support/fake_mongo.js`) |
| `api/test/mongo_unavailable.test.js` | 1 | Real `mongo.js` pointed at a closed port -> 503 |
| `web/test/screens456.test.js` | 6 | jsdom, mocked `fetch`, fake Chart.js and Leaflet, real page modules |

Run: `cd api && npm install && npm test` and `cd web && npm install && npm test`.

What they check: moving average equals a hand-computed value; the `from/to` filter does not change the averages; ties share a rank; `limit` is clamped; the summary stays stale until refresh and `lastRefreshed` moves; hotspots are within 5 km, recent and sorted by distance; an empty origin returns `[]`; bad `lat/lng` returns 400; a new ping appears on the next call; facet counts sum to the review count; unknown amenities id returns 404; the screens show loading, empty and error states, rebuild charts without leaking, update the map in place, and stop polling on unmount.

### Verification status of the merge
- The 3.4-3.6 tests were originally written and run (19/19 passing, Node 22) against the earlier standalone version of these screens. They were **ported** to this code base's CommonJS API and `dom.js` components during the merge and **have not been re-run since**; run both suites before submitting.
- Not verified at any point: the real MongoDB `$geoNear`/`$facet` pipelines through the API, and real browser rendering (Leaflet, Chart.js, phone layout). Run `mongo/02`, `mongo/03` and both screens against a real MongoDB before the demo.

### Bug found by the tests and fixed
`?property=<id>` was ignored on first load, because the picker's options load asynchronously and the screens read its value too early. The picker now pre-selects the id synchronously (regression test included).

## Known gaps
- `data_generation/ping_simulator.py` is not written yet, so new map pings appear only if sessions are inserted by hand (or by re-running `mongo_seeder.py`). Seeded sessions older than 2 hours are removed by the TTL index.
- Phone layout is a basic stacking rule (below 700 px); not checked in a browser.

# StaySpot: Screens 4, 5, 6 (Analytics, Map, Reviews)

Draft notes for this part of the Assignment 2 front end. Merge the relevant parts into the team README
(tech choices, assumptions, how to run, tests).

## What is here

| Path | Purpose |
|---|---|
| `api/src/routes/analytics.js` | Moving average, ranking, summary, refresh (PostgreSQL) |
| `api/src/routes/map.js` | Origins and hotspots (MongoDB `$geoNear`, reuses `mongo/02_workflow3_geonear.js`) |
| `api/src/routes/reviews.js` | `$facet` review stats and the amenities catalog (MongoDB) |
| `api/src/mongo.js` | Lazy MongoClient, `getDb()`, maps connection failures to `503 MONGO_UNAVAILABLE` |
| `web/src/screens/{analytics,map,reviews}.js` | The three screens, each exports `mount(root, params)` and returns a cleanup function |
| `web/src/screens/_picker.js` | Shared property search + select |
| `web/src/ui.stub.js` | Temporary stand-in for the shared `ui.js`; delete once the real one is merged |
| `web/css/screens456.css` | Screen styles (uses theme variables with fallbacks) |
| `api/test/`, `web/test/` | Tests (see below) |

## Wiring checklist

1. In `app.js`: `app.use('/api', analytics, map, reviews)` (route paths already include `/analytics`, `/map`, `/reviews`, `/amenities`).
2. In `index.html`: load Chart.js 4 and Leaflet 1.9 (script + Leaflet CSS) as globals before the screens, plus `css/screens456.css`.
3. In the router: `#/analytics`, `#/map`, `#/reviews` call the screen's `mount(root, params)`. `params.property` comes from `?property=<id>` (Browse links here).
4. Run `data_generation/ping_simulator.py` during the demo. Seeded search sessions are deleted by the TTL index after 2 hours. (The simulator is not written yet.)

## Technical assumptions

**Contracts with other people's files**
1. `api/src/db.js` exports `query(text, params)` returning a `pg` result (`.rows`). `api/src/http.js` exports `HttpError(status, code, message)` and `wrap(asyncHandler)`. `app.js` returns errors as `{ error: { code, message } }`.
2. `web/src/ui.js` exports `h, api, money, pageLayout, loading, empty, errorState, toast` as in `02_work_distribution.md`. `pageLayout(root, opts)` returns the content element below the hero. `api()` throws `{ status, code, message }` and passes `opts` (including `signal`) to `fetch` without swallowing an `AbortError`.
3. `web/src/theme.js` is at its Step 2 path. The screens import `colors` from it (chart, map and bar colours); CSS uses `var(--token, fallback)` with the same hex values.
4. Chart.js and Leaflet are browser globals (`window.Chart`, `window.L`), loaded from a CDN with a fixed version. The map needs internet for OpenStreetMap tiles.

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
17. Evergreen browsers only. No login: these screens do not use the actor switcher.
18. Error codes used: `INVALID_INPUT` 400, `NOT_FOUND` 404, `MONGO_UNAVAILABLE` 503.

## Tests

| Suite | Count | How it runs |
|---|---|---|
| `api/test/analytics.test.js` | 5 | Real PostgreSQL 16 with the schema in `sql/01` to `05`; no mocks |
| `api/test/mongo_routes.test.js` | 7 | Fake in-memory Mongo (`api/test/support/fake_mongo.js`) |
| `api/test/mongo_unavailable.test.js` | 1 | Real `mongo.js` pointed at a closed port |
| `web/test/screens.test.js` | 6 | jsdom, mocked `fetch`, fake Chart.js and Leaflet |

Run: `cd api && npm i -D supertest && node --test test/*.test.js` (needs the seeded Postgres env vars; no MongoDB needed) and `cd web && npm i && npm test`.
The API tests import `app` as the default export of `src/app.js` and use `db.js` for direct queries.

What they check: moving average equals a hand-computed value; the `from/to` filter does not change the averages; ties share a rank; `limit` is clamped; the summary stays stale until refresh and `lastRefreshed` moves; hotspots are within 5 km, recent and sorted by distance; an empty origin returns `[]`; bad `lat/lng` returns 400; a new ping appears on the next call; facet counts sum to the review count; unknown amenities id returns 404; the screens show loading, empty and error states, rebuild charts without leaking, update the map in place, and stop polling on unmount.

### Results (14 Oct 2026, Node 22)

All 19 tests passed. The analytics suite was also run on the team's real seeder output (10,000 guests, 1,000 properties, 50,000 bookings): each analytics endpoint answered in about 25 ms and the refresh in about 50 ms.

**Not verified**
- The real MongoDB pipelines (`$geoNear`, `$facet`). No MongoDB could be installed in the test environment, so the Mongo route tests use a fake that only approximates them. Run `mongo/02` and `mongo/03` and the two screens against a real Mongo before the demo.
- Real browser rendering (Leaflet, Chart.js, layout, the phone view). jsdom checks the logic, not how it looks.
- The real `ui.js`, `app.js`, `db.js`, and `http.js` from teammates; tests used small stand-ins that follow the contract above.

### Bug found by the tests and fixed
`?property=<id>` was ignored on first load, because the picker's options load asynchronously and the screens read its value too early (Reviews showed all properties; Analytics jumped to the top-ranked one). The picker now pre-selects the id synchronously. Regression test included.

## Known gaps
- `data_generation/ping_simulator.py` is not written yet.
- CSS is one shared file for the three screens (the plan splits it per screen).
- Phone layout is only a basic stacking rule (below 700 px); it has not been checked in a browser.

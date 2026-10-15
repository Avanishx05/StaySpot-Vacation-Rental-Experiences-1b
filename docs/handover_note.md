# Handover note: StaySpot Part A

> **Note on code references:** File and line references in the "Code that works" and "Code errors" sections point to the original repository state at commit `10199b8` before fixes and refactoring were applied.

## Code that works

- **Schema:** `guests`, `wallet_audit_logs`, `properties` and `bookings` have every column the spec lists, including `CHECK (wallet_balance >= 0.00)` and the status enum `CONFIRMED / CHECKED_IN / COMPLETED`. See `sql/01_schema_ddl.sql:5-37`.
- **Partial unique index:** `idx_active_stay` on `bookings(guest_id) WHERE status = 'CHECKED_IN'` blocks a second check-in for the same guest. See `sql/02_indexes.sql:1`.
- **Audit trigger logic:** once it compiles, an update to `wallet_balance` writes the matching DEBIT or CREDIT row with `balance_after`. See `sql/03_triggers_and_audit.sql:1-25`.
- **Materialized view refresh:** the view has a unique index and is refreshed with `REFRESH MATERIALIZED VIEW CONCURRENTLY`, which does not block readers. See `sql/05_materialized_views.sql:3-18`.
- **Stored procedure locking:** `SELECT ... FOR UPDATE` on the guest row stops two concurrent bookings from overdrawing the wallet. See `sql/04_stored_procedures.sql:7`.
- **Workflow 2:** the CTEs, window functions and `DENSE_RANK()` run. See `sql/06_window_analytics.sql`.
- **MongoDB collections:**
  - `PropertyAmenities` has arrays for house rules and accessibility features.
  - `PropertyReviews` has a rating, location tags and `created_at`.
  - `SearchSessions` stores GeoJSON points in `[lng, lat]` order.
  - See `data_generation/mongo_seeder.py:89-143`.
- **MongoDB indexes:** `SearchSessions` has a 2dsphere index on `location` and a 7200-second TTL index on `created_at`. See `mongo/01_collections_and_indexes.js:50-58`.
- **Workflow 3:** `$geoNear` uses `maxDistance: 5000` and then clusters results with `$group`. See `mongo/02_workflow3_geonear.js:22-45`.
- **Workflow 4:** `$facet` returns the rating distribution, the top tags (using `$unwind`) and the overall average. See `mongo/03_workflow4_facet.js:17-37`.
- **Seeders:** the PostgreSQL seeder inserts 10k guests, 1k properties, 50k bookings and 100k wallet updates, with no guest checked in twice.

## Code errors

1. **The tables can't be created.** The `uuid-ossp` extension line is commented out, so every `CREATE TABLE` fails with `function uuid_generate_v4() does not exist`. See `sql/01_schema_ddl.sql:3`.
2. **The trigger is never created.** There is no `;` after the function's closing `$$`, which gives `syntax error at or near "create"`. See `sql/03_triggers_and_audit.sql:19`.
3. **The procedure uses a column that doesn't exist.** It queries `guests.guest_id`, but the column is `id`, so it fails with `column "guest_id" does not exist`. See `sql/04_stored_procedures.sql:7`.
4. **The procedure's `COMMIT` is illegal.** A `COMMIT` inside a block that has an `EXCEPTION` handler fails with `cannot commit while a subtransaction is active`, so every booking fails. See `sql/04_stored_procedures.sql:23-25`.
5. **The procedure's `ROLLBACK` breaks when called inside a transaction.** It fails with `invalid transaction termination`. See `sql/04_stored_procedures.sql:25`.
6. **Errors are hidden instead of reported.** `when others then rollback; raise notice` turns every failure (insufficient balance, unknown property, the errors above) into a NOTICE, so the caller sees success. The spec asks for a graceful rollback, not a silent one. See `sql/04_stored_procedures.sql:24-26`.
7. **The procedure trusts the caller's price.** It uses the cost the caller passes in without checking it against `properties.base_price`. See `sql/04_stored_procedures.sql:1`.
8. **Audit rows can be changed.** `UPDATE`, `DELETE` and direct `INSERT` on `wallet_audit_logs` all succeed, so audit rows can be edited, deleted or forged. See `sql/01_schema_ddl.sql:12-19`.
9. **"Total nights booked" actually counts bookings.** The view computes `count(b.id)`, which is the number of bookings, not nights. See `sql/05_materialized_views.sql:5`.
10. **Workflow 2 averages over 7 rows, not 7 days.** `ROWS BETWEEN 6 PRECEDING` takes the last 7 days that had bookings, so gaps in the dates stretch the window. See `sql/06_window_analytics.sql:8`.
11. **The seeded bookings all share one date.** The seeder never sets `created_at`, so all 50,000 bookings land on the same day. The 7-day moving average and `DENSE_RANK` therefore cover only that one day. See `data_generation/postgres_seeder.py:130-133`.
12. **The two Mongo scripts conflict on the TTL index.** They create the same TTL key under two names (`created_at_1` and `created_at_ttl_7200`), so running both fails. See `mongo/01_collections_and_indexes.js:56-58` and `data_generation/mongo_seeder.py:154-158`.
13. **Workflow 3 has no "recent" filter.** The spec asks for recent sessions, but `$geoNear` has no `created_at` condition and relies on the TTL alone. See `mongo/02_workflow3_geonear.js:22-27`.
14. **The status filter does nothing.** `IN ('CONFIRMED','CHECKED_IN','COMPLETED')` lists every allowed status. See `sql/06_window_analytics.sql:4` and `sql/02_indexes.sql:3-5`.
15. **The README is wrong in two places.**
    - It describes files that don't exist (`generateData.js`, `workflows.js`, `test.js`, `npm run test`). See `README.md:40-48`.
    - Its index example `create unique idx_active_stay` is invalid SQL. See `README.md:154`.
16. **The seeder's connection settings are fixed and undocumented.** It hard-codes port `5433` and user `postgres` and reads env vars that are never documented. See `data_generation/postgres_seeder.py:14-19`.
17. **`requirements.txt` is incomplete.** It is missing `pymongo` and lists `dotenv` instead of `python-dotenv`.
18. **The Mongo performance file isn't stats.** `performance/mongo_execution_stats.json` contains a JavaScript script, not execution statistics.
19. **The Mongo IDs don't match the Postgres IDs.** Mongo uses `PROP-0001` and `GUEST-00001`, but Postgres uses UUIDs, even though `docs/partA/mongo_schema_map.json` says they map to `properties.id` and `guests.id`.

## What you changed and why

1. **Schema DDL & Relations (`sql/01_schema_ddl.sql`):**
   - Enabled `uuid-ossp` extension to ensure `uuid_generate_v4()` functions exist when initializing tables.
   - Added `nights int not null default 1 check (nights > 0)` to `bookings` so booking duration is recorded and "Total Nights Booked" can be properly calculated.
   - Moved `wallet_audit_logs` below `bookings` and added `booking_id uuid references bookings(id) on delete no action` to link wallet transactions to their corresponding booking events.

2. **Index Optimization (`sql/02_indexes.sql`):**
   - Dropped the redundant `WHERE status IN ('CONFIRMED','CHECKED_IN','COMPLETED')` condition on `idx_bookings_property_created` so that all rows by property and creation date are indexed unconditionally.

3. **Immutable Audit Trail (`sql/03_triggers_and_audit.sql`):**
   - Linked the audit log trigger to the active booking by setting and reading the session variable `stayspot.booking_id`.
   - Added `protect_audit_log()` and corresponding triggers (`audit_log_insert_guard`, `audit_log_immutable`, `audit_log_no_truncate`) to make `wallet_audit_logs` append-only, forbidding manual inserts, updates, deletes, and truncations.

4. **Stored Procedures & State Machine (`sql/04_stored_procedures.sql`):**
   - Refactored `create_booking` to calculate costs from `properties.base_price * nights` rather than trusting caller inputs, set session configuration for the audit link, and remove invalid subtransaction `COMMIT`/`ROLLBACK` logic inside exception handlers.
   - Raised explicit errors with standard SQLSTATE codes and hints (`INSUFFICIENT_BALANCE`, `ACTIVE_STAY_EXISTS`) instead of hiding failures as notices.
   - Added `change_booking_status` procedure to safely advance stays (`CONFIRMED -> CHECKED_IN -> COMPLETED`) while handling `idx_active_stay` unique constraint violations gracefully.

5. **Materialized Views & Refresh Log (`sql/05_materialized_views.sql`):**
   - Fixed `property_summary` to compute actual booked nights using `COALESCE(SUM(b.nights), 0)` and separated total bookings via `COUNT(b.id)`.
   - Created `mv_refresh_log` table and updated `refresh_property_summary()` to return and store the timestamp of the last concurrent refresh.

6. **Window Analytics Accuracy (`sql/06_window_analytics.sql`):**
   - Removed the no-op status filter.
   - Replaced row-based windowing (`ROWS BETWEEN 6 PRECEDING`) with calendar interval windowing (`RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW / 7.0`) to compute accurate 7-day daily moving averages despite missing booking dates.

7. **Realistic Data Seeding (`data_generation/postgres_seeder.py` & `data_generation/mongo_seeder.py`):**
   - Parameterized database connection settings via `.env` environment variables.
   - Updated Postgres seeder to generate bookings distributed across a 90-day history window and trigger an immediate materialized view refresh upon completion.
   - Updated Mongo seeder to query PostgreSQL IDs directly, ensuring `PropertyAmenities` and `PropertyReviews` reference real `properties.id` and `guests.id` UUIDs.

8. **Script & Package Setup:**
   - Synchronized TTL index naming to `created_at_ttl_7200` and removed conflicting dummy document insertions in `mongo/01_collections_and_indexes.js`.
   - Parameterized `$geoNear` aggregation in `mongo/02_workflow3_geonear.js` with geographic coordinate inputs and a recency filter.
   - Added `package.json` with npm run scripts, `.env.example` with standard connection parameters, and corrected `data_generation/requirements.txt`.
   - Renamed `performance/mongo_execution_stats.json` to `performance/mongo_execution_stats.js`.
   - Updated `README.md` with accurate setup commands and corrected SQL index syntax.

## Suggestions for the original authors

1. **Automate CI Schema and Migration Validation:**
   - Implement continuous integration jobs that spin up clean PostgreSQL and MongoDB instances and execute migration scripts in sequence. This would instantly catch unexecutable DDL such as disabled extensions (`uuid-ossp`) and syntax errors before code merges.

2. **Standardize Cross-Database ID Conventions:**
   - Maintain consistency between relational and document stores. When document models declare foreign key relationships to relational entities (as specified in `docs/partA/mongo_schema_map.json`), seeders should coordinate IDs rather than generating disjoint string identifiers (e.g., `PROP-0001` vs UUIDs).

3. **Avoid Subtransaction Control in PL/pgSQL Exception Blocks:**
   - Avoid executing explicit `COMMIT` or `ROLLBACK` commands inside PL/pgSQL blocks that contain `EXCEPTION` clauses, as PostgreSQL forbids ending transactions during an active subtransaction. Let errors bubble up or raise custom exceptions with meaningful SQLSTATE codes.

4. **Select Appropriate Window Framing for Time Series:**
   - When calculating moving averages over temporal data, use `RANGE BETWEEN INTERVAL ...` rather than `ROWS BETWEEN ...` if dates can contain gaps. Row-based frames distort temporal calculations when daily activity is sparse.

5. **Enforce Table Immutability at the Database Level:**
   - For sensitive compliance records like `wallet_audit_logs`, enforce append-only security using database trigger guards or permission grants rather than assuming application code will adhere to business rules.

6. **Keep Documentation and Package Manifests Aligned with Code:**
   - Provide concrete environment templates (`.env.example`) and package configurations (`package.json`, `requirements.txt`). Keep instructions in `README.md` verified against actual project scripts to prevent developer setup friction.

## Merge of screens 3.4-3.6 (Analytics, Map, Reviews)
The Analytics/Map/Reviews work was developed on a branch of the original Part A scripts and merged into the 3.1-3.3 code base. Where the two copies of a file differed (`sql/01-04`, `seeder`, `.env.example`, `api_endpoints.md`), the 3.1-3.3 version was kept because it contains the fixes listed above; the 3.4-3.6 code uses only objects both versions share (`property_summary`, `mv_refresh_log`, `refresh_property_summary()`, the Mongo collections). Its routes were rewritten from ES modules to this API's CommonJS style and its screens to the shared `dom.js` components and `render({ view, query })` router contract. Details: `docs/notes/screens_3_4_to_3_6.md`.

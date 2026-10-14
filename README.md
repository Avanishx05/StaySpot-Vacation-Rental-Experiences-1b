# StaySpot

## Repository Information

**GitHub Repository:** [-StaySpot-Vacation-Rental-Experiences](https://github.com/SaiSrinivas49/-StaySpot-Vacation-Rental-Experiences)


**Final Commit Hash:** b71f0bd7be7704aa9cf3339763667f33de739e0b

# Assumptions

# PostgreSQL

PostgreSQL is used for transactional data such as guests, properties, bookings, wallet balances, and audit logs.

MongoDB is used for geospatial telemetry data and aggregation-based analytics.

A guest can have at most one CHECKED_IN booking at a time. This is enforced using a partial unique index.

Wallet changes are automatically recorded in the wallet audit table using a PostgreSQL trigger.

The Workflow 2 moving average uses the current row plus the previous six rows, giving a seven-row moving window.

The PostgreSQL seeder generates valid booking records while respecting the partial unique constraint on CHECKED_IN bookings.

The generated data is synthetic and is used for testing database functionality and query performance.

# MongoDB

It covers:

Setting up the 3 unstructured collections — PropertyAmenities, PropertyReviews, SearchSessions (Step 1.2)

Adding geospatial (2dsphere) and TTL indexes on SearchSessions (Step 2.4)

Workflow 3 — trending search hotspots using $geoNear (Step 3.3)

Workflow 4 — review analytics using $facet (Step 3.4)

```bash
cp .env.example .env              # then edit the values
createdb stayspot
for f in sql/0*.sql; do psql -d stayspot -f "$f"; done
pip install -r data_generation/requirements.txt
python data_generation/postgres_seeder.py
python data_generation/mongo_seeder.py
npm install
npm run mongo:setup && npm run mongo:workflow3 && npm run mongo:workflow4
```

# Assignment 2: running the web app

Requirements: PostgreSQL 14+ (with the `pg_trgm` and `uuid-ossp` contrib extensions), Node 20+, MongoDB (only for screens 3.5-3.6), Python 3.10+.

```bash
cp .env.example .env                         # PG_*, MONGODB_URI, API_PORT
createdb stayspot
for f in sql/0*.sql; do psql -d stayspot -v ON_ERROR_STOP=1 -f "$f"; done
pip install -r data_generation/requirements.txt
python data_generation/postgres_seeder.py    # ~30 s: 10k guests, 1k properties, 50k bookings, 100k audit rows
cd api && npm install && npm start           # API + front end on http://localhost:4000
```
Open http://localhost:4000. To start over: `dropdb stayspot && createdb stayspot` and repeat (the audit table is append-only, so it cannot be truncated).
Connect the API as a **non-superuser** in real use: a PostgreSQL superuser can bypass the audit guards with `session_replication_role`.

Tests (need a local PostgreSQL; they build and drop their own `stayspot_test` database):
```bash
cd api && npm test        # 45 tests: validation, transaction failure paths, audit ordering, concurrency, scale
cd web && npm install && npm test   # 11 tests: the real pages in jsdom against the real API
```
Walkthrough of every screen, including how to trigger the insufficient-balance and blocked-check-in errors with any seeded guest: `docs/screens_3_1_to_3_3.md`.

## Tech choices
- **Front end: plain HTML + CSS + ES modules, no framework, no build step.** The screens are forms, tables and charts; the app stays small enough that every line can be explained, and the API serves it as static files. Shared look: `docs/design/design_system.md`.
- **API: Node + Express + `pg`.** A thin layer: every business rule (price, balance check, locking, audit row, status machine) stays in PostgreSQL procedures/triggers; the API validates input, runs the transaction, and translates database errors into friendly HTTP errors (`docs/api_endpoints.md`).

## Changes to inherited scripts (Assignment 2)
In addition to the fixes in `docs/handover_note.md`:
1. `sql/01_schema_ddl.sql`: `wallet_audit_logs.timestamp` default changed from `current_timestamp` to `clock_timestamp()` (no new columns); `action_type` CHECK (`DEBIT`/`CREDIT`). Reason: `current_timestamp` is frozen at transaction start, so audit rows written in one transaction all shared a timestamp and a running balance could not be ordered.
2. `sql/02_indexes.sql`: indexes on `bookings(guest_id, ...)`, `bookings(status, ...)`, `wallet_audit_logs(guest_id, timestamp, id)`, `pg_trgm` GIN indexes for name/title search. Reason: the screens query by these columns.
3. `sql/03_triggers_and_audit.sql`: removed the unreachable `NO_CHANGE` branch (zero-change updates write no row).
4. `sql/04_stored_procedures.sql`: nights bounded to 1-365, cost overflow check, `hint` codes on every error so the API can map them (`NOT_FOUND`, `INVALID_NIGHTS`, `INVALID_TRANSITION`, `AMOUNT_TOO_LARGE`).
5. `data_generation/postgres_seeder.py`: spreads audit timestamps over ~88 days (as table owner, immutability trigger disabled inside one transaction); verifies the audit balance chain.
6. `.env.example`: `API_PORT`, `CORS_ORIGIN`. Added `.gitignore`.

## Assumptions (UI)
- Currency is shown as INR (₹). Money is handled as decimal strings end to end.
- "Acting as" is a demo switcher; there is no login.
- A booking's price is always `properties.base_price * nights` from the database; `nights` is limited to 1-365.
- Seeded bookings do not debit wallets, so only bookings made through the UI create booking-linked audit rows.
- Audit trail order is by `timestamp` (then `id` as a tie-break; the column records each row's real insert time); the date filter treats plain dates as whole UTC days and the UI sends local-midnight instants.

## Screenshots / contribution table / demo video
_To be added by the team before submission (see `docs/verification_report.md` checklist)._

## A log from an actual run

```json
{
  "run_at": "2026-09-04T02:39:35.500Z",
  "database": "stayspot",
  "steps": [
    {
      "step": "Step 1.2 - Generate MongoDB collections & sample data",
      "status": "pass",
      "details": {
        "collections": ["PropertyAmenities", "PropertyReviews", "SearchSessions"]
      }
    },
    {
      "step": "Step 2.4 - MongoDB Geospatial & TTL indexes",
      "status": "pass",
      "details": {
        "geoIndexName": "location_2dsphere",
        "ttlIndexName": "created_at_1"
      }
    },
    {
      "step": "Step 3.3 - Workflow 3: Trending Search Hotspots",
      "status": "pass",
      "details": {
        "result_count": 1,
        "results": [
          { "_id": { "lat_bucket": 17.39, "lng_bucket": 78.49 }, "session_count": 1, "avg_distance": 0 }
        ]
      }
    },
    {
      "step": "Step 3.4 - Workflow 4: Multi-Faceted Review Analytics",
      "status": "pass",
      "details": {
        "ratingDistribution": [{ "_id": 4.5, "count": 2 }],
        "topTags": [
          { "_id": "quiet street", "count": 2 },
          { "_id": "near metro", "count": 2 },
          { "_id": "great view", "count": 2 }
        ],
        "overallAverage": [{ "_id": null, "avgRating": 4.5 }]
      }
    }
  ]
}
```

# Performance Proof

The PostgreSQL performance analysis was performed using:

```sql
EXPLAIN (ANALYZE, BUFFERS)
```

The Workflow 2 query was executed with EXPLAIN (ANALYZE, BUFFERS).

### Workflow 2 – EXPLAIN ANALYZE Output

```text
Incremental Sort  (cost=1972.35..2022.77 rows=1000 width=92) (actual time=43.554..43.595 rows=1000.00 loops=1)
  Sort Key: ranked_properties.booking_date, ranked_properties.revenue_rank
  Presorted Key: ranked_properties.booking_date
  Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 29kB  Peak Memory: 29kB
  Pre-sorted Groups: 1  Sort Method: quicksort  Average Memory: 87kB  Peak Memory: 87kB
  Buffers: shared hit=659
  ->  Subquery Scan on ranked_properties  (cost=1972.18..1994.66 rows=1000 width=92) (actual time=42.524..43.302 rows=1000.00 loops=1)
        Buffers: shared hit=653
        ->  WindowAgg  (cost=1972.18..1992.16 rows=1000 width=92) (actual time=42.506..43.109 rows=1000.00 loops=1)
              Window: w1 AS (PARTITION BY moving_average.booking_date ORDER BY moving_average.seven_day_moving_avg ROWS UNBOUNDED PRECEDING)
              Storage: Memory  Maximum Storage: 17kB
              Buffers: shared hit=653
              ->  Sort  (cost=1972.16..1974.66 rows=1000 width=84) (actual time=42.488..42.532 rows=1000.00 loops=1)
                    Sort Key: moving_average.booking_date, moving_average.seven_day_moving_avg DESC
                    Sort Method: quicksort  Memory: 79kB
                    Buffers: shared hit=653
                    ->  Subquery Scan on moving_average  (cost=1902.35..1922.33 rows=1000 width=84) (actual time=39.073..41.589 rows=1000.00 loops=1)
                          Buffers: shared hit=650
                          ->  WindowAgg  (cost=1902.35..1922.33 rows=1000 width=84) (actual time=39.072..41.483 rows=1000.00 loops=1)
                                Window: w1 AS (PARTITION BY bookings.property_id ORDER BY (date(bookings.created_at)) ROWS BETWEEN '6'::bigint PRECEDING AND CURRENT ROW)
                                Storage: Memory  Maximum Storage: 17kB
                                Buffers: shared hit=650
                                ->  Sort  (cost=1902.33..1904.83 rows=1000 width=52) (actual time=39.040..39.128 rows=1000.00 loops=1)
                                      Sort Key: bookings.property_id, (date(bookings.created_at))
                                      Sort Method: quicksort  Memory: 71kB
                                      Buffers: shared hit=650
                                      ->  HashAggregate  (cost=1837.50..1852.50 rows=1000 width=52) (actual time=38.286..38.644 rows=1000.00 loops=1)
                                            Group Key: bookings.property_id, date(bookings.created_at)
                                            Batches: 1  Memory Usage: 625kB
                                            Buffers: shared hit=650
                                            ->  Seq Scan on bookings  (cost=0.00..1462.50 rows=50000 width=26) (actual time=0.035..20.599 rows=50000.00 loops=1)
                                                  Filter: ((status)::text = ANY ('{CONFIRMED,CHECKED_IN,COMPLETED}'::text[]))
                                                  Buffers: shared hit=650
Planning:
  Buffers: shared hit=65 read=3
Planning Time: 1.258 ms
Execution Time: 43.915 ms
```

The following partial unique index is created:

```sql
create unique index idx_active_stay on bookings (guest_id) where status = 'CHECKED_IN';
```

This index ensures that the same guest cannot have more than one active CHECKED_IN booking.

### Query

```sql
EXPLAIN (ANALYZE, BUFFERS)

SELECT * FROM bookings WHERE guest_id = (SELECT guest_id FROM bookings WHERE status = 'CHECKED_IN' LIMIT 1)
AND status = 'CHECKED_IN';
```

```text
"QUERY PLAN"
"Index Scan using idx_active_stay on bookings  (cost=0.49..8.50 rows=1 width=72) (actual time=0.033..0.034 rows=1.00 loops=1)"
"  Index Cond: (guest_id = (InitPlan 1).col1)"
"  Index Searches: 1"
"  Buffers: shared hit=5"
"  InitPlan 1"
"    ->  Limit  (cost=0.00..0.20 rows=1 width=16) (actual time=0.018..0.018 rows=1.00 loops=1)"
"          Buffers: shared hit=2"
"          ->  Seq Scan on bookings bookings_1  (cost=0.00..1275.00 rows=6257 width=16) (actual time=0.017..0.017 rows=1.00 loops=1)"
"                Filter: ((status)::text = 'CHECKED_IN'::text)"
"                Rows Removed by Filter: 1"
"                Buffers: shared hit=2"
"Planning Time: 0.173 ms
Execution Time: 0.060 ms
```

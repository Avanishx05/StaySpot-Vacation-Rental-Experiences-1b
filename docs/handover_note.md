# Handover note: StaySpot Part A

We followed the original README to set up Part A on PostgreSQL 16 and MongoDB. File references in "What did not work" point to the code as we received it.

## What worked

- **Design:** the four tables match the spec. The `wallet_balance >= 0` check, the status enum and the `idx_active_stay` partial unique index (one CHECKED_IN stay per guest) were all correct.
- **Logic that was right once it compiled:** `SELECT ... FOR UPDATE` in the booking procedure, the DEBIT/CREDIT audit trigger, the concurrent refresh of `property_summary`, and the `DENSE_RANK()` query.
- **MongoDB:** the three collections have sensible shapes, `SearchSessions` has its 2dsphere and 2-hour TTL indexes, `$geoNear` filters to 5 km, and `$facet` returns the rating distribution, top tags and average.
- **Seeding:** 10k guests, 1k properties, 50k bookings and 100k wallet updates, with no guest checked in twice.

## What did not work

1. **No SQL ran.** The `uuid-ossp` line is commented out (`01_schema_ddl.sql:3`), and the trigger file is missing a `;` after `$$` (`03_triggers_and_audit.sql:19`).
2. **The booking procedure failed every time.** It reads a column that doesn't exist (`guests.guest_id`), and it calls `COMMIT`/`ROLLBACK` inside an exception block. It also turned every error into a NOTICE, so callers saw success.
3. **The procedure trusted the caller's price** instead of using `base_price`.
4. **Audit rows could be edited, deleted or forged.**
5. **Analytics were wrong.** "Total nights booked" counted bookings. The 7-day average used 7 rows instead of 7 days. All 50k seeded bookings had the same date, so the moving average was a single point.
6. **MongoDB:** the setup script and the seeder create the same TTL index under two names, so running both fails. `$geoNear` had no "recent" filter. Mongo IDs (`PROP-0001`) don't match the Postgres UUIDs.
7. **Setup:** the README describes files that don't exist, `requirements.txt` was missing `pymongo`, the seeder hard-coded port 5433, and the Mongo "stats" file was a script.

## What we changed and why

| Change | Why |
|---|---|
| Enabled `uuid-ossp`, fixed the trigger `;` | So the schema installs |
| Added `bookings.nights` and `wallet_audit_logs.booking_id` | To record stay length and link each wallet change to its booking |
| Rewrote `create_booking`: cost = `base_price × nights`, no `COMMIT`/`ROLLBACK`, raises `INSUFFICIENT_BALANCE` | So bookings work, can't be underpriced, and the app gets a clear error |
| Added `change_booking_status`, which raises `ACTIVE_STAY_EXISTS` | The app needs a safe way to move CONFIRMED → CHECKED_IN → COMPLETED |
| Added append-only guards on `wallet_audit_logs` | So audit rows can't be changed after they are written |
| `property_summary` now sums nights; added `mv_refresh_log` | Correct numbers, and the app can show "last refreshed" |
| 7-day `RANGE` window; seeder spreads bookings over 90 days | So the moving average is accurate over real dates |
| One TTL index name; `$geoNear` takes a point and a recency filter; Mongo seeder uses the Postgres UUIDs | So the scripts run together and the two databases join |
| `.env.example`, `package.json`, fixed `requirements.txt` and README | So a fresh clone sets up with the commands in the README |

After these changes, all six SQL files run on a fresh database, the seeder loads the full data set, and the booking, insufficient-balance, second-check-in and audit-lock cases behave as expected.

## Suggestions for the original authors

- Run every script against a clean database in CI before handing over.
- Let database errors reach the caller with clear codes instead of hiding them.
- Use one ID scheme across PostgreSQL and MongoDB.
- Use date ranges, not row counts, for time windows.
- Enforce audit immutability in the database, and keep the README in step with the code.

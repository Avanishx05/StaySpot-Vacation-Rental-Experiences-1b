> **Archived, historical.** This is an early review of the inherited repo, written before the fixes and the merge. Several items (missing `.git`, missing design docs, open Mongo items, README gaps) have since been resolved. The current state is in the root `README.md` ("Verification run", "Known limitations") and in `docs/handover_note.md`.

# Verification of the inherited repo against the Assignment 1 and 2 PDFs

Method: built a clean PostgreSQL 16 database from `sql/01-06`, ran `postgres_seeder.py` (10k guests, 1k properties, 50k bookings, 100k wallet updates), then exercised every procedure, the trigger, the audit guards, the materialized view and the window query by hand and with automated tests.
**Not verified:** anything that needs a running MongoDB (scripts in `mongo/`, `mongo_seeder.py`). No `mongod` was available in the review sandbox, so those files were code-reviewed only. Whoever owns 3.4-3.6 must run them.

## Step 1 (handover, API sketch)
| Requirement (A2 PDF) | Status |
|---|---|
| Part A schema, seeds, procedures run locally | **Pass** (PG side): all six SQL files and the seeder run clean after the previous member's fixes. Duplicate CHECKED_IN guests: 0. |
| `docs/handover_note.md`: worked / didn't / changed / suggestions | **Present, specific and honest** - the 19 listed errors and 8 change groups were checked against the code and are accurate. **Too long**: ~1,460 words vs "about one page". Trim before submission. |
| API sketch before building | **Present** (`docs/api_endpoints.md`) but incomplete for the UI (no search/sort params, actors unbounded, no error-code table). Updated. |
| "Note every change you make in your README" | **Missing**: changes are only in the handover note. README now has a "Changes to inherited scripts" section. |
| Keep Assignment 1 commit history | The zip has no `.git`. Continue in the fork/clone, not a re-upload. |

## Step 2 (design) - **incomplete in the zip**
| Requirement | Status |
|---|---|
| Users and what they want | **Missing** (no `docs/design/`). Written for screens 3.1-3.3 only (`docs/design/users_and_wireframes.md`). |
| Wireframes in `docs/design/` | **Missing**. Wireframes for 3.1-3.3 added; **3.4 Analytics, 3.5 Map, 3.6 Reviews still need wireframes** from their owners. |
| Consistent look, reusable components | **Missing**. Added `docs/design/design_system.md` + `web/css/styles.css` + `web/js/dom.js`. |

## Defects found in the inherited database work (fixed unless noted)
| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **High** | Audit ordering is ambiguous: `timestamp` defaulted to `current_timestamp` (frozen per transaction), so the seeder gave each guest's 10 rows an identical timestamp (10,000 tie groups). A running balance sorted by time would be shuffled. | Column default changed to `clock_timestamp()` (real insert time; **no new column**, schema still matches the A1 PDF). Audit API orders by `timestamp, id`. Result on seeded data: 0 tie groups, 0 broken balance chains. Test: 6 updates in one transaction come back in exact order. Residual risk: two inserts in the same microsecond could tie in theory (the `id` tie-break keeps the result deterministic). |
| 2 | High | All seeded audit rows were stamped "now", making the audit date filter pointless. | Seeder spreads each guest's rows over ~88 days, order-preserving, as table owner with the immutability trigger disabled inside one transaction (no backdoor in the trigger). Chain check: 0 broken. |
| 3 | Medium | No index on `bookings(guest_id)` (FK) nor `wallet_audit_logs(guest_id, ...)`; no trigram indexes for `ILIKE` search. | Added to `sql/02_indexes.sql`. At 50k bookings / 100k audit rows pages load in 6-114 ms. |
| 4 | Medium | `create_booking` with a huge `nights` or price throws raw `numeric field overflow`. | Bounds (1-365) and overflow check with hints (`INVALID_NIGHTS`, `AMOUNT_TOO_LARGE`) in `04_stored_procedures.sql`. |
| 5 | Low | `action_type` had no CHECK; trigger had an unreachable `NO_CHANGE` branch. | `CHECK (action_type IN ('DEBIT','CREDIT'))`; no-op updates return early. |
| 6 | Low | ERD PNG is stale (no `nights`, `booking_id`). | `docs/relational_erd.md` (Mermaid) matches the schema. |
| 7 | **High - open** | **Mongo seeded pings die within 2 hours.** `mongo_seeder.py` stamps `SearchSessions.created_at` within the last 1.9 h and the TTL index is 7200 s, so the Map screen will be empty a couple of hours after seeding (e.g. at the demo/viva). | Not changed (Mongo owner). Re-seed right before recording/demo, or add a ping simulator / "drop a pin" endpoint. |
| 8 | Medium - open | A PostgreSQL **superuser can bypass the audit guards** (`SET session_replication_role = replica` then UPDATE succeeds - tested). | The API must connect as a non-superuser. Be ready to explain this in the viva. |
| 9 | Low - open | Seeded bookings do not debit wallets and have no audit rows, so seeded guests' audit trails have no booking links; only live bookings do. | Documented as an assumption. |
| 10 | Low - open | README "Performance Proof" has EXPLAIN output for Workflow 2 only; none for Workflows 3 and 4. `performance/mongo_execution_stats.js` writes raw explain JSON but the output file is not in the repo. | Mongo owner: run it and commit/paste the output. |
| 11 | Low - open | README still needs: tech-choice justification, assumptions for the UI, screenshots, contribution table, demo video link, real final commit hash. | Required by the A2 PDF before submission. |

## Submission checklist (from the PDF)
ZIP named `<team_number>_a1b.zip` under 20 MB, no `node_modules/`, no build output, no DB dumps - README with repo URL + final commit hash + contribution table + demo link (<= 5 min) - `.gitignore` added.

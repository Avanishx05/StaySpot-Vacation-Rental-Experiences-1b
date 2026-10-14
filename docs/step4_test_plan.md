# Step 4 — Test plan and verification record

This plan focuses on the most important user-visible and data-integrity behaviours. The automated tests are already organized under `api/test/` and `web/test/`.

## Automated test suites

From the repository root:

```bash
(cd api && npm install && npm test)
(cd web && npm install && npm test)
```

### API tests (`api/test/`)

| Area | Important scenario | Expected result |
|---|---|---|
| Booking transaction | Valid guest, property, and number of nights | HTTP 201; booking returned; balance before/after correct; database-triggered audit row returned and linked to booking |
| Booking transaction | Wallet balance exactly equals booking cost | Booking succeeds and balance becomes `0.00` |
| Booking transaction | Balance is one paisa below the required cost | Friendly insufficient-balance response; no booking, debit, or audit row is persisted |
| Booking transaction | Unknown guest/property or invalid nights | Clear 404/400 response; no unintended database writes |
| Booking transaction | Guest already has an active checked-in stay | Status transition is rejected by the active-stay rule |
| Audit | Multiple entries for a guest | Stable chronological order and correct running balance |
| Browse | Pagination/search/filter inputs | Valid results and bounded page sizes; malformed input is rejected |
| Analytics | Window-function results | API returns the expected analytics shape from PostgreSQL |
| Mongo routes | MongoDB unavailable | Graceful error response rather than an unhandled exception |
| Mongo routes | Map/review aggregation endpoints | Routes return the expected shape when exercised with the fake Mongo test implementation |
| Reliability | Concurrent booking/status requests and larger result sets | Database constraints remain authoritative and response sizes remain bounded |

The API tests create and drop `stayspot_test` by default. **Never point `TEST_PG_DB` at a database containing data you need.** The configured PostgreSQL user must be able to create and drop databases. The test helper applies SQL files `01` through `05` to the disposable test database.

### Frontend tests (`web/test/`)

| Area | Important scenario | Expected result |
|---|---|---|
| Booking form | Submit with missing/invalid values | Validation message appears and no booking request is sent |
| Booking form | Successful booking | Confirmation, balance change, and audit details are displayed |
| Booking form | Insufficient funds | Plain-language failure message explains that no booking/charge occurred |
| Booking form | Active-stay constraint rejects check-in | Friendly error appears and the available next status action is shown |
| Browse and shared UI | Loading, empty, and API-error responses | UI displays a useful state instead of a blank screen |
| Audit, Analytics, Map, Reviews | Render screens against mocked API responses | Key screen content and error/empty behaviour render without requiring external services |
| Shared utilities | Formatting and helper behaviour | Expected output for representative values |

The browser tests mock API calls and browser-only integrations, so they do not replace the API/database integration tests.

## Manual end-to-end smoke test

After following the README setup and opening `http://localhost:4000`:

1. **Browse:** confirm the property list loads; try search, pagination, and opening a property detail.
2. **Actor switcher:** choose a seeded guest and confirm their wallet balance appears.
3. **Successful booking:** choose a property, enter valid nights, book, and verify the confirmation includes before/after balances and the audit entry.
4. **Insufficient balance:** choose a guest whose balance is lower than the selected stay's total; verify a clear error and confirm no booking/debit was created.
5. **Active-stay rule:** check in to one booking, then try to check in to another booking for the same guest; verify the second transition is rejected. Complete/cancel the first stay as allowed by the UI.
6. **Audit:** select the guest and verify the new transaction appears in timestamp order.
7. **Analytics:** load the analytics page and use refresh if available.
8. **Map and Reviews:** with MongoDB seeded, confirm hotspots and review analytics load. Also check the error message with MongoDB stopped.
9. **Responsive/error states:** narrow the browser window and use the browser's network tools to simulate an API failure; confirm the UI remains usable and reports the failure.

Record actual results (pass/fail, date, Node/PostgreSQL versions, and any issues) in `docs/verification_report.md` after running these steps. Do not mark a scenario passed unless it was run.

## Demo video

The assignment asks for a video of at most five minutes using seeded data. Record a concise walkthrough of Browse, successful and failed booking, Audit, Analytics, Map, and Reviews. Upload it to a location accessible to the teaching staff, then add its shareable URL to the README.

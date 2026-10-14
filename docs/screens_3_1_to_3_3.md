# Screens 3.1 Browse, 3.2 Transaction, 3.3 Audit trail - implementation notes

## Files
```
api/src/{config,db,errors,validate,app,server}.js     shared server plumbing (teammates reuse it)
api/src/routes/{actors,guests,properties,bookings}.js  endpoints for 3.1-3.3
api/test/*.test.js                                     45 API/DB tests (real PostgreSQL, throw-away DB)
web/index.html, css/styles.css, js/{dom,api,format,state,router,app}.js, js/pages/{browse,transaction,audit}.js
web/test/*.test.js                                     11 UI tests (real pages in jsdom -> real API -> real DB)
```
Plain HTML / CSS / ES modules, **no framework and no build step** (the API serves `web/`). Chosen because the screens are forms and tables, the whole thing is readable in a viva, and `npm install` is only needed for the API.

## Demo script (against seeded data, ~2 minutes) - works with any seeded guest
1. **Browse** - search a guest, sort by balance, change page size, open a guest -> detail with bookings. Open Bookings, filter `CHECKED_IN`.
2. In the header **"Acting as"**, search a name and pick a guest -> **Book a stay**: pick a property, 3 nights; show the estimate, confirm; point at *wallet before -> after* and the *DEBIT audit entry* (written by the trigger, linked to the booking).
3. **Insufficient balance:** same guest, pick any property, enter **365 nights** (always costs more than a seeded wallet holds: at least ₹3,65,000 vs about ₹1,70,000 max) -> friendly "short by ₹X, nothing was charged"; the balance is unchanged.
4. **Partial unique index:** under "Your bookings", click **Check in** on one booking -> OK. Book a second stay and click **Check in** on it -> "You already have a stay in progress". (About 64% of seeded guests already have a checked-in booking, so for them the very first check-in is refused; to show the success path pick a guest with no *Checked in* badge, or **Complete stay** the active one first.) Complete the first, check in the second -> works.
5. **Audit trail** -> running balance, totals, date presets. The booking you just made is the newest DEBIT row, linked to its booking; the older rows without a booking are the seeder's random wallet changes (credits and debits).

## Edge cases handled (and where it is tested)
| Area | Cases |
|---|---|
| Pagination | `page=0/-1/abc/1.5`, `limit=0/abc`, `limit=100000` (clamped to 100), page past the end (UI offers "go to last page"), 400 not 500 |
| Search | LIKE wildcards `%` `_` escaped, SQL-injection text, 101-char term, uuid paste, apostrophes; typing fast cancels stale requests |
| Ids | malformed uuid -> 400, unknown -> 404 (API and UI "not found" state) |
| Booking | nights 0/-2/1.5/"abc"/null/366/1e21 (client *and* server validation), missing guest/property, cost == balance (succeeds, 0.00), one paisa short (fails), client-supplied price ignored, overflowing amount -> 422 |
| Atomicity | failed booking leaves no booking row, no audit row, balance unchanged; double-click/Enter spam creates exactly one booking |
| Concurrency | 40 simultaneous bookings on a wallet that affords 7 -> exactly 7 succeed, balance 0.00, 7 audit rows with an unbroken chain; 20 guests in parallel; 6 simultaneous check-ins of one guest -> exactly 1 wins; same booking checked in 4x at once -> 1 wins |
| Status machine | skip step, repeat, go backwards, bogus status, unknown booking |
| Audit | rows written in one transaction keep their true order (distinct `clock_timestamp()` values); date filter inclusive/exclusive, single day, impossible dates (`2026-02-31`), from > to, empty range; guests never see each other's rows; audit table rejects UPDATE/DELETE/TRUNCATE/INSERT |
| Failure of the system | API down -> "can't reach the service, nothing was changed" with retry; DB errors mapped to 503; internals never leaked |
| Safety | all text rendered via `textContent` (hostile guest name `<img onerror>` shown as text); money kept as strings; payload > 10 kB rejected; sort fields whitelisted |
| Scale | 50k bookings + 100k audit rows: page 1 21 ms, deep page 1,500 114 ms, status filter 10 ms, text search 23 ms, guest trigram search 8 ms, audit of one guest 18 ms; audit query uses `idx_audit_guest_ts` (asserted via EXPLAIN) |

## Known limits / assumptions
- Currency shown as INR (₹); the spec gives none.
- "Acting as" guest is a demo switcher, not authentication; any caller can act as any guest.
- Dates are shown in the viewer's local time; the audit date filter sends local-midnight instants, so "today" means the user's today.
- Offset pagination is used (fine at 50k rows, 114 ms at page 1,500); keyset pagination would be the next step for millions.
- Not run in a real browser in the review sandbox (none available); UI behaviour is covered by jsdom tests. **Open it once in Chrome and a phone-width window before recording the demo.**

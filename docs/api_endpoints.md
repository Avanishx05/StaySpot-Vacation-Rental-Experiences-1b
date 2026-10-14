# API Endpoints

All endpoints live under `/api` (e.g. `GET /api/guests`). The API also serves the built React front end (`web/dist`, see `web/`) at `/`.

Conventions
- List endpoints take `page` (>= 1) and `limit` (1-100, larger values are clamped to 100) and return `{ items, page, limit, total }`. A page past the end returns an empty `items` array, not an error.
- Money (`wallet_balance`, `base_price`, `total_cost`, `amount_changed`, `balance_after`) is returned as a **decimal string** (`"1234.50"`), never a float. The browser formats it for display only.
- Errors return `{ error: { code, message, details? } }` with a stable `code`:

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | malformed UUID, bad page/limit/sort/date, `nights` not 1-365 ... (`details` = field -> message) |
| 404 | `NOT_FOUND` | unknown guest, property, booking or endpoint |
| 409 | `ACTIVE_STAY_EXISTS` | second `CHECKED_IN` for the same guest (`details.activeBookingId`, `activePropertyTitle`) |
| 409 | `INVALID_TRANSITION` | status change not allowed (e.g. `CONFIRMED` -> `COMPLETED`) |
| 413 | `PAYLOAD_TOO_LARGE` | body > 10 kB |
| 422 | `INSUFFICIENT_BALANCE` | wallet too low (`details`: `available`, `required`, `shortBy`) |
| 422 | `AMOUNT_TOO_LARGE` | cost / balance would overflow `decimal(10,2)` |
| 503 | `BUSY` / `DB_UNAVAILABLE` | lock/statement timeout, deadlock, database down |
| 500 | `INTERNAL` | anything unexpected (details are logged server-side, never sent) |

## Actors

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /actors` | `q` (name or id), `limit` (default 20, max 100) | `[{ id, name, wallet_balance }]` - a bounded search, never all 10k guests; ordered by name | PG `guests` |

## Browse

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /guests` | `page, limit, q, sort` (`name`\|`wallet_balance`), `order` | list of `{ id, name, wallet_balance }` | PG `guests` |
| `GET /guests/:id` | – | `{ id, name, wallet_balance, bookingCount, bookings[latest 20] }` | PG `guests`, `bookings` |
| `GET /properties` | `page, limit, q, minPrice, maxPrice, sort` (`title`\|`base_price`), `order` | list of `{ id, title, base_price, latitude, longitude }` | PG `properties` |
| `GET /properties/:id` | – | property + `bookingCount` + latest 20 `bookings` | PG `properties`, `bookings` |
| `GET /bookings` | `page, limit, status, guestId, propertyId, q` (guest name / property title / any id), `sort` (`created_at`\|`total_cost`), `order` | list of `{ id, guest, property, nights, total_cost, status, created_at }` | PG `bookings`, `guests`, `properties` |
| `GET /bookings/:id` | – | booking | PG `bookings` |

## Transaction (book stay)

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `POST /bookings` | `{ guestId, propertyId, nights }` | `{ booking, balanceBefore, balanceAfter, auditEntry }` | PG `CALL create_booking`, `wallet_audit_logs` |
| `PATCH /bookings/:id/status` | `{ status }` (`CHECKED_IN` / `COMPLETED`) | `{ booking }` | PG `CALL change_booking_status` (`idx_active_stay`) |

`POST /bookings` runs lock + balance read + `CALL create_booking` + audit lookup in **one transaction**, so `balanceBefore`/`balanceAfter` are exactly the values this booking changed even under concurrent requests. The price always comes from `properties.base_price`; the client cannot send a cost. `nights` must be a whole number 1-365. Status: `201` on success.

`PATCH /bookings/:id/status` allows only `CONFIRMED -> CHECKED_IN -> COMPLETED`.

## Audit trail

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /guests/:id/audit` | `from, to, page, limit, order` (`desc` default \| `asc`) | `{ guest, items: [{ id, timestamp, action_type, amount_changed, balance_after, booking_id }], page, limit, total, summary: { openingBalance, closingBalance, totalCredits, totalDebits } }` (`balance_after` = running balance) | PG `wallet_audit_logs` |

Date filter: `YYYY-MM-DD` = whole UTC day, both ends inclusive; a full ISO timestamp is `from` inclusive / `to` exclusive (the UI sends local-midnight instants so a user's "today" means their today). `from` must be before `to`. Rows are ordered by `timestamp` then `id`; the column defaults to `clock_timestamp()`, so rows written in one transaction still get distinct, correctly ordered times. `summary` covers the filtered range; the opening/closing balances are `null` when the range is empty.

## Analytics

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /analytics/moving-average` | `propertyId, from, to` | `[{ date, dailyRevenue, movingAvg7d }]` | PG window query (`06_window_analytics.sql`) |
| `GET /analytics/ranking` | `date, limit` | `[{ rank, propertyId, title, movingAvg7d }]` | PG `DENSE_RANK()` query (`06_window_analytics.sql`) |
| `GET /analytics/summary` | – | `{ rows: [{ propertyId, title, totalNightsBooked, grossRevenue }], lastRefreshed }` | PG `property_summary`, `mv_refresh_log` |
| `POST /analytics/summary/refresh` | – | `{ lastRefreshed }` | PG `refresh_property_summary()` |

## Map (search hotspots)

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /map/origins` | – | `[{ propertyId, title, lng, lat }]` | Mongo `PropertyAmenities` |
| `GET /map/hotspots` | `lng, lat, radiusKm=5` | `[{ lat, lng, searchCount, distanceKm }]` sorted by distance (polled for new pings) | Mongo `SearchSessions` `$geoNear` |

## Reviews + catalog

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /reviews/facets` | `propertyId` (optional) | `{ ratingDistribution, topTags, averageRating }` | Mongo `PropertyReviews` `$facet` |
| `GET /amenities/:propertyId` | – | `{ amenities, house_rules, accessibility_features }` | Mongo `PropertyAmenities` |

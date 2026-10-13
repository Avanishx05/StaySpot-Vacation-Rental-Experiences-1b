# API Endpoints

List endpoints take `page`, `limit` (max 100) and return `{ items, page, limit, total }`.
Errors return `{ error: { code, message } }`.

## Actors

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /actors` | – | `[{ id, name, wallet_balance }]` | PG `guests` |

## Browse

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /guests` | `page, limit, q` | list of `{ id, name, wallet_balance }` | PG `guests` |
| `GET /guests/:id` | – | guest + their bookings | PG `guests`, `bookings` |
| `GET /properties` | `page, limit, q, minPrice, maxPrice` | list of `{ id, title, base_price, latitude, longitude }` | PG `properties` |
| `GET /properties/:id` | – | property + its bookings | PG `properties`, `bookings` |
| `GET /bookings` | `page, limit, status, guestId, propertyId` | list of `{ id, guest, property, nights, total_cost, status, created_at }` | PG `bookings`, `guests`, `properties` |
| `GET /bookings/:id` | – | booking | PG `bookings` |

## Transaction (book stay)

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `POST /bookings` | `{ guestId, propertyId, nights }` | `{ booking, balanceBefore, balanceAfter, auditEntry }` | PG `CALL create_booking`, `wallet_audit_logs` |
| `PATCH /bookings/:id/status` | `{ status }` (`CHECKED_IN` / `COMPLETED`) | `{ booking }` | PG `CALL change_booking_status` (`idx_active_stay`) |

Errors:
- `422 INSUFFICIENT_BALANCE`: not enough wallet balance.
- `409 ACTIVE_STAY_EXISTS`: the guest already has a `CHECKED_IN` booking.
- `404 NOT_FOUND`: unknown guest, property or booking.

## Audit trail

| Endpoint | Input | Output | DB |
|---|---|---|---|
| `GET /guests/:id/audit` | `from, to, page, limit` | list of `{ timestamp, action_type, amount_changed, balance_after, booking_id }` (`balance_after` = running balance) | PG `wallet_audit_logs` |

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

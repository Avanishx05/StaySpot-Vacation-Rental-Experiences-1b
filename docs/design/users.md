# StaySpot: users

StaySpot has two kinds of user. There is no real login (the brief doesn't require one): an **actor switcher** in the header picks which guest you are acting as, and every page reads that choice through `useActor()`.

## 1. Guest

Someone looking for a holiday rental who pays from a prepaid StaySpot wallet.

| Wants to… | Screen | Endpoint |
|---|---|---|
| Browse properties, filter by price and open one to see its details | Browse | `GET /properties`, `GET /properties/:id` |
| Read what other guests thought and see the amenities, house rules and accessibility features before booking | Reviews | `GET /reviews/facets`, `GET /amenities/:propertyId` |
| Book a stay for a number of nights and see the price before paying | Book a stay | `POST /bookings` |
| Know straight away whether the booking worked, how much was taken from the wallet, and why it failed if it didn't | Book a stay | `POST /bookings` (`422 INSUFFICIENT_BALANCE`, `409 ACTIVE_STAY_EXISTS`) |
| Check in when they arrive and check out when they leave | Book a stay → My bookings | `PATCH /bookings/:id/status` |
| See every change to their wallet with a running balance, to check nothing was charged twice | Audit trail | `GET /guests/:id/audit` |

**What matters to them:** a clear price before they commit, a plain-language error instead of a database message, and proof that the money moved (balance before/after and the audit row).

## 2. Host / property manager

Someone who runs one or more properties and wants to know how they are doing.

| Wants to… | Screen | Endpoint |
|---|---|---|
| Look up guests and bookings, filter bookings by status | Browse | `GET /guests`, `GET /bookings` |
| Move a booking through CONFIRMED → CHECKED_IN → COMPLETED | Book a stay → My bookings | `PATCH /bookings/:id/status` |
| See daily revenue and the 7-day moving average for a property | Analytics | `GET /analytics/moving-average` |
| Compare properties in a ranked list | Analytics | `GET /analytics/ranking` |
| See totals (gross revenue, nights booked) and refresh them on demand | Analytics | `GET /analytics/summary`, `POST /analytics/summary/refresh` |
| See where guests are searching near a property, live | Map | `GET /map/origins`, `GET /map/hotspots` (polled) |
| Track average rating, rating spread and the most common review tags | Reviews | `GET /reviews/facets` |

**What matters to them:** numbers they can trust (with a "last refreshed" time), comparisons across properties, and seeing demand change without reloading the page.

## Switching between users for the demo

- The header shows **Acting as guest: <name>**. Opening it lists demo guests from `GET /actors` with their wallet balance (wireframe `w10-actor.png`).
- The choice is saved in `localStorage`, so a refresh keeps it.
- Pages that depend on the actor (Book a stay, My bookings, Audit trail) default to the chosen guest. Host pages (Analytics, Map, Reviews, Browse) work the same for everyone, because the Part A schema has no hosts table.
- Pick a guest with a low balance to demo the "Not enough balance" error, and one with a CHECKED_IN booking to demo the "You already have an active stay" error.

## Demo path covering both users

1. Guest browses properties and opens one (Browse).
2. Guest checks reviews and amenities (Reviews).
3. Guest books it: balance drops, audit row appears (Book a stay).
4. Guest checks in, then tries to check in to a second booking: blocked by `idx_active_stay` (Book a stay).
5. Guest checks out, then checks in to the second booking: works.
6. Guest opens the Audit trail and sees the debit with the running balance.
7. Host looks at Analytics and presses **Refresh view**: the "last refreshed" time updates.
8. Host opens the Map and watches new search pins arrive.

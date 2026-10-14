# Users and wireframes - screens 3.1-3.3 (StaySpot)

## Who uses it
| User | Wants to |
|---|---|
| **Guest** (the "Acting as" person) | find a property, book a stay with their wallet and see the money leave, check in / complete a stay, understand every wallet movement |
| **Support / ops** (same UI, any guest selected) | look up any guest / property / booking, and audit exactly what happened to a wallet and when |

## 3.1 Browse
```
+--------------------------------------------------------------------+
| StaySpot  [Browse] Book a stay  Audit trail      Acting as: Name . ₹ [Switch guest...] |
+--------------------------------------------------------------------+
| Browse                                                             |
| [Guests] [Properties] [Bookings]                                   |
| +----------------------------------------------------------------+ |
| | [ search........................ ] [filters] [25 / page v]      | |
| | Name ▲        Wallet balance     ID                            | |
| | ------------------------------------------------------------   | |
| | Aaron Smith   ₹ 61,200.00        3f2a91c0                      | |
| | ...                                                            | |
| | 1-25 of 10,003        « Prev  Page 1 / 401  Next »             | |
| +----------------------------------------------------------------+ |
|  states: Loading... | "No matches - clear filters" | "Can't reach the server [Try again]" |
+--------------------------------------------------------------------+
Detail: [<- Back]  Guest name   [Act as this guest] [Audit trail]
        balance / id / count      + latest 20 bookings table (+ "See all")
```

## 3.2 Book a stay
```
| New booking                                                        |
|  Wallet balance: ₹ 5,00,750.00                                     |
|  Property  [ search by title... v ]   Beach House · ₹1,000 / night |
|  Nights    [ 3 ]  1-365                                            |
|  +-- estimate --------------------------------------------------+  |
|  | ₹1,000 x 3 nights   Estimated total ₹3,000   Balance after ... | |
|  [ Book stay ]                                                     |
|  OK:  Booking confirmed - Wallet before -> after, Audit entry: DEBIT -₹3,000.00 |
|  ERR: "Not enough money in your wallet - costs X, you hold Y, short by Z. Nothing was charged." |
| Your bookings  [Booking | Property | Nights | Total | Status | Next step: Check in / Complete stay] |
|   ERR on 2nd check-in: "You already have a stay in progress ..."   |
```

## 3.3 Audit trail
```
| Wallet audit trail          Guest name            Current balance ₹.. |
| From [date] To [date] [Apply] [Last 7 days] [Last 30 days] [All time] |
| Entries | Opening | Total credits | Total debits | Closing           |
| When ▼              Type    Amount        Running balance   Booking  |
| 13 Oct 2026, 10:02  Debit   −₹3,000.00    ₹47,000.00        a1b2c3d4 |
| empty: "No wallet activity in this period - try a wider range"       |
```

# Relational ERD (current schema)

`relational_erd.png` is the Assignment 1 export and is out of date (it lacks `bookings.nights` and `wallet_audit_logs.booking_id`). This diagram matches `sql/01_schema_ddl.sql`.

```mermaid
erDiagram
  guests ||--o{ bookings : places
  properties ||--o{ bookings : "is booked in"
  guests ||--o{ wallet_audit_logs : "wallet history"
  bookings ||--o{ wallet_audit_logs : "caused by (nullable)"
  guests { uuid id PK
    varchar name
    decimal wallet_balance "CHECK >= 0" }
  properties { uuid id PK
    varchar title
    decimal base_price
    decimal latitude
    decimal longitude }
  bookings { uuid id PK
    uuid guest_id FK
    uuid property_id FK
    int nights "CHECK > 0"
    decimal total_cost
    varchar status "CONFIRMED / CHECKED_IN / COMPLETED"
    timestamptz created_at }
  wallet_audit_logs { uuid id PK
    uuid guest_id FK
    uuid booking_id FK
    decimal amount_changed
    varchar action_type "DEBIT / CREDIT"
    decimal balance_after
    timestamptz timestamp "default clock_timestamp()" }
```

create unique index idx_active_stay on bookings(guest_id) where status='CHECKED_IN';

create index idx_bookings_property_created on bookings (property_id, created_at);

-- ---- Assignment 2 additions (front-end access paths) ----
-- FK columns are not indexed automatically in PostgreSQL.
create index idx_bookings_guest_created on bookings (guest_id, created_at desc, id);
create index idx_bookings_created on bookings (created_at desc, id);
create index idx_bookings_status_created on bookings (status, created_at desc, id);

-- Audit trail: one guest's rows in time order, optionally filtered by date range.
create index idx_audit_guest_ts on wallet_audit_logs (guest_id, timestamp, id);

-- Browse: case-insensitive substring search (ILIKE '%term%') on names/titles.
create extension if not exists pg_trgm;
create index idx_guests_name_trgm on guests using gin (name gin_trgm_ops);
create index idx_properties_title_trgm on properties using gin (title gin_trgm_ops);
create index idx_properties_price on properties (base_price, id);

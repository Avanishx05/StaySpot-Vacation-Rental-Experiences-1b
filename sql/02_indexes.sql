create unique index idx_active_stay on bookings(guest_id) where status='CHECKED_IN';

create index idx_bookings_property_created on bookings (property_id, created_at);
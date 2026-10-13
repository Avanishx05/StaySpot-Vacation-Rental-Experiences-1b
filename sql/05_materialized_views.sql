drop materialized view if exists property_summary cascade;

create materialized view property_summary as
select p.id as PropertyID,p.title as Title,
coalesce(sum(b.nights),0) as TotalNightsBooked,
count(b.id) as TotalBookings,
coalesce(sum(b.total_cost),0.00) as GrossRevenue
from properties p left join bookings b on p.id = b.property_id
group by p.id,p.title;

create unique index property_summary_idx on property_summary(PropertyID);

create table if not exists mv_refresh_log(
	view_name text primary key,
	refreshed_at timestamp with time zone not null);

insert into mv_refresh_log values ('property_summary', now())
on conflict (view_name) do update set refreshed_at = excluded.refreshed_at;

create or replace function refresh_property_summary()
returns timestamp with time zone language plpgsql as $$
declare ts timestamp with time zone := clock_timestamp();
begin
	refresh materialized view concurrently property_summary;
	insert into mv_refresh_log values ('property_summary', ts)
	on conflict (view_name) do update set refreshed_at = excluded.refreshed_at;
	return ts;
end;
$$;
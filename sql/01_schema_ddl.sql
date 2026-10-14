create extension if not exists "uuid-ossp";

create table guests(
	id uuid primary key default uuid_generate_v4(),
	name varchar(64) not null,
	wallet_balance decimal(10,2) not null default 0.00
	check(wallet_balance >= 0.00)
);

create table properties(
	id uuid primary key default uuid_generate_v4(),
	title varchar(256) not null,
	base_price decimal(10,2) not null check(base_price >=0),
	latitude decimal(9,6) not null,
	longitude decimal(9,6) not null
);

create table bookings(
	id uuid primary key default uuid_generate_v4(),
	guest_id uuid not null references guests(id) on delete restrict,
	property_id uuid not null references properties(id) on delete restrict,
	nights int not null default 1 check (nights > 0),
	total_cost decimal(10,2) not null check(total_cost >=0.00),
	status varchar(32) not null default 'CONFIRMED'
	check (status in ('CONFIRMED','CHECKED_IN','COMPLETED')),
	created_at timestamp with time zone default current_timestamp
);

create table wallet_audit_logs(
	id uuid primary key default uuid_generate_v4(),
	guest_id uuid not null references guests(id) on delete no action,
	booking_id uuid references bookings(id) on delete no action,
	amount_changed decimal(10,2) not null,
	action_type varchar(50) not null check (action_type in ('DEBIT','CREDIT')),
	balance_after decimal(10,2) not null check(balance_after >=0.00),
	-- clock_timestamp() = the real time of THIS insert. (current_timestamp is frozen at transaction
	-- start, so rows written in one transaction would all tie and a running balance could not be ordered.)
	timestamp timestamp with time zone not null default clock_timestamp()
);

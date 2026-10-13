create or replace procedure create_booking(
	p_guest_id uuid, p_property_id uuid,
	p_nights int default 1, inout p_booking_id uuid default null)
language plpgsql as $$
declare
	curr_bal decimal(10,2); price decimal(10,2); cost decimal(10,2);
begin
	if p_nights is null or p_nights <= 0 then
		raise exception 'Nights must be at least 1' using errcode = '22023';
	end if;

	select wallet_balance into curr_bal from guests where id = p_guest_id for update;
	if not found then
		raise exception 'Guest does not exist: %', p_guest_id using errcode = 'P0002';
	end if;

	select base_price into price from properties where id = p_property_id;
	if not found then
		raise exception 'Property does not exist: %', p_property_id using errcode = 'P0002';
	end if;

	cost := price * p_nights;
	if curr_bal < cost then
		raise exception 'Insufficient balance. Available: %, Required: %', curr_bal, cost
			using errcode = 'P0001', hint = 'INSUFFICIENT_BALANCE';
	end if;

	insert into bookings(guest_id, property_id, nights, total_cost, status)
	values (p_guest_id, p_property_id, p_nights, cost, 'CONFIRMED')
	returning id into p_booking_id;

	perform set_config('stayspot.booking_id', p_booking_id::text, true);
	update guests set wallet_balance = wallet_balance - cost where id = p_guest_id;
	perform set_config('stayspot.booking_id', '', true);
end;
$$;

create or replace procedure change_booking_status(p_booking_id uuid, p_new_status varchar)
language plpgsql as $$
declare curr_status varchar(32);
begin
	select status into curr_status from bookings where id = p_booking_id for update;
	if not found then
		raise exception 'Booking does not exist: %', p_booking_id using errcode = 'P0002';
	end if;
	if not (curr_status = 'CONFIRMED' and p_new_status = 'CHECKED_IN')
	   and not (curr_status = 'CHECKED_IN' and p_new_status = 'COMPLETED') then
		raise exception 'Cannot move booking from % to %', curr_status, p_new_status
			using errcode = '22023';
	end if;
	begin
		update bookings set status = p_new_status where id = p_booking_id;
	exception when unique_violation then
		raise exception 'Guest already has an active (CHECKED_IN) stay'
			using errcode = '23505', hint = 'ACTIVE_STAY_EXISTS';
	end;
end;
$$;
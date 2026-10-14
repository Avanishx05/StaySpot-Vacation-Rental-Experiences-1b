create or replace function audit_log()
returns trigger
language plpgsql
as $$
declare
	amount_diff decimal(10,2);
	action varchar(50);
begin
	amount_diff :=new.wallet_balance -old.wallet_balance;
	if amount_diff = 0 then
		return new;
	end if;
	action := case when amount_diff < 0 then 'DEBIT' else 'CREDIT' end;

	insert into wallet_audit_logs(guest_id, booking_id, amount_changed, action_type, balance_after)
	values(new.id, nullif(current_setting('stayspot.booking_id', true), '')::uuid, amount_diff, action, new.wallet_balance);

	return new;
end;
$$;

create or replace trigger audit_log_trigger after update of wallet_balance
on guests
for each row
when (old.wallet_balance != new.wallet_balance)
execute function audit_log();

create or replace function protect_audit_log()
returns trigger language plpgsql as $$
begin
	if tg_op = 'INSERT' and pg_trigger_depth() > 1 then
		return new;
	end if;
	raise exception 'wallet_audit_logs is append-only (% not allowed)', tg_op
		using errcode = 'insufficient_privilege';
end;
$$;

create or replace trigger audit_log_insert_guard before insert on wallet_audit_logs
for each row execute function protect_audit_log();
create or replace trigger audit_log_immutable before update or delete on wallet_audit_logs
for each row execute function protect_audit_log();
create or replace trigger audit_log_no_truncate before truncate on wallet_audit_logs
for each statement execute function protect_audit_log();
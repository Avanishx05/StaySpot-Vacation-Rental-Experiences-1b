import os
import uuid
import random
from decimal import Decimal
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from psycopg2.extras import execute_values,register_uuid
from faker import Faker
register_uuid()

DB_NAME = os.getenv("PG_DB", "stayspot")
DB_USER = os.getenv("PG_USER", "postgres")
DB_PASSWORD = os.getenv("PG_PASSWORD", "")
DB_HOST = os.getenv("PG_HOST", "localhost")
DB_PORT = os.getenv("PG_PORT", "5432")

BOOKING_HISTORY_DAYS = 90

NUM_GUESTS = 10000
NUM_PROPERTIES = 1000
NUM_BOOKINGS = 50000

WALLET_UPDATES_PER_GUEST = 10

BATCH_SIZE = 5000

fake = Faker()
random.seed(42)

def get_connection():

    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT
    )

def gen_guests(conn):

    rows = []
    guest_ids = []

    for _ in range(NUM_GUESTS):

        guest_id = uuid.uuid4()
        name = fake.name()

        wallet_balance = Decimal(random.randint(50000, 150000))
        guest_ids.append(guest_id)
        rows.append((guest_id,name,wallet_balance))

    query = "insert into guests (id, name, wallet_balance) values %s;"

    with conn.cursor() as cur:

        for i in range(0,len(rows),BATCH_SIZE):
            batch = rows[i:i + BATCH_SIZE]
            execute_values(cur,query,batch)

            print(
                f"Guests Batch Inserted: "
                f"{min(i + BATCH_SIZE, len(rows))}/"
                f"{NUM_GUESTS}"
            )

    conn.commit()

    print(
        f"Total Guests Inserted: {len(guest_ids)}")

    return guest_ids

def gen_props(conn):

    rows = []
    property_ids = []
    property_prices = {}

    for _ in range(NUM_PROPERTIES):

        property_id = uuid.uuid4()

        title = fake.catch_phrase()
        base_price = Decimal(random.randint(1000, 25000))
        latitude = round(random.uniform(8.0, 28.0),4)
        longitude = round(random.uniform(72.0, 88.0),4)
        property_ids.append(property_id)
        property_prices[property_id] = base_price

        rows.append((property_id,title,base_price,latitude,longitude))

    query = """
        insert into properties (id, title, base_price, latitude, longitude) values %s;
        """

    with conn.cursor() as cur:

        for i in range(0,len(rows),BATCH_SIZE):
            batch = rows[i:i + BATCH_SIZE]
            execute_values(cur,query,batch)

    conn.commit()

    print(
        f"Total Properties Inserted: {len(property_ids)}")

    return property_ids, property_prices

def gen_bookings(conn,guest_ids,property_ids,property_prices):

    rows = []
    checked_in_guests = set()

    for _ in range(NUM_BOOKINGS):

        guest_id = random.choice(guest_ids)
        property_id = random.choice(property_ids)
        nights = random.randint(1, 7)
        total_cost = property_prices[property_id] * nights
        created_at = datetime.now(timezone.utc) - timedelta(
            seconds=random.randint(0, BOOKING_HISTORY_DAYS * 86400))

        if (guest_id not in checked_in_guests and random.random() < 0.20):

            status = "CHECKED_IN"
            checked_in_guests.add(guest_id)

        else:
            status = random.choice(["CONFIRMED","COMPLETED"])

        rows.append((uuid.uuid4(),guest_id,property_id,nights,total_cost,status,created_at))

    query = """
        insert into bookings (id,guest_id,property_id,nights,total_cost,status,created_at) values %s;
    """
    inserted = 0

    with conn.cursor() as cur:

        for i in range(0,len(rows),BATCH_SIZE):

            batch = rows[i:i + BATCH_SIZE]

            execute_values(cur,query,batch)
            inserted += len(batch)

            print(
                f"Bookings Batch Inserted: {inserted}/{NUM_BOOKINGS}")

    conn.commit()

    print(f"Total Bookings Inserted: {inserted}")

    print(f"Unique CHECKED_IN Guests: {len(checked_in_guests)}")

def gen_wallet_updates(conn,guest_ids):

    total_updates = 0
    successful_updates = 0

    with conn.cursor() as cur:

        for start in range(0,len(guest_ids),BATCH_SIZE):

            batch = guest_ids[start:start + BATCH_SIZE]

            for guest_id in batch:
                for _ in range(WALLET_UPDATES_PER_GUEST):
                    change = Decimal(random.randint(100,2000))

                    if random.random() < 0.5:
                        cur.execute("""
                            update guests set wallet_balance = wallet_balance + %s where id = %s;
                            """,(change,guest_id))

                    else:
                        cur.execute("""
                            update guests set wallet_balance = wallet_balance - %s where id = %s and wallet_balance >= %s;
                            """,(change,guest_id,change))

                    total_updates += 1

                    if cur.rowcount == 1:
                        successful_updates += 1
            conn.commit()

    print(f"\nTotal Wallet Updates: {total_updates}")
    print(f"Successful Wallet Updates: {successful_updates}")

    print(f"Expected Audit Entries: {successful_updates}")

def spread_audit_timestamps(conn):
    """The audit trigger stamps rows with clock_timestamp(), so every seeded row would be 'today'.
    To make the date filter meaningful we spread each guest's rows over the last ~88 days,
    keeping each guest's existing time order (so running balances stay correct).
    Done once, by the table owner, with the immutability trigger disabled *inside one
    transaction* - the trigger itself has no backdoor."""
    with conn.cursor() as cur:
        cur.execute("alter table wallet_audit_logs disable trigger audit_log_immutable")
        cur.execute("""
            update wallet_audit_logs w
               set timestamp = now() - interval '88 days'
                               + (r.rn::float8 / r.cnt) * interval '87 days'
                               + (abs(hashtext(w.guest_id::text)) % 1440) * interval '1 minute'
              from (select id,
                           row_number() over (partition by guest_id order by timestamp, id) as rn,
                           count(*)     over (partition by guest_id)              as cnt
                      from wallet_audit_logs) r
             where r.id = w.id
        """)
        cur.execute("alter table wallet_audit_logs enable trigger audit_log_immutable")
    conn.commit()
    print("Audit timestamps spread over the last ~88 days")

def verify_data(conn):

    with conn.cursor() as cur:
        cur.execute("select count(*) from guests;")
        guests_count = cur.fetchone()[0]

        cur.execute("select count(*) from properties;")
        properties_count = cur.fetchone()[0]

        cur.execute("select count(*) from bookings;")
        bookings_count = cur.fetchone()[0]

        cur.execute("select count(*) from wallet_audit_logs;")
        audits_count = cur.fetchone()[0]

        cur.execute("select count(*) from bookings where status = 'CHECKED_IN';")
        checked_in_count = cur.fetchone()[0]

        cur.execute("select guest_id, count(*) from bookings where status = 'CHECKED_IN' group by guest_id having count(*) > 1;")
        duplicate_checked_in = cur.fetchall()

        cur.execute("""
            select count(*) from (
              select balance_after - amount_changed as expected_prev,
                     lag(balance_after) over (partition by guest_id order by timestamp, id) as prev
                from wallet_audit_logs) t
             where prev is not null and prev <> expected_prev""")
        broken_chains = cur.fetchone()[0]

    print(f"Audit chains broken (should be 0): {broken_chains}")
    print(f"Guests: {guests_count:,}")
    print(f"Properties: {properties_count:,}")
    print(f"Bookings: {bookings_count:,}")
    print(f"Audit Entries: {audits_count:,}")
    print(f"CHECKED_IN Bookings : {checked_in_count:,}")
    print(f"Duplicate CHECKED_IN guests: {len(duplicate_checked_in)}")

def main():
    conn = None

    try:
        conn = get_connection()
        print("Connected to PgSQL server!\n")

        guest_ids = gen_guests(conn)
        property_ids, property_prices = gen_props(conn)
        gen_bookings(conn,guest_ids,property_ids,property_prices)
        gen_wallet_updates(conn,guest_ids)
        spread_audit_timestamps(conn)

        with conn.cursor() as cur:
            cur.execute("select refresh_property_summary();")
        conn.commit()

        verify_data(conn)

        print("\nData generation completed successfully!")

    except Exception as e:

        print("\nError:")
        print(e)
        if conn:
            conn.rollback()

    finally:
        if conn:
            conn.close()

        print("\nConnection closed!")

if __name__ == "__main__":
    main()
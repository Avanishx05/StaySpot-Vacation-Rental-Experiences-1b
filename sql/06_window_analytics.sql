with daily_revenue as (
    select property_id, date(created_at) as booking_date, sum(total_cost) as daily_revenue
    from bookings
    group by property_id, date(created_at)
),
moving_average as (
    select property_id, booking_date, daily_revenue,
        sum(daily_revenue) over (
            partition by property_id
            order by booking_date
            range between interval '6 days' preceding and current row
        ) / 7.0 as seven_day_moving_avg
    from daily_revenue
),
ranked_properties as (
    select
        property_id,
        booking_date,
        daily_revenue,
        seven_day_moving_avg,
        dense_rank() over (
            partition by booking_date
            order by seven_day_moving_avg desc
        ) as revenue_rank
    from moving_average
)

select property_id, booking_date, daily_revenue, round(seven_day_moving_avg, 2) as seven_day_moving_avg, revenue_rank
from ranked_properties order by booking_date,revenue_rank;
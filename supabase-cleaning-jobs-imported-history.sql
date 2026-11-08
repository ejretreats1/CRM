-- Clear cleaning jobs imported from a calendar's history.
-- Run in Supabase SQL Editor → New Query. Steps 1–2 only read.
--
-- Connecting a calendar used to pull in the stays that were already on it,
-- including ones from before the property came to us. Those are not jobs and
-- not our revenue. The sync no longer imports them (each feed records the day
-- it was connected), but rows created before that fix are still there.
--
-- The Jobs tab can do this too — Select → select day → Delete — which is
-- easier for one bad day. Use this when there are too many to click through.

-- 1) Where the pile-ups are: jobs per property per day, worst first.
select property_id,
       property_name,
       checkout_date,
       count(*)                                           as jobs,
       count(*) filter (where charged_at is not null)      as charged,
       count(*) filter (where payout_sent_at is not null)  as paid_out,
       min(created_at)                                     as first_created,
       max(created_at)                                     as last_created,
       array_agg(distinct source)                          as sources
from cleaning_jobs
where status <> 'cancelled'
group by 1, 2, 3
having count(*) > 2
order by jobs desc, checkout_date desc
limit 50;

-- 2) The rows one property imported from before it was enrolled. Set the
--    property id; the date comes from the property's own enrolment.
--    (Swap the date in manually if you connected the calendar later.)
select j.id, j.checkout_date, j.status, j.source, j.guest_name,
       j.cleaning_fee, j.cleaner_payout, j.charged_at, j.created_at
from cleaning_jobs j
join cleaning_property_configs c on c.property_id = j.property_id
where j.property_id = 'PUT-PROPERTY-ID-HERE'
  and j.checkout_date < to_char(c.enrolled_at, 'YYYY-MM-DD')
  and j.charged_at is null
  and j.payout_sent_at is null
order by j.checkout_date;

-- 3) DELETE those rows (writes — read step 2 first). Nothing charged or paid
--    out is touched, so no record of money that moved is lost.
--
-- delete from cleaning_jobs j
--  using cleaning_property_configs c
--  where c.property_id = j.property_id
--    and j.property_id = 'PUT-PROPERTY-ID-HERE'
--    and j.checkout_date < to_char(c.enrolled_at, 'YYYY-MM-DD')
--    and j.charged_at is null
--    and j.payout_sent_at is null;

-- 4) Or clear one bad day for one property, whatever its enrolment date.
--
-- delete from cleaning_jobs
--  where property_id = 'PUT-PROPERTY-ID-HERE'
--    and checkout_date = '2026-11-01'
--    and charged_at is null
--    and payout_sent_at is null;

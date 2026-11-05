-- Find (and optionally tidy) cleaning jobs that cover the same clean twice.
-- Run in Supabase SQL Editor → New Query. Steps 1–3 only read.
--
-- The existing dedupe script (supabase-cleaning-jobs-dedupe.sql) catches the
-- same BOOKING stored twice. This one catches the same STAY arriving under two
-- different reservation ids — typically one listing reaching the CRM through
-- two calendar feeds (an old listing's feed left on the property beside the new
-- one), or a job added by hand that the sync then created as well.

-- 1) The duplicates: same property, same unit, same checkout date, still live.
select j.property_id,
       j.property_name,
       coalesce(j.unit_id, '(no unit)') as unit,
       j.checkout_date,
       count(*)                          as jobs,
       array_agg(j.id order by j.created_at)              as job_ids,
       array_agg(j.status order by j.created_at)          as statuses,
       array_agg(j.source order by j.created_at)          as sources,
       array_agg(j.reservation_id order by j.created_at)  as reservation_ids,
       array_agg(j.guest_name order by j.created_at)      as guests,
       count(*) filter (where j.charged_at is not null)   as already_charged
from cleaning_jobs j
where j.status <> 'cancelled'
  and coalesce(j.job_type, 'cleaning') <> 'supplies'
  and j.property_id not like 'manual_payout_%'
group by 1, 2, 3, 4
having count(*) > 1
order by j.checkout_date desc;

-- 2) Same question, one row per job, so you can see each copy in full.
with dupes as (
  select property_id, unit_id, checkout_date
  from cleaning_jobs
  where status <> 'cancelled'
    and coalesce(job_type, 'cleaning') <> 'supplies'
    and property_id not like 'manual_payout_%'
  group by 1, 2, 3
  having count(*) > 1
)
select j.checkout_date, j.property_name, j.unit_id, j.id, j.status, j.source,
       j.reservation_id, j.guest_name, j.assigned_cleaner_name,
       j.charged_at, j.payout_sent_at, j.created_at
from cleaning_jobs j
join dupes d
  on d.property_id = j.property_id
 and d.checkout_date = j.checkout_date
 and d.unit_id is not distinct from j.unit_id
where j.status <> 'cancelled'
order by j.checkout_date desc, j.property_name, j.created_at;

-- 3) The usual culprit: more than one calendar feed on a property. Two feeds
--    for the same listing produce the same stay under two reservation ids.
select property_id, property_name,
       jsonb_array_length(coalesce(ical_urls, '[]'::jsonb)) as feeds,
       jsonb_path_query_array(coalesce(ical_urls, '[]'::jsonb), '$[*].platform')  as platforms,
       jsonb_path_query_array(coalesce(ical_urls, '[]'::jsonb), '$[*].unitName')  as unit_names
from cleaning_property_configs
where jsonb_array_length(coalesce(ical_urls, '[]'::jsonb)) > 1
order by property_name;

-- 4) CLEANUP (writes — read step 2 first). Cancels the extra copies and keeps
--    the most advanced one per stay: charged > paid out > completed/in progress/
--    accepted > dispatched > oldest. Nothing charged or paid out is cancelled,
--    and cancelled jobs stay in the Cancelled tab if you need to look back.
--
-- with ranked as (
--   select id,
--          row_number() over (
--            partition by property_id, unit_id, checkout_date
--            order by (charged_at is not null) desc,
--                     (payout_sent_at is not null) desc,
--                     (status in ('completed', 'in_progress', 'accepted')) desc,
--                     (status = 'dispatched') desc,
--                     created_at asc
--          ) as rn
--   from cleaning_jobs
--   where status <> 'cancelled'
--     and coalesce(job_type, 'cleaning') <> 'supplies'
--     and property_id not like 'manual_payout_%'
-- )
-- update cleaning_jobs
--    set status = 'cancelled', updated_at = now()
--  where id in (select id from ranked where rn > 1)
--    and charged_at is null
--    and payout_sent_at is null;

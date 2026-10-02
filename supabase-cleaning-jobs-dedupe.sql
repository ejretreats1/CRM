-- Remove duplicate cleaning jobs (same property + same booking) so the unique
-- index can be created. Run in Supabase SQL Editor → New Query.
--
-- 1) Preview what is duplicated (optional):
--    select property_id, reservation_id, count(*) from cleaning_jobs
--    where reservation_id is not null group by 1, 2 having count(*) > 1;
--
-- 2) Delete the extras. For each booking we keep the most "advanced" row:
--    charged > paid out > completed/in progress/accepted > dispatched > not cancelled,
--    then the most recently updated. Nothing that was charged is ever deleted
--    in favour of an uncharged copy.
with ranked as (
  select id,
         row_number() over (
           partition by property_id, reservation_id
           order by (charged_at is not null) desc,
                    (payout_sent_at is not null) desc,
                    (status in ('completed', 'in_progress', 'accepted')) desc,
                    (status = 'dispatched') desc,
                    (status <> 'cancelled') desc,
                    updated_at desc nulls last,
                    created_at desc nulls last
         ) as rn
  from cleaning_jobs
  where reservation_id is not null
)
delete from cleaning_jobs where id in (select id from ranked where rn > 1);

-- 3) Now the index succeeds:
create unique index if not exists cleaning_jobs_property_reservation_uniq
  on public.cleaning_jobs (property_id, reservation_id)
  where reservation_id is not null;

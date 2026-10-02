-- Cleaning job lifecycle: booking reconcile + dispatch escalation.
-- Run in Supabase SQL Editor → New Query. Safe to re-run.

alter table cleaning_jobs
  add column if not exists unit_id                 text,         -- Uplisting sub-listing / iCal unit the booking belongs to
  add column if not exists same_day                boolean not null default false,
  add column if not exists dispatch_advanced_at    timestamptz,  -- when the current cleaner was offered the job
  add column if not exists escalation_notified_at  timestamptz,  -- admin was alerted about an unassigned job near checkout
  add column if not exists reschedule_count        integer not null default 0;

create index if not exists cleaning_jobs_status_checkout_idx on cleaning_jobs (status, checkout_date);

-- One job per booking. Wrapped so the rest of the migration still applies if you
-- already have duplicate jobs; the notice tells you to clean those up first.
do $$ begin
  create unique index if not exists cleaning_jobs_property_reservation_uniq
    on cleaning_jobs (property_id, reservation_id) where reservation_id is not null;
exception when others then
  raise notice 'unique index not created (%): find duplicates with
    select property_id, reservation_id, count(*) from cleaning_jobs where reservation_id is not null group by 1,2 having count(*) > 1;', sqlerrm;
end $$;

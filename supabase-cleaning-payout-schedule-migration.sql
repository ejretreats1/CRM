-- Scheduled cleaner payouts: sent automatically 2 days after the report.
-- Run in Supabase SQL Editor → New Query. Safe to re-run.

alter table cleaning_jobs
  add column if not exists payout_due_at timestamptz;

create index if not exists cleaning_jobs_payout_due_idx on cleaning_jobs (payout_due_at) where payout_sent_at is null;

-- Backfill: completed jobs that haven't been paid out yet are due 2 days after completion
-- (so anything older than 2 days is paid on the next 1pm ET run).
update cleaning_jobs
set payout_due_at = coalesce(completed_at, updated_at, now()) + interval '2 days'
where status = 'completed'
  and payout_sent_at is null
  and payout_due_at is null
  and assigned_cleaner_id is not null
  and cleaner_payout > 0;

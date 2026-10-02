-- Cleaning billing state machine (charges + payouts)
-- Run in Supabase SQL Editor → New Query. Safe to re-run.
--
-- Adds the columns the unified charge/payout code (api/_billing.ts) uses to
-- make charging atomic, retry declined cards on a schedule, and track cleaner
-- payouts that must be paid outside Stripe.

alter table cleaning_jobs
  add column if not exists charge_status          text,         -- processing | charged | failed
  add column if not exists charge_attempts        integer not null default 0,
  add column if not exists last_charge_error      text,
  add column if not exists next_charge_attempt_at timestamptz,
  add column if not exists payout_status          text,         -- processing | sent | sent_manual | manual_due | failed
  add column if not exists payout_attempts        integer not null default 0,
  add column if not exists payout_error           text,
  add column if not exists payout_method          text,         -- for sent_manual: zelle / venmo / cash / check …
  add column if not exists payout_reference       text;

-- Backfill from the existing timestamps
update cleaning_jobs set charge_status = 'charged' where charged_at is not null and charge_status is null;
update cleaning_jobs set payout_status = 'sent'    where payout_sent_at is not null and payout_status is null;

create index if not exists cleaning_jobs_charge_queue_idx
  on cleaning_jobs (status, charged_at, next_charge_attempt_at)
  where charged_at is null;

create index if not exists cleaning_jobs_payout_queue_idx
  on cleaning_jobs (payout_sent_at, charged_at)
  where payout_sent_at is null;

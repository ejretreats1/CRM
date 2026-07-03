-- Columns added for automated charge/payout cron and Stripe Connect cleaner payouts
-- Run this in your Supabase SQL editor

-- cleaning_jobs: charge + payout tracking
alter table cleaning_jobs
  add column if not exists charged_at       timestamptz,
  add column if not exists stripe_charge_id text,
  add column if not exists payout_sent_at   timestamptz,
  add column if not exists stripe_transfer_id text;

-- cleaners: Stripe Connect for automatic payouts
alter table cleaners
  add column if not exists stripe_account_id      text,
  add column if not exists stripe_connect_status  text,
  add column if not exists connect_token          text;

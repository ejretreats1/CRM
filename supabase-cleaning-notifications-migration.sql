-- Cleaning notifications: delivery tracking for cleaner texts/emails.
-- Run in Supabase SQL Editor → New Query. Safe to re-run.

alter table cleaning_jobs
  add column if not exists dispatch_email_error  text,         -- the offer email to the current cleaner failed (shown in Jobs tab)
  add column if not exists morning_sms_sent_at   timestamptz,  -- cleaner got the morning-of text
  add column if not exists receipt_sent_at       timestamptz;  -- client got the clean-complete email (also in the Stripe webhook migration)

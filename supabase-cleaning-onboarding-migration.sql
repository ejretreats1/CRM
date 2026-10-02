-- Cleaning onboarding: columns the client/cleaner onboarding flows write.
-- Run in Supabase SQL Editor → New Query. Safe to re-run.

alter table cleaning_client_onboarding
  add column if not exists completed_at  timestamptz,   -- card saved
  add column if not exists consent       jsonb;         -- what the client agreed to (fees shown, time, device)

alter table cleaner_onboarding_tokens
  add column if not exists completed_at    timestamptz,
  add column if not exists agreement_data  jsonb;

alter table cleaners
  add column if not exists agreement_signed_at    timestamptz,
  add column if not exists stripe_connect_status  text,
  add column if not exists connect_token          text,
  add column if not exists dashboard_token        text;

-- Cleaners now start as 'pending' (onboarding) and flip to 'active' automatically
-- once the agreement is signed AND Stripe payouts are connected. Existing cleaners
-- keep whatever status they have.

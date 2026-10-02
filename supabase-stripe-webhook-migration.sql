-- Stripe webhook support. Run in Supabase SQL Editor → New Query. Safe to re-run.

-- Every webhook event Stripe delivers is recorded once, so retries are no-ops.
create table if not exists stripe_events (
  id         text primary key,
  type       text not null,
  created_at timestamptz not null default now()
);
alter table stripe_events enable row level security;
-- Only the server (service role) touches this table; no browser policies.

alter table cleaning_jobs
  add column if not exists receipt_sent_at timestamptz;

alter table cleaning_property_configs
  add column if not exists card_update_requested_at timestamptz;

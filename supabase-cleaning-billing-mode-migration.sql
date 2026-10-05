-- Per-property billing mode. Run in Supabase SQL Editor → New Query. Safe to re-run.
--   stripe   (default) — charge the client's card on file after each clean
--   external           — the client pays E&J outside Stripe; the cleaner is still paid via Stripe after each report
alter table cleaning_property_configs
  add column if not exists billing_mode text not null default 'stripe';

-- New-client welcome deal: pay for 5 cleans, cleans 6 and 7 are free.
-- Run in Supabase SQL Editor → New Query. Safe to re-run.
--
-- The deal lives on the property config. Properties onboarded together share a
-- promo_group so one owner with three units still gets ONE deal (5 paid + 2 free
-- across all of them). Counting starts at promo_started_at and only counts
-- turnover cleans (not supplies / handyman / lawn care).
--
-- api/_billing.ts decides at charge time: once 5 cleans in the group have been
-- charged (or invoiced, for externally billed clients), the next 2 completed
-- cleans are marked promo_free and nothing is charged. Cleaners are still paid.

alter table cleaning_property_configs
  add column if not exists promo_type        text,                         -- 'welcome_5_2' | null (no deal)
  add column if not exists promo_paid_cleans integer not null default 5,
  add column if not exists promo_free_cleans integer not null default 2,
  add column if not exists promo_group       text,                         -- shared by properties onboarded in one batch
  add column if not exists promo_started_at  timestamptz;

alter table cleaning_jobs
  add column if not exists promo_free        boolean not null default false, -- this clean was free under the welcome deal
  add column if not exists promo_free_index  integer;                       -- 1 = first free clean, 2 = second

-- charge_status gains the value 'promo_free' (nothing charged, by design).

alter table cleaning_client_onboarding
  add column if not exists promo jsonb;                                      -- what the client was shown when they signed

create index if not exists cleaning_property_configs_promo_group_idx on cleaning_property_configs (promo_group) where promo_group is not null;
create index if not exists cleaning_jobs_promo_free_idx on cleaning_jobs (property_id) where promo_free;

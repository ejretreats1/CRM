-- Fix/create cleaning_client_onboarding table with correct column types
-- Run in Supabase SQL Editor → New Query
-- Safe to run even if the table already exists

-- Create the table fresh with correct TEXT/JSONB types.
-- If the table already exists with UUID-typed columns (id, token, property_config_id),
-- the inserts will fail because property IDs like "cpc_1234" are not UUIDs.
-- This migration recreates the table with TEXT columns so any string ID format works.
--
-- NOTE: This drops existing rows (pending onboarding links will stop working).
-- Clients who haven't completed setup will need a new link — just resend from Properties tab.

drop table if exists cleaning_client_onboarding;

create table cleaning_client_onboarding (
  id                     text primary key,
  token                  text not null unique,
  property_config_id     text,
  property_config_ids    jsonb default '[]'::jsonb,
  property_name          text not null default '',
  client_name            text,
  client_email           text not null default '',
  status                 text not null default 'pending',
  stripe_customer_id     text,
  stripe_payment_method_id text,
  onboarded_at           timestamptz,
  created_at             timestamptz not null default now(),
  expires_at             timestamptz
);

alter table cleaning_client_onboarding enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cleaning_client_onboarding' and policyname = 'anon_all'
  ) then
    execute 'create policy "anon_all" on cleaning_client_onboarding for all using (true) with check (true)';
  end if;
end $$;

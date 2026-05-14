-- Run this once in your Supabase SQL editor to add Hostaway credential columns.
-- Settings table may not be in the original schema.sql if it was created manually.

-- Create settings table if it doesn't exist yet
create table if not exists settings (
  id           text primary key,
  slack_token  text default '',
  slack_channels jsonb default '[]',
  calendar_url text default '',
  uplisting_api_key text default '',
  updated_at   timestamptz default now()
);

alter table settings enable row level security;
create policy if not exists "Allow all settings" on settings for all using (true) with check (true);

-- Add Hostaway columns (safe to run even if table already exists)
alter table settings
  add column if not exists hostaway_account_id text default '',
  add column if not exists hostaway_secret     text default '';

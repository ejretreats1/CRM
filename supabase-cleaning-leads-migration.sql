-- Run in Supabase SQL Editor

create table if not exists cleaning_leads (
  id                 text primary key,
  name               text not null default '',
  email              text not null default '',
  phone              text not null default '',
  company            text not null default '',
  category           text not null default 'Property Management',
  source             text not null default 'Other',
  multi_prop         text,
  priority           text,
  outreach_status    text not null default 'Not Contacted',
  opportunity_status text not null default 'New',
  handoff_needed     boolean,
  notes              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table cleaning_leads enable row level security;
create policy "anon_all" on cleaning_leads for all using (true) with check (true);

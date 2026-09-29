-- Client property enrollment links (cleaning CRM)
-- Run in Supabase SQL Editor → New Query
--
-- Lets you send a client a link where THEY fill in property details
-- (address, door code, iCal links, check-in/out times, laundry, notes…).
-- The cleaning fee is never shown to or collected from the client — you set
-- it on the property in the CRM after they submit.

create table if not exists cleaning_property_enrollments (
  id                  text primary key,
  token               text not null unique,
  client_name         text,
  client_email        text not null default '',
  client_phone        text,
  status              text not null default 'pending',   -- pending | submitted
  submission          jsonb,                              -- raw form the client submitted
  property_config_ids jsonb not null default '[]'::jsonb, -- cleaning_property_configs rows created on submit
  created_at          timestamptz not null default now(),
  expires_at          timestamptz,
  submitted_at        timestamptz
);

alter table cleaning_property_enrollments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'cleaning_property_enrollments' and policyname = 'anon_all'
  ) then
    execute 'create policy "anon_all" on cleaning_property_enrollments for all using (true) with check (true)';
  end if;
end $$;

-- Extra client-supplied details stored on the property config itself
alter table cleaning_property_configs
  add column if not exists client_phone text,
  add column if not exists client_notes text;

-- Run in Supabase SQL Editor
-- Adds iCal URL storage to cleaning property configs

alter table cleaning_property_configs
  add column if not exists ical_urls jsonb not null default '[]';

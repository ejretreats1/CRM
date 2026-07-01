-- Add door code, address, and default check-in/checkout times to cleaning property configs
-- Run this in your Supabase SQL editor

alter table cleaning_property_configs
  add column if not exists door_code    text,
  add column if not exists address      text,
  add column if not exists checkout_time text,
  add column if not exists checkin_time  text;

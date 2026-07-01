-- Add door code, address, default check-in/checkout times, and staging photos to cleaning property configs
-- Run this in your Supabase SQL editor

alter table cleaning_property_configs
  add column if not exists door_code          text,
  add column if not exists address            text,
  add column if not exists checkout_time      text,
  add column if not exists checkin_time       text,
  add column if not exists photo_url          text,
  add column if not exists staging_photo_urls text[] not null default '{}';

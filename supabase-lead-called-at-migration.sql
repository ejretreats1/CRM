-- Add called_at column to leads table for cold call outreach tracking
-- Run this in your Supabase SQL editor

alter table leads
  add column if not exists called_at timestamptz;

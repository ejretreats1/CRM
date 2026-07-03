-- Add share_token to rental_agreement_templates for group share links
-- Run this in your Supabase SQL editor

alter table rental_agreement_templates
  add column if not exists share_token text unique;

-- Add dashboard_token column to cleaners table for secure portal link authentication
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS dashboard_token UUID;

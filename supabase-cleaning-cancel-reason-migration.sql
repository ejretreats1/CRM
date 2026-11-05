-- Why a cleaning job was cancelled, shown on the row in the Jobs tab.
-- Run in Supabase SQL Editor → New Query. Safe to re-run.
--
-- Written by the calendar syncs ("The booking was cancelled." / "The booking no
-- longer appears in the calendar."). Until this runs, cancelling still works —
-- the sync falls back to setting the status alone — the rows just don't say why.

alter table cleaning_jobs
  add column if not exists cancel_reason text;

-- Revenue Intelligence: persist last AI analysis result
alter table settings
  add column if not exists last_intel_result jsonb,
  add column if not exists last_intel_at      timestamptz;

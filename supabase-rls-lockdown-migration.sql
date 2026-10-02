-- ─────────────────────────────────────────────────────────────────────────────
-- Lock down Row Level Security for the cleaning CRM + settings
-- Run in Supabase SQL Editor → New Query
--
-- BEFORE RUNNING, finish the two dashboard steps in SECURITY_SETUP.md:
--   1. Clerk dashboard → Integrations → Supabase: enable (adds the
--      "role": "authenticated" claim to session tokens).
--   2. Supabase dashboard → Authentication → Sign In / Providers →
--      Third-party auth → Add Clerk (your Clerk frontend API domain).
--   3. Vercel env: VITE_SUPABASE_CLERK_AUTH=true and SUPABASE_SERVICE_ROLE_KEY set,
--      then redeploy. The CRM must be able to read data with the Clerk token
--      BEFORE the anon policies below are removed.
--
-- What this does: every table below drops its "anyone with the public key can do
-- anything" policies and allows only signed-in CRM users (authenticated role).
-- Server code (API + cron) uses the service-role key, which bypasses RLS.
-- Public client/cleaner pages never touch these tables directly — they go
-- through token-checked API endpoints.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  pol record;
  tables text[] := array[
    'cleaners', 'cleaning_jobs', 'cleaning_property_configs', 'cleaning_expenses',
    'cleaning_sops', 'cleaning_leads', 'cleaning_client_onboarding',
    'cleaning_property_enrollments', 'cleaner_onboarding_tokens',
    'settings', 'email_logs'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping % (table does not exist)', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    -- drop every existing policy on the table (anon_all, "Allow all", etc.)
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format(
      'create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true)', t
    );
    raise notice 'locked down %', t;
  end loop;
end $$;

-- Helpful indexes / guards that the lockdown review called for
create unique index if not exists cleaning_jobs_property_reservation_uniq
  on public.cleaning_jobs (property_id, reservation_id)
  where reservation_id is not null;

-- Verify: should list exactly one policy ("authenticated_all") per table above
-- select tablename, policyname, roles from pg_policies where schemaname='public'
--   and tablename like 'clean%' or tablename in ('settings','email_logs') order by 1;

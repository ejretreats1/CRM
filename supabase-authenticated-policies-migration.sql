-- Give the signed-in CRM access to every table that only allowed the anon role.
--
-- The CRM now sends your Clerk login token to Supabase, so its queries run as
-- the "authenticated" role. Tables whose only policy is "to anon" (for example
-- onboarding_requests, created with an "anon all" policy) silently return
-- nothing. This adds an "authenticated_all" policy to every public table that
-- has RLS on but no policy covering authenticated users. Safe to re-run.
do $$
declare t record;
begin
  for t in
    select c.relname as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
          and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
      )
  loop
    execute format('create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true)', t.tbl);
    raise notice 'added authenticated policy on %', t.tbl;
  end loop;
end $$;

-- See the result:
select tablename, policyname, roles from pg_policies where schemaname = 'public' order by 1, 2;

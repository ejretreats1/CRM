-- Guest Marketing: drafts & scheduled campaigns
create table if not exists gm_drafts (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists gm_campaigns (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table gm_drafts    enable row level security;
alter table gm_campaigns enable row level security;

create policy "Allow all gm_drafts" on gm_drafts for all using (true) with check (true);
create policy "Allow all gm_campaigns" on gm_campaigns for all using (true) with check (true);

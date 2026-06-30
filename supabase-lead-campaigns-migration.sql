-- Lead Campaigns: outreach campaigns to pipeline leads & referral contacts
create table if not exists lead_campaigns (
  id                 text primary key,
  name               text not null default '',
  from_name          text not null default '',
  reply_to           text not null default '',
  subject            text not null default '',
  body               text not null default '',
  lead_ids           text[] not null default '{}',
  sent_lead_ids      text[] not null default '{}',
  contact_ids        text[] not null default '{}',
  sent_contact_ids   text[] not null default '{}',
  daily_limit        integer not null default 20,
  status             text not null default 'draft',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists contacts (
  id          text primary key,
  name        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  category    text not null default 'other',
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

alter table lead_campaigns enable row level security;
alter table contacts       enable row level security;

create policy "Allow all lead_campaigns" on lead_campaigns for all using (true) with check (true);
create policy "Allow all contacts" on contacts for all using (true) with check (true);

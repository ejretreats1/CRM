-- Leads
create table if not exists leads (
  id text primary key,
  name text not null,
  email text,
  phone text,
  property_address text,
  property_type text,
  bedrooms integer,
  estimated_revenue numeric,
  stage text,
  notes text,
  source text,
  created_at timestamptz,
  updated_at timestamptz
);

-- Owners
create table if not exists owners (
  id text primary key,
  name text not null,
  email text,
  phone text,
  notes text,
  source text,
  created_at timestamptz
);

-- Properties (belong to owners)
create table if not exists properties (
  id text primary key,
  owner_id text references owners(id) on delete cascade,
  address text,
  city text,
  state text,
  type text,
  bedrooms integer,
  bathrooms numeric,
  max_guests integer,
  monthly_revenue numeric,
  occupancy_rate numeric,
  platforms text[],
  status text,
  joined_at timestamptz
);

-- Outreach entries
create table if not exists outreach_entries (
  id text primary key,
  lead_id text references leads(id) on delete set null,
  owner_id text references owners(id) on delete set null,
  contact_name text,
  contact_type text,
  type text,
  subject text,
  notes text,
  date timestamptz,
  outcome text,
  follow_up_date timestamptz
);

-- VA Hub: Projects
create table if not exists projects (
  id text primary key,
  title text not null,
  description text,
  status text not null default 'pending',
  priority text not null default 'medium',
  assigned_to text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared To-Do List
create table if not exists todos (
  id text primary key,
  text text not null,
  completed boolean not null default false,
  project_id text references projects(id) on delete set null,
  priority text not null default 'medium',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (open for now, lock down after adding auth)
alter table leads enable row level security;
alter table owners enable row level security;
alter table properties enable row level security;
alter table outreach_entries enable row level security;
alter table projects enable row level security;
alter table todos enable row level security;

-- Temporary open policies (replace with auth policies once login is added)
create policy "Allow all leads" on leads for all using (true) with check (true);
create policy "Allow all owners" on owners for all using (true) with check (true);
create policy "Allow all properties" on properties for all using (true) with check (true);
create policy "Allow all outreach" on outreach_entries for all using (true) with check (true);
create policy "Allow all projects" on projects for all using (true) with check (true);
create policy "Allow all todos" on todos for all using (true) with check (true);

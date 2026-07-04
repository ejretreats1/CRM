-- Run in Supabase SQL Editor
-- Creates the cleaning_sops table and seeds two starter SOPs

create table if not exists cleaning_sops (
  id text primary key,
  title text not null default '',
  content text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cleaning_sops enable row level security;
create policy "anon_all" on cleaning_sops for all using (true) with check (true);

-- Seed SOP 1: CRM Overview
insert into cleaning_sops (id, title, content, sort_order, created_at, updated_at)
values (
  'sop_crm_overview',
  'CRM Overview — Setup & Operations',
  E'# Setting Up Cleaners\n1. Go to the Cleaners tab and click Add Cleaner\n2. Enter the cleaner''s name, email, and phone number\n3. Click Send Connect Link — this emails them a one-time secure link\n4. The cleaner clicks the link, sets a PIN, and is connected to the system\n5. They now appear as Active and can be assigned to properties and jobs\n\n# Enrolling Properties\n1. Go to the Properties tab and click Add Property\n2. Enter the property name, the client''s cleaning fee, and the cleaner payout amount\n3. Assign one or more cleaners to the property\n4. Optionally add iCal links (Airbnb, VRBO, etc.) to auto-create jobs from reservations\n5. Save — the property is now active in the system\n\n# Sending Client Onboarding Links\n1. In the Properties tab, check one or more properties\n2. Enter the client''s name and email in the batch panel that appears\n3. Click Send Email to email the onboarding link, or Copy Link to share it manually\n4. The client receives a link to review the service agreement and add their card on file\n5. Once they complete setup, the property is active for automatic billing after each clean\n\n# How the Cleaner Portal Works\n- Cleaners log in with their email + PIN at the Cleaner Portal URL\n- The portal shows all jobs dispatched to them with date, property, and payout\n- They tap Accept to confirm a job\n- After the cleaning is done, they submit a photo report through the portal\n- The report is logged in the Jobs tab and triggers the review step before charging\n\n# Dispatching Jobs\n1. Go to the Jobs tab — jobs are created manually or auto-created from iCal feeds\n2. Click Dispatch on a pending job to notify the assigned cleaner\n3. The cleaner gets an email notification and sees the job in their portal\n4. Once they accept and complete it, they submit their report\n5. You then review and trigger the charge and payout from the Jobs tab\n\n# iCal Auto-Sync\n- Add Airbnb or VRBO iCal export URLs in the property''s edit modal\n- A daily automatic sync runs at 11am UTC to pull new reservations\n- Each reservation creates a pending cleaning job on the checkout date\n- Cancellations in the iCal feed automatically cancel the corresponding job\n- You can also trigger a manual sync per property using the Sync iCal button',
  0,
  now(),
  now()
)
on conflict (id) do nothing;

-- Seed SOP 2: Transactions & Payouts
insert into cleaning_sops (id, title, content, sort_order, created_at, updated_at)
values (
  'sop_transactions',
  'Transactions & Payouts',
  E'# When the Client Gets Charged\n- Clients are charged automatically at approximately 12:00 PM ET on the guest checkout date\n- The cron job runs daily and charges all jobs with a checkout date of today\n- Charges run against the card on file added during onboarding\n- The charge amount is the cleaning fee set in the property config\n- If a charge fails, it appears in the Payments tab for manual retry\n\n# Cleaner Payouts — Fully Automated\n- Cleaner payouts are 100% automatic — no manual action needed\n- Cleaners are paid out 2.5 days (60 hours) after the client charge processes\n- This window ensures Stripe has fully settled the client payment before the transfer\n- Example: Checkout Monday → Charged Monday 12pm ET → Cleaner paid Thursday 12pm ET\n- Cleaners must have a connected Stripe account (set up during their onboarding)\n- Cleaners receive funds in their bank account within 1–2 business days after payout\n\n# Stripe Processing Window\n- Stripe holds funds for approximately 2 business days after a successful charge\n- The 2.5-day payout delay ensures funds are always available when the transfer runs\n- No manual intervention required unless a payout fails\n\n# Fee Breakdown\n- Client pays: the cleaning fee set in the property config\n- Cleaner receives: the cleaner payout amount set in the property config\n- E&J Retreats retains: the difference between the two\n- Example: $150 cleaning fee, $100 cleaner payout → $50 margin for E&J Retreats\n\n# Manual Override\n- The Jobs tab has a Charge & Payout button for manual retries or one-off corrections\n- Use this only when the automated cron missed a job or a payout failed\n- Normal operations run fully automatically — no daily action required\n\n# Failed Charges\n- Failed charges appear flagged in the Payments tab\n- Common causes: expired card, insufficient funds, bank decline\n- Contact the client to update their payment method\n- Send a new onboarding link from the Properties tab to collect a fresh card',
  1,
  now(),
  now()
)
on conflict (id) do nothing;

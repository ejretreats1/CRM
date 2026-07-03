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
  E'# When the Client Gets Charged\n- Clients are charged within 24 hours of a completed cleaning\n- A photo report must be submitted by the cleaner before any charge is processed\n- Charges run automatically against the card on file added during onboarding\n- The charge amount is the cleaning fee set in the property config\n- If a charge fails, it appears in the Payments tab for manual retry\n\n# Stripe Payout Window (2-Day Hold)\n- Stripe holds funds for 2 business days after a successful client charge\n- Cleaner payouts cannot be initiated until those funds are available\n- Example: Cleaning completed Monday → Client charged Tuesday → Funds available Thursday → Cleaner paid Thursday\n- Weekend days do not count as business days\n- Always confirm the client charge cleared before initiating payout\n\n# Initiating Cleaner Payouts\n1. Go to the Jobs tab and find the completed, charged job\n2. Confirm at least 2 business days have passed since the client was charged\n3. Click the Charge & Payout button to initiate the cleaner''s Stripe transfer\n4. The cleaner receives funds within 1–2 business days after payout is triggered\n5. The cleaner must have a connected Stripe account (set up during their onboarding)\n\n# Fee Breakdown\n- Client pays: the cleaning fee set in the property config\n- Cleaner receives: the cleaner payout amount set in the property config\n- E&J Retreats retains: the difference between the two amounts\n- Example: $150 cleaning fee, $100 cleaner payout → $50 retained by E&J Retreats\n\n# Refunds & Disputes\n- If a client disputes a charge, handle it through the Stripe dashboard directly\n- For quality issues reported within 24 hours, arrange a free re-clean or issue a credit\n- Cleaner-caused damage is covered — document with photos from the job report\n- Guest-caused damage falls under Airbnb/VRBO host guarantees, not E&J Retreats\n\n# Failed Charges\n- Failed charges appear flagged in the Payments tab\n- Common causes: expired card, insufficient funds, bank decline\n- Contact the client to update their card via a new onboarding link\n- Resend an onboarding link from the Properties tab to collect a new payment method',
  1,
  now(),
  now()
)
on conflict (id) do nothing;

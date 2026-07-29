import { supabase } from './supabase';
import type { Cleaner, CleaningPropertyConfig, CleaningJob } from '../types/cleaning';

// ── Cleaners ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCleaner(r: any): Cleaner {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? undefined,
    stripeAccountId: r.stripe_account_id ?? undefined,
    stripeConnectStatus: r.stripe_connect_status ?? undefined,
    agreementSignedAt: r.agreement_signed_at ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    dashboardToken: r.dashboard_token ?? undefined,
    skills: (r.skills ?? ['cleaning']) as Cleaner['skills'],
    payoutInfo: r.payout_info ?? undefined,
  };
}

function cleanerToRow(c: Cleaner) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? null,
    status: c.status,
    created_at: c.createdAt,
    skills: c.skills ?? ['cleaning'],
    ...(c.stripeAccountId  !== undefined && { stripe_account_id: c.stripeAccountId }),
    ...(c.dashboardToken   !== undefined && { dashboard_token: c.dashboardToken }),
    ...(c.payoutInfo       !== undefined && { payout_info: c.payoutInfo }),
  };
}

export async function fetchCleaners(): Promise<Cleaner[]> {
  const { data, error } = await supabase.from('cleaners').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCleaner);
}

export async function upsertCleaner(c: Cleaner): Promise<void> {
  const { error } = await supabase.from('cleaners').upsert(cleanerToRow(c));
  if (error) throw error;
}

export async function deleteCleaner(id: string): Promise<void> {
  const { error } = await supabase.from('cleaners').delete().eq('id', id);
  if (error) throw error;
}

// ── Property Configs ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConfig(r: any): CleaningPropertyConfig {
  return {
    id: r.id,
    propertyId: r.property_id,
    propertyName: r.property_name,
    cleaningFee: Number(r.cleaning_fee),
    assignedCleaners: r.assigned_cleaners ?? [],
    enrolledAt: r.enrolled_at,
    stripeCustomerId: r.stripe_customer_id ?? undefined,
    stripePaymentMethodId: r.stripe_payment_method_id ?? undefined,
    clientEmail: r.client_email ?? undefined,
    clientName: r.client_name ?? undefined,
    onboardedAt: r.onboarded_at ?? undefined,
    doorCode: r.door_code ?? undefined,
    address: r.address ?? undefined,
    checkoutTime: r.checkout_time ?? undefined,
    checkinTime: r.checkin_time ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    stagingPhotoUrls: r.staging_photo_urls ?? [],
    icalUrls: r.ical_urls ?? [],
    laundromatAddress: r.laundromat_address ?? undefined,
  };
}

function configToRow(c: CleaningPropertyConfig) {
  return {
    id: c.id,
    property_id: c.propertyId,
    property_name: c.propertyName,
    cleaning_fee: c.cleaningFee,
    assigned_cleaners: c.assignedCleaners,
    enrolled_at: c.enrolledAt,
    door_code: c.doorCode ?? null,
    address: c.address ?? null,
    checkout_time: c.checkoutTime ?? null,
    checkin_time: c.checkinTime ?? null,
    photo_url: c.photoUrl ?? null,
    staging_photo_urls: c.stagingPhotoUrls ?? [],
    ical_urls: c.icalUrls ?? [],
    laundromat_address: c.laundromatAddress ?? null,
  };
}

export async function fetchPropertyConfigs(): Promise<CleaningPropertyConfig[]> {
  const { data, error } = await supabase
    .from('cleaning_property_configs')
    .select('*')
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToConfig);
}

export async function upsertPropertyConfig(c: CleaningPropertyConfig): Promise<void> {
  const { error } = await supabase.from('cleaning_property_configs').upsert(configToRow(c));
  if (error) throw error;
}

export async function deletePropertyConfig(id: string): Promise<void> {
  const { error } = await supabase.from('cleaning_property_configs').delete().eq('id', id);
  if (error) throw error;
}

// ── Cleaning Jobs ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToJob(r: any): CleaningJob {
  return {
    id: r.id,
    reservationId: r.reservation_id ?? undefined,
    propertyId: r.property_id,
    propertyName: r.property_name,
    guestName: r.guest_name ?? undefined,
    checkoutDate: r.checkout_date,
    checkinDate: r.checkin_date ?? undefined,
    status: r.status,
    assignedCleanerId: r.assigned_cleaner_id ?? undefined,
    assignedCleanerName: r.assigned_cleaner_name ?? undefined,
    cleaningFee: Number(r.cleaning_fee),
    cleanerPayout: Number(r.cleaner_payout),
    dispatchedAt: r.dispatched_at ?? undefined,
    acceptedAt: r.accepted_at ?? undefined,
    completedAt: r.completed_at ?? undefined,
    chargedAt: r.charged_at ?? undefined,
    stripeChargeId: r.stripe_charge_id ?? undefined,
    payoutSentAt: r.payout_sent_at ?? undefined,
    stripeTransferId: r.stripe_transfer_id ?? undefined,
    notes: r.notes ?? undefined,
    jobType: (r.job_type ?? 'cleaning') as CleaningJob['jobType'],
    portalData: r.portal_data ?? undefined,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function jobToRow(j: CleaningJob) {
  return {
    id: j.id,
    reservation_id: j.reservationId ?? null,
    property_id: j.propertyId,
    property_name: j.propertyName,
    guest_name: j.guestName ?? null,
    checkout_date: j.checkoutDate,
    checkin_date: j.checkinDate ?? null,
    status: j.status,
    assigned_cleaner_id: j.assignedCleanerId ?? null,
    assigned_cleaner_name: j.assignedCleanerName ?? null,
    cleaning_fee: j.cleaningFee,
    cleaner_payout: j.cleanerPayout,
    dispatched_at: j.dispatchedAt ?? null,
    accepted_at: j.acceptedAt ?? null,
    completed_at: j.completedAt ?? null,
    notes: j.notes ?? null,
    job_type: j.jobType ?? 'cleaning',
    source: j.source,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  };
}

export async function fetchCleaningJobs(): Promise<CleaningJob[]> {
  const { data, error } = await supabase
    .from('cleaning_jobs')
    .select('*')
    .order('checkout_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToJob);
}

export async function upsertCleaningJob(j: CleaningJob): Promise<void> {
  const { error } = await supabase.from('cleaning_jobs').upsert(jobToRow(j));
  if (error) throw error;
}

export async function bulkUpsertCleaningJobs(jobs: CleaningJob[]): Promise<void> {
  if (!jobs.length) return;
  const { error } = await supabase.from('cleaning_jobs').upsert(jobs.map(jobToRow));
  if (error) throw error;
}

export async function deleteCleaningJobsByProperty(propertyId: string): Promise<void> {
  const { error } = await supabase.from('cleaning_jobs').delete().eq('property_id', propertyId);
  if (error) throw error;
}

export async function deleteCleaningJob(id: string): Promise<void> {
  const { error } = await supabase.from('cleaning_jobs').delete().eq('id', id);
  if (error) throw error;
}

// ─── Cleaning Leads ──────────────────────────────────────────────────────────

export const CLEANING_LEAD_CATEGORIES = [
  'Property Management',
  'Realtor / Real Estate Team',
  'Short-Term Rental',
  'Direct Booking Owner',
  'Real Estate Investor',
  'Strategic Partner',
  'Residential',
] as const;
export type CleaningLeadCategory = typeof CLEANING_LEAD_CATEGORIES[number];

export const CLEANING_LEAD_SOURCES = [
  'Scraped List',
  'Google',
  'LinkedIn',
  'Facebook Group',
  'Facebook Marketplace',
  'Website',
  'Referral',
  'Other',
] as const;
export type CleaningLeadSource = typeof CLEANING_LEAD_SOURCES[number];

export type CleaningLeadPriority = 'High' | 'Medium' | 'Low';
export type CleaningLeadMultiProp = 'Yes' | 'No' | 'Unknown';
export type CleaningLeadOutreachStatus = 'Not Contacted' | 'Contacted' | 'Follow-Up Required' | 'Responded' | 'Interested' | 'Not Interested';
export type CleaningLeadOpportunityStatus = 'New' | 'Qualified' | 'Quote Requested' | 'Booked' | 'Lost' | 'Future Opportunity';

export interface CleaningLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  category: CleaningLeadCategory;
  source: CleaningLeadSource;
  multiProp?: CleaningLeadMultiProp;
  priority?: CleaningLeadPriority;
  outreachStatus: CleaningLeadOutreachStatus;
  opportunityStatus: CleaningLeadOpportunityStatus;
  handoffNeeded?: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCleaningLead(r: any): CleaningLead {
  return {
    id:                r.id,
    name:              r.name ?? '',
    email:             r.email ?? '',
    phone:             r.phone ?? '',
    company:           r.company ?? '',
    category:          r.category ?? 'Property Management',
    source:            r.source ?? 'Other',
    multiProp:         r.multi_prop ?? undefined,
    priority:          r.priority ?? undefined,
    outreachStatus:    r.outreach_status ?? 'Not Contacted',
    opportunityStatus: r.opportunity_status ?? 'New',
    handoffNeeded:     r.handoff_needed ?? undefined,
    notes:             r.notes ?? '',
    createdAt:         r.created_at,
    updatedAt:         r.updated_at,
  };
}

export async function fetchCleaningLeads(): Promise<CleaningLead[]> {
  const PAGE = 1000;
  const all: CleaningLead[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('cleaning_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []).map(rowToCleaningLead));
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export async function upsertCleaningLead(lead: CleaningLead): Promise<void> {
  const { error } = await supabase.from('cleaning_leads').upsert({
    id:                lead.id,
    name:              lead.name,
    email:             lead.email,
    phone:             lead.phone,
    company:           lead.company,
    category:          lead.category,
    source:            lead.source,
    multi_prop:        lead.multiProp ?? null,
    priority:          lead.priority ?? null,
    outreach_status:   lead.outreachStatus,
    opportunity_status:lead.opportunityStatus,
    handoff_needed:    lead.handoffNeeded ?? null,
    notes:             lead.notes,
    created_at:        lead.createdAt,
    updated_at:        lead.updatedAt,
  });
  if (error) throw error;
}

export async function bulkUpsertCleaningLeads(leads: CleaningLead[]): Promise<void> {
  if (!leads.length) return;
  const { error } = await supabase.from('cleaning_leads').upsert(
    leads.map(lead => ({
      id:                lead.id,
      name:              lead.name,
      email:             lead.email,
      phone:             lead.phone,
      company:           lead.company,
      category:          lead.category,
      source:            lead.source,
      multi_prop:        lead.multiProp ?? null,
      priority:          lead.priority ?? null,
      outreach_status:   lead.outreachStatus,
      opportunity_status:lead.opportunityStatus,
      handoff_needed:    lead.handoffNeeded ?? null,
      notes:             lead.notes,
      created_at:        lead.createdAt,
      updated_at:        lead.updatedAt,
    }))
  );
  if (error) throw error;
}

export async function deleteCleaningLead(id: string): Promise<void> {
  const { error } = await supabase.from('cleaning_leads').delete().eq('id', id);
  if (error) throw error;
}

// ─── SOPs ─────────────────────────────────────────────────────────────────────

export interface CleaningSop {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export async function fetchCleaningSops(): Promise<CleaningSop[]> {
  const { data, error } = await supabase
    .from('cleaning_sops')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function upsertCleaningSop(sop: CleaningSop): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('cleaning_sops').upsert({
    id: sop.id,
    title: sop.title,
    content: sop.content,
    sort_order: sop.sortOrder,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteCleaningSop(id: string): Promise<void> {
  const { error } = await supabase.from('cleaning_sops').delete().eq('id', id);
  if (error) throw error;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

import type { CleaningExpense } from '../types/cleaning';

export async function fetchCleaningExpenses(): Promise<CleaningExpense[]> {
  const { data, error } = await supabase
    .from('cleaning_expenses')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id,
    date: r.date,
    amount: Number(r.amount),
    description: r.description ?? '',
    category: r.category ?? 'laundry',
    createdAt: r.created_at,
  }));
}

export async function upsertCleaningExpense(e: CleaningExpense): Promise<void> {
  const { error } = await supabase.from('cleaning_expenses').upsert({
    id: e.id,
    date: e.date,
    amount: e.amount,
    description: e.description,
    category: e.category,
    created_at: e.createdAt,
  });
  if (error) throw error;
}

export async function deleteCleaningExpense(id: string): Promise<void> {
  const { error } = await supabase.from('cleaning_expenses').delete().eq('id', id);
  if (error) throw error;
}

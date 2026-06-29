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
    status: r.status,
    createdAt: r.created_at,
  };
}

function cleanerToRow(c: Cleaner) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone ?? null,
    stripe_account_id: c.stripeAccountId ?? null,
    status: c.status,
    created_at: c.createdAt,
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
    stripe_customer_id: c.stripeCustomerId ?? null,
    stripe_payment_method_id: c.stripePaymentMethodId ?? null,
    client_email: c.clientEmail ?? null,
    client_name: c.clientName ?? null,
    onboarded_at: c.onboardedAt ?? null,
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
    notes: r.notes ?? undefined,
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

export async function deleteCleaningJob(id: string): Promise<void> {
  const { error } = await supabase.from('cleaning_jobs').delete().eq('id', id);
  if (error) throw error;
}

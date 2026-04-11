import { supabase } from './supabase';
import type { Lead, Owner, Property, OutreachEntry } from '../types';

// ─── Leads ───────────────────────────────────────────────────────────────────

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToLead);
}

export async function upsertLead(lead: Lead): Promise<void> {
  const { error } = await supabase.from('leads').upsert(leadToRow(lead));
  if (error) throw error;
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// ─── Owners ──────────────────────────────────────────────────────────────────

export async function fetchOwners(): Promise<Owner[]> {
  const { data: ownerRows, error: ownerError } = await supabase
    .from('owners')
    .select('*')
    .order('created_at', { ascending: false });
  if (ownerError) throw ownerError;

  const { data: propRows, error: propError } = await supabase
    .from('properties')
    .select('*');
  if (propError) throw propError;

  return (ownerRows ?? []).map(o => ({
    id: o.id,
    name: o.name,
    email: o.email ?? '',
    phone: o.phone ?? '',
    notes: o.notes ?? '',
    source: o.source,
    createdAt: o.created_at,
    properties: (propRows ?? [])
      .filter(p => p.owner_id === o.id)
      .map(rowToProperty),
  }));
}

export async function upsertOwner(owner: Owner): Promise<void> {
  const { error } = await supabase.from('owners').upsert({
    id: owner.id,
    name: owner.name,
    email: owner.email,
    phone: owner.phone,
    notes: owner.notes,
    source: owner.source,
    created_at: owner.createdAt,
  });
  if (error) throw error;
}

export async function deleteOwner(id: string): Promise<void> {
  const { error } = await supabase.from('owners').delete().eq('id', id);
  if (error) throw error;
}

// ─── Properties ──────────────────────────────────────────────────────────────

export async function upsertProperty(ownerId: string, property: Property): Promise<void> {
  const { error } = await supabase.from('properties').upsert(propertyToRow(ownerId, property));
  if (error) throw error;
}

export async function deleteProperty(propertyId: string): Promise<void> {
  const { error } = await supabase.from('properties').delete().eq('id', propertyId);
  if (error) throw error;
}

// ─── Outreach ─────────────────────────────────────────────────────────────────

export async function fetchOutreach(): Promise<OutreachEntry[]> {
  const { data, error } = await supabase.from('outreach_entries').select('*').order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToOutreach);
}

export async function upsertOutreach(entry: OutreachEntry): Promise<void> {
  const { error } = await supabase.from('outreach_entries').upsert(outreachToRow(entry));
  if (error) throw error;
}

export async function deleteOutreach(id: string): Promise<void> {
  const { error } = await supabase.from('outreach_entries').delete().eq('id', id);
  if (error) throw error;
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLead(r: any): Lead {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? '',
    phone: r.phone ?? '',
    propertyAddress: r.property_address ?? '',
    propertyType: r.property_type ?? '',
    bedrooms: r.bedrooms ?? 0,
    estimatedRevenue: r.estimated_revenue ?? 0,
    stage: r.stage,
    notes: r.notes ?? '',
    source: r.source,
    scheduledCallAt: r.scheduled_call_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function leadToRow(l: Lead) {
  return {
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    property_address: l.propertyAddress,
    property_type: l.propertyType,
    bedrooms: l.bedrooms,
    estimated_revenue: l.estimatedRevenue,
    stage: l.stage,
    notes: l.notes,
    source: l.source,
    scheduled_call_at: l.scheduledCallAt ?? null,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProperty(r: any): Property {
  return {
    id: r.id,
    address: r.address ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    type: r.type ?? '',
    bedrooms: r.bedrooms ?? 0,
    bathrooms: r.bathrooms ?? 0,
    maxGuests: r.max_guests ?? 0,
    monthlyRevenue: r.monthly_revenue ?? 0,
    occupancyRate: r.occupancy_rate ?? 0,
    platforms: r.platforms ?? [],
    status: r.status,
    joinedAt: r.joined_at,
  };
}

function propertyToRow(ownerId: string, p: Property) {
  return {
    id: p.id,
    owner_id: ownerId,
    address: p.address,
    city: p.city,
    state: p.state,
    type: p.type,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    max_guests: p.maxGuests,
    monthly_revenue: p.monthlyRevenue,
    occupancy_rate: p.occupancyRate,
    platforms: p.platforms,
    status: p.status,
    joined_at: p.joinedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOutreach(r: any): OutreachEntry {
  return {
    id: r.id,
    leadId: r.lead_id ?? undefined,
    ownerId: r.owner_id ?? undefined,
    contactName: r.contact_name ?? '',
    contactType: r.contact_type,
    type: r.type,
    subject: r.subject ?? '',
    notes: r.notes ?? '',
    date: r.date,
    outcome: r.outcome,
    followUpDate: r.follow_up_date ?? undefined,
  };
}

function outreachToRow(e: OutreachEntry) {
  return {
    id: e.id,
    lead_id: e.leadId ?? null,
    owner_id: e.ownerId ?? null,
    contact_name: e.contactName,
    contact_type: e.contactType,
    type: e.type,
    subject: e.subject,
    notes: e.notes,
    date: e.date,
    outcome: e.outcome,
    follow_up_date: e.followUpDate ?? null,
  };
}

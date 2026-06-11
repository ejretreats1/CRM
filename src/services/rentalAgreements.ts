import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON);
}

export type FieldType = 'signature' | 'text' | 'date' | 'initials' | 'credit_card';

export interface AgreementField {
  id: string;
  type: FieldType;
  label: string;
  page: number;   // 0-indexed
  x: number;     // 0-1 (fraction of page width from left)
  y: number;     // 0-1 (fraction of page height from top)
  w: number;     // 0-1 (fraction of page width)
  h: number;     // 0-1 (fraction of page height)
  required?: boolean;
}

export interface AgreementTemplate {
  id: string;
  propertyId: string;
  ownerId: string;
  name: string;
  category: string;
  documentUrl: string;
  fields: AgreementField[];
  createdAt: string;
}

export interface AgreementSubmission {
  id: string;
  templateId: string;
  propertyId: string;
  ownerId: string;
  guestName: string;
  guestEmail: string;
  status: 'pending' | 'completed' | 'expired';
  token: string;
  fieldValues?: Record<string, string>;
  completedAt?: string;
  filledDocumentUrl?: string;
  sentAt: string;
  expiresAt: string;
}

function rowToTemplate(r: Record<string, unknown>): AgreementTemplate {
  return {
    id:          String(r.id),
    propertyId:  String(r.property_id ?? 'global'),
    ownerId:     String(r.owner_id),
    name:        String(r.name),
    category:    String(r.category ?? 'Rental Agreement'),
    documentUrl: String(r.document_url),
    fields:      (r.fields as AgreementField[]) ?? [],
    createdAt:   String(r.created_at),
  };
}

function rowToSubmission(r: Record<string, unknown>): AgreementSubmission {
  return {
    id:                String(r.id),
    templateId:        String(r.template_id),
    propertyId:        String(r.property_id),
    ownerId:           String(r.owner_id),
    guestName:         String(r.guest_name),
    guestEmail:        String(r.guest_email),
    status:            (r.status as AgreementSubmission['status']) ?? 'pending',
    token:             String(r.token),
    fieldValues:       (r.field_values as Record<string, string>) ?? undefined,
    completedAt:       r.completed_at ? String(r.completed_at) : undefined,
    filledDocumentUrl: r.filled_document_url ? String(r.filled_document_url) : undefined,
    sentAt:            String(r.sent_at ?? r.created_at),
    expiresAt:         String(r.expires_at),
  };
}

export async function fetchTemplates(propertyId: string): Promise<AgreementTemplate[]> {
  const { data, error } = await sb()
    .from('rental_agreement_templates')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTemplate);
}

export async function saveTemplate(t: Omit<AgreementTemplate, 'createdAt'>): Promise<AgreementTemplate> {
  const row = {
    id:           t.id,
    property_id:  t.propertyId,
    owner_id:     t.ownerId,
    name:         t.name,
    category:     t.category,
    document_url: t.documentUrl,
    fields:       t.fields,
  };
  const { data, error } = await sb()
    .from('rental_agreement_templates')
    .upsert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTemplate(data as Record<string, unknown>);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await sb().from('rental_agreement_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchSubmissions(templateId: string): Promise<AgreementSubmission[]> {
  const { data, error } = await sb()
    .from('rental_agreement_submissions')
    .select('*')
    .eq('template_id', templateId)
    .order('sent_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSubmission);
}

export async function fetchSubmissionByToken(token: string): Promise<{ submission: AgreementSubmission; template: AgreementTemplate } | null> {
  const { data: sub, error: se } = await sb()
    .from('rental_agreement_submissions')
    .select('*')
    .eq('token', token)
    .single();
  if (se || !sub) return null;

  const { data: tmpl, error: te } = await sb()
    .from('rental_agreement_templates')
    .select('*')
    .eq('id', sub.template_id)
    .single();
  if (te || !tmpl) return null;

  return {
    submission: rowToSubmission(sub as Record<string, unknown>),
    template:   rowToTemplate(tmpl as Record<string, unknown>),
  };
}

export async function fetchAllTemplates(): Promise<AgreementTemplate[]> {
  const { data, error } = await sb()
    .from('rental_agreement_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTemplate);
}

export async function fetchAllSubmissions(): Promise<AgreementSubmission[]> {
  const { data, error } = await sb()
    .from('rental_agreement_submissions')
    .select('*')
    .order('sent_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToSubmission);
}

export async function uploadAgreementPdf(file: File, propertyId: string): Promise<string> {
  const supabase = sb();
  const path = `agreements/${propertyId}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage
    .from('documents')
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
  return publicUrl;
}

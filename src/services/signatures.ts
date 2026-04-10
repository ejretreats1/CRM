import { supabase } from './supabase';
import type { SignatureRequest } from '../types';

export async function fetchSignatureRequests(ownerId: string): Promise<SignatureRequest[]> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select('*')
    .eq('owner_id', ownerId)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToSignatureRequest);
}

export async function fetchSignatureRequestByToken(token: string): Promise<SignatureRequest | null> {
  const { data, error } = await supabase
    .from('signature_requests')
    .select('*')
    .eq('token', token)
    .single();
  if (error) return null;
  return rowToSignatureRequest(data);
}

export async function uploadDocument(
  ownerId: string,
  file: File
): Promise<string> {
  const path = `originals/${ownerId}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from('documents').upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('documents').getPublicUrl(path);
  return data.publicUrl;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSignatureRequest(r: any): SignatureRequest {
  return {
    id: r.id,
    ownerId: r.owner_id,
    documentName: r.document_name,
    documentUrl: r.document_url,
    signedDocumentUrl: r.signed_document_url ?? undefined,
    status: r.status,
    token: r.token,
    sentToEmail: r.sent_to_email,
    sentAt: r.sent_at,
    signedAt: r.signed_at ?? undefined,
    expiresAt: r.expires_at,
    sigX: r.sig_x ?? undefined,
    sigY: r.sig_y ?? undefined,
    dateX: r.date_x ?? undefined,
    dateY: r.date_y ?? undefined,
  };
}

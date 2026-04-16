import { supabase } from './supabase';

export interface LeadDocument {
  id: string;
  leadId: string;
  name: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  uploadedAt: string;
}

export async function fetchLeadDocuments(leadId: string): Promise<LeadDocument[]> {
  const { data, error } = await supabase
    .from('lead_documents')
    .select('*')
    .eq('lead_id', leadId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDoc);
}

export async function uploadLeadDocument(leadId: string, file: File): Promise<LeadDocument> {
  const path = `leads/${leadId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

  const id = `ldoc_${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('lead_documents')
    .insert({
      id,
      lead_id: leadId,
      name: file.name,
      file_url: urlData.publicUrl,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      storage_path: path,
      uploaded_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToDoc(data);
}

export async function deleteLeadDocument(doc: LeadDocument): Promise<void> {
  if (doc.storagePath) {
    await supabase.storage.from('documents').remove([doc.storagePath]);
  }
  await supabase.from('lead_documents').delete().eq('id', doc.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDoc(r: any): LeadDocument {
  return {
    id: r.id,
    leadId: r.lead_id,
    name: r.name,
    fileUrl: r.file_url,
    fileType: r.file_type ?? '',
    fileSize: r.file_size ?? 0,
    storagePath: r.storage_path ?? '',
    uploadedAt: r.uploaded_at,
  };
}

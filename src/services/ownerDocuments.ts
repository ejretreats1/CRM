import { supabase } from './supabase';

export interface OwnerDocument {
  id: string;
  ownerId: string;
  name: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  uploadedAt: string;
}

export async function fetchOwnerDocuments(ownerId: string): Promise<OwnerDocument[]> {
  const { data, error } = await supabase
    .from('owner_documents')
    .select('*')
    .eq('owner_id', ownerId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDoc);
}

export async function uploadOwnerDocument(ownerId: string, file: File): Promise<OwnerDocument> {
  const path = `manual/${ownerId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

  const id = `doc_${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('owner_documents')
    .insert({
      id,
      owner_id: ownerId,
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

export async function deleteOwnerDocument(doc: OwnerDocument): Promise<void> {
  if (doc.storagePath) {
    await supabase.storage.from('documents').remove([doc.storagePath]);
  }
  await supabase.from('owner_documents').delete().eq('id', doc.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDoc(r: any): OwnerDocument {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    fileUrl: r.file_url,
    fileType: r.file_type ?? '',
    fileSize: r.file_size ?? 0,
    storagePath: r.storage_path ?? '',
    uploadedAt: r.uploaded_at,
  };
}

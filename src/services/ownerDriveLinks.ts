import { supabase } from './supabase';

export interface OwnerDriveLink {
  id: string;
  ownerId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  webViewLink: string;
  createdAt: string;
}

export async function fetchOwnerDriveLinks(ownerId: string): Promise<OwnerDriveLink[]> {
  const { data, error } = await supabase
    .from('owner_drive_links')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToLink);
}

export async function saveOwnerDriveLink(link: Omit<OwnerDriveLink, 'createdAt'>): Promise<OwnerDriveLink> {
  const { data, error } = await supabase
    .from('owner_drive_links')
    .insert({
      id: link.id,
      owner_id: link.ownerId,
      file_id: link.fileId,
      file_name: link.fileName,
      mime_type: link.mimeType,
      web_view_link: link.webViewLink,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToLink(data);
}

export async function deleteOwnerDriveLink(id: string): Promise<void> {
  await supabase.from('owner_drive_links').delete().eq('id', id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLink(r: any): OwnerDriveLink {
  return {
    id: r.id,
    ownerId: r.owner_id,
    fileId: r.file_id,
    fileName: r.file_name,
    mimeType: r.mime_type ?? '',
    webViewLink: r.web_view_link ?? '',
    createdAt: r.created_at,
  };
}

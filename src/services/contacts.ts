import { createClient } from '@supabase/supabase-js';
import type { Contact, ContactCategory } from '../types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToContact(r: any): Contact {
  return {
    id:        r.id,
    name:      r.name ?? '',
    email:     r.email ?? '',
    phone:     r.phone ?? '',
    category:  (r.category as ContactCategory) ?? 'other',
    notes:     r.notes ?? '',
    createdAt: r.created_at ?? '',
  };
}

export async function fetchContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToContact);
}

export async function upsertContact(c: Contact): Promise<void> {
  const { error } = await supabase.from('contacts').upsert({
    id:         c.id,
    name:       c.name,
    email:      c.email,
    phone:      c.phone,
    category:   c.category,
    notes:      c.notes,
    created_at: c.createdAt,
  });
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

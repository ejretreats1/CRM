import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export interface WarmupEntry {
  id: string;
  email: string;
  name: string;
  startDate: string;
  status: 'warming' | 'ready' | 'paused';
  seedEmails: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(r: any): WarmupEntry {
  return {
    id:         r.id,
    email:      r.email ?? '',
    name:       r.name ?? '',
    startDate:  r.start_date ?? '',
    status:     (r.status as WarmupEntry['status']) ?? 'warming',
    seedEmails: Array.isArray(r.seed_emails) ? r.seed_emails as string[] : [],
  };
}

export async function fetchWarmupEntries(): Promise<WarmupEntry[]> {
  const { data, error } = await supabase
    .from('warmup_addresses')
    .select('*')
    .order('start_date');
  if (error) throw error;
  return (data ?? []).map(rowToEntry);
}

export async function upsertWarmupEntry(e: WarmupEntry): Promise<void> {
  const { error } = await supabase.from('warmup_addresses').upsert({
    id:          e.id,
    email:       e.email,
    name:        e.name,
    start_date:  e.startDate,
    status:      e.status,
    seed_emails: e.seedEmails ?? [],
  });
  if (error) throw error;
}

export async function deleteWarmupEntry(id: string): Promise<void> {
  const { error } = await supabase.from('warmup_addresses').delete().eq('id', id);
  if (error) throw error;
}

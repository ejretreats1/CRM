import { supabase } from './supabase';

export async function cacheGet<T>(key: string): Promise<T | null> {
  const { data } = await supabase.from('app_cache').select('value').eq('key', key).single();
  return data ? (data.value as T) : null;
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  await supabase.from('app_cache').upsert({ key, value, updated_at: new Date().toISOString() });
}

export async function cacheRemove(key: string): Promise<void> {
  await supabase.from('app_cache').delete().eq('key', key);
}

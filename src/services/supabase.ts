import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    `Missing Supabase env vars. VITE_SUPABASE_URL: ${supabaseUrl ? 'set' : 'MISSING'}, VITE_SUPABASE_ANON_KEY: ${supabaseAnonKey ? 'set' : 'MISSING'}`
  );
}

// When VITE_SUPABASE_CLERK_AUTH=true, every query carries the admin's Clerk
// session token so RLS policies for the `authenticated` role apply (see
// SECURITY_SETUP.md: Clerk must be added as a third-party auth provider in
// Supabase first). Public pages have no session and fall back to the anon key.
const useClerkAuth = String(import.meta.env.VITE_SUPABASE_CLERK_AUTH ?? '').toLowerCase() === 'true';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, useClerkAuth ? {
  accessToken: async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerk = (window as any).Clerk;
    try { return (await clerk?.session?.getToken()) ?? null; } catch { return null; }
  },
} : undefined);

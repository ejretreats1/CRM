import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Accepts a POST from Zapier with lead fields directly in the body.
// Zapier maps the Facebook Lead Ads fields and sends them here.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body ?? {};

  const firstName = body.first_name ?? body.name?.split(' ')[0] ?? '';
  const lastName  = body.last_name  ?? body.name?.split(' ').slice(1).join(' ') ?? '';
  const name      = body.full_name ?? body.name ?? `${firstName} ${lastName}`.trim() || 'Unknown';
  const email     = body.email ?? body.email_address ?? '';
  const phone     = body.phone ?? body.phone_number ?? '';
  const address   = body.street_address ?? body.property_address ?? body.address ?? '';

  const now = new Date().toISOString();

  const { error } = await supabase.from('leads').insert({
    id: randomUUID(),
    name,
    email,
    phone,
    property_address: address,
    property_type: '',
    bedrooms: 0,
    estimated_revenue: 0,
    stage: 'new',
    notes: '',
    source: 'facebook_outreach',
    created_at: now,
    updated_at: now,
  });

  if (error) {
    console.error('facebook-lead-zapier insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}

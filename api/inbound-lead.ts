import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — allow any origin so website forms can POST from any domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const apiKey = process.env.INBOUND_LEAD_API_KEY;
  const authHeader = req.headers['authorization'] ?? '';
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { first_name, last_name, email, phone, property_address, message } = req.body ?? {};

  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'first_name, last_name, and email are required' });
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const { error } = await supabase.from('leads').insert({
    id,
    name: `${first_name.trim()} ${last_name.trim()}`,
    email: email.trim(),
    phone: phone?.trim() ?? '',
    property_address: property_address?.trim() ?? '',
    property_type: '',
    bedrooms: 0,
    estimated_revenue: 0,
    stage: 'new',
    notes: message?.trim() ?? '',
    source: 'website',
    created_at: now,
    updated_at: now,
  });

  if (error) {
    console.error('inbound-lead insert error:', error);
    return res.status(500).json({ error: 'Failed to create lead' });
  }

  return res.status(201).json({ success: true, id });
}

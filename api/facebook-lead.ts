import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function insertLead(fields: {
  name: string;
  email: string;
  phone: string;
  address: string;
  estimatedRevenue: number;
}) {
  const now = new Date().toISOString();
  return supabase.from('leads').insert({
    id: randomUUID(),
    name: fields.name || 'Unknown',
    email: fields.email,
    phone: fields.phone,
    property_address: fields.address,
    property_type: '',
    bedrooms: 0,
    estimated_revenue: fields.estimatedRevenue,
    stage: 'new',
    notes: '',
    source: 'meta_ads',
    created_at: now,
    updated_at: now,
  }).select('id, name');
}

function parseRevenue(raw: string | number | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Facebook webhook verification handshake
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body ?? {};

  // Zapier format: fields sent directly in body
  if (body.object !== 'page') {
    const name    = body.full_name ?? body.name ?? `${body.first_name ?? ''} ${body.last_name ?? ''}`.trim();
    const email   = body.email ?? body.email_address ?? '';
    const phone   = body.phone ?? body.phone_number ?? '';
    const street  = body.street_address ?? body.property_address ?? body.address ?? '';
    const state   = body.state ?? '';
    const address = [street, state].filter(Boolean).join(', ');
    const estimatedRevenue = parseRevenue(body.estimated_revenue);

    console.log('facebook-lead incoming:', { name, email, phone, address, estimatedRevenue });
    const { data, error } = await insertLead({ name, email, phone, address, estimatedRevenue });
    if (error) {
      console.error('facebook-lead zapier insert error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }
    console.log('facebook-lead inserted:', data);
    return res.status(200).json({ ok: true, inserted: data?.[0] ?? null });
  }

  // Meta webhook format: fetch lead details from Graph API
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;

      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
        );
        const lead = await fbRes.json();
        if (!fbRes.ok || lead.error) {
          console.error('Facebook lead fetch error:', lead.error);
          continue;
        }

        const fields: Record<string, string> = {};
        for (const field of lead.field_data ?? []) {
          fields[field.name] = field.values?.[0] ?? '';
        }

        const firstName = fields['first_name'] ?? fields['full_name']?.split(' ')[0] ?? '';
        const lastName  = fields['last_name']  ?? fields['full_name']?.split(' ').slice(1).join(' ') ?? '';
        const name      = fields['full_name'] ?? `${firstName} ${lastName}`.trim();
        const email     = fields['email'] ?? fields['email_address'] ?? '';
        const phone     = fields['phone_number'] ?? fields['phone'] ?? '';
        const street    = fields['street_address'] ?? fields['property_address'] ?? '';
        const state     = fields['state'] ?? '';
        const address   = [street, state].filter(Boolean).join(', ');
        const estimatedRevenue = parseRevenue(fields['estimated_revenue'] ?? fields['last_12_months_revenue'] ?? fields['annual_revenue']);

        await insertLead({ name, email, phone, address, estimatedRevenue });
      } catch (err) {
        console.error('facebook-lead handler error:', err);
      }
    }
  }

  return res.status(200).end();
}

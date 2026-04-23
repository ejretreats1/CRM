import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Webhook verification handshake (Meta sends a GET to confirm the endpoint)
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

  const body = req.body;
  if (body.object !== 'page') return res.status(200).end();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;

      try {
        // Fetch lead details from Facebook Graph API
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`
        );
        const lead = await fbRes.json();
        if (!fbRes.ok || lead.error) {
          console.error('Facebook lead fetch error:', lead.error);
          continue;
        }

        // Parse the field_data array into a flat object
        const fields: Record<string, string> = {};
        for (const field of lead.field_data ?? []) {
          fields[field.name] = field.values?.[0] ?? '';
        }

        const firstName = fields['first_name'] ?? fields['full_name']?.split(' ')[0] ?? '';
        const lastName  = fields['last_name']  ?? fields['full_name']?.split(' ').slice(1).join(' ') ?? '';
        const name      = `${firstName} ${lastName}`.trim() || fields['full_name'] || 'Unknown';
        const email     = fields['email'] ?? fields['email_address'] ?? '';
        const phone     = fields['phone_number'] ?? fields['phone'] ?? '';
        const address   = fields['street_address'] ?? fields['property_address'] ?? '';
        const notes     = Object.entries(fields)
          .filter(([k]) => !['first_name','last_name','full_name','email','email_address','phone_number','phone','street_address','property_address'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');

        const now = new Date().toISOString();
        await supabase.from('leads').insert({
          id: randomUUID(),
          name,
          email,
          phone,
          property_address: address,
          property_type: '',
          bedrooms: 0,
          estimated_revenue: 0,
          stage: 'new',
          notes: notes || '',
          source: 'facebook_outreach',
          created_at: now,
          updated_at: now,
        });
      } catch (err) {
        console.error('facebook-lead handler error:', err);
      }
    }
  }

  // Always respond 200 quickly so Meta doesn't retry
  return res.status(200).end();
}

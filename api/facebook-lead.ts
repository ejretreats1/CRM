import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';

// Disable Vercel's body parser so we get the raw bytes for HMAC signature verification
export const config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// v19.0 was deprecated May 21 2026 — use v22.0+
const GRAPH_VERSION = 'v22.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyMetaSignature(rawBody: Buffer, signatureHeader: string, appSecret: string): boolean {
  if (!signatureHeader.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.slice(7); // strip 'sha256='
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

function parseRevenue(raw: string | number | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

// Map Meta field_data array → flat key/value object
function fieldDataToMap(fieldData: Array<{ name: string; values: string[] }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldData ?? []) out[f.name] = f.values?.[0] ?? '';
  return out;
}

// Extract a normalised contact from any Meta field map or flat body
function extractContact(f: Record<string, string>) {
  const firstName = f['first_name'] ?? '';
  const lastName  = f['last_name']  ?? '';
  const name      = f['full_name']  ?? `${firstName} ${lastName}`.trim();
  const email     = f['email']      ?? f['email_address'] ?? '';
  const phone     = f['phone_number'] ?? f['phone'] ?? '';

  const street    = f['street_address'] ?? f['property_address'] ?? f['address'] ?? '';
  const city      = f['city']      ?? '';
  const state     = f['state']     ?? f['province'] ?? '';
  const zip       = f['zip_code']  ?? f['postal_code'] ?? '';
  const address   = [street, city, state, zip].filter(Boolean).join(', ');

  const estimatedRevenue = parseRevenue(
    f['estimated_revenue']      ??
    f['last_12_months_revenue'] ??
    f['annual_revenue']         ??
    f['revenue']
  );

  return { name, email, phone, address, estimatedRevenue };
}

type Contact = ReturnType<typeof extractContact>;

async function insertLead(
  contact: Contact,
  meta?: { leadgenId?: string; formId?: string },
): Promise<{ inserted?: { id: string; name: string }; duplicate?: boolean; error?: string }> {
  // Dedup: skip if same email already came in within the last 24 h (Meta retries on timeout)
  if (contact.email) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('email', contact.email)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (existing?.length) return { duplicate: true };
  }

  const noteParts = [
    meta?.formId    ? `Meta Form ID: ${meta.formId}`    : '',
    meta?.leadgenId ? `Meta Lead ID: ${meta.leadgenId}` : '',
  ].filter(Boolean);

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('leads').insert({
    id:                randomUUID(),
    name:              contact.name || 'Unknown',
    email:             contact.email,
    phone:             contact.phone,
    property_address:  contact.address,
    property_type:     '',
    bedrooms:          0,
    estimated_revenue: contact.estimatedRevenue,
    stage:             'new',
    notes:             noteParts.join('\n'),
    source:            'meta_ads',
    created_at:        now,
    updated_at:        now,
  }).select('id, name');

  if (error) return { error: error.message };
  return { inserted: data?.[0] as { id: string; name: string } };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── GET: Meta webhook verification handshake ──────────────────────────────
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>;
    if (mode === 'subscribe' && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
      console.log('[facebook-lead] webhook handshake verified');
      return res.status(200).send(challenge);
    }
    console.error('[facebook-lead] webhook verification failed — check FACEBOOK_WEBHOOK_VERIFY_TOKEN');
    return res.status(403).json({ error: 'verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  // Read the raw body before parsing (needed for HMAC check)
  const rawBody = await readRawBody(req);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'invalid JSON' });
  }

  // ── Zapier / direct POST (no Meta envelope) ───────────────────────────────
  // Zapier sends lead fields directly in the body without an "object" field
  if ((body as { object?: string }).object !== 'page') {
    const flat = body as Record<string, string>;
    const fields: Record<string, string> = {
      full_name:         flat.full_name ?? flat.name ?? `${flat.first_name ?? ''} ${flat.last_name ?? ''}`.trim(),
      email:             flat.email ?? flat.email_address ?? '',
      phone_number:      flat.phone ?? flat.phone_number ?? '',
      street_address:    flat.street_address ?? flat.property_address ?? flat.address ?? '',
      city:              flat.city ?? '',
      state:             flat.state ?? '',
      zip_code:          flat.zip_code ?? flat.postal_code ?? '',
      estimated_revenue: flat.estimated_revenue ?? flat.annual_revenue ?? '',
    };
    const contact = extractContact(fields);
    console.log('[facebook-lead] zapier/direct POST:', contact);

    const result = await insertLead(contact);
    if (result.duplicate)  return res.status(200).json({ ok: true, duplicate: true });
    if (result.error)      { console.error('[facebook-lead] insert error:', result.error); return res.status(500).json({ ok: false, error: result.error }); }
    return res.status(200).json({ ok: true, inserted: result.inserted });
  }

  // ── Native Meta webhook ───────────────────────────────────────────────────

  // Verify HMAC signature if app secret is configured (highly recommended)
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (appSecret) {
    const sig = String(req.headers['x-hub-signature-256'] ?? '');
    if (!sig || !verifyMetaSignature(rawBody, sig, appSecret)) {
      console.error('[facebook-lead] HMAC signature mismatch — possible spoofed request');
      return res.status(403).json({ error: 'invalid signature' });
    }
  }

  const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageToken) {
    console.error('[facebook-lead] FACEBOOK_PAGE_ACCESS_TOKEN env var is not set');
    return res.status(500).json({ error: 'server misconfigured: missing page token' });
  }

  type MetaEntry = { changes?: Array<{ field: string; value: { leadgen_id?: string; form_id?: string } }> };
  const entries = (body as { entry?: MetaEntry[] }).entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;

      const leadgenId = change.value?.leadgen_id;
      const formId    = change.value?.form_id;
      if (!leadgenId) continue;

      try {
        // Fetch full lead data from Meta Graph API
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=field_data,created_time,ad_id,form_id&access_token=${pageToken}`;
        const fbRes = await fetch(url);
        const lead  = await fbRes.json() as {
          field_data?: Array<{ name: string; values: string[] }>;
          error?: { message: string; code: number; error_subcode?: number };
        };

        if (!fbRes.ok || lead.error) {
          console.error(`[facebook-lead] Graph API error for lead ${leadgenId}:`, lead.error);
          // Don't return 500 — Meta will retry endlessly; just log and continue
          continue;
        }

        const fields  = fieldDataToMap(lead.field_data ?? []);
        const contact = extractContact(fields);
        console.log(`[facebook-lead] received lead ${leadgenId}:`, contact);

        const result = await insertLead(contact, { leadgenId, formId });
        if (result.duplicate) console.log(`[facebook-lead] duplicate skipped: ${leadgenId}`);
        else if (result.error) console.error(`[facebook-lead] DB insert failed for ${leadgenId}:`, result.error);
        else console.log(`[facebook-lead] inserted: ${leadgenId}`, result.inserted);

      } catch (err) {
        console.error(`[facebook-lead] unexpected error for lead ${leadgenId}:`, err);
      }
    }
  }

  // Always return 200 to Meta — non-200 causes aggressive retries
  return res.status(200).end();
}

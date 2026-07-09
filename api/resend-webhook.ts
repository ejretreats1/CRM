import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

export const config = { maxDuration: 15 };

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

function verifySignature(req: VercelRequest): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // skip verification if not configured

  const svixId        = req.headers['svix-id']        as string;
  const svixTimestamp = req.headers['svix-timestamp']  as string;
  const svixSignature = req.headers['svix-signature']  as string;

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const toSign  = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key     = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(toSign).digest('base64');
  const signatures = svixSignature.split(' ').map(s => s.split(',').pop());
  return signatures.includes(expected);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!verifySignature(req)) return res.status(401).json({ error: 'Invalid signature' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = req.body as { type: string; data: Record<string, any> };
  const { type, data } = event;
  if (!data) return res.status(200).end();

  const emailId = data.email_id as string | undefined;
  if (!emailId) return res.status(200).end();

  const sb  = getSupabase();
  const now = new Date().toISOString();

  if (type === 'email.delivered') {
    await sb.from('email_logs')
      .update({ delivered_at: data.created_at ?? now, status: 'delivered' })
      .eq('id', emailId)
      .in('status', ['sent']); // don't downgrade if already opened/clicked
  }

  else if (type === 'email.opened') {
    const { data: existing } = await sb.from('email_logs').select('open_count,opened_at').eq('id', emailId).maybeSingle();
    const newCount = (existing?.open_count ?? 0) + 1;
    await sb.from('email_logs').update({
      opened_at:  existing?.opened_at ?? now,
      open_count: newCount,
      status:     'opened',
    }).eq('id', emailId);
  }

  else if (type === 'email.clicked') {
    const { data: existing } = await sb.from('email_logs').select('click_count,clicked_at').eq('id', emailId).maybeSingle();
    const newCount = (existing?.click_count ?? 0) + 1;
    await sb.from('email_logs').update({
      clicked_at:       existing?.clicked_at ?? now,
      click_count:      newCount,
      last_clicked_url: (data.click?.link ?? data.url ?? null) as string | null,
      status:           'clicked',
    }).eq('id', emailId);
  }

  else if (type === 'email.bounced') {
    await sb.from('email_logs').update({ bounced_at: now, status: 'bounced' }).eq('id', emailId);
  }

  else if (type === 'email.complained') {
    await sb.from('email_logs').update({ status: 'complained' }).eq('id', emailId);
  }

  // Inbound reply — Resend fires `email.received` when an inbound email arrives
  else if (type === 'email.received') {
    // data.from = sender email, data.subject = subject, data.to = recipient
    const fromEmail  = (data.from   as string) ?? '';
    const toEmail    = (data.to     as string[] | string) ?? '';
    const subject    = (data.subject as string) ?? '';
    const text       = (data.text   as string) ?? '';
    const toAddr     = Array.isArray(toEmail) ? toEmail[0] : toEmail;

    // Try to find the original outreach email by recipient
    const { data: origLogs } = await sb
      .from('email_logs')
      .select('id,subject')
      .eq('recipient_email', fromEmail)
      .in('email_type', ['outreach', 'lead-sequence'])
      .order('sent_at', { ascending: false })
      .limit(1);

    await sb.from('email_replies').insert({
      id:              `reply_${Date.now()}`,
      from_email:      fromEmail,
      to_email:        toAddr,
      subject,
      body_text:       text.slice(0, 5000),
      original_email_id: origLogs?.[0]?.id ?? null,
      received_at:     data.created_at ?? now,
    }).catch(() => {}); // table may not exist yet — ignore
  }

  return res.status(200).json({ ok: true });
}

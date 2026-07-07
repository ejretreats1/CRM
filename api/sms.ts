import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

let _twilio: any = null;
async function getTwilio() {
  if (!_twilio) {
    const { default: Twilio } = await import('twilio');
    _twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return _twilio;
}

const FROM = () => process.env.TWILIO_PHONE_NUMBER!;

// ─── GET handlers ─────────────────────────────────────────────────────────────

async function getTemplates(res: VercelResponse) {
  const sb = getSupabase();
  const { data, error } = await sb.from('sms_templates').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ templates: data ?? [] });
}

async function getCampaigns(res: VercelResponse) {
  const sb = getSupabase();
  const { data, error } = await sb.from('sms_campaigns').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ campaigns: data ?? [] });
}

// ─── POST handlers ────────────────────────────────────────────────────────────

async function upsertTemplate(body: any, res: VercelResponse) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const id = body.id ?? `smstpl_${Date.now()}`;
  const { error } = await sb.from('sms_templates').upsert({
    id,
    name: body.name,
    body: body.body,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ id });
}

async function deleteTemplate(body: any, res: VercelResponse) {
  const sb = getSupabase();
  const { error } = await sb.from('sms_templates').delete().eq('id', body.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function sendCampaign(body: any, res: VercelResponse) {
  const { campaignName, templateId, templateBody, leads } = body;
  if (!templateBody || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'templateBody and leads[] required.' });
  }

  const sb = getSupabase();
  const twilio = await getTwilio();
  const campaignId = `smsc_${Date.now()}`;
  const now = new Date().toISOString();

  // Create campaign record
  const { error: cErr } = await sb.from('sms_campaigns').insert({
    id: campaignId,
    name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
    template_id: templateId ?? null,
    template_body: templateBody,
    status: 'sending',
    lead_category: body.leadCategory ?? 'Property Management',
    sent_count: 0,
    response_count: 0,
    calls_set: 0,
    closes: 0,
    created_at: now,
    sent_at: now,
  });
  if (cErr) return res.status(500).json({ error: cErr.message });

  // Send to each lead
  let sentCount = 0;
  const recipients: any[] = [];

  for (const lead of leads) {
    const phone = normalizePhone(lead.phone);
    if (!phone) {
      recipients.push({
        id: randomUUID(),
        campaign_id: campaignId,
        lead_id: lead.id,
        lead_name: lead.name,
        phone: lead.phone,
        status: 'failed',
        sent_at: now,
        error_msg: 'Invalid phone number',
      });
      continue;
    }

    // Personalize message with lead name
    const personalizedBody = templateBody
      .replace(/\{name\}/gi, lead.name || 'there')
      .replace(/\{company\}/gi, lead.company || '');

    try {
      const msg = await twilio.messages.create({
        body: personalizedBody,
        from: FROM(),
        to: phone,
      });
      sentCount++;
      recipients.push({
        id: randomUUID(),
        campaign_id: campaignId,
        lead_id: lead.id,
        lead_name: lead.name,
        phone,
        status: 'sent',
        sent_at: now,
        twilio_message_sid: msg.sid,
      });
    } catch (e: any) {
      recipients.push({
        id: randomUUID(),
        campaign_id: campaignId,
        lead_id: lead.id,
        lead_name: lead.name,
        phone,
        status: 'failed',
        sent_at: now,
        error_msg: e.message ?? 'Send failed',
      });
    }
  }

  // Insert recipients
  if (recipients.length > 0) {
    await sb.from('sms_campaign_recipients').insert(recipients);
  }

  // Update campaign with final count
  await sb.from('sms_campaigns').update({ sent_count: sentCount, status: 'sent' }).eq('id', campaignId);

  return res.json({ campaignId, sentCount, totalLeads: leads.length });
}

async function updateCampaignStats(body: any, res: VercelResponse) {
  const { campaignId, callsSet, closes } = body;
  const sb = getSupabase();
  const update: any = {};
  if (typeof callsSet === 'number') update.calls_set = callsSet;
  if (typeof closes === 'number') update.closes = closes;
  const { error } = await sb.from('sms_campaigns').update(update).eq('id', campaignId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function deleteCampaign(body: any, res: VercelResponse) {
  const sb = getSupabase();
  await sb.from('sms_campaign_recipients').delete().eq('campaign_id', body.id);
  const { error } = await sb.from('sms_campaigns').delete().eq('id', body.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

// ─── Twilio inbound webhook ───────────────────────────────────────────────────
// POST /api/sms?action=inbound — set this URL in Twilio console for incoming messages

async function handleInbound(req: VercelRequest, res: VercelResponse) {
  const fromRaw: string = (req.body?.From ?? req.query?.From ?? '') as string;
  const body: string = (req.body?.Body ?? req.query?.Body ?? '') as string;
  const sid: string = (req.body?.MessageSid ?? '') as string;

  if (!fromRaw) return res.status(400).send('Missing From');

  const from = normalizePhone(fromRaw) ?? fromRaw;
  const sb = getSupabase();
  const now = new Date().toISOString();

  // Store inbound message
  await sb.from('sms_inbound_messages').insert({
    id: randomUUID(),
    from_phone: from,
    body,
    twilio_sid: sid,
    received_at: now,
  });

  // Mark recipient as responded (most recent campaign sent to this number)
  const { data: recipient } = await sb
    .from('sms_campaign_recipients')
    .select('id, campaign_id, status')
    .eq('phone', from)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  if (recipient) {
    await sb.from('sms_campaign_recipients').update({ status: 'responded', responded_at: now }).eq('id', recipient.id);
    // Increment campaign response count
    const { data: camp } = await sb.from('sms_campaigns').select('response_count').eq('id', recipient.campaign_id).single();
    if (camp) {
      await sb.from('sms_campaigns').update({ response_count: (camp.response_count ?? 0) + 1 }).eq('id', recipient.campaign_id);
    }
  }

  // Handle STOP — mark opted out
  if (/^\s*stop\s*$/i.test(body)) {
    await sb.from('sms_campaign_recipients').update({ status: 'opted_out' }).eq('phone', from).eq('status', 'sent');
  }

  // Twilio expects TwiML response
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const action = req.query.action as string;
      if (action === 'templates') return await getTemplates(res);
      if (action === 'campaigns') return await getCampaigns(res);
      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const action = (req.query.action ?? req.body?.action) as string;
      if (action === 'inbound') return await handleInbound(req, res);

      const body = req.body ?? {};
      if (action === 'upsert-template') return await upsertTemplate(body, res);
      if (action === 'delete-template') return await deleteTemplate(body, res);
      if (action === 'send-campaign') return await sendCampaign(body, res);
      if (action === 'update-campaign-stats') return await updateCampaignStats(body, res);
      if (action === 'delete-campaign') return await deleteCampaign(body, res);
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'Internal error' });
  }
}

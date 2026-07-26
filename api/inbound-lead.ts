import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 7 ? `+${digits}` : null;
}

async function sendWelcomeSms(phone: string, firstName: string) {
  const to = toE164(phone);
  if (!to) return;
  try {
    const { default: Twilio } = await import('twilio');
    const client = new Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body: `Hi ${firstName}! Thanks for reaching out to EJ Retreats. We received your inquiry and someone from our team will be in touch with you shortly!`,
    });
  } catch (err) {
    console.error('[inbound-lead] SMS failed:', err);
  }
}

async function sendTeamAlert(name: string, email: string, phone: string, address: string, message: string) {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: 'E&J Retreats <signatures@ejretreats.com>',
      to: 'ejretreats1@gmail.com',
      subject: `‼️ NEW LEAD — ${name}`,
      html: `<div style="font-family:sans-serif;max-width:560px">
        <h2 style="color:#ff7a00">New Lead from Website</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5">Name</td><td style="padding:6px 12px">${name}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:6px 12px"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5">Phone</td><td style="padding:6px 12px"><a href="tel:${phone}">${phone}</a></td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5">Property</td><td style="padding:6px 12px">${address || '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5">Message</td><td style="padding:6px 12px">${message || '—'}</td></tr>
        </table>
        <p style="margin-top:20px"><a href="https://ej-retreat.vercel.app" style="background:#ff7a00;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Open CRM</a></p>
      </div>`,
    });
  } catch (err) {
    console.error('[inbound-lead] team alert email failed:', err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — allow any origin so website forms can POST from any domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth — optional Bearer key; if INBOUND_LEAD_API_KEY is set the header must match,
  // but if the env var is not set we accept public submissions (website lead form).
  const apiKey = process.env.INBOUND_LEAD_API_KEY;
  if (apiKey) {
    const authHeader = req.headers['authorization'] ?? '';
    if (authHeader !== `Bearer ${apiKey}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { first_name, last_name, email, phone, property_address, message, sms_consent } = req.body ?? {};

  if (!first_name || !email) {
    return res.status(400).json({ error: 'first_name and email are required' });
  }

  const fullName = last_name?.trim()
    ? `${first_name.trim()} ${last_name.trim()}`
    : first_name.trim();

  const now = new Date().toISOString();
  const id = randomUUID();

  const { error } = await supabase.from('leads').insert({
    id,
    name: fullName,
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

  // Fire and forget — don't block the response
  if (phone?.trim() && sms_consent) sendWelcomeSms(phone.trim(), first_name.trim());
  sendTeamAlert(fullName, email.trim(), phone?.trim() ?? '', property_address?.trim() ?? '', message?.trim() ?? '');

  return res.status(201).json({ success: true, id });
}

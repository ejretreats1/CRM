import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { ownerId, ownerName, documentUrl, documentName, sentToEmail, appUrl } = req.body;

  const token = randomUUID();
  const id = `sig_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('signature_requests').insert({
    id,
    owner_id: ownerId,
    document_name: documentName,
    document_url: documentUrl,
    status: 'pending',
    token,
    sent_to_email: sentToEmail,
    sent_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  if (error) return res.status(500).json({ error: error.message });

  const signingUrl = `${appUrl}/sign/${token}`;

  const { error: emailError } = await resend.emails.send({
    from: 'E&J Retreats <onboarding@resend.dev>',
    to: sentToEmail,
    subject: `Please sign: ${documentName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">Document Signature Request</h2>
        <p>Hi ${ownerName},</p>
        <p>Please review and sign the following document: <strong>${documentName}</strong></p>
        <p style="margin:32px 0">
          <a href="${signingUrl}"
            style="background:#0d9488;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Review &amp; Sign Document
          </a>
        </p>
        <p style="color:#64748b;font-size:14px">This link expires in 7 days. If you have questions, reply to this email.</p>
        <p>— E&amp;J Retreats Team</p>
      </div>
    `,
  });

  if (emailError) return res.status(500).json({ error: 'Document saved but email failed to send.' });

  return res.status(200).json({ id, token });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { randomUUID } from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

interface AgreementField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'initials' | 'credit_card';
  label: string;
  page: number;
  x: number; y: number; w: number; h: number;
  required?: boolean;
}

// Send agreement to a guest
async function handleSend(body: any, res: VercelResponse) {
  const { templateId, propertyId, ownerId, guestName, guestEmail, appUrl } = body;
  const supabase = getSupabase();

  // Fetch template to verify it exists
  const { data: tmpl, error: te } = await supabase
    .from('rental_agreement_templates')
    .select('name, document_url')
    .eq('id', templateId)
    .single();
  if (te || !tmpl) return res.status(404).json({ error: 'Template not found.' });

  const token = randomUUID();
  const id = `ra_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('rental_agreement_submissions').insert({
    id,
    template_id:  templateId,
    property_id:  propertyId,
    owner_id:     ownerId,
    guest_name:   guestName,
    guest_email:  guestEmail,
    status:       'pending',
    token,
    sent_at:      new Date().toISOString(),
    expires_at:   expiresAt,
  });
  if (error) return res.status(500).json({ error: error.message });

  const fillUrl = `${appUrl}/fill/${token}`;

  await resend.emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: guestEmail,
    subject: `Please review and sign: ${tmpl.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">Rental Agreement</h2>
        <p>Hi ${guestName},</p>
        <p>Please review and complete the following document: <strong>${tmpl.name}</strong></p>
        <p style="margin:32px 0">
          <a href="${fillUrl}"
            style="background:#0d9488;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Review &amp; Sign Agreement
          </a>
        </p>
        <p style="color:#64748b;font-size:14px">This link expires in 7 days.</p>
        <p>— E&amp;J Retreats Team</p>
      </div>
    `,
  });

  return res.status(200).json({ id, token });
}

// Guest completes and submits the agreement
async function handleComplete(body: any, res: VercelResponse) {
  const { token, fieldValues } = body as { token: string; fieldValues: Record<string, string> };
  const supabase = getSupabase();

  const { data: sub, error: se } = await supabase
    .from('rental_agreement_submissions')
    .select('*, rental_agreement_templates(*)')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (se || !sub) return res.status(404).json({ error: 'Invalid or already completed link.' });
  if (new Date(sub.expires_at) < new Date()) {
    await supabase.from('rental_agreement_submissions').update({ status: 'expired' }).eq('id', sub.id);
    return res.status(410).json({ error: 'This link has expired.' });
  }

  const tmpl = sub.rental_agreement_templates as any;
  const fields: AgreementField[] = tmpl?.fields ?? [];

  // Fetch and fill the PDF
  const pdfRes = await fetch(tmpl.document_url);
  if (!pdfRes.ok) return res.status(500).json({ error: 'Could not load agreement PDF.' });
  const pdfBytes = await pdfRes.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const field of fields) {
    const value = fieldValues[field.id];
    if (!value) continue;

    const page = pages[field.page] ?? pages[pages.length - 1];
    const { width: pw, height: ph } = page.getSize();

    // Convert fractions to PDF coords (pdf-lib origin is bottom-left)
    const absX = field.x * pw;
    const absY = (1 - field.y - field.h) * ph; // flip y-axis
    const absW = field.w * pw;
    const absH = field.h * ph;

    if (field.type === 'signature' || field.type === 'initials') {
      try {
        const base64 = value.replace(/^data:image\/png;base64,/, '');
        const imgBytes = Buffer.from(base64, 'base64');
        const img = await pdfDoc.embedPng(imgBytes);
        page.drawImage(img, { x: absX, y: absY, width: absW, height: absH });
      } catch {}
    } else {
      // Text fields: draw text centered vertically in the box
      const fontSize = Math.min(12, absH * 0.6);
      const textY = absY + (absH - fontSize) / 2;
      const displayValue = field.type === 'credit_card'
        ? value.replace(/\d(?=\d{4})/g, '•') // mask card number
        : value;
      page.drawText(displayValue, {
        x: absX + 2,
        y: textY,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: absW - 4,
      });
      // Underline
      page.drawLine({
        start: { x: absX, y: absY },
        end:   { x: absX + absW, y: absY },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  const filledBytes = await pdfDoc.save();
  const filledPath = `agreements/filled/${sub.owner_id}/${sub.id}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(filledPath, filledBytes, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) return res.status(500).json({ error: uploadErr.message });

  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filledPath);

  await supabase.from('rental_agreement_submissions').update({
    status:               'completed',
    field_values:         fieldValues,
    filled_document_url:  publicUrl,
    completed_at:         new Date().toISOString(),
  }).eq('id', sub.id);

  const completedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  await resend.emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: 'ejretreats1@gmail.com',
    subject: `✅ Agreement signed: ${tmpl.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">Agreement Completed</h2>
        <p><strong>${sub.guest_name}</strong> (${sub.guest_email}) has completed <strong>${tmpl.name}</strong> on ${completedDate}.</p>
        <p style="margin:24px 0">
          <a href="${publicUrl}" style="background:#0d9488;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Download Completed Agreement
          </a>
        </p>
      </div>
    `,
  });

  return res.status(200).json({ filledDocumentUrl: publicUrl });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { action } = req.body;
  if (action === 'send')     return handleSend(req.body, res);
  if (action === 'complete') return handleComplete(req.body, res);
  return res.status(400).json({ error: 'action must be "send" or "complete"' });
}

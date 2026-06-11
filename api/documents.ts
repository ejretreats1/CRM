import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { randomUUID } from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

async function logEmail(
  emailId: string,
  emailType: string,
  recipientEmail: string,
  subject: string,
  recordId?: string,
  recipientName?: string,
) {
  try {
    await getSupabase().from('email_logs').insert({
      id: emailId,
      email_type: emailType,
      record_id: recordId ?? null,
      recipient_email: recipientEmail,
      recipient_name: recipientName ?? null,
      subject,
      sent_at: new Date().toISOString(),
      status: 'sent',
    });
  } catch {}
}

// ── SIGNATURE REQUESTS (owner contract signing) ───────────────────────────────

async function sigSend(body: any, res: VercelResponse) {
  const { ownerId, ownerName, documentUrl, documentName, sentToEmail, appUrl, sigX, sigY, dateX, dateY } = body;

  const supabase = getSupabase();
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
    sig_x: sigX ?? 0.08,
    sig_y: sigY ?? 0.78,
    date_x: dateX ?? 0.55,
    date_y: dateY ?? 0.78,
  });

  if (error) return res.status(500).json({ error: error.message });

  const signingUrl = `${appUrl}/sign/${token}`;

  const sigSubject = `Please sign: ${documentName}`;
  const { data: emailData, error: emailError } = await resend.emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: sentToEmail,
    subject: sigSubject,
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
  if (emailData?.id) await logEmail(emailData.id, 'signing', sentToEmail, sigSubject, id, ownerName);
  return res.status(200).json({ id, token });
}

async function sigComplete(body: any, res: VercelResponse) {
  const { token, signatureDataUrl } = body;
  const supabase = getSupabase();

  const { data: sigReq, error: fetchError } = await supabase
    .from('signature_requests')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (fetchError || !sigReq) return res.status(404).json({ error: 'Invalid or already used signing link.' });
  if (new Date(sigReq.expires_at) < new Date()) {
    await supabase.from('signature_requests').update({ status: 'expired' }).eq('id', sigReq.id);
    return res.status(410).json({ error: 'This signing link has expired.' });
  }

  const pdfRes = await fetch(sigReq.document_url);
  if (!pdfRes.ok) return res.status(500).json({ error: 'Could not load document.' });
  const pdfBytes = await pdfRes.arrayBuffer();

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width: pageWidth, height: pageHeight } = lastPage.getSize();

  const pdfSigX  = (sigReq.sig_x  ?? 0.08) * pageWidth;
  const pdfSigY  = (1 - (sigReq.sig_y  ?? 0.78)) * pageHeight;
  const pdfDateX = (sigReq.date_x ?? 0.55) * pageWidth;
  const pdfDateY = (1 - (sigReq.date_y ?? 0.78)) * pageHeight;

  const sigBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
  const sigBytes = Buffer.from(sigBase64, 'base64');
  const sigImage = await pdfDoc.embedPng(sigBytes);
  const sigDims = sigImage.scale(0.35);

  lastPage.drawImage(sigImage, {
    x: pdfSigX - sigDims.width / 2,
    y: pdfSigY - sigDims.height / 2,
    width: sigDims.width,
    height: sigDims.height,
  });
  lastPage.drawLine({
    start: { x: pdfSigX - sigDims.width / 2, y: pdfSigY - sigDims.height / 2 - 3 },
    end:   { x: pdfSigX + sigDims.width / 2, y: pdfSigY - sigDims.height / 2 - 3 },
    thickness: 0.5, color: rgb(0.7, 0.7, 0.7),
  });

  const dateText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  lastPage.drawText(dateText, { x: pdfDateX, y: pdfDateY, size: 10, color: rgb(0.15, 0.15, 0.15) });
  lastPage.drawLine({
    start: { x: pdfDateX - 2, y: pdfDateY - 4 },
    end:   { x: pdfDateX + 150, y: pdfDateY - 4 },
    thickness: 0.5, color: rgb(0.7, 0.7, 0.7),
  });

  const signedPdfBytes = await pdfDoc.save();
  const signedPath = `signed/${sigReq.owner_id}/${sigReq.id}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(signedPath, signedPdfBytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(signedPath);

  await supabase.from('signature_requests').update({
    status: 'signed',
    signed_at: new Date().toISOString(),
    signed_document_url: publicUrl,
  }).eq('id', sigReq.id);

  const { data: owner } = await supabase.from('owners').select('name').eq('id', sigReq.owner_id).single();
  const signedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  await resend.emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: 'ejretreats1@gmail.com',
    subject: `✅ Signed: ${sigReq.document_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">Document Signed</h2>
        <p><strong>${owner?.name ?? sigReq.sent_to_email}</strong> has signed <strong>${sigReq.document_name}</strong> on ${signedDate}.</p>
        <p style="margin:24px 0">
          <a href="${publicUrl}" style="background:#0d9488;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Download Signed Document
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">Signed by: ${sigReq.sent_to_email}</p>
      </div>
    `,
  });

  return res.status(200).json({ signedDocumentUrl: publicUrl });
}

// ── RENTAL AGREEMENTS (guest fill-and-sign) ───────────────────────────────────

interface AgreementField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'initials' | 'credit_card';
  label: string;
  page: number;
  x: number; y: number; w: number; h: number;
  required?: boolean;
}

async function agreementSend(body: any, res: VercelResponse) {
  const { templateId, propertyId, ownerId, guestName, guestEmail, appUrl } = body;
  const supabase = getSupabase();

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

  const agSubject = `Please review and sign: ${tmpl.name}`;
  const { data: agEmailData } = await resend.emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: guestEmail,
    subject: agSubject,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">Document for Signature</h2>
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
  if (agEmailData?.id) await logEmail(agEmailData.id, 'agreement', guestEmail, agSubject, id, guestName);

  return res.status(200).json({ id, token });
}

async function agreementComplete(body: any, res: VercelResponse) {
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

    const absX = field.x * pw;
    const absY = (1 - field.y - field.h) * ph;
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
      const fontSize = Math.min(12, absH * 0.6);
      const textY = absY + (absH - fontSize) / 2;
      const displayValue = field.type === 'credit_card'
        ? value.replace(/\d(?=\d{4})/g, '•')
        : value;
      page.drawText(displayValue, {
        x: absX + 2,
        y: textY,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: absW - 4,
      });
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

// ── RESEND WEBHOOK ────────────────────────────────────────────────────────────

async function handleResendWebhook(body: any, res: VercelResponse) {
  const type: string = body.type ?? '';
  const emailId: string = body.data?.email_id ?? '';
  if (!emailId) return res.status(200).end();

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const statusMap: Record<string, string> = {
    'email.delivered':  'delivered',
    'email.opened':     'opened',
    'email.clicked':    'clicked',
    'email.bounced':    'bounced',
    'email.complained': 'complained',
  };
  const newStatus = statusMap[type];
  if (!newStatus) return res.status(200).end();

  // Fetch current record to avoid downgrading status
  const { data: existing } = await supabase
    .from('email_logs')
    .select('status, open_count, click_count')
    .eq('id', emailId)
    .single();

  const STATUS_RANK: Record<string, number> = {
    sent: 0, delivered: 1, opened: 2, clicked: 3, bounced: 4, complained: 5,
  };
  const currentRank = STATUS_RANK[existing?.status ?? 'sent'] ?? 0;
  const newRank = STATUS_RANK[newStatus] ?? 0;

  const updates: Record<string, unknown> = {};
  if (newRank > currentRank || newStatus === 'bounced' || newStatus === 'complained') {
    updates.status = newStatus;
  }

  if (type === 'email.delivered') updates.delivered_at = now;
  if (type === 'email.opened') {
    updates.opened_at = existing?.status !== 'opened' ? now : undefined;
    updates.open_count = (existing?.open_count ?? 0) + 1;
  }
  if (type === 'email.clicked') {
    updates.clicked_at = existing?.status !== 'clicked' ? now : undefined;
    updates.click_count = (existing?.click_count ?? 0) + 1;
    const clickUrl = body.data?.click?.link ?? body.data?.url ?? null;
    if (clickUrl) updates.last_clicked_url = clickUrl;
  }
  if (type === 'email.bounced')    updates.bounced_at = now;
  if (type === 'email.complained') updates.bounced_at = now;

  // Remove undefined values
  for (const k of Object.keys(updates)) {
    if (updates[k] === undefined) delete updates[k];
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('email_logs').update(updates).eq('id', emailId);
  }

  return res.status(200).end();
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body;

  // Resend webhook: body has { type: 'email.opened', data: { email_id: '...' } }
  if (typeof body.type === 'string' && body.type.startsWith('email.') && body.data?.email_id) {
    return handleResendWebhook(body, res);
  }

  const { action, flow } = body;
  if (flow === 'agreement') {
    if (action === 'send')     return agreementSend(body, res);
    if (action === 'complete') return agreementComplete(body, res);
  } else {
    if (action === 'send')     return sigSend(body, res);
    if (action === 'complete') return sigComplete(body, res);
  }

  return res.status(400).json({ error: 'Unknown action.' });
}

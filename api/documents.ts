import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireAdmin, APP_URL, ADMIN_EMAIL, escapeHtml } from './_auth.js';
import { chargeJob, payoutJob, markPayoutPaid, payoutDueFrom } from './_billing.js';


import { syncPropertyIcal } from './_ical.js';
import { dispatchJob, advanceDispatch, syncUplistingJobs, dispatchTick, maybeActivateCleaner, type RosterCleaner } from './_jobs.js';
import { sendCleanerPortalEmail, sendJobCancelledEmail, sendClientReceiptEmail, sendReportReminderEmail, cleanerPortalUrl, emailId } from './_emails.js';
import { sendSms } from './_sms.js';

let _resend: any = null;
async function getResend() {
  if (!_resend) {
    const { Resend } = await import('resend');
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend as any;
}

// Server-side DB client. Prefers the service-role key (bypasses RLS) so the
// browser's anon key can be locked down; falls back to anon if it isn't set.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _serverSupabase: any = null;
function getSupabase() {
  if (_serverSupabase) return _serverSupabase;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
  _serverSupabase = createClient(process.env.VITE_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _serverSupabase;
}

// Service-role client — bypasses RLS. Used only for storage uploads from
// unauthenticated cleaner sessions where the anon key would be blocked.
function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is not set');
  return createClient(process.env.VITE_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
  const { data: emailData, error: emailError } = await (await getResend()).emails.send({
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
  if (emailId(emailData)) await logEmail(emailId(emailData)!, 'signing', sentToEmail, sigSubject, id, ownerName);
  return res.status(200).json({ id, token });
}

async function sigComplete(body: any, res: VercelResponse) {
  const { PDFDocument, rgb } = await import('pdf-lib');
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

  await (await getResend()).emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: ADMIN_EMAIL,
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
  const { templateId, propertyId, ownerId, guestName, guestEmail, appUrl, skipEmail } = body;
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

  if (skipEmail) return res.status(200).json({ id, token });

  const agSubject = `Please review and sign: ${tmpl.name}`;
  const { data: agEmailData } = await (await getResend()).emails.send({
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
  if (emailId(agEmailData)) await logEmail(emailId(agEmailData)!, 'agreement', guestEmail, agSubject, id, guestName);

  return res.status(200).json({ id, token });
}

async function agreementComplete(body: any, res: VercelResponse) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
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
  await (await getResend()).emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: ADMIN_EMAIL,
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

// Self-sign: anyone with the share link enters their name and signs directly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function agreementSelfSign(body: any, res: VercelResponse) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const { shareToken, signerName, fieldValues } = body as {
    shareToken: string;
    signerName: string;
    fieldValues: Record<string, string>;
  };
  if (!shareToken || !signerName?.trim() || !fieldValues) {
    return res.status(400).json({ error: 'shareToken, signerName, and fieldValues are required.' });
  }

  const supabase = getSupabase();
  const { data: tmpl, error: te } = await supabase
    .from('rental_agreement_templates')
    .select('*')
    .eq('share_token', shareToken)
    .single();
  if (te || !tmpl) return res.status(404).json({ error: 'Template not found.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: AgreementField[] = (tmpl.fields as AgreementField[]) ?? [];

  const pdfRes = await fetch(tmpl.document_url as string);
  if (!pdfRes.ok) return res.status(500).json({ error: 'Could not load template PDF.' });
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
      page.drawText(displayValue, { x: absX + 2, y: textY, size: fontSize, font, color: rgb(0.1, 0.1, 0.1), maxWidth: absW - 4 });
      page.drawLine({ start: { x: absX, y: absY }, end: { x: absX + absW, y: absY }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    }
  }

  const filledBytes = await pdfDoc.save();
  const safeName     = signerName.trim().replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
  const safeTmplName = String(tmpl.name).replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
  const subId        = `ra_${Date.now()}`;
  const filledPath   = `agreements/filled/${tmpl.owner_id}/${safeName} - ${safeTmplName} - ${subId}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(filledPath, filledBytes, { contentType: 'application/pdf', upsert: false });
  if (uploadErr) return res.status(500).json({ error: uploadErr.message });

  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filledPath);

  const now = new Date().toISOString();
  await supabase.from('rental_agreement_submissions').insert({
    id:                  subId,
    template_id:         tmpl.id,
    property_id:         tmpl.property_id,
    owner_id:            tmpl.owner_id,
    guest_name:          signerName.trim(),
    guest_email:         '',
    status:              'completed',
    token:               randomUUID(),
    sent_at:             now,
    expires_at:          now,
    field_values:        fieldValues,
    filled_document_url: publicUrl,
    completed_at:        now,
  });

  const completedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  await (await getResend()).emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
    to: ADMIN_EMAIL,
    subject: `✅ ${signerName.trim()} signed: ${tmpl.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">Document Signed</h2>
        <p><strong>${signerName.trim()}</strong> signed <strong>${tmpl.name}</strong> on ${completedDate}.</p>
        <p style="margin:24px 0">
          <a href="${publicUrl}" style="background:#0d9488;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Download: ${safeName} - ${safeTmplName}.pdf
          </a>
        </p>
      </div>
    `,
  }).catch(() => {});

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

  // Also update campaign stats if this is a campaign email
  if (type === 'email.opened' || type === 'email.clicked') {
    const { data: rec } = await supabase
      .from('email_mkt_recipients')
      .select('id, campaign_id')
      .eq('resend_email_id', emailId)
      .single();
    if (rec) {
      if (type === 'email.opened') {
        await supabase.from('email_mkt_recipients').update({ status: 'opened', opened_at: now }).eq('id', rec.id);
        const { data: camp } = await supabase.from('email_mkt_campaigns').select('open_count').eq('id', rec.campaign_id).single();
        if (camp) await supabase.from('email_mkt_campaigns').update({ open_count: (camp.open_count ?? 0) + 1 }).eq('id', rec.campaign_id);
      } else {
        await supabase.from('email_mkt_recipients').update({ clicked_at: now }).eq('id', rec.id);
        const { data: camp } = await supabase.from('email_mkt_campaigns').select('click_count').eq('id', rec.campaign_id).single();
        if (camp) await supabase.from('email_mkt_campaigns').update({ click_count: (camp.click_count ?? 0) + 1 }).eq('id', rec.campaign_id);
      }
    }
  }

  return res.status(200).end();
}

// ── ONBOARDING ───────────────────────────────────────────────────────────────
/*
 * Required Supabase table — run once in Supabase SQL editor:
 *
 *   create table if not exists onboarding_requests (
 *     id           text primary key,
 *     token        uuid unique not null,
 *     status       text not null default 'pending',
 *     owner_id     text,
 *     form_data    jsonb,
 *     created_at   timestamptz default now(),
 *     expires_at   timestamptz not null,
 *     submitted_at timestamptz
 *   );
 *   alter table onboarding_requests enable row level security;
 *   create policy "anon all" on onboarding_requests
 *     for all to anon using (true) with check (true);
 */

// Loose address equality (same house number + street name, ignoring punctuation
// and St/Street-style suffix differences). Mirrors src/services/addressMatch.ts.
const ADDR_SUFFIXES: Record<string, string> = {
  street: 'st', avenue: 'ave', av: 'ave', boulevard: 'blvd', drive: 'dr', road: 'rd', lane: 'ln',
  court: 'ct', circle: 'cir', place: 'pl', terrace: 'ter', trail: 'trl', parkway: 'pkwy', highway: 'hwy',
  north: 'n', south: 's', east: 'e', west: 'w',
};
function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  return (raw.split(',')[0] ?? raw).toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean).map(w => ADDR_SUFFIXES[w] ?? w).join(' ');
}
function addressesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddress(a), nb = normalizeAddress(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [numA, ...restA] = na.split(' ');
  const [numB, ...restB] = nb.split(' ');
  if (!/^\d/.test(numA) || numA !== numB) return false;
  const sa = restA.slice(0, 2).join(' '), sb = restB.slice(0, 2).join(' ');
  return !!sa && (sa === sb || sa.startsWith(sb) || sb.startsWith(sa));
}

async function onboardingGet(token: string, res: VercelResponse) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('onboarding_requests')
    .select('status, expires_at')
    .eq('token', token)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Not found' });
  if (data.status === 'completed') return res.status(200).json({ status: 'completed' });
  if (new Date(data.expires_at) < new Date()) return res.status(200).json({ status: 'expired' });
  return res.status(200).json({ status: 'pending' });
}

async function onboardingCreate(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  const token = randomUUID();
  const id = `onboard_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  // existingOwnerId links this request to an existing client — submit will update, not create
  const existingOwnerId: string | null = req.body.ownerId ?? null;
  const { error } = await supabase.from('onboarding_requests').insert({
    id, token, status: 'pending',
    owner_id: existingOwnerId,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  if (error) return res.status(500).json({ error: error.message });
  const appUrl = (process.env.VITE_APP_URL ?? '').replace(/\/$/, '') || `https://${req.headers.host}`;
  return res.status(200).json({ token, url: `${appUrl}?onboarding=${token}` });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function onboardingSubmit(body: any, res: VercelResponse) {
  const { token, formData } = body;
  if (!token || !formData) return res.status(400).json({ error: 'Missing token or formData' });
  const supabase = getSupabase();

  const { data: request, error: fetchErr } = await supabase
    .from('onboarding_requests').select('*').eq('token', token).single();
  if (fetchErr || !request) return res.status(404).json({ error: 'Invalid token' });
  if (request.status === 'completed') return res.status(400).json({ error: 'Already submitted' });
  if (new Date(request.expires_at) < new Date()) return res.status(400).json({ error: 'Link expired' });

  const now = new Date().toISOString();
  const notes = buildOnboardingNotes(formData);
  const entries = onboardingProperties(formData);

  if (request.owner_id) {
    // ── Existing client: update notes, don't create a new owner ──────────────
    const { error: updateErr } = await supabase
      .from('owners')
      .update({ notes, phone: formData.phone || undefined, email: formData.email || undefined })
      .eq('id', request.owner_id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Update each submitted property whose address matches an existing one,
    // otherwise add it as a new property for this owner.
    if (entries.length) {
      const { data: existingProps } = await supabase
        .from('properties')
        .select('id, address, property_info')
        .eq('owner_id', request.owner_id);
      for (const [i, entry] of entries.entries()) {
        const address = String(entry.propertyAddress).trim();
        const match = existingProps?.find(p => addressesMatch(p.address, address));
        if (match) {
          // Layer the form's answers over the existing Property Info so notes
          // E&J added by hand (alarm codes, quirks, …) are kept.
          const fromForm = Object.fromEntries(
            Object.entries(onboardingPropertyInfo(entry)).filter(([, v]) => v !== undefined)
          );
          await supabase.from('properties').update({
            type:        entry.propertyType || undefined,
            bedrooms:    parseInt(entry.bedrooms)  || undefined,
            bathrooms:   parseFloat(entry.bathrooms) || undefined,
            max_guests:  parseInt(entry.maxGuests) || undefined,
            platforms:   entry.platforms?.length ? entry.platforms : undefined,
            property_info: { ...((match as any).property_info ?? {}), ...fromForm },
          }).eq('id', match.id);
        } else {
          await supabase.from('properties').insert({
            id: `prop_${Date.now()}_${i}`, owner_id: request.owner_id,
            address, city: '', state: '',
            type: entry.propertyType || '',
            bedrooms: parseInt(entry.bedrooms) || 0,
            bathrooms: parseFloat(entry.bathrooms) || 0,
            max_guests: parseInt(entry.maxGuests) || 0,
            monthly_revenue: 0, occupancy_rate: 0,
            platforms: entry.platforms ?? [], status: 'onboarding', joined_at: now,
            property_info: onboardingPropertyInfo(entry),
          });
        }
      }
    }

    await supabase.from('onboarding_requests').update({
      status: 'completed', form_data: formData, submitted_at: now,
    }).eq('token', token);

    return res.status(200).json({ success: true });
  }

  // ── New client: create owner + every property they listed ─────────────────
  const ownerId = `owner_${Date.now()}`;
  const portalToken = randomUUID();

  const { error: ownerErr } = await supabase.from('owners').insert({
    id: ownerId, name: formData.fullName, email: formData.email, phone: formData.phone,
    notes, source: 'website', vendors: [], created_at: now, archived: false, portal_token: portalToken,
  });
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  if (entries.length) {
    await supabase.from('properties').insert(entries.map((entry, i) => ({
      id: `prop_${Date.now()}_${i}`, owner_id: ownerId,
      address: String(entry.propertyAddress).trim(), city: '', state: '',
      type: entry.propertyType || '',
      bedrooms: parseInt(entry.bedrooms) || 0,
      bathrooms: parseFloat(entry.bathrooms) || 0,
      max_guests: parseInt(entry.maxGuests) || 0,
      monthly_revenue: 0, occupancy_rate: 0,
      platforms: entry.platforms ?? [], status: 'onboarding', joined_at: now,
      property_info: onboardingPropertyInfo(entry),
    })));
  }

  await supabase.from('onboarding_requests').update({
    status: 'completed', owner_id: ownerId, form_data: formData, submitted_at: now,
  }).eq('token', token);

  return res.status(200).json({ success: true });
}

/*
 * The onboarding form collects one entry per property. Older submissions stored
 * the single property's fields flat on the form itself, so fall back to that
 * shape. Entries without an address are dropped, as are duplicate addresses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onboardingProperties(f: any): any[] {
  const raw: any[] = Array.isArray(f?.properties) && f.properties.length ? f.properties : [f];
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.filter((p: any) => {
    const address = typeof p?.propertyAddress === 'string' ? p.propertyAddress.trim().toLowerCase() : '';
    if (!address || seen.has(address)) return false;
    seen.add(address);
    return true;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onboardingPropertyInfo(p: any) {
  const icalLinks = Array.isArray(p.icalLinks)
    ? p.icalLinks
        .filter((l: any) => l && typeof l.url === 'string' && l.url.trim())
        .map((l: any) => ({ platform: String(l.platform || 'Other'), url: String(l.url).trim() }))
    : [];
  return {
    doorCode:        p.lockCode       || undefined,
    gateCode:        p.gateCode       || undefined,
    garageCode:      p.garageCode     || undefined,
    parkingNotes:    p.parkingNotes   || undefined,
    wifiNetwork:     p.wifiName       || undefined,
    wifiPassword:    p.wifiPassword   || undefined,
    checkInTime:     p.checkInTime    || undefined,
    checkOutTime:    p.checkOutTime   || undefined,
    checkInInstructions: p.checkInInstructions || undefined,
    thermostatNotes: p.thermostatNotes || undefined,
    trashPickupDays: p.trashPickupDays || undefined,
    trashBinLocation: p.trashBinLocation || undefined,
    suppliesLocation: p.suppliesLocation || undefined,
    icalLinks:       icalLinks.length ? icalLinks : undefined,
    petPolicy:       p.petsAllowed === 'Yes' ? 'Pets allowed ($75 fee)' : p.petsAllowed === 'No' ? 'No pets' : undefined,
    houseRulesNotes: p.houseRules     || undefined,
    generalNotes:    p.otherAmenities || undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOnboardingNotes(f: any): string {
  const lines: string[] = ['=== ONBOARDING FORM SUBMISSION ==='];
  const add = (label: string, val: unknown) => { if (val) lines.push(`${label}: ${val}`); };
  add('Monthly costs', f.monthlyCosts);
  add('Airbnb login', f.airbnbLogin); add('VRBO login', f.vrboLogin);
  add('Booking.com login', f.bookingLogin); add('Stripe login', f.stripeLogin);
  add('Account preference', f.accountPreference); add('Bank info', f.bankInfo);
  add('Supply ordering', f.supplyOrdering); add('Preferred cleaner', f.preferredCleaner);
  add('Cleaner contact', f.cleanerContact); add('Preferred handyman', f.preferredHandyman);
  add('Handyman contact', f.handymanContact); add('Pricing tool', f.pricingTool);
  add('PriceLabs', f.priceLabs); add('PMS', f.pms);
  add('Additional info', f.additionalInfo); add('Questions', f.questions);

  const entries = onboardingProperties(f);
  if (entries.length > 1) lines.push(`Properties submitted: ${entries.length}`);
  entries.forEach((p, i) => {
    lines.push('', `--- PROPERTY ${i + 1}: ${String(p.propertyAddress).trim()} ---`);
    add('Property type', p.propertyType);
    add('Bedrooms', p.bedrooms); add('Bathrooms', p.bathrooms); add('Bed sizes', p.bedSizes);
    add('Max guests', p.maxGuests); add('Door codes', p.doorCodes);
    if (p.platforms?.length) lines.push(`Platforms: ${p.platforms.join(', ')}`);
    add('Listing links', p.listingLinks); add('Average ratings', p.averageRatings);
    if (Array.isArray(p.icalLinks) && p.icalLinks.length) {
      lines.push(`iCal links: ${p.icalLinks.map((l: any) => `${l.platform}: ${l.url}`).join(' | ')}`);
    }
    add('Entry type', p.entryType); add('Lock code', p.lockCode);
    add('Gate code', p.gateCode); add('Garage code', p.garageCode); add('Parking / entry', p.parkingNotes);
    add('Check-in time', p.checkInTime); add('Check-out time', p.checkOutTime); add('Check-in instructions', p.checkInInstructions);
    add('Supplies location', p.suppliesLocation); add('Trash pickup', p.trashPickupDays); add('Trash bins', p.trashBinLocation);
    add('Thermostat', p.thermostatNotes);
    if (p.wifiName) lines.push(`WiFi: ${p.wifiName} / ${p.wifiPassword ?? ''}`);
    if (p.amenities?.length) lines.push(`Amenities: ${p.amenities.join(', ')}`);
    add('Other amenities', p.otherAmenities); add('Stocked supplies', p.stockedSupplies);
    add('Blackout dates', p.blackoutDates);
    add('Pets allowed', p.petsAllowed); add('House rules', p.houseRules);
    add('Professional photos', p.professionalPhotos);
  });
  return lines.join('\n');
}

// ── CLEANING DISPATCH ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningGet(combined: string, res: VercelResponse) {
  const colonIdx = combined.indexOf(':');
  const jobId  = combined.slice(0, colonIdx);
  const token  = combined.slice(colonIdx + 1);
  if (!jobId || !token) return res.status(400).json({ error: 'Invalid link.' });

  const supabase = getSupabase();
  const [{ data: row }, { data: configs }] = await Promise.all([
    supabase.from('cleaning_jobs').select('*').eq('id', jobId).single(),
    supabase.from('cleaning_property_configs').select('property_id,door_code,address,checkout_time,checkin_time,photo_url,staging_photo_urls,laundromat_address'),
  ]);
  if (!row) return res.status(404).json({ error: 'Job not found.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (row.dispatch_tokens ?? {}) as Record<string, any>;
  const cleanerInfo = tokens[token];
  if (!cleanerInfo) return res.status(401).json({ error: 'Invalid or expired link.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (configs ?? []).find((c: any) => c.property_id === row.property_id);

  const dispatchOrder = (row.dispatch_order ?? []) as string[];
  const dispatchIndex = row.dispatch_index ?? 0;
  const canAccept = row.status === 'dispatched' && dispatchOrder[dispatchIndex] === token;

  return res.status(200).json({
    job: {
      id: row.id, propertyName: row.property_name, checkoutDate: row.checkout_date,
      checkinDate: row.checkin_date, guestName: row.guest_name, notes: row.notes,
      status: row.status, assignedCleanerId: row.assigned_cleaner_id,
      portalData: row.portal_data,
      // Door code only once this cleaner holds the job and the clean is live.
      doorCode: row.assigned_cleaner_id === cleanerInfo.cleanerId && ['accepted', 'in_progress'].includes(row.status) ? (cfg?.door_code ?? null) : null,
      address: cfg?.address ?? null,
      checkoutTime: cfg?.checkout_time ?? null,
      checkinTime: cfg?.checkin_time ?? null,
      photoUrl: cfg?.photo_url ?? null,
      stagingPhotoUrls: cfg?.staging_photo_urls ?? [],
      laundromatAddress: cfg?.laundromat_address ?? null,
    },
    cleaner: cleanerInfo,
    canAccept,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function manualClientCharge(body: any, res: VercelResponse) {
  const { propertyId, amount, description, requestId } = body;
  if (!propertyId || !amount || Number(amount) <= 0)
    return res.status(400).json({ error: 'propertyId and a positive amount are required.' });

  const supabase = getSupabase();
  const { data: config } = await supabase
    .from('cleaning_property_configs')
    .select('property_name, client_name, stripe_customer_id, stripe_payment_method_id')
    .eq('property_id', propertyId)
    .maybeSingle();
  if (!config) return res.status(404).json({ error: 'Property not found.' });
  if (!config.stripe_customer_id || !config.stripe_payment_method_id)
    return res.status(400).json({ error: `${config.property_name} has no payment method on file — client onboarding not complete.` });

  const stripe = await getStripe();
  const amountCents = Math.round(Number(amount) * 100);
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: config.stripe_customer_id,
      payment_method: config.stripe_payment_method_id,
      confirm: true,
      off_session: true,
      description: description?.trim() || `Manual charge — ${config.property_name}`,
      metadata: { property_id: propertyId, type: 'manual_charge' },
    }, { idempotencyKey: `manual_charge_${requestId || randomUUID()}` });

    const now = new Date().toISOString();
    const jobId = `cj_manual_${randomUUID().slice(0, 8)}`;
    await supabase.from('cleaning_jobs').insert({
      id: jobId,
      property_id: propertyId,
      property_name: config.property_name,
      status: 'completed',
      checkout_date: now.slice(0, 10),
      cleaning_fee: Number(amount),
      cleaner_payout: 0,
      charged_at: now,
      stripe_charge_id: paymentIntent.id,
      charge_status: 'charged',
      notes: description?.trim() || 'Manual charge',
      source: 'manual',
      created_at: now,
      updated_at: now,
    });

    return res.json({ paymentIntentId: paymentIntent.id, jobId, amount: Number(amount), propertyName: config.property_name, clientName: config.client_name });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'Charge failed.' });
  }
}

async function manualCleanerPayout(body: any, res: VercelResponse) {
  const { cleanerId, amount, note, requestId } = body;
  if (!cleanerId || !amount || Number(amount) <= 0)
    return res.status(400).json({ error: 'cleanerId and a positive amount are required.' });

  const supabase = getSupabase();
  const { data: cleaner } = await supabase
    .from('cleaners').select('name, email, stripe_account_id').eq('id', cleanerId).single();
  if (!cleaner) return res.status(404).json({ error: 'Cleaner not found.' });
  if (!cleaner.stripe_account_id)
    return res.status(400).json({ error: `${cleaner.name} has not connected their Stripe account yet.` });

  const stripe = await getStripe();
  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(amount) * 100),
      currency: 'usd',
      destination: cleaner.stripe_account_id,
      description: note?.trim() || `Manual payout to ${cleaner.name}`,
      metadata: { type: 'manual_payout', cleaner_id: cleanerId },
    }, { idempotencyKey: `manual_payout_${requestId || randomUUID()}` });

    const now = new Date().toISOString();
    const jobId = `cj_manual_payout_${randomUUID().slice(0, 8)}`;
    await supabase.from('cleaning_jobs').insert({
      id: jobId,
      property_id: `manual_payout_${cleanerId}`,
      property_name: `Manual Payout`,
      status: 'completed',
      checkout_date: now.slice(0, 10),
      cleaning_fee: 0,
      cleaner_payout: Number(amount),
      assigned_cleaner_id: cleanerId,
      assigned_cleaner_name: cleaner.name,
      payout_sent_at: now,
      stripe_transfer_id: transfer.id,
      payout_status: 'sent',
      notes: note?.trim() || `Manual payout to ${cleaner.name}`,
      source: 'manual',
      created_at: now,
      updated_at: now,
    });

    return res.json({ transferId: transfer.id, jobId, amount: Number(amount), cleanerName: cleaner.name });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'Transfer failed.' });
  }
}

async function sendJobPayout(body: any, res: VercelResponse) {
  const { jobId } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });
  const outcome = await payoutJob(getSupabase(), await getStripe(), jobId, { manual: true, notify: { resend: await getResend(), sms: sendSms } });
  if (outcome.status === 'sent') return res.json({ transferId: outcome.transferId, jobId, amount: outcome.amount, warning: outcome.error ?? null });
  if (outcome.status === 'already_sent') return res.status(400).json({ error: 'Payout already sent.' });
  if (outcome.status === 'manual_due') return res.status(409).json({ error: 'This cleaner has no active Stripe account yet — pay them directly and use “Mark paid”.', manualDue: true });
  if (outcome.status === 'failed') return res.status(502).json({ error: outcome.error ?? 'Stripe transfer failed.' });
  return res.status(400).json({ error: outcome.error ?? `Payout not possible (${outcome.reason ?? 'skipped'}).` });
}

// Admin recorded a payout made outside Stripe (Zelle, Venmo, cash…).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningMarkPayoutPaid(body: any, res: VercelResponse) {
  const { jobId, method, reference, paidAt } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });
  const r = await markPayoutPaid(getSupabase(), jobId, { method, reference, paidAt, notify: { resend: await getResend(), sms: sendSms } });
  if (!r.ok) return res.status(400).json({ error: r.error });
  return res.json({ success: true });
}

/**
 * Admin: waive the cleaner's report for a job (e.g. the portal was down). Marks
 * the job completed with a placeholder report so billing can proceed. Nothing is
 * charged here — "Charge now" or the daily run does that.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningWaiveReport(body: any, res: VercelResponse) {
  const { jobId, note } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });
  const supabase = getSupabase();
  const { data: job } = await supabase.from('cleaning_jobs').select('id, status, portal_data, assigned_cleaner_id').eq('id', jobId).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.status === 'cancelled') return res.status(409).json({ error: 'Job is cancelled.' });
  if (job.portal_data?.submittedAt && !job.portal_data?.waived) return res.status(409).json({ error: 'The cleaner already submitted a report for this job.' });
  const now = new Date().toISOString();
  const portalData = {
    checklist: {}, photos: [], damageNotes: '', damageMedia: [], suppliesNotes: '',
    submittedAt: now, waived: true,
    waivedNote: typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : 'Report waived by E&J Retreats',
  };
  const patch: Record<string, unknown> = { portal_data: portalData, updated_at: now, payout_due_at: payoutDueFrom(now) };
  if (job.status !== 'completed') { patch.status = 'completed'; patch.completed_at = now; }
  const { error } = await supabase.from('cleaning_jobs').update(patch).eq('id', jobId).neq('status', 'cancelled');
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, portalData });
}

/** Admin: nudge the assigned cleaner to submit an overdue report (email + text). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningRemindReport(body: any, res: VercelResponse) {
  const { jobId } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });
  const supabase = getSupabase();
  const { data: job } = await supabase.from('cleaning_jobs').select('id, property_name, checkout_date, status, assigned_cleaner_id, dispatch_tokens, portal_data').eq('id', jobId).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (!job.assigned_cleaner_id) return res.status(400).json({ error: 'No cleaner is assigned to this job.' });
  if (job.status === 'completed' || job.portal_data?.submittedAt) return res.status(409).json({ error: 'The report for this job is already in.' });
  const { data: cleaner } = await supabase.from('cleaners').select('id, name, email, phone, dashboard_token').eq('id', job.assigned_cleaner_id).maybeSingle();
  if (!cleaner) return res.status(404).json({ error: 'Cleaner not found.' });
  const tokens = (job.dispatch_tokens ?? {}) as Record<string, { cleanerId: string }>;
  const token = Object.entries(tokens).find(([, t]) => t.cleanerId === cleaner.id)?.[0];
  if (!token) return res.status(400).json({ error: 'This cleaner has no job link on file. Re-dispatch the job to them first.' });
  const portalLink = `${APP_URL}/?cleaner=${jobId}:${token}`;
  const dashboardLink = cleaner.dashboard_token ? cleanerPortalUrl(cleaner, cleaner.dashboard_token) : null;
  const out: { email?: string; sms?: string } = {};
  if (cleaner.email) {
    try {
      const sent = await sendReportReminderEmail(await getResend(), { to: cleaner.email, name: cleaner.name, propertyName: job.property_name, checkoutDate: job.checkout_date, portalLink, dashboardLink });
      if (sent.id) await logEmail(sent.id, 'cleaning-report-reminder', cleaner.email, sent.subject, jobId, cleaner.name);
      out.email = 'sent';
    } catch (e) { out.email = `failed: ${e instanceof Error ? e.message : String(e)}`; }
  }
  const phone = normalizePhone(cleaner.phone);
  if (phone) {
    try {
      const sid = await sendSms(phone, `Hi ${String(cleaner.name).split(' ')[0]}, E&J Retreats here — we still need your cleaning report for ${job.property_name} (${new Date(job.checkout_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}). Your payout goes out once it's in: ${portalLink}`);
      out.sms = sid ? 'sent' : 'not configured';
    } catch (e) { out.sms = `failed: ${e instanceof Error ? e.message : String(e)}`; }
  }
  return res.status(200).json({ ok: true, ...out });
}

async function cleaningCancellation(body: any, res: VercelResponse) {
  const { jobId, reason } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });

  const supabase = getSupabase();
  const { data: job } = await supabase
    .from('cleaning_jobs')
    .select('id, property_name, checkout_date, assigned_cleaner_id, dispatch_tokens, dispatch_order, dispatch_index, status')
    .eq('id', jobId)
    .single();
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  // Who needs to hear about it: the assigned cleaner, else the cleaner currently being offered the job.
  const toNotify: { name: string; email: string }[] = [];
  const tokens = (job.dispatch_tokens ?? {}) as Record<string, { cleanerId: string; cleanerName: string; cleanerEmail?: string }>;
  if (job.assigned_cleaner_id) {
    const { data: cleaner } = await supabase.from('cleaners').select('name, email').eq('id', job.assigned_cleaner_id).single();
    if (cleaner?.email) toNotify.push({ name: cleaner.name, email: cleaner.email });
  } else if (job.status === 'dispatched') {
    const order = (job.dispatch_order ?? []) as string[];
    const cur = tokens[order[job.dispatch_index ?? 0]];
    if (cur?.cleanerEmail) toNotify.push({ name: cur.cleanerName, email: cur.cleanerEmail });
  }
  if (toNotify.length === 0) return res.json({ notified: 0 });

  const resend = await getResend();
  let notified = 0;
  for (const c of toNotify) {
    try {
      const sent = await sendJobCancelledEmail(resend, { to: c.email, name: c.name, propertyName: job.property_name ?? 'the property', checkoutDate: job.checkout_date, reason: typeof reason === 'string' ? reason : undefined });
      if (sent.id) await logEmail(sent.id, 'cleaning-cancelled', c.email, sent.subject, jobId, c.name);
      notified++;
    } catch (e) {
      console.error('Cancellation email error:', c.email, e);
    }
  }
  return res.json({ notified });
}

async function cleaningDispatch(body: any, res: VercelResponse) {
  const { jobId, cleaners } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });
  if (!cleaners?.length) return res.status(400).json({ error: 'No cleaners provided.' });

  const supabase = getSupabase();
  const { data: job } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).maybeSingle();
  if (!job) return res.status(404).json({ error: 'Job not found. Save it first, then dispatch.' });
  if (job.status !== 'pending') {
    if (!body.redispatch || ['completed', 'cancelled'].includes(job.status)) return res.status(409).json({ error: `Job is ${job.status}, not pending.` });
    // Re-dispatch: drop the current assignment so the whole roster is offered the job again.
    const { error: resetErr } = await supabase.from('cleaning_jobs').update({
      status: 'pending', assigned_cleaner_id: null, assigned_cleaner_name: null, accepted_at: null,
      dispatch_tokens: null, dispatch_order: null, dispatch_index: 0, updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('status', job.status);
    if (resetErr) return res.status(500).json({ error: resetErr.message });
    job.status = 'pending';
  }

  // The admin picks the order; names/emails come from the cleaners table so a stale
  // browser copy can never email the wrong address.
  const ids = (cleaners as { id: string }[]).map(c => c.id);
  const { data: rows } = await supabase.from('cleaners').select('id, name, email, status').in('id', ids);
  const byId = new Map<string, any>((rows ?? []).map((r: any) => [r.id, r] as [string, any]));
  const roster: RosterCleaner[] = (cleaners as { id: string; payout?: number }[])
    .map(c => { const r = byId.get(c.id); return r?.email ? { id: r.id, name: r.name, email: r.email, payout: Number(c.payout ?? 0) } : null; })
    .filter((c): c is RosterCleaner => !!c);
  if (!roster.length) return res.status(400).json({ error: 'None of the selected cleaners have an email on file.' });

  const result = await dispatchJob(supabase, await getResend(), job, roster);
  if (!result.ok) return res.status(409).json({ error: result.error });
  return res.status(200).json({ sent: 1, warning: result.error });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningDecline(body: any, res: VercelResponse) {
  const { combined } = body;
  const colonIdx = (combined as string).indexOf(':');
  const jobId = combined.slice(0, colonIdx);
  const token = combined.slice(colonIdx + 1);

  const supabase = getSupabase();
  const { data: row } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).single();
  if (!row) return res.status(404).json({ error: 'Job not found.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (row.dispatch_tokens ?? {}) as Record<string, any>;
  if (!tokens[token]) return res.status(401).json({ error: 'Invalid or expired link.' });
  if (row.status !== 'dispatched') {
    return res.status(409).json({ error: 'This job has already been claimed or is no longer available.' });
  }
  const dispatchOrder = (row.dispatch_order ?? []) as string[];
  if (dispatchOrder[row.dispatch_index ?? 0] !== token) {
    return res.status(400).json({ error: 'You have already passed on this job.' });
  }

  const outcome = await advanceDispatch(supabase, await getResend(), row, 'passed');
  if (outcome.error && !outcome.next && !outcome.exhausted) return res.status(409).json({ error: outcome.error });
  return res.status(200).json({ passed: true, allPassed: outcome.exhausted });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningUploadPhoto(body: any, res: VercelResponse) {
  const { photoBase64, filename, jobId, combined } = body;
  if (!photoBase64 || !jobId) return res.status(400).json({ error: 'photoBase64 and jobId required' });
  if (typeof photoBase64 !== 'string' || photoBase64.length > 20 * 1024 * 1024) {
    return res.status(413).json({ error: 'File too large (max ~15MB).' });
  }

  // Use service-role client so RLS on storage.objects doesn't block the upload
  const admin = getSupabaseAdmin();

  // Only the cleaner holding this job (proven by their dispatch token) may upload.
  const { data: job } = await getSupabase().from('cleaning_jobs').select('id, dispatch_tokens, assigned_cleaner_id, status').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const upToken = typeof combined === 'string' && combined.includes(':') ? combined.slice(combined.indexOf(':') + 1) : '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upInfo = ((job as any).dispatch_tokens ?? {})[upToken];
  if (!upInfo || (job as any).assigned_cleaner_id !== upInfo.cleanerId) {
    return res.status(403).json({ error: 'You are not assigned to this job.' });
  }
  if ((job as any).status === 'cancelled') return res.status(410).json({ error: 'This job has been cancelled.' });

  const base64Data = (photoBase64 as string).replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const ext = (filename as string | undefined)?.split('.').pop()?.toLowerCase() ?? 'jpg';
  const CONTENT_TYPES: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/avi',
  };
  const contentType = CONTENT_TYPES[ext] ?? 'image/jpeg';
  const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await admin.storage.from('cleaning-photos').upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) return res.status(500).json({ error: error.message });

  const { data: { publicUrl } } = admin.storage.from('cleaning-photos').getPublicUrl(path);
  return res.status(200).json({ url: publicUrl });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningAccept(body: any, res: VercelResponse) {
  const { combined } = body;
  const colonIdx = (combined as string).indexOf(':');
  const jobId = combined.slice(0, colonIdx);
  const token = combined.slice(colonIdx + 1);

  const supabase = getSupabase();
  const { data: row } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).single();
  if (!row) return res.status(404).json({ error: 'Job not found.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (row.dispatch_tokens ?? {}) as Record<string, any>;
  const cleanerInfo = tokens[token];
  if (!cleanerInfo) return res.status(401).json({ error: 'Invalid or expired link.' });

  if (row.status === 'accepted' || row.status === 'in_progress' || row.status === 'completed') {
    if (row.assigned_cleaner_id === cleanerInfo.cleanerId) {
      // This cleaner already accepted — return success so they see the portal
      return res.status(200).json({ alreadyAccepted: true });
    }
    return res.status(409).json({ error: 'Sorry — this job was already claimed by another cleaner.' });
  }

  if (row.status === 'cancelled') {
    return res.status(410).json({ error: 'This job has been cancelled.' });
  }

  const now = new Date().toISOString();
  const { data: claimed, error } = await supabase.from('cleaning_jobs').update({
    status: 'accepted',
    assigned_cleaner_id: cleanerInfo.cleanerId,
    assigned_cleaner_name: cleanerInfo.cleanerName,
    cleaner_payout: cleanerInfo.payout ?? 0,
    accepted_at: now,
    updated_at: now,
  }).eq('id', jobId).in('status', ['dispatched', 'pending']).select('id');

  if (error) return res.status(500).json({ error: error.message });
  if (!claimed?.length) return res.status(409).json({ error: 'Sorry — this job was just claimed by another cleaner.' });

  // Notify admin
  const _acceptSubj = `✅ ${cleanerInfo.cleanerName} accepted: ${row.property_name}`;
  const _acr = await (await getResend()).emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: ADMIN_EMAIL,
    subject: _acceptSubj,
    html: `<div style="font-family:sans-serif;padding:24px"><p><strong>${cleanerInfo.cleanerName}</strong> accepted the cleaning job for <strong>${row.property_name}</strong> on ${new Date(row.checkout_date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}.</p></div>`,
  }).catch(() => null);
  if (emailId(_acr)) await logEmail(emailId(_acr)!, 'cleaning-accept', ADMIN_EMAIL, _acceptSubj, jobId, 'Admin');

  return res.status(200).json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningSubmit(body: any, res: VercelResponse) {
  const { combined, checklist, photos, damageNotes, damageMedia, suppliesNotes } = body;
  const crmUrl = APP_URL;
  const colonIdx = (combined as string).indexOf(':');
  const jobId = combined.slice(0, colonIdx);
  const token = combined.slice(colonIdx + 1);

  const supabase = getSupabase();
  const { data: row } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).single();
  if (!row) return res.status(404).json({ error: 'Job not found.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (row.dispatch_tokens ?? {}) as Record<string, any>;
  const cleanerInfo = tokens[token];
  if (!cleanerInfo) return res.status(401).json({ error: 'Invalid link.' });
  if (row.assigned_cleaner_id !== cleanerInfo.cleanerId) return res.status(403).json({ error: 'You are not assigned to this job.' });
  if (row.status === 'cancelled') return res.status(410).json({ error: 'This job has been cancelled.' });

  const now = new Date().toISOString();
  const portalData = { checklist, photos: photos ?? [], damageNotes: damageNotes ?? '', damageMedia: damageMedia ?? [], suppliesNotes: suppliesNotes ?? '', submittedAt: now };

  const payoutDueAt = payoutDueFrom(now);
  await supabase.from('cleaning_jobs').update({
    status: 'completed',
    completed_at: now,
    updated_at: now,
    portal_data: portalData,
    ...(row.payout_sent_at ? {} : { payout_due_at: row.payout_due_at ?? payoutDueAt }),
  }).eq('id', jobId);

  // Charge the client now that the report is in (idempotent). The cleaner's
  // payout is scheduled for payoutDueAt and sent by the daily run.
  const charge = await chargeJob(supabase, await getStripe(), jobId, { trigger: 'submit' })
    .catch(e => ({ ok: false as const, error: (e as Error).message ?? 'Unexpected error' } as Awaited<ReturnType<typeof chargeJob>>));

  const dateLabel = new Date(row.checkout_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const photoCount = (photos ?? []).length;
  const damageMediaArr = (damageMedia ?? []) as string[];
  const checklistDone = Object.values(checklist as Record<string, boolean>).filter(Boolean).length;
  const checklistTotal = Object.keys(checklist as Record<string, boolean>).length;

  const payoutNote = row.payout_sent_at
    ? 'Cleaner already paid'
    : `Cleaner payout scheduled for ${new Date(row.payout_due_at ?? payoutDueAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} (sends automatically)`;
  const paymentLine = charge.reason === 'external_billing'
    ? `🧾 <strong>Client billed outside Stripe</strong> — invoice them $${charge.amount ?? row.cleaning_fee}${payoutNote ? ` · ${payoutNote}` : ''}`
    : charge.ok
      ? `💳 <strong>$${charge.amount ?? row.cleaning_fee} charged</strong> to client automatically${payoutNote ? ` · ${payoutNote}` : ''}`
      : `⚠️ <strong>Auto-charge failed:</strong> ${escapeHtml(charge.error ?? 'unknown error')}${charge.willRetryAt ? ' — will retry automatically' : ' — retry from the CRM'}`;

  const hasDamage = !!(damageNotes?.trim() || damageMediaArr.length > 0);
  const hasSuppliesNeeded = !!suppliesNotes?.trim();

  // Tell the client the turnover is done (once). If the card was charged this
  // doubles as the receipt; otherwise the Stripe webhook won't send a second one
  // because receipt_sent_at is set here.
  let clientNotified = false;
  if (!row.receipt_sent_at) {
    let config = (await supabase.from('cleaning_property_configs').select('*').eq('property_id', row.property_id).maybeSingle()).data;
    if (!config) config = (await supabase.from('cleaning_property_configs').select('*').contains('linked_property_ids', [row.property_id]).maybeSingle()).data;
    if (config?.client_email) {
      const paymentNote = charge.reason === 'external_billing' ? 'This clean will appear on your next invoice from E&J Retreats.'
        : charge.ok ? null
        : charge.willRetryAt ? 'Your card on file could not be charged yet; we will retry automatically.'
        : charge.reason === 'already_charged' ? null
        : 'We will follow up separately about payment.';
      try {
        const sent = await sendClientReceiptEmail(await getResend(), {
          to: config.client_email, clientName: config.client_name, propertyName: row.property_name, checkoutDate: row.checkout_date,
          amount: charge.ok && !charge.skipped ? Number(charge.amount ?? row.cleaning_fee) : 0,
          photos: photos ?? [], checklistDone, checklistTotal, paymentNote,
        });
        await supabase.from('cleaning_jobs').update({ receipt_sent_at: now }).eq('id', jobId);
        if (sent.id) await logEmail(sent.id, 'cleaning-client-complete', config.client_email, sent.subject, jobId, config.client_name ?? undefined);
        clientNotified = true;
      } catch (e) {
        console.error('Client clean-complete email failed:', e);
      }
    }
  }

  const _submitSubj = `${charge.ok || charge.reason === 'external_billing' ? '✅' : '⚠️'} Job submitted: ${row.property_name} – ${cleanerInfo.cleanerName}`;
  const _sr = await (await getResend()).emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: ADMIN_EMAIL,
    subject: _submitSubj,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">🧹 Cleaning Job Submitted</h2>
        <p><strong>${cleanerInfo.cleanerName}</strong> has submitted the cleaning for <strong>${row.property_name}</strong> (${dateLabel}).</p>
        <p>✅ Checklist: ${checklistDone}/${checklistTotal} items completed<br>
           📸 Cleaning photos: ${photoCount}<br>
           ${suppliesNotes ? `📦 Supplies needed: ${escapeHtml(suppliesNotes)}<br>` : ''}
           ${damageNotes ? `⚠️ Damage notes: ${escapeHtml(damageNotes)}<br>` : ''}
           ${damageMediaArr.length ? `📸 Damage photos/videos: ${damageMediaArr.length}<br>` : ''}
           ${paymentLine}<br>
           ${clientNotified ? '📧 Client emailed: clean complete' + (charge.ok ? ' + receipt' : '') : '📧 Client not emailed (no client email on the property)'}
        </p>
        <p><a href="${crmUrl}" style="color:#0f766e">→ View in CRM (Jobs tab)</a></p>
        ${photoCount > 0 ? `<div><p style="font-weight:bold;margin-bottom:4px">Cleaning Photos</p>${(photos as string[]).map((url: string) => `<img src="${url}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;margin:4px" />`).join('')}</div>` : ''}
        ${damageMediaArr.length > 0 ? `<div style="margin-top:12px"><p style="font-weight:bold;color:#dc2626;margin-bottom:4px">⚠️ Damage Photos/Videos</p>${damageMediaArr.map((url: string) => url.match(/\.(mp4|mov|webm)$/i) ? `<a href="${url}" style="display:inline-block;margin:4px;padding:8px 12px;background:#fee2e2;border-radius:6px;color:#dc2626;text-decoration:none;font-size:12px">▶ View Video</a>` : `<img src="${url}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;margin:4px;border:2px solid #dc2626" />`).join('')}</div>` : ''}
      </div>
    `,
  }).catch(() => null);
  if (emailId(_sr)) await logEmail(emailId(_sr)!, 'cleaning-submit', ADMIN_EMAIL, _submitSubj, jobId, 'Admin');

  // Send a separate urgent damage alert if cleaner reported damage
  if (hasDamage) {
    const _dmgSubj = `🚨 DAMAGE REPORTED: ${row.property_name} – ${cleanerInfo.cleanerName}`;
    const _dr = await (await getResend()).emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: ADMIN_EMAIL,
      subject: _dmgSubj,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:12px;padding:16px 20px;margin-bottom:20px">
            <h2 style="color:#dc2626;margin:0 0 8px">🚨 Damage Reported</h2>
            <p style="margin:0;color:#7f1d1d;font-size:15px">
              <strong>${cleanerInfo.cleanerName}</strong> reported damage at <strong>${row.property_name}</strong> on ${dateLabel}.
            </p>
          </div>
          ${damageNotes ? `
          <div style="margin-bottom:20px">
            <p style="font-weight:bold;color:#374151;margin-bottom:6px">Damage Notes:</p>
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;color:#7c2d12;white-space:pre-wrap;font-size:14px">${escapeHtml(damageNotes)}</div>
          </div>` : ''}
          ${damageMediaArr.length > 0 ? `
          <div style="margin-bottom:20px">
            <p style="font-weight:bold;color:#374151;margin-bottom:8px">Damage Photos/Videos (${damageMediaArr.length}):</p>
            <div>
              ${damageMediaArr.map((url: string, idx: number) =>
                url.match(/\.(mp4|mov|webm)$/i) || url.startsWith('data:video')
                  ? `<a href="${url}" style="display:inline-block;margin:4px;padding:10px 16px;background:#fee2e2;border:2px solid #dc2626;border-radius:8px;color:#dc2626;text-decoration:none;font-weight:bold;font-size:13px">▶ Download Video ${idx + 1}</a>`
                  : `<a href="${url}" download="damage-${idx + 1}.jpg" style="display:inline-block;margin:4px"><img src="${url}" alt="Damage ${idx + 1}" style="width:160px;height:120px;object-fit:cover;border-radius:8px;border:2px solid #dc2626" /></a>`
              ).join('')}
            </div>
            <p style="font-size:12px;color:#6b7280;margin-top:8px">Right-click any photo to save it. Videos open in a new tab.</p>
          </div>` : ''}
          <p style="margin-top:24px">
            <a href="${crmUrl}" style="display:inline-block;background:#dc2626;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
              → View Full Cleaning Report in CRM
            </a>
          </p>
          <p style="font-size:12px;color:#9ca3af;margin-top:16px">Job: ${row.property_name} · ${dateLabel} · Cleaner: ${cleanerInfo.cleanerName}</p>
        </div>
      `,
    }).catch(() => null);
    if (emailId(_dr)) await logEmail(emailId(_dr)!, 'cleaning-damage-alert', ADMIN_EMAIL, _dmgSubj, jobId, 'Admin');
  }

  if (hasSuppliesNeeded) {
    const _supSubj = `📦 Supplies Needed: ${row.property_name} – ${cleanerInfo.cleanerName}`;
    const _sr2 = await (await getResend()).emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: ADMIN_EMAIL,
      subject: _supSubj,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;padding:16px 20px;margin-bottom:20px">
            <h2 style="color:#b45309;margin:0 0 8px">📦 Supplies Needed</h2>
            <p style="margin:0;color:#78350f;font-size:15px">
              <strong>${cleanerInfo.cleanerName}</strong> noted low/needed supplies at <strong>${row.property_name}</strong> on ${dateLabel}.
            </p>
          </div>
          <div style="margin-bottom:20px">
            <p style="font-weight:bold;color:#374151;margin-bottom:6px">Supplies Notes:</p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;color:#78350f;white-space:pre-wrap;font-size:14px">${escapeHtml(suppliesNotes)}</div>
          </div>
          <p style="margin-top:24px">
            <a href="${crmUrl}" style="display:inline-block;background:#f59e0b;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
              → View in CRM
            </a>
          </p>
          <p style="font-size:12px;color:#9ca3af;margin-top:16px">Job: ${row.property_name} · ${dateLabel} · Cleaner: ${cleanerInfo.cleanerName}</p>
        </div>
      `,
    }).catch(() => null);
    if (emailId(_sr2)) await logEmail(emailId(_sr2)!, 'cleaning-supplies-alert', ADMIN_EMAIL, _supSubj, jobId, 'Admin');
  }

  return res.status(200).json({ success: true });
}

// ── CLEANER STRIPE CONNECT ────────────────────────────────────────────────────

async function cleanerSendPortalLink(body: any, res: VercelResponse) {
  const { cleanerId } = body;
  if (!cleanerId) return res.status(400).json({ error: 'cleanerId required.' });

  const supabase = getSupabase();
  const { data: cleaner } = await supabase.from('cleaners').select('id, name, email, dashboard_token').eq('id', cleanerId).single();
  if (!cleaner?.email) return res.status(404).json({ error: 'Cleaner not found.' });

  let dashToken: string = cleaner.dashboard_token;
  if (!dashToken) {
    const { randomUUID } = await import('crypto');
    dashToken = randomUUID();
    await supabase.from('cleaners').update({ dashboard_token: dashToken }).eq('id', cleanerId);
  }

  const nameSlug = cleaner.name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const portalUrl = `${APP_URL}/cleaner?cleaner-dashboard=${nameSlug}:${cleanerId}:${dashToken}`;
  const firstName = cleaner.name.split(' ')[0];
  const portalAppName = `${cleaner.name} Cleaner Portal`;

  const portalSubject = `Your ${portalAppName} — Save it to your phone!`;
  const _plr = await (await getResend()).emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: cleaner.email,
    subject: portalSubject,
    html: `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc">
        <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
          <h2 style="color:#1e40af;margin:0 0 20px;font-size:22px">📱 Your Cleaner Portal</h2>

          <p style="color:#334155;margin:0 0 16px">Hi ${firstName},</p>
          <p style="color:#334155;margin:0 0 24px">Here is your personal E&amp;J Retreats Cleaner Portal. This is where you'll see your upcoming jobs, accept new assignments, and track your pay. Save it to your phone's home screen so you can open it with one tap — just like any other app.</p>

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:0 0 28px;text-align:center">
            <p style="margin:0 0 6px;font-size:13px;color:#1e40af;font-weight:700;letter-spacing:0.05em">YOUR CLEANER PORTAL</p>
            <a href="${portalUrl}" style="display:inline-block;background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin:8px 0">${portalAppName}</a>
            <p style="margin:10px 0 0;font-size:11px;color:#64748b;word-break:break-all">${portalUrl}</p>
          </div>

          <p style="color:#1e293b;font-weight:700;font-size:15px;margin:0 0 12px">How to save it as an app on your phone</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:0 0 16px">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a">🍎 iPhone (Safari)</p>
            <ol style="margin:0;padding-left:20px;color:#334155;font-size:13px;line-height:2">
              <li>Open the link above in <strong>Safari</strong> (not Chrome)</li>
              <li>Tap the <strong>Share button</strong> <span style="background:#e2e8f0;padding:1px 5px;border-radius:4px;font-size:12px">⬆</span> at the bottom of the screen</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li>Set the name to <strong>${portalAppName}</strong></li>
              <li>Tap <strong>"Add"</strong> in the top right corner</li>
            </ol>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:0 0 24px">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a">🤖 Android (Chrome)</p>
            <ol style="margin:0;padding-left:20px;color:#334155;font-size:13px;line-height:2">
              <li>Open the link above in <strong>Chrome</strong></li>
              <li>Tap the <strong>three dots menu</strong> <span style="background:#e2e8f0;padding:1px 5px;border-radius:4px;font-size:12px">⋮</span> in the top right</li>
              <li>Tap <strong>"Add to Home screen"</strong></li>
              <li>Set the name to <strong>${portalAppName}</strong></li>
              <li>Tap <strong>"Add"</strong></li>
            </ol>
          </div>

          <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center">Questions? Contact E&amp;J Retreats anytime.<br>— E&amp;J Retreats</p>
        </div>
      </div>
    `,
  });
  if (emailId(_plr)) await logEmail(emailId(_plr)!, 'cleaning-portal', cleaner.email, portalSubject, cleanerId, cleaner.name);

  return res.status(200).json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanerBroadcastResetup(_body: any, res: VercelResponse) {
  const supabase = getSupabase();
  const { data: cleaners } = await supabase
    .from('cleaners')
    .select('id, name, email, dashboard_token')
    .eq('status', 'active');

  if (!cleaners?.length) return res.status(200).json({ sent: 0 });

  const resend = await getResend();
  const { randomUUID } = await import('crypto');
  let sent = 0;

  for (const cleaner of cleaners) {
    if (!cleaner.email) continue;

    // Generate a token on the fly if this cleaner doesn't have one yet
    let dashToken: string = cleaner.dashboard_token;
    if (!dashToken) {
      dashToken = randomUUID();
      await supabase.from('cleaners').update({ dashboard_token: dashToken }).eq('id', cleaner.id);
    }

    const nameSlug = cleaner.name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const portalUrl = `${APP_URL}/cleaner?cleaner-dashboard=${nameSlug}:${cleaner.id}:${dashToken}`;
    const firstName = cleaner.name.split(' ')[0];
    const portalAppName = `${cleaner.name} Cleaner Portal`;
    const subject = `Action needed: Re-save your Cleaner Portal app`;

    const _r = await resend.emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: cleaner.email,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc">
          <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
            <h2 style="color:#dc2626;margin:0 0 16px;font-size:20px">📱 Important: Please Re-Save Your App</h2>

            <p style="color:#334155;margin:0 0 12px">Hi ${firstName},</p>
            <p style="color:#334155;margin:0 0 16px">We recently fixed an issue with the Cleaner Portal app on your phone's home screen. If you previously saved the portal as a shortcut, <strong>it may be opening the wrong page</strong>. Please follow the steps below to remove the old shortcut and re-save it correctly — it only takes about 30 seconds.</p>

            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 24px">
              <p style="margin:0 0 8px;font-weight:700;color:#991b1b;font-size:14px">Step 1 — Delete the old shortcut from your home screen</p>
              <p style="margin:0;color:#7f1d1d;font-size:13px">Press and hold the <strong>${portalAppName}</strong> icon on your home screen, then delete or remove it.</p>
            </div>

            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:0 0 24px;text-align:center">
              <p style="margin:0 0 6px;font-size:13px;color:#1e40af;font-weight:700;letter-spacing:0.05em">Step 2 — Open your portal from this link</p>
              <a href="${portalUrl}" style="display:inline-block;background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin:8px 0">${portalAppName}</a>
              <p style="margin:10px 0 0;font-size:11px;color:#64748b;word-break:break-all">${portalUrl}</p>
            </div>

            <p style="color:#1e293b;font-weight:700;font-size:15px;margin:0 0 12px">Step 3 — Re-save it to your home screen</p>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:0 0 16px">
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a">🍎 iPhone (Safari)</p>
              <ol style="margin:0;padding-left:20px;color:#334155;font-size:13px;line-height:2">
                <li>Open the link above in <strong>Safari</strong> (not Chrome)</li>
                <li>Tap the <strong>Share button</strong> <span style="background:#e2e8f0;padding:1px 5px;border-radius:4px;font-size:12px">⬆</span> at the bottom</li>
                <li>Tap <strong>"Add to Home Screen"</strong></li>
                <li>Set the name to <strong>${portalAppName}</strong> and tap <strong>Add</strong></li>
              </ol>
            </div>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin:0 0 24px">
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f172a">🤖 Android (Chrome)</p>
              <ol style="margin:0;padding-left:20px;color:#334155;font-size:13px;line-height:2">
                <li>Open the link above in <strong>Chrome</strong></li>
                <li>Tap the <strong>three dots menu</strong> <span style="background:#e2e8f0;padding:1px 5px;border-radius:4px;font-size:12px">⋮</span> in the top right</li>
                <li>Tap <strong>"Add to Home screen"</strong></li>
                <li>Set the name to <strong>${portalAppName}</strong> and tap <strong>Add</strong></li>
              </ol>
            </div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:0 0 20px">
              <p style="margin:0;color:#166534;font-size:13px">Once saved, the new shortcut will open <strong>only your personal dashboard</strong> — not the full CRM. Everything else works the same as before.</p>
            </div>

            <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center">Questions? Contact E&amp;J Retreats anytime.<br>— E&amp;J Retreats</p>
          </div>
        </div>
      `,
    }).catch(() => null);

    const emailId = _r?.data?.id ?? (_r as any)?.id;
    if (emailId) {
      await logEmail(emailId, 'cleaning-portal-resetup', cleaner.email, subject, cleaner.id, cleaner.name);
    }
    if (_r && !_r.error) sent++;
  }

  return res.status(200).json({ sent });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * Stripe Connect onboarding link for a cleaner. Reuses the existing Express
 * account and connect token so links in earlier emails keep working.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureConnectLink(supabase: any, cleaner: any): Promise<{ link: string; stripeAccountId: string; token: string }> {
  const stripe = await getStripe();
  let stripeAccountId: string = cleaner.stripe_account_id ?? '';
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: cleaner.email,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { cleaner_id: cleaner.id, cleaner_name: cleaner.name },
    });
    stripeAccountId = account.id;
  }
  const token: string = cleaner.connect_token || randomUUID();
  const patch: Record<string, unknown> = { stripe_account_id: stripeAccountId, connect_token: token };
  if (cleaner.stripe_connect_status !== 'active') patch.stripe_connect_status = 'pending';
  const { error } = await supabase.from('cleaners').update(patch).eq('id', cleaner.id);
  if (error) throw new Error(`DB update failed: ${error.message}`);
  return { link: `${APP_URL}?cleaner-setup=${cleaner.id}:${token}`, stripeAccountId, token };
}

async function cleanerConnectSend(body: any, res: VercelResponse) {
  const { cleanerId, appUrl, sendEmail } = body;
  if (!cleanerId) return res.status(400).json({ error: 'cleanerId required.' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured in environment variables.' });
  }

  const supabase = getSupabase();
  const { data: cleaner, error: dbErr } = await supabase.from('cleaners').select('*').eq('id', cleanerId).single();
  if (dbErr || !cleaner) return res.status(404).json({ error: `Cleaner not found: ${dbErr?.message ?? 'unknown'}` });

  try {
    const { link } = await ensureConnectLink(supabase, cleaner);

    if (sendEmail) {
      const stripeEmailSubj = 'Set up your Stripe account to receive cleaning payouts';
      const _ser = await (await getResend()).emails.send({
        from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
        to: cleaner.email,
        subject: stripeEmailSubj,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
            <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
              <h2 style="color:#1e40af;margin:0 0 16px">💳 Set Up Your Stripe Account</h2>
              <p style="color:#334155">Hi ${cleaner.name.split(' ')[0]},</p>
              <p style="color:#334155">E&amp;J Retreats uses Stripe to send your cleaning payouts directly to your bank account. Setup takes about 5 minutes.</p>
              <ul style="color:#334155;font-size:14px;line-height:1.8">
                <li>Connect your bank account for direct deposit</li>
                <li>Payouts sent automatically after each completed cleaning</li>
                <li>Secure &amp; encrypted — powered by Stripe</li>
              </ul>
              <p style="margin:28px 0;text-align:center">
                <a href="${link}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
                  Set Up Stripe Payouts
                </a>
              </p>
              <p style="color:#94a3b8;font-size:12px;text-align:center">This link is personal to you. — E&amp;J Retreats</p>
            </div>
          </div>
        `,
      }).catch(() => null);
      if (emailId(_ser)) await logEmail(emailId(_ser)!, 'cleaning-stripe', cleaner.email, stripeEmailSubj, cleanerId, cleaner.name);
    }

    return res.status(200).json({ link });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error('cleanerConnectSend stripe error:', msg);
    return res.status(500).json({ error: `Stripe error: ${msg}` });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanerConnectUrl(body: any, res: VercelResponse) {
  const { combined, appUrl } = body;
  const colonIdx = (combined as string).indexOf(':');
  const cleanerId = combined.slice(0, colonIdx);
  const token = combined.slice(colonIdx + 1);

  const supabase = getSupabase();
  const { data: cleaner } = await supabase.from('cleaners').select('*').eq('id', cleanerId).single();
  if (!cleaner) return res.status(404).json({ error: 'Invalid link.' });
  if (cleaner.connect_token !== token) return res.status(401).json({ error: 'Invalid or expired link.' });
  if (!cleaner.stripe_account_id) return res.status(400).json({ error: 'No Stripe account found. Contact E&J Retreats.' });

  const stripe = await getStripe();
  const base = APP_URL;

  const accountLink = await stripe.accountLinks.create({
    account: cleaner.stripe_account_id,
    type: 'account_onboarding',
    return_url: `${base}?cleaner-connected=${cleanerId}:${token}`,
    refresh_url: `${base}?cleaner-setup=${cleanerId}:${token}`,
  });

  return res.status(200).json({ url: accountLink.url, cleanerName: cleaner.name ?? '' });
}

async function cleanerConnectVerify(combined: string, res: VercelResponse) {
  const colonIdx = combined.indexOf(':');
  const cleanerId = combined.slice(0, colonIdx);
  const token = combined.slice(colonIdx + 1);

  const supabase = getSupabase();
  const { data: cleaner } = await supabase.from('cleaners').select('*').eq('id', cleanerId).single();
  if (!cleaner) return res.status(404).json({ error: 'Invalid link.' });
  if (cleaner.connect_token !== token) return res.status(401).json({ error: 'Invalid or expired link.' });
  if (!cleaner.stripe_account_id) return res.status(400).json({ error: 'No Stripe account associated.' });

  const stripe = await getStripe();
  const account = await stripe.accounts.retrieve(cleaner.stripe_account_id);

  if (account.details_submitted && cleaner.stripe_connect_status !== 'active') {
    let dashToken: string = cleaner.dashboard_token;
    if (!dashToken) {
      const { randomUUID } = await import('crypto');
      dashToken = randomUUID();
    }
    await supabase.from('cleaners').update({ stripe_connect_status: 'active', dashboard_token: dashToken }).eq('id', cleanerId);
    await maybeActivateCleaner(supabase, cleanerId);

    // Portal link + save-as-app instructions (shared with the Stripe webhook path)
    try {
      const sent = await sendCleanerPortalEmail(await getResend(), { ...cleaner, dashboard_token: dashToken }, dashToken);
      if (sent.id) await logEmail(sent.id, 'cleaning-portal', cleaner.email, sent.subject, cleanerId, cleaner.name);
    } catch (err) {
      console.error('[cleaner-connect] portal email failed:', (err as Error).message);
    }

    // Notify admin
    const _stripeAdminSubj = `✅ Stripe connected: ${cleaner.name}`;
    const _sar = await (await getResend()).emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: ADMIN_EMAIL,
      subject: _stripeAdminSubj,
      html: `<div style="font-family:sans-serif;padding:24px"><p><strong>${cleaner.name}</strong> has connected their Stripe account (${cleaner.stripe_account_id}) and is ready to receive payouts.</p></div>`,
    }).catch(() => null);
    if (emailId(_sar)) await logEmail(emailId(_sar)!, 'cleaning-stripe', ADMIN_EMAIL, _stripeAdminSubj, cleanerId, 'Admin');
  }

  return res.status(200).json({
    name: cleaner.name,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
  });
}

// ── CLEANING CLIENT ONBOARDING ────────────────────────────────────────────────

let _stripeInstance: any = null;
async function getStripe() {
  if (!_stripeInstance) {
    const { default: Stripe } = await import('stripe');
    _stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripeInstance as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningClientGet(token: string, res: VercelResponse) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cleaning_client_onboarding')
    .select('*')
    .eq('token', token)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Invalid or expired link.' });
  if (new Date(data.expires_at) < new Date()) return res.status(410).json({ error: 'This onboarding link has expired.' });
  const configIds: string[] = data.property_config_ids ?? (data.property_config_id ? [data.property_config_id] : []);
  const { data: cfgs } = configIds.length ? await supabase.from('cleaning_property_configs').select('id, property_name, cleaning_fee').in('id', configIds) : { data: [] };
  const properties = configIds.map((id: string) => {
    const c = (cfgs ?? []).find((x: any) => x.id === id);
    return { id, name: c?.property_name ?? '', fee: Number(c?.cleaning_fee ?? 0) };
  });
  return res.status(200).json({
    id: data.id,
    propertyConfigId: configIds[0] ?? data.property_config_id,
    propertyConfigIds: configIds,
    propertyName: data.property_name,
    clientName: data.client_name,
    clientEmail: data.client_email,
    status: data.status,
    properties,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningClientSend(body: any, res: VercelResponse) {
  try {
    // Support batch (propertyConfigIds[]) and legacy single (propertyConfigId)
    const propertyConfigIds: string[] = body.propertyConfigIds ??
      (body.propertyConfigId ? [body.propertyConfigId] : []);
    const propertyNames: string[] = body.propertyNames ??
      (body.propertyName ? [body.propertyName] : []);
    const { clientName, clientEmail, appUrl, copyOnly } = body;

    if (!clientEmail || !propertyConfigIds.length) {
      return res.status(400).json({ error: 'clientEmail and propertyConfigIds are required.' });
    }

    const supabase = getSupabase();
    const token = randomUUID();
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const propertyNamesStr = propertyNames.join(', ');

    const { error } = await supabase.from('cleaning_client_onboarding').insert({
      id, token,
      property_config_id: propertyConfigIds[0],
      property_config_ids: propertyConfigIds,
      property_name: propertyNamesStr,
      client_name: clientName ?? null,
      client_email: clientEmail,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
    if (error) return res.status(500).json({ error: error.message });

    const base = APP_URL;
    const link = `${base}?cleaning-onboard=${token}`;

    if (copyOnly) {
      return res.status(200).json({ id, token, link });
    }

    const isMulti = propertyNames.length > 1;
    const subjectLabel = isMulti ? `${propertyNames.length} properties` : propertyNamesStr;
    const propListHtml = isMulti
      ? `<ul style="color:#334155;font-size:14px;margin:8px 0 16px;padding-left:20px">${propertyNames.map(n => `<li>${n}</li>`).join('')}</ul>`
      : `<p style="color:#334155">Your property <strong>${propertyNamesStr}</strong> is enrolled in E&amp;J Retreats' professional cleaning service.</p>`;

    try {
      const clientOnboardSubj = `Action required: Set up cleaning service for ${subjectLabel}`;
      const _cor = await (await getResend()).emails.send({
        from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
        to: clientEmail,
        subject: clientOnboardSubj,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
            <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
              <h2 style="color:#1e40af;margin:0 0 16px">🏠 Cleaning Service Setup</h2>
              <p style="color:#334155">Hi ${clientName ?? 'there'},</p>
              ${isMulti ? `<p style="color:#334155">The following ${propertyNames.length} properties are enrolled in E&amp;J Retreats' professional cleaning service. To activate, please review our service agreement and add a payment method on file.</p>${propListHtml}` : propListHtml}
              <ul style="color:#334155;font-size:14px;line-height:1.8">
                <li>Professional cleaning after every guest checkout</li>
                <li>Charged automatically — only after each completed cleaning</li>
                <li>Photo report submitted by cleaner after every job</li>
              </ul>
              <p style="margin:28px 0;text-align:center">
                <a href="${link}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
                  Complete Setup
                </a>
              </p>
              <p style="color:#94a3b8;font-size:12px;text-align:center">Link expires in 30 days. You will not be charged until a cleaning is completed.&nbsp;&mdash;&nbsp;E&amp;J Retreats</p>
            </div>
          </div>
        `,
      });
      if (emailId(_cor)) await logEmail(emailId(_cor)!, 'cleaning-client', clientEmail, clientOnboardSubj, id, clientName ?? undefined);
    } catch (emailErr) {
      console.error('Resend email failed:', emailErr);
      // Still return the link even if email fails
      return res.status(200).json({ id, token, link, emailError: 'Email could not be sent, but link was created.' });
    }

    return res.status(200).json({ id, token, link });
  } catch (err) {
    console.error('cleaningClientSend error:', err);
    try {
      if (!res.headersSent) return res.status(500).json({ error: 'An unexpected error occurred.' });
    } catch {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningClientSetupIntent(body: any, res: VercelResponse) {
  const { token } = body;
  const supabase = getSupabase();

  const { data: record } = await supabase.from('cleaning_client_onboarding').select('*').eq('token', token).single();
  if (!record) return res.status(404).json({ error: 'Invalid link.' });
  if (new Date(record.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired.' });

  const allConfigIds: string[] = record.property_config_ids ?? (record.property_config_id ? [record.property_config_id] : []);
  const primaryConfigId: string = allConfigIds[0] ?? record.property_config_id;

  const stripe = await getStripe();
  const { data: config } = await supabase
    .from('cleaning_property_configs')
    .select('stripe_customer_id')
    .eq('id', primaryConfigId)
    .single();

  let customerId: string = config?.stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: record.client_name ?? '',
      email: record.client_email ?? '',
      metadata: { property_config_id: primaryConfigId, property_name: record.property_name },
    });
    customerId = customer.id;
    for (const configId of allConfigIds) {
      await supabase.from('cleaning_property_configs').update({
        stripe_customer_id: customerId,
        client_name: record.client_name,
        client_email: record.client_email,
      }).eq('id', configId);
    }
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    metadata: { property_config_id: primaryConfigId, token },
  });

  return res.status(200).json({ clientSecret: setupIntent.client_secret });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningClientConfirm(body: any, res: VercelResponse) {
  const { token, setupIntentId, consent } = body;
  if (!token || typeof setupIntentId !== 'string' || !setupIntentId.startsWith('seti_')) return res.status(400).json({ error: 'token and setupIntentId required.' });
  const supabase = getSupabase();

  const { data: record } = await supabase.from('cleaning_client_onboarding').select('*').eq('token', token).single();
  if (!record) return res.status(404).json({ error: 'Invalid link.' });
  if (record.status === 'completed') return res.status(200).json({ success: true, alreadyComplete: true });

  const stripe = await getStripe();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  if (setupIntent.status !== 'succeeded') return res.status(400).json({ error: 'Payment setup not completed.' });
  if (setupIntent.metadata?.token && setupIntent.metadata.token !== token) return res.status(400).json({ error: 'This card setup belongs to a different link.' });

  const pmId = typeof setupIntent.payment_method === 'string'
    ? setupIntent.payment_method
    : setupIntent.payment_method?.id ?? '';

  const now = new Date().toISOString();
  const confirmConfigIds: string[] = record.property_config_ids ?? (record.property_config_id ? [record.property_config_id] : []);
  for (const configId of confirmConfigIds) {
    await supabase.from('cleaning_property_configs').update({
      stripe_payment_method_id: pmId,
      client_name: record.client_name,
      client_email: record.client_email,
      onboarded_at: now,
    }).eq('id', configId);
  }

  await supabase.from('cleaning_client_onboarding').update({
    status: 'completed',
    completed_at: now,
    consent: {
      agreedAt: typeof consent?.agreedAt === 'string' ? consent.agreedAt : now,
      feesShown: Array.isArray(consent?.feesShown) ? consent.feesShown.slice(0, 50) : null,
      userAgent: typeof consent?.userAgent === 'string' ? consent.userAgent.slice(0, 300) : null,
      setupIntentId,
    },
  }).eq('token', token);

  await (await getResend()).emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: ADMIN_EMAIL,
    subject: `✅ Client onboarded: ${record.property_name}`,
    html: `<div style="font-family:sans-serif;padding:24px"><p><strong>${record.client_name ?? record.client_email}</strong> completed onboarding for <strong>${record.property_name}</strong>. Card is on file and ready to charge after each cleaning.</p></div>`,
  }).catch(() => {});

  return res.status(200).json({ success: true });
}

// ── CLEANING CLIENT PROPERTY ENROLLMENT (client fills in property details) ────
// The client never sees or sets the cleaning fee — it's set in the CRM after submit.

const ENROLL_ICAL = z.object({
  platform: z.string().trim().max(40).default('Other'),
  url: z.string().trim().url().max(2000),
  unitName: z.string().trim().max(80).optional(),
});

const ENROLL_PROPERTY = z.object({
  propertyName:      z.string().trim().min(1, 'Property name is required').max(120),
  address:           z.string().trim().min(1, 'Address is required').max(300),
  bedrooms:          z.string().trim().max(10).optional(),
  bathrooms:         z.string().trim().max(10).optional(),
  doorCode:          z.string().trim().min(1, 'Door / lock code is required').max(60),
  entryInstructions: z.string().trim().max(1000).optional(),
  checkoutTime:      z.string().trim().max(30).optional(),
  checkinTime:       z.string().trim().max(30).optional(),
  icalUrls:          z.array(ENROLL_ICAL).max(20).default([]),
  laundryOffsite:    z.boolean().default(false),
  laundromatAddress: z.string().trim().max(300).optional(),
  wifiName:          z.string().trim().max(120).optional(),
  wifiPassword:      z.string().trim().max(120).optional(),
  suppliesLocation:  z.string().trim().max(1000).optional(),
  trashInstructions: z.string().trim().max(1000).optional(),
  notes:             z.string().trim().max(2000).optional(),
});

const ENROLL_SUBMIT = z.object({
  token: z.string().min(1),
  client: z.object({
    name:  z.string().trim().min(1, 'Your name is required').max(120),
    email: z.string().trim().email('A valid email is required').max(200),
    phone: z.string().trim().max(40).optional(),
  }),
  properties: z.array(ENROLL_PROPERTY).min(1, 'Add at least one property').max(25),
});

type EnrollProperty = z.infer<typeof ENROLL_PROPERTY>;

function enrollmentNotes(p: EnrollProperty): string | null {
  const lines: string[] = [];
  if (p.bedrooms || p.bathrooms) lines.push(`Size: ${p.bedrooms ? `${p.bedrooms} bed` : ''}${p.bedrooms && p.bathrooms ? ' / ' : ''}${p.bathrooms ? `${p.bathrooms} bath` : ''}`);
  if (p.entryInstructions) lines.push(`Entry / parking: ${p.entryInstructions}`);
  if (p.wifiName || p.wifiPassword) lines.push(`WiFi: ${p.wifiName ?? ''}${p.wifiPassword ? ` / ${p.wifiPassword}` : ''}`);
  if (p.suppliesLocation) lines.push(`Supplies: ${p.suppliesLocation}`);
  if (p.trashInstructions) lines.push(`Trash: ${p.trashInstructions}`);
  if (p.notes) lines.push(`Notes: ${p.notes}`);
  return lines.length ? lines.join('\n') : null;
}

async function cleaningEnrollGet(token: string, res: VercelResponse) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cleaning_property_enrollments')
    .select('id, client_name, client_email, client_phone, status, expires_at, submitted_at')
    .eq('token', token)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Invalid or expired link.' });
  if (data.status !== 'submitted' && data.expires_at && new Date(data.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This enrollment link has expired. Please contact E&J Retreats for a new one.' });
  }
  return res.status(200).json({
    id: data.id,
    clientName: data.client_name,
    clientEmail: data.client_email,
    clientPhone: data.client_phone,
    status: data.status,
    submittedAt: data.submitted_at,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningEnrollCreateLink(body: any, res: VercelResponse) {
  try {
    const { clientName, clientEmail, clientPhone, appUrl, copyOnly } = body;
    if (!clientEmail || typeof clientEmail !== 'string') {
      return res.status(400).json({ error: 'clientEmail is required.' });
    }

    const supabase = getSupabase();
    const id = randomUUID();
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('cleaning_property_enrollments').insert({
      id, token,
      client_name: clientName ?? null,
      client_email: clientEmail,
      client_phone: clientPhone ?? null,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
    if (error) return res.status(500).json({ error: error.message });

    const base = APP_URL;
    const link = `${base}?cleaning-enroll=${token}`;

    if (copyOnly) return res.status(200).json({ id, token, link });

    try {
      const subject = 'E&J Retreats Cleaning — tell us about your property';
      const sent = await (await getResend()).emails.send({
        from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
        to: clientEmail,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
            <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
              <h2 style="color:#1e40af;margin:0 0 16px">🏠 Property Enrollment</h2>
              <p style="color:#334155">Hi ${clientName ?? 'there'},</p>
              <p style="color:#334155">Welcome to E&amp;J Retreats' cleaning service! To get your property set up, please fill out a short form with the details our cleaners need:</p>
              <ul style="color:#334155;font-size:14px;line-height:1.8">
                <li>Property address and door / lock code</li>
                <li>Guest check-in and check-out times</li>
                <li>Booking calendar (iCal) links so cleanings schedule automatically</li>
                <li>Laundry, supplies, trash and any special instructions</li>
              </ul>
              <p style="color:#334155">You can enroll more than one property in the same form.</p>
              <p style="margin:28px 0;text-align:center">
                <a href="${link}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
                  Enroll My Property
                </a>
              </p>
              <p style="color:#94a3b8;font-size:12px;text-align:center">Link expires in 30 days.&nbsp;&mdash;&nbsp;E&amp;J Retreats</p>
            </div>
          </div>
        `,
      });
      if (emailId(sent)) await logEmail(emailId(sent)!, 'cleaning-enroll', clientEmail, subject, id, clientName ?? undefined);
    } catch (emailErr) {
      console.error('Resend email failed:', emailErr);
      return res.status(200).json({ id, token, link, emailError: 'Email could not be sent, but link was created.' });
    }

    return res.status(200).json({ id, token, link });
  } catch (err) {
    console.error('cleaningEnrollCreateLink error:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningEnrollSubmit(body: any, res: VercelResponse) {
  const parsed = ENROLL_SUBMIT.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message ?? 'Please check the form and try again.' });
  }
  const { token, client, properties } = parsed.data;

  const supabase = getSupabase();
  const { data: record } = await supabase.from('cleaning_property_enrollments').select('*').eq('token', token).single();
  if (!record) return res.status(404).json({ error: 'Invalid link.' });
  if (record.status === 'submitted') return res.status(409).json({ error: 'This form has already been submitted.' });
  if (record.expires_at && new Date(record.expires_at) < new Date()) return res.status(410).json({ error: 'This link has expired.' });

  const now = new Date().toISOString();
  const createdIds: string[] = [];

  for (let i = 0; i < properties.length; i++) {
    const p = properties[i];
    const id = `cpc_${Date.now()}_${i}`;
    const row = {
      id,
      property_id: `enroll_${randomUUID().slice(0, 8)}`,
      property_name: p.propertyName,
      cleaning_fee: 0,                    // set by E&J in the CRM — never collected from the client
      assigned_cleaners: [],
      enrolled_at: now,
      client_name: client.name,
      client_email: client.email,
      client_phone: client.phone ?? null,
      address: p.address,
      door_code: p.doorCode,
      checkout_time: p.checkoutTime || null,
      checkin_time: p.checkinTime || null,
      ical_urls: p.icalUrls.map(u => ({ platform: u.platform || 'Other', url: u.url, ...(u.unitName ? { unitName: u.unitName } : {}) })),
      laundromat_address: p.laundryOffsite ? (p.laundromatAddress || 'Off-site (address not provided)') : null,
      client_notes: enrollmentNotes(p),
    };
    const { error } = await supabase.from('cleaning_property_configs').insert(row);
    if (error) {
      console.error('enrollment insert failed:', error);
      return res.status(500).json({ error: `Could not save property "${p.propertyName}": ${error.message}` });
    }
    createdIds.push(id);
  }

  // Combined flow: the card-setup link is created now so the client can add
  // their card on the next screen instead of waiting for a second email.
  let nextLink: string | null = null;
  try {
    const obId = randomUUID();
    const obToken = randomUUID();
    const { error: obErr } = await supabase.from('cleaning_client_onboarding').insert({
      id: obId, token: obToken,
      property_config_id: createdIds[0],
      property_config_ids: createdIds,
      property_name: properties.map(p => p.propertyName).join(', '),
      client_name: client.name,
      client_email: client.email,
      status: 'pending',
      created_at: now,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!obErr) nextLink = `${APP_URL}?cleaning-onboard=${obToken}`;
  } catch (e) { console.error('enroll → card link failed:', e); }

  await supabase.from('cleaning_property_enrollments').update({
    status: 'submitted',
    submitted_at: now,
    client_name: client.name,
    client_email: client.email,
    client_phone: client.phone ?? null,
    submission: { client, properties },
    property_config_ids: createdIds,
  }).eq('token', token);

  const summary = properties.map(p => `<li><strong>${escapeHtml(p.propertyName)}</strong> — ${escapeHtml(p.address)}</li>`).join('');
  await (await getResend()).emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: ADMIN_EMAIL,
    subject: `🏠 Property enrollment submitted: ${client.name} (${properties.length} propert${properties.length === 1 ? 'y' : 'ies'})`,
    html: `<div style="font-family:sans-serif;padding:24px">
      <p><strong>${escapeHtml(client.name)}</strong> (${escapeHtml(client.email)}${client.phone ? `, ${escapeHtml(client.phone)}` : ''}) submitted property details:</p>
      <ul>${summary}</ul>
      <p>The propert${properties.length === 1 ? 'y is' : 'ies are'} now in the Cleaning → Properties tab. <strong>Set the cleaning fee and assign cleaners</strong>, then send the payment setup link.</p>
    </div>`,
  }).catch(() => {});

  return res.status(200).json({ success: true, propertyConfigIds: createdIds, nextLink });
}

// ── CLEANING CHARGE & PAYOUT ──────────────────────────────────────────────────

// Manual retry endpoint — guards against double-charging
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningChargeAndPayout(body: any, res: VercelResponse) {
  const { jobId } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });
  // Admin-triggered: may charge a completed job even if the cleaner's report is missing.
  const outcome = await chargeJob(getSupabase(), await getStripe(), jobId, { trigger: 'manual', allowWithoutReport: true });
  if (outcome.skipped && outcome.reason === 'external_billing') {
    return res.status(200).json({ charged: false, external: true, amount: outcome.amount, message: 'This property is billed outside Stripe — nothing was charged. The cleaner payout goes out on its scheduled date (or use Pay cleaner now).' });
  }
  if (outcome.skipped && outcome.reason === 'already_charged') return res.status(400).json({ error: 'This job has already been charged.' });
  if (outcome.skipped) return res.status(400).json({ error: outcome.error ?? 'Job cannot be charged right now.' });
  if (!outcome.ok) return res.status(402).json({ error: outcome.error ?? 'Charge failed.', willRetryAt: outcome.willRetryAt ?? null });
  return res.status(200).json({ charged: true, paymentIntentId: outcome.paymentIntentId, amount: outcome.amount, warning: outcome.error ?? null });
}

// ── CONTENT STUDIO ───────────────────────────────────────────────────────────

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '25mb' } },
};

async function contentGenerate(body: any, res: VercelResponse) {
  const SlideSchema = z.object({
    slideNumber: z.number(),
    headline: z.string(),
    body: z.string(),
    emoji: z.string().optional(),
  });
  const ThreadTweetSchema = z.object({ tweetNumber: z.number(), text: z.string() });
  const ScriptSceneSchema = z.object({ scene: z.string(), text: z.string(), duration: z.string() });
  const ContentResultSchema = z.object({
    hook: z.string(),
    slides: z.array(SlideSchema).optional(),
    thread: z.array(ThreadTweetSchema).optional(),
    caption: z.string().optional(),
    script: z.array(ScriptSceneSchema).optional(),
    tweetCards: z.array(z.object({ text: z.string(), angle: z.string() })).optional(),
    hashtags: z.array(z.string()),
    cta: z.string(),
  });
  const { topic, platform, contentType, context: brandContext } = body as {
    topic: string;
    platform: string;
    contentType: string;
    context?: string;
  };

  if (!topic || !platform || !contentType) {
    return res.status(400).json({ error: 'topic, platform, and contentType are required.' });
  }

  const platformGuide: Record<string, string> = {
    instagram: 'Instagram (square format, casual yet professional, heavy emoji use, strong CTA to follow/save)',
    twitter: 'X / Twitter (concise, punchy, conversational, max 280 chars per tweet)',
    linkedin: 'LinkedIn (professional, data-driven, thought leadership tone, minimal emoji)',
    facebook: 'Facebook (friendly, community-focused, slightly longer form, moderate emoji)',
    tiktok: 'TikTok (very fast hook, trend-aware language, energetic, Gen Z friendly)',
  };

  const typeInstructions: Record<string, string> = {
    'tweet-card': `Create exactly 3 tweet card variations. Each is a short, punchy tweet (max 240 chars) designed to be screenshotted and posted as a photo on Instagram. Make each a different angle: Variation 1 = bold statement or hot take, Variation 2 = data/stat-driven insight, Variation 3 = numbered list (max 5 items). Set the angle field to describe the approach (e.g. "Bold Statement", "Key Stats", "Quick List"). No hashtags inside the tweet text. Fill the tweetCards array and the caption field. Do NOT fill slides, thread, or script.`,
    carousel: `Create a 6-slide carousel. Slide 1 is the hook (bold statement or question that stops the scroll). Slides 2-5 are meaty content points with emoji. Slide 6 is the CTA (follow/save/share). Each headline max 8 words. Body max 25 words.`,
    caption: `Write a single-post caption. Start with a strong first line (hook). 3-4 short paragraphs. End with a direct CTA. 150-200 words total.`,
    thread: `Write a 6-tweet thread. Tweet 1 is the hook/teaser ending with "🧵". Tweets 2-5 are the value. Tweet 6 is the wrap-up + CTA. Each tweet max 240 characters.`,
    script: `Write a short-form video script. Scene 1: 0-3s hook (shocking stat or question). Scenes 2-4: core value points with B-roll notes. Scene 5: CTA. Keep each scene 5-10 seconds max.`,
  };

  const prompt = `You are a social media content expert for E&J Retreats, a luxury short-term rental property management company based in the US. We manage high-end Airbnb/VRBO properties and help homeowners earn passive income.

PLATFORM: ${platformGuide[platform] ?? platform}
CONTENT TYPE: ${typeInstructions[contentType] ?? contentType}
TOPIC: ${topic}
${brandContext ? `BRAND CONTEXT / EXTRA DETAILS: ${brandContext}` : ''}

BRAND VOICE: Confident, knowledgeable, approachable. We are the experts that property owners trust. We make STR ownership simple and profitable.

Generate content that educates, entertains, or inspires property owners, investors, or people interested in short-term rentals. Make it highly shareable and valuable.

Rules:
- Do NOT use em dashes (—). Use commas or rewrite instead.
- Always include a strong hook field (the very first sentence/line).
- Always include 8-15 relevant hashtags in the hashtags array (used as IG caption hashtags).
- Always include a clear cta field (call to action text, 1 sentence).
- For tweet-card: fill the tweetCards array (3 items) AND the caption field (an Instagram-ready caption to post alongside the carousel, 80-120 words, engaging, ends with a CTA). Leave slides, thread, script empty.
- For carousel: fill the slides array (6 items) only.
- For thread: fill the thread array (6 tweets) only.
- For caption: fill the caption field only.
- For script: fill the script array (5 scenes) only.`;

  const { gateway } = await import('@ai-sdk/gateway');
  const { generateText, Output } = await import('ai');
  const { output } = await generateText({
    model: gateway('anthropic/claude-sonnet-4-6'),
    output: Output.object({ schema: ContentResultSchema }),
    messages: [{ role: 'user', content: prompt }],
  });

  const supabase = getSupabase();
  const id = `content_${Date.now()}`;
  await supabase.from('content_pieces').insert({
    id,
    topic,
    platform,
    content_type: contentType,
    result: output,
    created_at: new Date().toISOString(),
  });

  return res.status(200).json({ id, result: output });
}

// ── META (Facebook & Instagram) ──────────────────────────────────────────────

const META_GRAPH = 'https://graph.facebook.com/v21.0';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function metaConnect(body: any, res: VercelResponse) {
  const { shortLivedToken } = body;
  const appId     = process.env.VITE_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return res.status(500).json({ error: 'Meta not configured on server (set VITE_META_APP_ID and META_APP_SECRET in Vercel).' });

  const tokenRes = await fetch(
    `${META_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenData: any = await tokenRes.json();
  if (tokenData.error) return res.status(400).json({ error: tokenData.error.message });
  const longLivedToken: string = tokenData.access_token;
  const expiresIn: number      = tokenData.expires_in ?? 5184000;

  const pagesRes = await fetch(`${META_GRAPH}/me/accounts?fields=id,name,access_token&access_token=${longLivedToken}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pagesData: any = await pagesRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPages: any[] = pagesData.data ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pages = await Promise.all(rawPages.map(async (page: any) => {
    let igAccount: { id: string; username: string } | null = null;
    try {
      // Check both Business and Creator account fields
      const igCheckRes = await fetch(
        `${META_GRAPH}/${page.id}?fields=instagram_business_account,connected_instagram_account&access_token=${page.access_token}`
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const igCheck: any = await igCheckRes.json();
      const igId = igCheck.instagram_business_account?.id ?? igCheck.connected_instagram_account?.id;
      if (igId) {
        const igInfoRes = await fetch(`${META_GRAPH}/${igId}?fields=id,username&access_token=${page.access_token}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const igInfo: any = await igInfoRes.json();
        if (igInfo.username) igAccount = { id: igInfo.id, username: igInfo.username };
      }
    } catch {}
    return { id: page.id, name: page.name, access_token: page.access_token, igAccount };
  }));

  const connection = {
    longLivedToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    pages,
    connectedAt: new Date().toISOString(),
  };
  await getSupabase().from('app_cache').upsert({ key: 'meta_connection', value: connection, updated_at: new Date().toISOString() });

  return res.status(200).json({
    connection: {
      pages: pages.map(p => ({ id: p.id, name: p.name, igAccount: p.igAccount })),
      connectedAt: connection.connectedAt,
      expiresAt: connection.expiresAt,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function metaPostFacebook(body: any, res: VercelResponse) {
  const { pageId, message, imageUrl } = body;
  const { data } = await getSupabase().from('app_cache').select('value').eq('key', 'meta_connection').single();
  if (!data) return res.status(400).json({ error: 'Meta account not connected. Connect in Settings first.' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = data.value as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (conn.pages as any[]).find((p: any) => p.id === pageId);
  if (!page) return res.status(400).json({ error: 'Page not found in connection.' });

  const endpoint = imageUrl ? `${META_GRAPH}/${pageId}/photos` : `${META_GRAPH}/${pageId}/feed`;
  const payload: Record<string, string> = { access_token: page.access_token };
  if (imageUrl) { payload.url = imageUrl; payload.caption = message; }
  else          { payload.message = message; }

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await r.json();
  if (result.error) return res.status(400).json({ error: result.error.message });
  return res.status(200).json({ postId: result.id ?? result.post_id });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function metaPostInstagram(body: any, res: VercelResponse) {
  const { igAccountId, pageId, imageUrl, caption } = body;
  const { data } = await getSupabase().from('app_cache').select('value').eq('key', 'meta_connection').single();
  if (!data) return res.status(400).json({ error: 'Meta account not connected. Connect in Settings first.' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = data.value as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (conn.pages as any[]).find((p: any) => p.id === pageId);
  if (!page) return res.status(400).json({ error: 'Page not found in connection.' });

  const containerRes = await fetch(`${META_GRAPH}/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: page.access_token }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const container: any = await containerRes.json();
  if (container.error) return res.status(400).json({ error: container.error.message });

  await new Promise(r => setTimeout(r, 2000));

  const publishRes = await fetch(`${META_GRAPH}/${igAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: page.access_token }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const published: any = await publishRes.json();
  if (published.error) return res.status(400).json({ error: published.error.message });
  return res.status(200).json({ postId: published.id });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function metaAddPage(body: any, res: VercelResponse) {
  const { pageId } = body;
  if (!pageId) return res.status(400).json({ error: 'pageId required' });
  const { data } = await getSupabase().from('app_cache').select('value').eq('key', 'meta_connection').single();
  if (!data) return res.status(400).json({ error: 'Meta account not connected. Connect first.' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = data.value as any;
  const userToken: string = conn.longLivedToken;
  if (!userToken) return res.status(400).json({ error: 'No stored user token — please disconnect and reconnect.' });

  const pageRes = await fetch(`${META_GRAPH}/${pageId}?fields=id,name,access_token&access_token=${userToken}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageData: any = await pageRes.json();
  if (pageData.error) return res.status(400).json({ error: `Facebook: ${pageData.error.message}` });
  if (!pageData.access_token) return res.status(400).json({ error: 'Page found but no access token returned — make sure you are an admin of this page.' });

  const newPage = { id: pageData.id, name: pageData.name, access_token: pageData.access_token, igAccount: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingPages = (conn.pages as any[]).filter((p: any) => p.id !== newPage.id);
  const updatedConn = { ...conn, pages: [...existingPages, newPage] };
  await getSupabase().from('app_cache').upsert({ key: 'meta_connection', value: updatedConn, updated_at: new Date().toISOString() });

  return res.status(200).json({
    connection: {
      pages: updatedConn.pages.map((p: any) => ({ id: p.id, name: p.name, igAccount: p.igAccount })),
      connectedAt: updatedConn.connectedAt,
      expiresAt: updatedConn.expiresAt,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function metaPostCarousel(body: any, res: VercelResponse) {
  const { pageId, igAccountId, imageUrls, caption } = body;
  if (!Array.isArray(imageUrls) || imageUrls.length < 1) return res.status(400).json({ error: 'imageUrls required' });
  const { data } = await getSupabase().from('app_cache').select('value').eq('key', 'meta_connection').single();
  if (!data) return res.status(400).json({ error: 'Meta account not connected. Connect in Settings first.' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = data.value as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (conn.pages as any[]).find((p: any) => p.id === pageId);
  if (!page) return res.status(400).json({ error: 'Page not found in connection.' });

  // ── Facebook multi-photo post ──
  const fbPhotoIds: string[] = [];
  for (const url of imageUrls) {
    const r = await fetch(`${META_GRAPH}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, published: false, access_token: page.access_token }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await r.json();
    if (d.id) fbPhotoIds.push(d.id);
  }
  let fbPostId: string | null = null;
  if (fbPhotoIds.length > 0) {
    const fbFeedRes = await fetch(`${META_GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: caption,
        attached_media: fbPhotoIds.map(id => ({ media_fbid: id })),
        access_token: page.access_token,
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fbFeed: any = await fbFeedRes.json();
    if (fbFeed.error) return res.status(400).json({ error: `Facebook: ${fbFeed.error.message}` });
    fbPostId = fbFeed.id;
  }

  // ── Instagram carousel ──
  let igPostId: string | null = null;
  if (igAccountId) {
    const itemIds: string[] = [];
    for (const url of imageUrls) {
      const r = await fetch(`${META_GRAPH}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: page.access_token }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await r.json();
      if (d.id) itemIds.push(d.id);
    }
    if (itemIds.length > 0) {
      const carouselRes = await fetch(`${META_GRAPH}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type: 'CAROUSEL', children: itemIds.join(','), caption, access_token: page.access_token }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const carousel: any = await carouselRes.json();
      if (carousel.error) return res.status(400).json({ error: `Instagram: ${carousel.error.message}` });
      await new Promise(r => setTimeout(r, 2000));
      const publishRes = await fetch(`${META_GRAPH}/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: carousel.id, access_token: page.access_token }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const published: any = await publishRes.json();
      if (published.error) return res.status(400).json({ error: `Instagram publish: ${published.error.message}` });
      igPostId = published.id;
    }
  }

  return res.status(200).json({ fbPostId, igPostId });
}

// ── CLEANER ONBOARDING (AGREEMENT) ───────────────────────────────────────────

async function cleanerOnboardGet(token: string, res: VercelResponse) {
  const supabase = getSupabase();
  const { data: row } = await supabase
    .from('cleaner_onboarding_tokens')
    .select('cleaner_name, cleaner_email, status')
    .eq('token', token)
    .single();
  if (!row) return res.status(404).json({ error: 'Invalid or expired link.' });
  return res.status(200).json({ cleanerName: row.cleaner_name, cleanerEmail: row.cleaner_email, status: row.status });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanerOnboardSend(body: any, res: VercelResponse) {
  const { cleanerId, cleanerName, cleanerEmail, appUrl, sendEmail } = body;
  if (!cleanerEmail?.trim()) return res.status(400).json({ error: 'cleanerEmail required.' });

  const supabase = getSupabase();
  const id = `cot_${Date.now()}`;
  const token = randomUUID();

  const { error: insertErr } = await supabase.from('cleaner_onboarding_tokens').insert({
    id, token,
    cleaner_id: cleanerId ?? null,
    cleaner_name: cleanerName?.trim() ?? null,
    cleaner_email: cleanerEmail.trim(),
    status: 'pending',
  });
  if (insertErr) return res.status(500).json({ error: insertErr.message });

  const base = APP_URL;
  const link = `${base}?cleaner-onboard=${token}`;

  if (sendEmail) {
    try {
      const agrmtSubj = 'Action required: Sign your E&J Retreats Contractor Agreement';
      const _osr = await (await getResend()).emails.send({
        from: 'E&J Retreats <cleaning@ejretreats.com>',
        to: cleanerEmail.trim(),
        subject: agrmtSubj,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
            <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
              <h2 style="color:#1e40af;margin:0 0 16px;font-size:20px">📋 Contractor Agreement</h2>
              <p style="color:#334155;margin:0 0 12px">Hi ${cleanerName?.trim() ? cleanerName.trim().split(' ')[0] : 'there'},</p>
              <p style="color:#334155;margin:0 0 16px">Please review and sign your E&J Retreats Independent Contractor Agreement. This includes your NDA and non-compete agreement. It only takes a few minutes.</p>
              <div style="text-align:center;margin:28px 0">
                <a href="${link}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Review &amp; Sign Agreement</a>
              </div>
              <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">— E&amp;J Retreats</p>
            </div>
          </div>
        `,
      });
      if (emailId(_osr)) await logEmail(emailId(_osr)!, 'cleaning-onboard', cleanerEmail.trim(), agrmtSubj, id, cleanerName?.trim() ?? undefined);
    } catch {}
  }

  return res.status(200).json({ link });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanerOnboardComplete(body: any, res: VercelResponse) {
  const { token, name, address, phone, email, signatureDataUrl, signedAt } = body;
  if (!token || !name?.trim() || !email?.trim() || !signatureDataUrl) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const supabase = getSupabase();
  const { data: row } = await supabase
    .from('cleaner_onboarding_tokens')
    .select('*')
    .eq('token', token)
    .single();
  if (!row) return res.status(404).json({ error: 'Invalid or expired link.' });
  if (row.status === 'completed') return res.status(200).json({ ok: true, alreadyComplete: true });

  const now = signedAt || new Date().toISOString();
  const agreementData = { name: name.trim(), address: address?.trim() ?? '', phone: phone?.trim() ?? '', email: email.trim(), signatureDataUrl, signedAt: now };

  await supabase.from('cleaner_onboarding_tokens').update({
    status: 'completed',
    completed_at: now,
    cleaner_name: name.trim(),
    cleaner_email: email.trim(),
    agreement_data: agreementData,
  }).eq('token', token);

  // Attach the signature to the cleaner record (by id, else by email) and
  // hand the cleaner straight to Stripe payout setup — one link, no waiting.
  let cleanerId: string | null = row.cleaner_id ?? null;
  if (!cleanerId) {
    const { data: byEmail } = await supabase.from('cleaners').select('id').ilike('email', email.trim()).limit(1).maybeSingle();
    cleanerId = byEmail?.id ?? null;
  }
  let nextLink: string | null = null;
  let stripeActive = false;
  if (cleanerId) {
    await supabase.from('cleaners').update({ agreement_signed_at: now, ...(phone?.trim() ? { phone: phone.trim() } : {}) }).eq('id', cleanerId);
    const { data: cleaner } = await supabase.from('cleaners').select('*').eq('id', cleanerId).maybeSingle();
    stripeActive = cleaner?.stripe_connect_status === 'active';
    if (stripeActive) await maybeActivateCleaner(supabase, cleanerId);
    else if (cleaner && process.env.STRIPE_SECRET_KEY) {
      try { nextLink = (await ensureConnectLink(supabase, cleaner)).link; } catch (e) { console.error('connect link after agreement failed:', e); }
    }
  }

  const dateLabel = new Date(now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Email copy to cleaner
  try {
    const signedCopySubj = 'Your signed E&J Retreats Contractor Agreement';
    const _scr = await (await getResend()).emails.send({
      from: 'E&J Retreats <cleaning@ejretreats.com>',
      to: email.trim(),
      subject: signedCopySubj,
      html: `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc">
          <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
            <h2 style="color:#1e40af;margin:0 0 4px;font-size:20px">✅ Agreement Signed</h2>
            <p style="color:#64748b;font-size:13px;margin:0 0 20px">Signed on ${dateLabel}</p>
            <p style="color:#334155;margin:0 0 16px">Hi ${name.trim().split(' ')[0]},</p>
            <p style="color:#334155;margin:0 0 20px">This confirms you have signed the E&J Retreats Independent Contractor Agreement. Your signature is on file.</p>
            <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:0 0 20px">
              <p style="margin:0 0 6px;font-size:13px;color:#64748b;font-weight:600">Your Details</p>
              <p style="margin:0;font-size:14px;color:#0f172a"><strong>Name:</strong> ${name.trim()}</p>
              ${address?.trim() ? `<p style="margin:4px 0 0;font-size:14px;color:#0f172a"><strong>Address:</strong> ${address.trim()}</p>` : ''}
              ${phone?.trim() ? `<p style="margin:4px 0 0;font-size:14px;color:#0f172a"><strong>Phone:</strong> ${phone.trim()}</p>` : ''}
              <p style="margin:4px 0 0;font-size:14px;color:#0f172a"><strong>Email:</strong> ${email.trim()}</p>
              <p style="margin:4px 0 0;font-size:14px;color:#0f172a"><strong>Date:</strong> ${dateLabel}</p>
            </div>
            <div style="margin:0 0 20px">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600">Your Signature on File</p>
              <img src="${signatureDataUrl}" alt="Signature" style="max-width:240px;border:1px solid #e2e8f0;border-radius:8px;background:white;padding:8px" />
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:0">Please keep this email for your records. Contact E&amp;J Retreats if you have any questions.<br>— E&amp;J Retreats</p>
          </div>
        </div>
      `,
    });
    if (emailId(_scr)) await logEmail(emailId(_scr)!, 'cleaning-onboard', email.trim(), signedCopySubj, row.id, name.trim());
  } catch {}

  // Notify admin
  try {
    const adminSignedSubj = `✅ Contractor agreement signed: ${name.trim()}`;
    const _adr = await (await getResend()).emails.send({
      from: 'E&J Retreats <cleaning@ejretreats.com>',
      to: ADMIN_EMAIL,
      subject: adminSignedSubj,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc">
          <div style="background:white;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
            <h2 style="margin:0 0 16px;color:#1e293b">📋 Contractor Agreement Signed</h2>
            <p style="color:#334155;margin:0 0 4px"><strong>Name:</strong> ${name.trim()}</p>
            <p style="color:#334155;margin:0 0 4px"><strong>Email:</strong> ${email.trim()}</p>
            ${phone?.trim() ? `<p style="color:#334155;margin:0 0 4px"><strong>Phone:</strong> ${phone.trim()}</p>` : ''}
            ${address?.trim() ? `<p style="color:#334155;margin:0 0 4px"><strong>Address:</strong> ${address.trim()}</p>` : ''}
            <p style="color:#334155;margin:0 0 16px"><strong>Signed:</strong> ${dateLabel}</p>
            <div>
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;font-weight:600">Signature</p>
              <img src="${signatureDataUrl}" alt="Signature" style="max-width:240px;border:1px solid #e2e8f0;border-radius:8px;background:white;padding:8px" />
            </div>
          </div>
        </div>
      `,
    });
    if (emailId(_adr)) await logEmail(emailId(_adr)!, 'cleaning-onboard', ADMIN_EMAIL, adminSignedSubj, row.id, 'Admin');
  } catch {}

  return res.status(200).json({ ok: true, nextLink, stripeActive });
}

// ── CLEANER DASHBOARD ─────────────────────────────────────────────────────────

async function cleanerDashboardGet(combined: string, res: VercelResponse) {
  // URL formats (newest first, all backward-compatible):
  //   name-slug:cleanerId:token   ← current
  //   cleanerId:token             ← previous security fix
  //   cleanerId                   ← original (no token)
  const parts = combined.split(':');
  let cleanerId: string;
  let providedToken: string;
  if (parts.length >= 3) {
    cleanerId = parts[1];
    providedToken = parts[2];
  } else if (parts.length === 2) {
    cleanerId = parts[0];
    providedToken = parts[1];
  } else {
    cleanerId = parts[0];
    providedToken = '';
  }

  const supabase = getSupabase();
  res.setHeader('Cache-Control', 'private, no-store'); // personal data; the page keeps its own local copy

  // Only what the dashboard renders: unfinished jobs always, finished ones from the last 60 days.
  const JOB_COLS = 'id, property_id, property_name, checkout_date, checkin_date, guest_name, notes, status, cleaner_payout, assigned_cleaner_id, dispatch_tokens, same_day, completed_at, portal_data, charged_at, payout_sent_at, payout_status, payout_due_at, payout_method';
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const [{ data: cleanerRow }, { data: myJobRows }, { data: dispatchedRows }, { data: configs }] = await Promise.all([
    supabase.from('cleaners').select('id, name, email, phone, dashboard_token, status').eq('id', cleanerId).maybeSingle(),
    supabase.from('cleaning_jobs')
      .select(JOB_COLS)
      .eq('assigned_cleaner_id', cleanerId)
      .neq('status', 'cancelled')
      .or(`status.in.(accepted,in_progress),checkout_date.gte.${sixtyDaysAgo}`)
      .order('checkout_date', { ascending: true })
      .limit(200),
    supabase.from('cleaning_jobs')
      .select(JOB_COLS)
      .eq('status', 'dispatched')
      .is('assigned_cleaner_id', null)
      .gte('checkout_date', sixtyDaysAgo)
      .order('checkout_date', { ascending: true })
      .limit(100),
    supabase.from('cleaning_property_configs')
      .select('property_id,linked_property_ids,door_code,address,checkout_time,checkin_time,photo_url'),
  ]);

  if (!cleanerRow) return res.status(404).json({ error: 'Cleaner not found.' });
  // A dashboard token is required. Links from before tokens existed stop working;
  // the admin can send a fresh portal link from the Cleaners tab.
  if (!cleanerRow.dashboard_token || !providedToken || cleanerRow.dashboard_token !== providedToken) {
    return res.status(403).json({ error: 'This portal link is no longer valid. Please ask E&J Retreats for a new link.' });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function enrichJob(row: any, myPayout?: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = (configs ?? []).find((c: any) => c.property_id === row.property_id || (c.linked_property_ids ?? []).includes(row.property_id));
    // Find this cleaner's dispatch token so the dashboard can link to the job portal
    const tokens = (row.dispatch_tokens ?? {}) as Record<string, { cleanerId: string; payout?: number }>;
    const portalToken = Object.entries(tokens).find(([, t]) => t.cleanerId === cleanerId)?.[0] ?? null;
    return {
      id: row.id,
      propertyId: row.property_id,
      propertyName: row.property_name,
      checkoutDate: row.checkout_date,
      checkinDate: row.checkin_date ?? null,
      guestName: row.guest_name ?? null,
      notes: row.notes ?? null,
      status: row.status,
      payout: myPayout ?? row.cleaner_payout ?? 0,
      // Door code only once this cleaner holds the job and the clean is live.
      doorCode: row.assigned_cleaner_id === cleanerId && ['accepted', 'in_progress'].includes(row.status) ? (cfg?.door_code ?? null) : null,
      address: cfg?.address ?? null,
      checkoutTime: cfg?.checkout_time ?? null,
      checkinTime: cfg?.checkin_time ?? null,
      photoUrl: cfg?.photo_url ?? null,
      portalToken,
      sameDay: !!row.same_day || (!!row.checkin_date && row.checkin_date === row.checkout_date),
      // Only a real cleaner report counts — an admin marking the job Complete does not.
      reportSubmitted: !!(row.portal_data?.submittedAt),
      reportWaived: !!(row.portal_data?.waived),
      completedAt: row.completed_at ?? null,
      // Billing already done → the report is optional (nice to have photos), not a blocker.
      billed: !!row.charged_at || row.charge_status === 'external',
      paidOut: !!row.payout_sent_at,
      payoutStatus: row.payout_status ?? null,
      payoutDueAt: row.payout_due_at ?? null,
      paidAt: row.payout_sent_at ?? null,
      payoutMethod: row.payout_method ?? null,
    };
  }

  // Available = dispatched jobs where this cleaner has a token (i.e. was emailed about the job)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availableJobs = (dispatchedRows ?? []).flatMap((row: any) => {
    const tokens = (row.dispatch_tokens ?? {}) as Record<string, { cleanerId: string; payout?: number }>;
    const entry = Object.values(tokens).find(t => t.cleanerId === cleanerId);
    return entry ? [enrichJob(row, entry.payout)] : [];
  });

  return res.status(200).json({
    cleaner: {
      id: cleanerRow.id,
      name: cleanerRow.name,
      email: cleanerRow.email,
      phone: cleanerRow.phone ?? null,
    },
    myJobs: (myJobRows ?? []).map((r: any) => enrichJob(r)), // eslint-disable-line @typescript-eslint/no-explicit-any
    availableJobs,
    serverTime: new Date().toISOString(),
  });
}

/** Resolve + verify a cleaner from a dashboard `combined` value ("slug:cleanerId:token" / "cleanerId:token"). */
async function verifyDashboardCleaner(combined: unknown): Promise<{ cleanerId: string } | null> {
  if (typeof combined !== 'string' || !combined) return null;
  const parts = combined.split(':');
  const cleanerId = parts.length >= 3 ? parts[1] : parts[0];
  const token = parts.length >= 3 ? parts[2] : parts.length === 2 ? parts[1] : '';
  if (!cleanerId || !token) return null;
  const { data } = await getSupabase().from('cleaners').select('id, dashboard_token').eq('id', cleanerId).maybeSingle();
  if (!data?.dashboard_token || data.dashboard_token !== token) return null;
  return { cleanerId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanerDashboardAccept(body: any, res: VercelResponse) {
  const auth = await verifyDashboardCleaner(body.combined);
  if (!auth) return res.status(403).json({ error: 'Invalid or expired portal link.' });
  const { jobId } = body;
  const cleanerId = auth.cleanerId;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId.' });

  const supabase = getSupabase();
  const { data: row } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).single();
  if (!row) return res.status(404).json({ error: 'Job not found.' });

  const tokens = (row.dispatch_tokens ?? {}) as Record<string, { cleanerId: string; cleanerName: string; payout?: number }>;
  const cleanerInfo = Object.values(tokens).find(t => t.cleanerId === cleanerId);
  if (!cleanerInfo) return res.status(403).json({ error: 'You are not eligible for this job.' });

  if (['accepted', 'in_progress', 'completed'].includes(row.status)) {
    if (row.assigned_cleaner_id === cleanerId) return res.status(200).json({ alreadyAccepted: true });
    return res.status(409).json({ error: 'Sorry — this job was already claimed by another cleaner.' });
  }
  if (row.status === 'cancelled') return res.status(410).json({ error: 'This job has been cancelled.' });

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase.from('cleaning_jobs').update({
    status: 'accepted',
    assigned_cleaner_id: cleanerInfo.cleanerId,
    assigned_cleaner_name: cleanerInfo.cleanerName,
    cleaner_payout: cleanerInfo.payout ?? 0,
    accepted_at: now,
    updated_at: now,
  }).eq('id', jobId).in('status', ['dispatched', 'pending']).select('id');

  if (error) return res.status(500).json({ error: error.message });
  if (!updated?.length) return res.status(409).json({ error: 'Sorry — this job was already claimed by another cleaner.' });

  await (await getResend()).emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: ADMIN_EMAIL,
    subject: `✅ ${cleanerInfo.cleanerName} accepted: ${row.property_name}`,
    html: `<div style="font-family:sans-serif;padding:24px"><p><strong>${cleanerInfo.cleanerName}</strong> accepted the cleaning job for <strong>${row.property_name}</strong> on ${new Date(row.checkout_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.</p></div>`,
  }).catch(() => {});

  return res.status(200).json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanerDashboardDecline(body: any, res: VercelResponse) {
  const auth = await verifyDashboardCleaner(body.combined);
  if (!auth) return res.status(403).json({ error: 'Invalid or expired portal link.' });
  const { jobId } = body;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId.' });

  const supabase = getSupabase();
  const { data: row } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).single();
  if (!row) return res.status(404).json({ error: 'Job not found.' });
  if (row.status !== 'dispatched') return res.status(409).json({ error: 'This job is no longer available.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (row.dispatch_tokens ?? {}) as Record<string, any>;
  const token = Object.entries(tokens).find(([, t]) => t.cleanerId === auth.cleanerId)?.[0];
  if (!token) return res.status(403).json({ error: 'You were not dispatched to this job.' });
  const dispatchOrder = (row.dispatch_order ?? []) as string[];
  if (dispatchOrder[row.dispatch_index ?? 0] !== token) {
    return res.status(400).json({ error: 'You have already passed on this job.' });
  }

  const outcome = await advanceDispatch(supabase, await getResend(), row, 'passed');
  if (outcome.error && !outcome.next && !outcome.exhausted) return res.status(409).json({ error: outcome.error });
  return res.status(200).json({ success: true, allPassed: outcome.exhausted });
}

// ── EMAIL MARKETING ──────────────────────────────────────────────────────────

async function emailMktGetTemplates(res: VercelResponse) {
  const { data, error } = await getSupabase().from('email_mkt_templates').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ templates: data ?? [] });
}

async function emailMktGetCampaigns(res: VercelResponse) {
  const { data, error } = await getSupabase().from('email_mkt_campaigns').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ campaigns: data ?? [] });
}

async function emailMktUpsertTemplate(body: any, res: VercelResponse) {
  const now = new Date().toISOString();
  const id = body.id ?? `emtpl_${Date.now()}`;
  const { error } = await getSupabase().from('email_mkt_templates').upsert(
    { id, name: body.name, subject: body.subject, body_html: body.body_html, updated_at: now },
    { onConflict: 'id' }
  );
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ id });
}

async function emailMktDeleteTemplate(body: any, res: VercelResponse) {
  const { error } = await getSupabase().from('email_mkt_templates').delete().eq('id', body.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function emailMktSendCampaign(body: any, res: VercelResponse) {
  const { campaignName, templateId, subject, bodyHtml, leads, leadCategory, batchSize = 50 } = body;
  if (!subject || !bodyHtml || !Array.isArray(leads) || leads.length === 0)
    return res.status(400).json({ error: 'subject, bodyHtml, and leads[] required.' });

  const sb = getSupabase();
  const resend = await getResend();
  const campaignId = `emkc_${Date.now()}`;
  const now = new Date().toISOString();
  const appUrl = process.env.VITE_APP_URL ?? 'https://ej-retreat.vercel.app';

  // Check unsubscribes
  const { data: unsubs } = await sb.from('email_mkt_unsubscribes').select('email');
  const unsubSet = new Set((unsubs ?? []).map((u: any) => u.email.toLowerCase()));

  const { error: cErr } = await sb.from('email_mkt_campaigns').insert({
    id: campaignId, name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
    template_id: templateId ?? null, subject, body_html: bodyHtml,
    lead_category: leadCategory ?? 'Property Management',
    status: 'sending', sent_count: 0, open_count: 0, click_count: 0, calls_set: 0, closes: 0,
    created_at: now, sent_at: now,
  });
  if (cErr) return res.status(500).json({ error: cErr.message });

  let sentCount = 0;
  const recipients: any[] = [];
  const batch = Math.min(batchSize, 250);

  for (let i = 0; i < leads.length; i += batch) {
    const chunk = leads.slice(i, i + batch);
    for (const lead of chunk) {
      const email: string = lead.email?.trim();
      if (!email) continue;
      if (unsubSet.has(email.toLowerCase())) {
        recipients.push({ id: randomUUID(), campaign_id: campaignId, lead_id: lead.id, lead_name: lead.name, email, status: 'unsubscribed', sent_at: now });
        continue;
      }
      const unsubLink = `${appUrl}/api/documents?flow=email-mkt&action=unsubscribe&email=${encodeURIComponent(email)}&cid=${campaignId}`;
      const firstName = (lead.name || '').split(' ')[0] || 'there';
      const personalBody = bodyHtml
        .replace(/\{First Name\}/g, firstName)
        .replace(/\{name\}/gi, lead.name || 'there')
        .replace(/\{company\}/gi, lead.company || '')
        .replace(/\{city\}/gi, lead.city || '')
        .replace(/\{unsubscribe_link\}/gi, unsubLink);
      const unsubFooter = `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/><p style="font-size:12px;color:#999;margin:0">To unsubscribe, <a href="${unsubLink}" style="color:#999">click here</a>.</p>`;
      let htmlBody: string;
      if (personalBody.includes('<')) {
        htmlBody = personalBody.includes('</body>')
          ? personalBody.replace('</body>', `${unsubFooter}</body>`)
          : personalBody + unsubFooter;
      } else {
        htmlBody = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:600px">${personalBody.replace(/\n/g, '<br/>')}<br/><br/>${unsubFooter}</div>`;
      }
      try {
        const r = await resend.emails.send({
          from: process.env.RESEND_CAMPAIGN_FROM_EMAIL ?? 'outreach@ejretreats.com',
          reply_to: process.env.RESEND_CAMPAIGN_REPLY_TO ?? ADMIN_EMAIL,
          to: email,
          subject: subject.replace(/\{First Name\}/g, firstName).replace(/\{name\}/gi, lead.name || '').replace(/\{company\}/gi, lead.company || ''),
          html: htmlBody,
        });
        sentCount++;
        recipients.push({ id: randomUUID(), campaign_id: campaignId, lead_id: lead.id, lead_name: lead.name, email, status: 'sent', sent_at: now, resend_email_id: r?.data?.id });
      } catch (e: any) {
        recipients.push({ id: randomUUID(), campaign_id: campaignId, lead_id: lead.id, lead_name: lead.name, email, status: 'failed', sent_at: now, error_msg: e.message ?? 'Send failed' });
      }
    }
    // Small pause between batches to be friendly to Resend rate limits
    if (i + batch < leads.length) await new Promise(r => setTimeout(r, 500));
  }

  if (recipients.length > 0) await sb.from('email_mkt_recipients').insert(recipients);
  await sb.from('email_mkt_campaigns').update({ sent_count: sentCount, status: 'sent' }).eq('id', campaignId);

  // Mark successfully sent leads as Contacted so future campaigns skip them by default
  const sentLeadIds = recipients.filter(r => r.status === 'sent').map(r => r.lead_id).filter(Boolean);
  if (sentLeadIds.length > 0) {
    await sb.from('cleaning_leads').update({ outreach_status: 'Contacted', updated_at: new Date().toISOString() }).in('id', sentLeadIds);
  }

  return res.json({ campaignId, sentCount, totalLeads: leads.length });
}

async function emailMktUpdateStats(body: any, res: VercelResponse) {
  const update: any = {};
  if (typeof body.callsSet === 'number') update.calls_set = body.callsSet;
  if (typeof body.closes === 'number') update.closes = body.closes;
  const { error } = await getSupabase().from('email_mkt_campaigns').update(update).eq('id', body.campaignId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function emailMktDeleteCampaign(body: any, res: VercelResponse) {
  const sb = getSupabase();
  await sb.from('email_mkt_recipients').delete().eq('campaign_id', body.id);
  const { error } = await sb.from('email_mkt_campaigns').delete().eq('id', body.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function emailMktUnsubscribe(req: VercelRequest, res: VercelResponse) {
  const email = (req.query.email ?? req.body?.email ?? '') as string;
  if (!email) return res.status(400).send('Missing email');
  await getSupabase().from('email_mkt_unsubscribes').upsert({ email: email.toLowerCase(), unsubscribed_at: new Date().toISOString() }, { onConflict: 'email' });
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(`<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><h2 style="color:#222">You've been unsubscribed</h2><p style="color:#666">You will no longer receive emails from E&J Retreats Cleaning.<br/>If this was a mistake, reply to any previous email.</p></body></html>`);
}

// Handle Resend open/click webhooks for email marketing campaigns
async function emailMktHandleWebhook(body: any, res: VercelResponse) {
  const sb = getSupabase();
  const emailId: string = body.data?.email_id ?? body.data?.id;
  const type: string = body.type; // email.opened, email.clicked
  if (!emailId) return res.json({ ok: true });
  const now = new Date().toISOString();
  if (type === 'email.opened') {
    const { data: rec } = await sb.from('email_mkt_recipients').select('id, campaign_id').eq('resend_email_id', emailId).single();
    if (rec) {
      await sb.from('email_mkt_recipients').update({ status: 'opened', opened_at: now }).eq('id', rec.id);
      const { data: camp } = await sb.from('email_mkt_campaigns').select('open_count').eq('id', rec.campaign_id).single();
      if (camp) await sb.from('email_mkt_campaigns').update({ open_count: (camp.open_count ?? 0) + 1 }).eq('id', rec.campaign_id);
    }
  } else if (type === 'email.clicked') {
    const { data: rec } = await sb.from('email_mkt_recipients').select('id, campaign_id').eq('resend_email_id', emailId).single();
    if (rec) {
      await sb.from('email_mkt_recipients').update({ clicked_at: now }).eq('id', rec.id);
      const { data: camp } = await sb.from('email_mkt_campaigns').select('click_count').eq('id', rec.campaign_id).single();
      if (camp) await sb.from('email_mkt_campaigns').update({ click_count: (camp.click_count ?? 0) + 1 }).eq('id', rec.campaign_id);
    }
  }
  return res.json({ ok: true });
}

// ── SMS ───────────────────────────────────────────────────────────────────────

let _twilio: any = null;
async function getTwilio() {
  if (!_twilio) {
    const { default: Twilio } = await import('twilio');
    _twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return _twilio;
}
// ── EMAIL MARKETING SEQUENCES ─────────────────────────────────────────────────

async function emailMktGetSequences(res: VercelResponse) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const [{ data: seqs }, { data: enrollments }] = await Promise.all([
    sb.from('email_mkt_sequences').select('*').order('created_at', { ascending: false }),
    sb.from('email_mkt_sequence_enrollments').select('sequence_id, status, next_send_at'),
  ]);
  const result = (seqs ?? []).map((seq: any) => {
    const enrs = (enrollments ?? []).filter((e: any) => e.sequence_id === seq.id);
    return {
      ...seq,
      active_count:    enrs.filter((e: any) => e.status === 'active').length,
      due_count:       enrs.filter((e: any) => e.status === 'active' && e.next_send_at && e.next_send_at <= now).length,
      completed_count: enrs.filter((e: any) => e.status === 'completed').length,
    };
  });
  return res.status(200).json({ sequences: result });
}

async function emailMktUpsertSequence(body: any, res: VercelResponse) {
  const { id, name, steps } = body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required.' });
  const sb = getSupabase();
  const seqId = id || `seq_${Date.now()}`;
  await sb.from('email_mkt_sequences').upsert(
    { id: seqId, name: name.trim(), steps: steps ?? [], updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  return res.status(200).json({ ok: true, id: seqId });
}

async function emailMktDeleteSequence(body: any, res: VercelResponse) {
  const sb = getSupabase();
  await sb.from('email_mkt_sequence_enrollments').delete().eq('sequence_id', body.id);
  await sb.from('email_mkt_sequences').delete().eq('id', body.id);
  return res.status(200).json({ ok: true });
}

async function emailMktEnrollSequence(body: any, res: VercelResponse) {
  const { sequenceId, campaignId } = body;
  if (!sequenceId || !campaignId) return res.status(400).json({ error: 'sequenceId and campaignId required.' });
  const sb = getSupabase();

  const { data: seq } = await sb.from('email_mkt_sequences').select('*').eq('id', sequenceId).single();
  if (!seq) return res.status(404).json({ error: 'Sequence not found.' });
  const steps: Array<{ step_number: number; template_id: string; delay_days: number }> = seq.steps ?? [];
  if (!steps.length) return res.status(400).json({ error: 'Sequence has no steps configured.' });

  const { data: recipients } = await sb.from('email_mkt_recipients')
    .select('email, lead_name, lead_id, sent_at').eq('campaign_id', campaignId).eq('status', 'sent');
  if (!recipients?.length) return res.status(400).json({ error: 'No sent recipients found for that campaign.' });

  // Enrich with company from cleaning_leads
  const leadIds = [...new Set(recipients.filter((r: any) => r.lead_id).map((r: any) => r.lead_id))];
  const { data: leadDetails } = leadIds.length
    ? await sb.from('cleaning_leads').select('id, company').in('id', leadIds)
    : { data: [] as any[] };
  const leadMap = new Map((leadDetails ?? []).map((l: any) => [l.id, l]));

  const [{ data: unsubs }, { data: existing }] = await Promise.all([
    sb.from('email_mkt_unsubscribes').select('email'),
    sb.from('email_mkt_sequence_enrollments').select('email').eq('sequence_id', sequenceId),
  ]);
  const unsubSet = new Set((unsubs ?? []).map((u: any) => u.email.toLowerCase()));
  const existingSet = new Set((existing ?? []).map((e: any) => e.email.toLowerCase()));

  const sorted = [...steps].sort((a, b) => a.delay_days - b.delay_days);
  const firstStep = sorted[0];

  const toInsert: any[] = [];
  for (const r of recipients as any[]) {
    if (!r.email || unsubSet.has(r.email.toLowerCase()) || existingSet.has(r.email.toLowerCase())) continue;
    const enrolledAt = r.sent_at ? new Date(r.sent_at) : new Date();
    const nextSendAt = new Date(enrolledAt.getTime() + firstStep.delay_days * 86400000);
    const lead = r.lead_id ? leadMap.get(r.lead_id) : null;
    toInsert.push({
      id: `enr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sequence_id: sequenceId,
      source_campaign_id: campaignId,
      email: r.email,
      lead_name: r.lead_name ?? null,
      company: (lead as any)?.company ?? null,
      enrolled_at: enrolledAt.toISOString(),
      next_step: firstStep.step_number,
      next_send_at: nextSendAt.toISOString(),
      status: 'active',
    });
  }
  if (!toInsert.length) return res.status(200).json({ ok: true, enrolled: 0, skipped: recipients.length });
  for (let i = 0; i < toInsert.length; i += 500) {
    await sb.from('email_mkt_sequence_enrollments').insert(toInsert.slice(i, i + 500));
  }
  return res.status(200).json({ ok: true, enrolled: toInsert.length, skipped: recipients.length - toInsert.length });
}

async function emailMktSendDueSequences(body: any, res: VercelResponse) {
  const { sequenceId, batchSize = 50 } = body;
  const sb = getSupabase();
  const resend = await getResend();
  const now = new Date().toISOString();
  const appUrl = process.env.APP_URL ?? APP_URL;

  let q = sb.from('email_mkt_sequence_enrollments')
    .select('*').eq('status', 'active').lte('next_send_at', now).limit(batchSize);
  if (sequenceId) q = (q as any).eq('sequence_id', sequenceId);
  const { data: due } = await q;
  if (!due?.length) return res.status(200).json({ sent: 0, due: 0 });

  const seqIds = [...new Set((due as any[]).map((e: any) => e.sequence_id))];
  const { data: seqs } = await sb.from('email_mkt_sequences').select('*').in('id', seqIds);
  const allTplIds = [...new Set((seqs ?? []).flatMap((s: any) => (s.steps ?? []).map((st: any) => st.template_id)))];
  const { data: tmpls } = await sb.from('email_mkt_templates').select('*').in('id', allTplIds);
  const tmplMap = new Map((tmpls ?? []).map((t: any) => [t.id, t]));

  const { data: unsubs } = await sb.from('email_mkt_unsubscribes').select('email')
    .in('email', (due as any[]).map((e: any) => e.email));
  const unsubSet = new Set((unsubs ?? []).map((u: any) => u.email.toLowerCase()));

  let sent = 0;
  for (const enr of due as any[]) {
    if (unsubSet.has(enr.email.toLowerCase())) {
      await sb.from('email_mkt_sequence_enrollments').update({ status: 'unsubscribed' }).eq('id', enr.id);
      continue;
    }
    const seq = (seqs ?? []).find((s: any) => s.id === enr.sequence_id);
    if (!seq) continue;
    const steps: Array<{ step_number: number; template_id: string; delay_days: number }> = (seq as any).steps ?? [];
    const step = steps.find(s => s.step_number === enr.next_step);
    if (!step) {
      await sb.from('email_mkt_sequence_enrollments').update({ status: 'completed', next_send_at: null }).eq('id', enr.id);
      continue;
    }
    const tmpl = tmplMap.get(step.template_id) as any;
    if (!tmpl) continue;

    const unsubLink = `${appUrl}/api/documents?flow=email-mkt&action=unsubscribe&email=${encodeURIComponent(enr.email)}&cid=${enr.source_campaign_id ?? enr.sequence_id}`;
    const firstName = (enr.lead_name || '').split(' ')[0] || 'there';
    const personalBody = (tmpl.body_html as string)
      .replace(/\{First Name\}/g, firstName)
      .replace(/\{name\}/gi, enr.lead_name || 'there')
      .replace(/\{company\}/gi, enr.company || '')
      .replace(/\{unsubscribe_link\}/gi, unsubLink);
    const unsubFooter = `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/><p style="font-size:12px;color:#999;margin:0">To unsubscribe, <a href="${unsubLink}" style="color:#999">click here</a>.</p>`;
    const htmlBody = personalBody.includes('<')
      ? (personalBody.includes('</body>') ? personalBody.replace('</body>', `${unsubFooter}</body>`) : personalBody + unsubFooter)
      : `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:600px">${personalBody.replace(/\n/g, '<br/>')}<br/><br/>${unsubFooter}</div>`;
    const subject = (tmpl.subject as string)
      .replace(/\{First Name\}/g, firstName)
      .replace(/\{name\}/gi, enr.lead_name || '')
      .replace(/\{company\}/gi, enr.company || '');

    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'team@ejretreats.com',
        reply_to: process.env.RESEND_REPLY_TO ?? ADMIN_EMAIL,
        to: enr.email, subject, html: htmlBody,
      });
      sent++;
      const sorted = [...steps].sort((a, b) => a.delay_days - b.delay_days);
      const nextStep = sorted.find(s => s.step_number > enr.next_step);
      if (nextStep) {
        const nextSendAt = new Date(new Date(enr.enrolled_at).getTime() + nextStep.delay_days * 86400000);
        await sb.from('email_mkt_sequence_enrollments').update({ next_step: nextStep.step_number, next_send_at: nextSendAt.toISOString() }).eq('id', enr.id);
      } else {
        await sb.from('email_mkt_sequence_enrollments').update({ status: 'completed', next_send_at: null }).eq('id', enr.id);
      }
    } catch { /* continue */ }
  }
  return res.status(200).json({ sent, total: (due as any[]).length });
}

// ─────────────────────────────────────────────────────────────────────────────

const TWILIO_FROM = () => process.env.TWILIO_PHONE_NUMBER!;

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return null;
}

async function smsGetTemplates(res: VercelResponse) {
  const { data, error } = await getSupabase().from('sms_templates').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ templates: data ?? [] });
}

async function smsGetCampaigns(res: VercelResponse) {
  const { data, error } = await getSupabase().from('sms_campaigns').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ campaigns: data ?? [] });
}

async function smsUpsertTemplate(body: any, res: VercelResponse) {
  const now = new Date().toISOString();
  const id = body.id ?? `smstpl_${Date.now()}`;
  const { error } = await getSupabase().from('sms_templates').upsert({ id, name: body.name, body: body.body, updated_at: now }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ id });
}

async function smsDeleteTemplate(body: any, res: VercelResponse) {
  const { error } = await getSupabase().from('sms_templates').delete().eq('id', body.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function smsSendCampaign(body: any, res: VercelResponse) {
  const { campaignName, templateId, templateBody, leads } = body;
  if (!templateBody || !Array.isArray(leads) || leads.length === 0)
    return res.status(400).json({ error: 'templateBody and leads[] required.' });

  const sb = getSupabase();
  const twilio = await getTwilio();
  const campaignId = `smsc_${Date.now()}`;
  const now = new Date().toISOString();

  const { error: cErr } = await sb.from('sms_campaigns').insert({
    id: campaignId,
    name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
    template_id: templateId ?? null,
    template_body: templateBody,
    status: 'sending',
    lead_category: body.leadCategory ?? 'Property Management',
    sent_count: 0, response_count: 0, calls_set: 0, closes: 0,
    created_at: now, sent_at: now,
  });
  if (cErr) return res.status(500).json({ error: cErr.message });

  let sentCount = 0;
  const recipients: any[] = [];
  for (const lead of leads) {
    const phone = normalizePhone(lead.phone);
    if (!phone) {
      recipients.push({ id: randomUUID(), campaign_id: campaignId, lead_id: lead.id, lead_name: lead.name, phone: lead.phone, status: 'failed', sent_at: now, error_msg: 'Invalid phone number' });
      continue;
    }
    const msg_body = templateBody.replace(/\{name\}/gi, lead.name || 'there').replace(/\{company\}/gi, lead.company || '').replace(/\{propertyAddress\}/gi, lead.propertyAddress || '');
    try {
      const msg = await twilio.messages.create({ body: msg_body, from: TWILIO_FROM(), to: phone });
      sentCount++;
      recipients.push({ id: randomUUID(), campaign_id: campaignId, lead_id: lead.id, lead_name: lead.name, phone, status: 'sent', sent_at: now, twilio_message_sid: msg.sid });
    } catch (e: any) {
      recipients.push({ id: randomUUID(), campaign_id: campaignId, lead_id: lead.id, lead_name: lead.name, phone, status: 'failed', sent_at: now, error_msg: e.message ?? 'Send failed' });
    }
  }
  if (recipients.length > 0) await sb.from('sms_campaign_recipients').insert(recipients);
  await sb.from('sms_campaigns').update({ sent_count: sentCount, status: 'sent' }).eq('id', campaignId);
  return res.json({ campaignId, sentCount, totalLeads: leads.length });
}

async function smsUpdateStats(body: any, res: VercelResponse) {
  const update: any = {};
  if (typeof body.callsSet === 'number') update.calls_set = body.callsSet;
  if (typeof body.closes === 'number') update.closes = body.closes;
  const { error } = await getSupabase().from('sms_campaigns').update(update).eq('id', body.campaignId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function smsDeleteCampaign(body: any, res: VercelResponse) {
  const sb = getSupabase();
  await sb.from('sms_campaign_recipients').delete().eq('campaign_id', body.id);
  const { error } = await sb.from('sms_campaigns').delete().eq('id', body.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}

async function smsGetInbox(res: VercelResponse) {
  const sb = getSupabase();
  const [{ data: messages, error: mErr }, { data: replies }] = await Promise.all([
    sb.from('sms_inbound_messages').select('*').order('received_at', { ascending: false }).limit(500),
    sb.from('sms_outbound_replies').select('*').order('sent_at', { ascending: false }).limit(500),
  ]);
  if (mErr) return res.status(500).json({ error: mErr.message });

  const phones = [...new Set((messages ?? []).map((m: any) => m.from_phone as string))];
  const leadByPhone = new Map<string, string>();
  if (phones.length > 0) {
    const { data: recipients } = await sb
      .from('sms_campaign_recipients').select('phone, lead_name').in('phone', phones);
    for (const r of (recipients ?? [])) {
      if (r.lead_name && !leadByPhone.has(r.phone)) leadByPhone.set(r.phone, r.lead_name);
    }
  }
  const enriched = (messages ?? []).map((m: any) => ({ ...m, lead_name: leadByPhone.get(m.from_phone) ?? null }));
  return res.json({ messages: enriched, replies: replies ?? [] });
}

async function smsSendReply(body: any, res: VercelResponse) {
  const { to, replyBody } = body;
  if (!to || !replyBody?.trim()) return res.status(400).json({ error: 'to and replyBody required.' });
  const phone = normalizePhone(to) ?? to;
  const twilio = await getTwilio();
  try {
    const msg = await twilio.messages.create({ body: replyBody, from: TWILIO_FROM(), to: phone });
    const sb = getSupabase();
    await sb.from('sms_outbound_replies').insert({
      id: randomUUID(), to_phone: phone, body: replyBody,
      twilio_message_sid: msg.sid, sent_at: new Date().toISOString(),
    });
    return res.json({ sid: msg.sid });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'Reply failed.' });
  }
}

async function smsInbound(req: VercelRequest, res: VercelResponse) {
  const fromRaw: string = (req.body?.From ?? req.query?.From ?? '') as string;
  const msgBody: string = (req.body?.Body ?? req.query?.Body ?? '') as string;
  const sid: string = (req.body?.MessageSid ?? '') as string;
  if (!fromRaw) return res.status(400).send('Missing From');
  const from = normalizePhone(fromRaw) ?? fromRaw;
  const sb = getSupabase();
  const now = new Date().toISOString();

  await sb.from('sms_inbound_messages').insert({ id: randomUUID(), from_phone: from, body: msgBody, twilio_sid: sid, received_at: now });

  // Find most recent recipient record for this phone (any status) to get lead name
  const { data: recipient } = await sb
    .from('sms_campaign_recipients')
    .select('id, campaign_id, status, lead_name')
    .eq('phone', from)
    .order('sent_at', { ascending: false })
    .limit(1).single();

  const leadName: string | null = recipient?.lead_name ?? null;

  if (recipient && recipient.status === 'sent') {
    await sb.from('sms_campaign_recipients').update({ status: 'responded', responded_at: now }).eq('id', recipient.id);
    const { data: camp } = await sb.from('sms_campaigns').select('response_count').eq('id', recipient.campaign_id).single();
    if (camp) await sb.from('sms_campaigns').update({ response_count: (camp.response_count ?? 0) + 1 }).eq('id', recipient.campaign_id);
  }

  if (/^\s*stop\s*$/i.test(msgBody)) {
    await sb.from('sms_campaign_recipients').update({ status: 'opted_out' }).eq('phone', from);
  } else {
    // Send notification email (non-blocking — don't delay Twilio response)
    const notifyEmail = process.env.NOTIFY_EMAIL;
    if (notifyEmail) {
      const crmUrl = (process.env.CRM_URL ?? APP_URL).replace(/\/$/, '');
      const inboxUrl = `${crmUrl}?goto=sms-inbox`;
      const preview = msgBody.length > 80 ? msgBody.slice(0, 80) + '…' : msgBody;
      const subjectName = leadName ?? from;
      getResend().then(resend => resend.emails.send({
        from: 'E&J Retreats CRM <cleaning@ejretreats.com>',
        to: notifyEmail,
        subject: `📱 SMS reply from ${subjectName}: "${preview}"`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc">
            <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
              <h2 style="color:#1e40af;margin:0 0 4px;font-size:18px">📱 New SMS Reply</h2>
              <p style="color:#64748b;margin:0 0 20px;font-size:13px">Someone replied to your SMS campaign</p>
              <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:0 0 20px">
                <table style="width:100%;border-collapse:collapse">
                  <tr>
                    <td style="padding:4px 0;color:#64748b;font-size:13px;width:90px">From</td>
                    <td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:13px">${leadName ? `${leadName} (${from})` : from}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;color:#64748b;font-size:13px;vertical-align:top">Message</td>
                    <td style="padding:4px 0;color:#0f172a;font-size:14px;line-height:1.5">${msgBody.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center;margin:24px 0">
                <a href="${inboxUrl}" style="background:#1e40af;color:white;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                  View &amp; Reply in CRM →
                </a>
              </div>
              <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0">Go to SMS Campaigns → Inbox tab to reply</p>
            </div>
          </div>
        `,
      })).catch(() => {});
    }
  }

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

// ─── Lead Scraper ─────────────────────────────────────────────────────────────

const SCRAPER_SKIP_DOMAINS = [
  'facebook.com','linkedin.com','instagram.com','twitter.com','x.com','reddit.com',
  'wikipedia.org','bbb.org','angi.com','thumbtack.com','apartments.com','realtor.com',
  'zillow.com','trulia.com','redfin.com','indeed.com','glassdoor.com','google.com',
  'bing.com','duckduckgo.com','yahoo.com','mapquest.com','homeadvisor.com',
  'angieslist.com','houzz.com','alignable.com','manta.com','chamberofcommerce.com',
  'yelp.com','yellowpages.com','whitepages.com','superpages.com','foursquare.com',
];

// URL patterns that indicate a contact/about/team page — crawled first
const CONTACT_PATH_RE = /\/(contact|about|reach|get.in.touch|team|staff|connect|email|hire|people|our.team|meet)[^/]*/i;
// Resource extensions to skip when following links
const SKIP_EXT_RE = /\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf|doc|docx|xls|zip|json|ico|woff|woff2|ttf|mp4|mp3|avi|mov|xml)(\?|$)/i;

function isNoiseEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (/^(noreply|no-reply|donotreply|bounce|mailer-daemon|postmaster|webmaster|admin|info@wix|support@wix|privacy|legal|security|example|test|sample|user|email|name)@/.test(lower)) return true;
  if (/(wixpress|squarespace|wordpress|godaddy|hostgator|siteground|elementor|mailchimp|sendgrid|amazonaws|cloudfront|akamai|fastly|sentry\.io|hubspot|salesforce|zendesk|example\.com)/.test(lower)) return true;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|pdf|doc|xml|json|ico|woff|ttf)$/.test(lower)) return true;
  const parts = lower.split('@');
  if (parts.length !== 2) return true;
  const tld = parts[1].split('.').pop() || '';
  if (tld.length < 2 || tld.length > 6) return true;
  return false;
}

function scraperCleanText(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '').trim();
}

// ── Sitemap discovery ─────────────────────────────────────────────────────────

async function parseSitemapXml(xml: string, sameHost: string, out: string[], seen: Set<string>, depth: number): Promise<void> {
  if (depth > 2 || out.length >= 200) return;
  // Sitemap index → recurse into child sitemaps
  if (xml.includes('<sitemapindex')) {
    for (const m of [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].slice(0, 8)) {
      const childUrl = m[1].trim();
      if (seen.has(childUrl)) continue;
      seen.add(childUrl);
      const childXml = await fetchHtml(childUrl, 4000);
      if (childXml) await parseSitemapXml(childXml, sameHost, out, seen, depth + 1);
    }
    return;
  }
  // Regular urlset
  for (const m of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
    const u = m[1].trim();
    if (seen.has(u)) continue;
    seen.add(u);
    try {
      if (new URL(u).hostname.replace('www.', '').includes(sameHost)) out.push(u);
    } catch {}
  }
}

async function fetchSitemapUrls(origin: string, sameHost: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  // 1. Check robots.txt for Sitemap: directive
  const robots = await fetchHtml(`${origin}/robots.txt`, 3000);
  if (robots) {
    for (const m of robots.matchAll(/^sitemap:\s*(.+)$/gim)) {
      const sitemapUrl = m[1].trim();
      if (seen.has(sitemapUrl)) continue;
      seen.add(sitemapUrl);
      const xml = await fetchHtml(sitemapUrl, 4000);
      if (xml) await parseSitemapXml(xml, sameHost, out, seen, 0);
    }
  }
  // 2. Fall back to common sitemap paths
  if (!out.length) {
    for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.xml.gz']) {
      const url = `${origin}${path}`;
      if (seen.has(url)) continue;
      seen.add(url);
      const xml = await fetchHtml(url, 4000);
      if (xml) { await parseSitemapXml(xml, sameHost, out, seen, 0); if (out.length) break; }
    }
  }
  return out;
}

// ── Link extraction ───────────────────────────────────────────────────────────

function findInternalLinks(html: string, origin: string, sameHost: string): string[] {
  const links: string[] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href.startsWith('#')) continue;
    if (SKIP_EXT_RE.test(href)) continue;
    const full = href.startsWith('http') ? href : href.startsWith('/') ? `${origin}${href}` : null;
    if (!full) continue;
    const norm = full.split('#')[0].split('?')[0];
    try {
      if (!new URL(norm).hostname.replace('www.', '').includes(sameHost)) continue;
    } catch { continue; }
    links.push(norm);
  }
  return [...new Set(links)];
}

// ── BFS domain crawler ────────────────────────────────────────────────────────

async function crawlDomainForEmails(
  startUrl: string,
  budgetMs = 20000,
): Promise<{ emails: string[]; phones: string[]; businessName: string; pagesChecked: number; blocked: boolean }> {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  const empty = { emails: [] as string[], phones: [] as string[], businessName: '', pagesChecked: 0, blocked: false };

  let base: URL;
  try { base = new URL(startUrl); } catch { return empty; }
  const origin = base.origin;
  const sameHost = base.hostname.replace('www.', '');

  const visited = new Set<string>();
  const emails: string[] = [];
  const phones: string[] = [];
  let businessName = sameHost;
  let pagesChecked = 0;
  let siteBlocked = false;

  type QItem = { url: string; priority: number };
  const queue: QItem[] = [];
  const enqueue = (url: string, priority: number) => {
    const norm = url.split('#')[0].split('?')[0];
    if (!visited.has(norm) && !queue.some(q => q.url === norm)) queue.push({ url: norm, priority });
  };
  const dequeue = (): QItem | undefined => {
    if (!queue.length) return undefined;
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].priority > queue[best].priority) best = i;
    return queue.splice(best, 1)[0];
  };

  // Seed with homepage (highest priority) then common contact paths
  enqueue(startUrl, 10);
  for (const p of ['/contact', '/contact-us', '/about', '/about-us', '/team', '/our-team', '/staff', '/reach-us', '/get-in-touch']) {
    enqueue(`${origin}${p}`, 9);
  }

  const PHONE_RE = /(?:\+?1[-.\s]?)?\(?([2-9][0-9]{2})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;

  while (queue.length > 0 && pagesChecked < 10 && elapsed() < budgetMs - 1000) {
    const item = dequeue();
    if (!item) break;
    const { url } = item;
    if (visited.has(url)) continue;
    visited.add(url);
    pagesChecked++;

    const timeLeft = budgetMs - elapsed() - 500;
    if (timeLeft < 500) break;

    const html = await fetchHtml(url, Math.min(8000, timeLeft));
    if (!html) continue;

    if (isCloudflarePage(html)) {
      if (pagesChecked === 1) siteBlocked = true;
      continue;
    }

    // Homepage: extract title + phones
    if (pagesChecked === 1) {
      const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const raw = (titleM?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
      const name = raw.replace(/\s*[-–|·•,]\s*.{0,40}$/, '').replace(/\s+/g, ' ').trim();
      if (name) businessName = name;
      for (const p of html.match(PHONE_RE) ?? []) {
        const d = p.replace(/\D/g, '').replace(/^1/, '');
        if (d.length === 10) { const fmt = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; if (!phones.includes(fmt)) phones.push(fmt); }
      }
    }

    for (const e of extractEmailsFromHtml(html)) {
      if (!emails.includes(e)) emails.push(e);
    }
    if (emails.length >= 5) break;

    // Discover more same-domain links, prioritise contact-like paths
    if (elapsed() < budgetMs - 3000) {
      for (const link of findInternalLinks(html, origin, sameHost)) {
        enqueue(link, CONTACT_PATH_RE.test(link) ? 8 : 1);
      }
    }
  }

  return { emails: emails.slice(0, 5), phones: phones.slice(0, 3), businessName, pagesChecked, blocked: siteBlocked && emails.length === 0 };
}

function scraperAddResult(
  rawUrl: string,
  title: string,
  snippet: string,
  seen: Set<string>,
  results: { name: string; url: string; description: string }[],
  maxCount: number,
  dedupByUrl = false,
): boolean {
  if (!rawUrl.startsWith('http')) return false;
  let hostname = '';
  try { hostname = new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { return false; }
  if (SCRAPER_SKIP_DOMAINS.some(d => hostname.includes(d))) return false;
  const dedupKey = dedupByUrl ? rawUrl : hostname;
  if (seen.has(dedupKey)) return false;
  seen.add(dedupKey);
  results.push({ name: title || hostname, url: rawUrl, description: snippet });
  return results.length >= maxCount;
}

async function scraperSearchDDG(
  q: string,
  seen: Set<string>,
  results: { name: string; url: string; description: string }[],
  maxCount: number,
): Promise<{ status: number; htmlLen: number; anchorCount: number }> {
  const info = { status: 0, htmlLen: 0, anchorCount: 0 };
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://duckduckgo.com/',
      },
      signal: AbortSignal.timeout(12000),
    });
    info.status = r.status;
    if (!r.ok) return info;
    const html = await r.text();
    info.htmlLen = html.length;

    // Match entire <a> tag regardless of attribute order
    const anchors = [...html.matchAll(/<a\b[^>]*class="result__a"[^>]*>[\s\S]*?<\/a>/g)];
    const snips   = [...html.matchAll(/<a\b[^>]*class="result__snippet"[^>]*>[\s\S]*?<\/a>/g)];
    info.anchorCount = anchors.length;

    for (let i = 0; i < anchors.length && results.length < maxCount; i++) {
      const aHtml = anchors[i][0];
      const hrefM = aHtml.match(/href="([^"]+)"/);
      if (!hrefM) continue;
      let rawUrl = hrefM[1];
      if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
      if (rawUrl.includes('duckduckgo.com/l/')) {
        try { const u = new URL(rawUrl).searchParams.get('uddg'); if (u) rawUrl = decodeURIComponent(u); } catch {}
      }
      scraperAddResult(rawUrl, scraperCleanText(aHtml), scraperCleanText(snips[i]?.[0] ?? ''), seen, results, maxCount);
    }
  } catch {}
  return info;
}

function decodeBingRedirect(href: string): string {
  // Bing wraps result links as /ck/a?!&&p=HASH&u=a1BASE64URL&ntb=1
  // The 'u' param is 'a1' prefix + base64url-encoded actual URL
  try {
    const full = href.startsWith('/') ? 'https://www.bing.com' + href : href;
    // URL may have unescaped & in HTML — replace &amp; then parse
    const clean = full.replace(/&amp;/g, '&');
    const uParam = new URL(clean).searchParams.get('u');
    if (uParam?.startsWith('a1')) {
      const b64 = uParam.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      if (decoded.startsWith('http')) return decoded;
    }
  } catch {}
  return href;
}

async function scraperSearchBing(
  q: string,
  seen: Set<string>,
  results: { name: string; url: string; description: string }[],
  maxCount: number,
): Promise<{ status: number; htmlLen: number; anchorCount: number; htmlSnippet?: string }> {
  const info: { status: number; htmlLen: number; anchorCount: number; htmlSnippet?: string } = { status: 0, htmlLen: 0, anchorCount: 0 };
  try {
    const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=20&form=QBLH`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });
    info.status = r.status;
    if (!r.ok) return info;
    const html = await r.text();
    info.htmlLen = html.length;
    info.htmlSnippet = html.slice(0, 800);

    // Bing wraps result title links in <h2>; extract every anchor inside any <h2>
    const h2Blocks = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)];
    info.anchorCount = h2Blocks.length;

    for (const h2 of h2Blocks) {
      if (results.length >= maxCount) break;
      const hrefM = h2[1].match(/href="([^"]+)"/);
      if (!hrefM) continue;

      // Decode Bing's click-tracking redirect to get the real URL
      let rawUrl = decodeBingRedirect(hrefM[1]);
      if (rawUrl.includes('bing.com') || rawUrl.includes('microsoft.com')) continue;
      if (!rawUrl.startsWith('http')) continue;

      const title = scraperCleanText(h2[1]);
      scraperAddResult(rawUrl, title, '', seen, results, maxCount);
    }
  } catch {}
  return info;
}

async function scraperSearchBrave(
  q: string,
  apiKey: string,
  seen: Set<string>,
  results: { name: string; url: string; description: string }[],
  maxCount: number,
  dedupByUrl = false,
): Promise<number> {
  try {
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20&search_lang=en&country=us`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return 0;
    const data = await r.json();
    const items: any[] = data?.web?.results ?? [];
    for (const item of items) {
      if (results.length >= maxCount) break;
      const rawUrl = item.url ?? item.profile?.url;
      if (!rawUrl) continue;
      scraperAddResult(rawUrl, item.title ?? '', item.description ?? '', seen, results, maxCount, dedupByUrl);
    }
    return items.length;
  } catch { return 0; }
}

async function scraperFindUrls(req: VercelRequest, res: VercelResponse) {
  const { businessType = 'property management', city = '', state = '', count = '20' } = req.query as Record<string, string>;
  const cityState = `${city} ${state}`.trim();
  if (!cityState) return res.status(400).json({ error: 'city and state required' });

  const braveKey = process.env.BRAVE_SEARCH_API_KEY ?? '';
  if (!braveKey) {
    return res.status(503).json({
      error: 'BRAVE_SEARCH_API_KEY not configured',
      setup: 'Get a free API key at https://brave.com/search/api/ (2,000 searches/month free), then add BRAVE_SEARCH_API_KEY to your Vercel environment variables.',
    });
  }

  const typeQueries: Record<string, string[]> = {
    'property management': [`property management companies ${cityState}`, `property managers ${cityState}`, `residential property management ${cityState}`],
    'realtor':             [`realtors ${cityState}`, `real estate agents ${cityState}`, `real estate team ${cityState}`],
    'short term rental':   [`vacation rental management ${cityState}`, `short term rental management ${cityState}`, `airbnb property manager ${cityState}`],
    'investor':            [`real estate investors ${cityState}`, `property investors ${cityState}`, `real estate investment company ${cityState}`],
    'direct booking':      [
      `site:holidayfuture.com ${city}`,
      `site:hospitable.rentals ${city}`,
      `site:guestybookings.com ${city}`,
      `site:hostfully.com ${city}`,
      `site:lodgify.com ${city}`,
      `site:ownerreservations.com ${city}`,
      `site:liverez.com ${city}`,
      `"powered by hostaway" ${cityState} vacation rental`,
      `"powered by guesty" ${cityState} vacation rental`,
      `"powered by uplisting" ${cityState} short term rental`,
      `"powered by lodgify" ${cityState} vacation rental`,
      `"powered by ownerrez" ${cityState} vacation rental`,
      `"powered by tokeet" ${cityState} short term rental`,
      `"powered by streamline" ${cityState} vacation rental`,
      `"book direct" short term rental ${cityState} owner`,
    ],
  };
  const queries = typeQueries[businessType] ?? [`${businessType} ${cityState}`];
  const maxCount = Math.min(parseInt(count) || 20, 60);
  const seen = new Set<string>();
  const results: { name: string; url: string; description: string }[] = [];

  const dedupByUrl = businessType === 'direct booking';
  for (const q of queries) {
    if (results.length >= maxCount) break;
    await scraperSearchBrave(q, braveKey, seen, results, maxCount, dedupByUrl);
    if (queries.indexOf(q) < queries.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  return res.status(200).json({ results, count: results.length });
}

const SCRAPER_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchHtml(url: string, timeoutMs = 9000): Promise<string> {
  try {
    const r = await fetch(url, { headers: SCRAPER_FETCH_HEADERS, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

function isCloudflarePage(html: string): boolean {
  return html.length < 60000 && (
    /cf-browser-verification|checking your browser|just a moment\.\.\.|enable javascript and cookies/i.test(html) ||
    html.includes('cdn-cgi/challenge-platform') ||
    html.includes('data-cf-settings')
  );
}

function decodeCFEmail(encoded: string): string {
  const key = parseInt(encoded.slice(0, 2), 16);
  let result = '';
  for (let i = 2; i < encoded.length; i += 2) {
    result += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
  }
  return result;
}

function extractEmailsFromHtml(html: string): string[] {
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;
  const MAILTO_RE = /href=["']mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6})/gi;

  // 1. Cloudflare email protection (data-cfemail XOR encoding)
  const cfEmails: string[] = [];
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]{4,})["']/gi)) {
    try {
      const decoded = decodeCFEmail(m[1]);
      if (decoded.includes('@')) cfEmails.push(decoded.toLowerCase());
    } catch { /* skip malformed */ }
  }

  // 2. mailto: href attributes — most reliable
  const mailtoEmails = [...html.matchAll(MAILTO_RE)].map(m => m[1].toLowerCase());

  // 3. JSON-LD / schema.org "email" fields (all occurrences)
  const jsonldEmails: string[] = [];
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of block[1].matchAll(/"email"\s*:\s*"([^"@\s]+@[^"@\s]+)"/gi)) {
      jsonldEmails.push(m[1].toLowerCase());
    }
  }

  // 4. Obfuscated [at] / (at) / (dot) patterns
  const obfuscated: string[] = [];
  const OBF_RE = /([a-zA-Z0-9._%+\-]{2,})\s*(?:\[at\]|\(at\)|@AT@)\s*([a-zA-Z0-9.\-]+)\s*(?:\[dot\]|\(dot\)|\.)\s*([a-zA-Z]{2,6})/gi;
  for (const m of html.matchAll(OBF_RE)) {
    obfuscated.push(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase());
  }

  // 5. General text scan
  const textEmails = [...html.matchAll(EMAIL_RE)].map(m => m[0].toLowerCase());

  const all = [...cfEmails, ...mailtoEmails, ...jsonldEmails, ...obfuscated, ...textEmails];
  return [...new Set(all.filter(e => !isNoiseEmail(e)))].slice(0, 5);
}

// Use Brave's pre-rendered search index to extract emails from a domain.
// Brave renders JS when indexing, so this catches emails that direct HTML fetch misses.
async function scraperEmailsViaBrave(domain: string, apiKey: string): Promise<string[]> {
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}/g;
  const emails: string[] = [];
  const queries = [`"@${domain}"`, `site:${domain} email contact`];
  for (const q of queries) {
    if (emails.length >= 3) break;
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&search_lang=en&country=us`, {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      for (const item of (data?.web?.results ?? []) as any[]) {
        const text = `${item.title ?? ''} ${item.description ?? ''}`;
        for (const m of text.matchAll(EMAIL_RE)) {
          const e = m[0].toLowerCase();
          // Only keep emails that belong to this domain
          if (!isNoiseEmail(e) && (e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`)) && !emails.includes(e)) {
            emails.push(e);
          }
        }
      }
    } catch { /* network error — skip */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return emails.slice(0, 5);
}

async function scraperScrapeEmails(body: any, res: VercelResponse) {
  const { urls } = body;
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'urls[] required' });

  const braveKey = process.env.BRAVE_SEARCH_API_KEY ?? '';

  const results = await Promise.all(urls.slice(0, 10).map(async (url: string) => {
    const fallback = { url, businessName: '', emails: [] as string[], phones: [] as string[], found: false, blocked: false, pagesChecked: 0 };
    try {
      const base = new URL(url);
      const domain = base.hostname.replace(/^www\./, '');
      fallback.businessName = domain;

      // Run Brave index search + direct page crawl in parallel
      const [braveEmails, crawlResult] = await Promise.all([
        braveKey ? scraperEmailsViaBrave(domain, braveKey) : Promise.resolve([] as string[]),
        crawlDomainForEmails(url, 20000),
      ]);

      // Merge: direct crawl wins (freshest), Brave fills gaps
      const merged = [...new Set([...crawlResult.emails, ...braveEmails])].filter(e => !isNoiseEmail(e)).slice(0, 5);

      return {
        url,
        businessName: crawlResult.businessName || domain,
        emails: merged,
        phones: crawlResult.phones,
        found: merged.length > 0,
        blocked: crawlResult.blocked,
        pagesChecked: crawlResult.pagesChecked,
      };
    } catch (e) {
      return { ...fallback, error: String(e) };
    }
  }));

  return res.status(200).json({ results });
}

// ── SIGNED DOCUMENT PDF DOWNLOADS ────────────────────────────────────────────

async function cleanerAgreementPdf(req: VercelRequest, res: VercelResponse) {
  const cleanerId = req.query.cleanerId as string;
  if (!cleanerId) return res.status(400).json({ error: 'cleanerId required' });

  const supabase = getSupabase();
  const { data: row } = await supabase
    .from('cleaner_onboarding_tokens')
    .select('agreement_data, cleaner_name, completed_at')
    .eq('cleaner_id', cleanerId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row?.agreement_data) return res.status(404).json({ error: 'No signed agreement found for this cleaner.' });

  const d = row.agreement_data as { name: string; address: string; phone: string; email: string; signatureDataUrl: string; signedAt: string };

  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = height - 48;
  const left = 60;
  const lineH = 18;

  // Header
  page.drawText('E&J RETREATS', { x: left, y, size: 20, font: fontBold, color: rgb(0.07, 0.25, 0.62) });
  y -= 22;
  page.drawText('Independent Contractor Agreement — Signed Copy', { x: left, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.07, 0.25, 0.62) });
  y -= 26;

  // Contractor Details
  page.drawText('CONTRACTOR DETAILS', { x: left, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  y -= lineH;

  const fields: [string, string][] = [
    ['Name', d.name],
    ['Email', d.email],
    ['Phone', d.phone || '—'],
    ['Address', d.address || '—'],
    ['Date Signed', new Date(d.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
  ];
  for (const [label, value] of fields) {
    page.drawText(`${label}:`, { x: left, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(value, { x: left + 70, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    y -= lineH;
  }

  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;

  // Agreement Summary
  page.drawText('AGREEMENT SUMMARY', { x: left, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  y -= lineH;

  const summaryLines = [
    'The undersigned agrees to provide cleaning and housekeeping services as an independent',
    'contractor for E&J Retreats. The contractor acknowledges they are not an employee and',
    'are responsible for their own taxes and insurance. Services will be performed according',
    'to the standards and schedules agreed upon with E&J Retreats.',
    '',
    'This agreement covers: cleaning services, property preparation, quality standards,',
    'payment terms, confidentiality, and independent contractor status.',
  ];
  for (const line of summaryLines) {
    if (line === '') { y -= 8; continue; }
    page.drawText(line, { x: left, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= lineH;
  }

  y -= 20;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 24;

  // Signature section
  page.drawText('CONTRACTOR SIGNATURE', { x: left, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;

  if (d.signatureDataUrl?.startsWith('data:image/png;base64,')) {
    try {
      const base64 = d.signatureDataUrl.split(',')[1];
      const sigBytes = Buffer.from(base64, 'base64');
      const sigImage = await pdfDoc.embedPng(sigBytes);
      const sigDims = sigImage.scaleToFit(240, 80);
      page.drawRectangle({ x: left, y: y - sigDims.height - 4, width: sigDims.width + 8, height: sigDims.height + 8, color: rgb(0.98, 0.98, 0.98), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
      page.drawImage(sigImage, { x: left + 4, y: y - sigDims.height, width: sigDims.width, height: sigDims.height });
      y -= sigDims.height + 20;
    } catch (_) {
      page.drawText('[Signature on file]', { x: left, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
      y -= 20;
    }
  }

  page.drawLine({ start: { x: left, y }, end: { x: left + 240, y }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
  y -= lineH;
  page.drawText(d.name, { x: left, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
  y -= lineH;
  page.drawText(new Date(d.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), { x: left, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });

  // Footer
  page.drawText('E&J Retreats  ·  ejretreats.com  ·  This document is a legally binding agreement.', {
    x: left, y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6),
  });

  const pdfBytes = await pdfDoc.save();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="contractor-agreement-${d.name.replace(/\s+/g, '-')}.pdf"`);
  return res.status(200).send(Buffer.from(pdfBytes));
}

async function clientEnrollmentPdf(req: VercelRequest, res: VercelResponse) {
  const propertyConfigId = req.query.propertyConfigId as string;
  if (!propertyConfigId) return res.status(400).json({ error: 'propertyConfigId required' });

  const supabase = getSupabase();
  const { data: config } = await supabase
    .from('cleaning_property_configs')
    .select('property_name, client_name, client_email, onboarded_at')
    .eq('id', propertyConfigId)
    .maybeSingle();

  if (!config?.onboarded_at) return res.status(404).json({ error: 'No enrollment record found for this property.' });

  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = height - 48;
  const left = 60;
  const lineH = 18;

  // Header
  page.drawText('E&J RETREATS', { x: left, y, size: 20, font: fontBold, color: rgb(0.07, 0.25, 0.62) });
  y -= 22;
  page.drawText('Cleaning Services — Client Enrollment Confirmation', { x: left, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.07, 0.25, 0.62) });
  y -= 26;

  // Client details
  page.drawText('ENROLLMENT DETAILS', { x: left, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  y -= lineH;

  const enrollDate = new Date(config.onboarded_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fields: [string, string][] = [
    ['Property', config.property_name || '—'],
    ['Client Name', config.client_name || '—'],
    ['Client Email', config.client_email || '—'],
    ['Enrollment Date', enrollDate],
  ];
  for (const [label, value] of fields) {
    page.drawText(`${label}:`, { x: left, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(value, { x: left + 90, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    y -= lineH;
  }

  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 20;

  // Services summary
  page.drawText('SERVICES ENROLLED', { x: left, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  y -= lineH;

  const serviceLines = [
    'The client has enrolled in E&J Retreats professional cleaning services for the above',
    'property. A payment method has been securely authorized on file via Stripe.',
    '',
    'Services include: scheduled turnaround cleaning between guest stays, quality',
    'inspection of the property, restocking of supplies as agreed, and reporting of',
    'any property issues or damage found during cleaning.',
    '',
    'Cleaning fees will be charged per completed job as outlined in the service agreement.',
  ];
  for (const line of serviceLines) {
    if (line === '') { y -= 8; continue; }
    page.drawText(line, { x: left, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= lineH;
  }

  y -= 20;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  y -= 24;

  // Confirmation box
  page.drawRectangle({ x: left, y: y - 44, width: width - left * 2, height: 52, color: rgb(0.94, 0.98, 0.95), borderColor: rgb(0.36, 0.88, 0.63), borderWidth: 0.5 });
  page.drawText('Payment Method on File', { x: left + 12, y: y - 18, size: 10, font: fontBold, color: rgb(0.05, 0.45, 0.25) });
  page.drawText('A payment method has been securely saved via Stripe. No card details are stored by E&J Retreats.', { x: left + 12, y: y - 34, size: 8, font, color: rgb(0.1, 0.35, 0.2) });

  // Footer
  page.drawText('E&J Retreats  ·  ejretreats.com  ·  This is a service enrollment confirmation.', {
    x: left, y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6),
  });

  const pdfBytes = await pdfDoc.save();
  const safeName = (config.property_name || 'property').replace(/\s+/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="enrollment-${safeName}.pdf"`);
  return res.status(200).send(Buffer.from(pdfBytes));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
  // Health check — no DB or email needed
  if (req.query.flow === 'health') return res.status(200).json({ ok: true, v: 5 });

  // GET — token status checks
  // Public, token-gated GET flows (client / cleaner pages). Everything else needs a signed-in admin.
  const PUBLIC_GET = new Set(['onboarding', 'cleaning', 'cleaning-client', 'cleaning-enroll', 'cleaner-onboard', 'cleaner-connect', 'cleaner-dashboard']);
  if (req.method === 'GET') {
    const f = String(req.query.flow ?? '');
    const publicGet = PUBLIC_GET.has(f)
      || (f === 'email-mkt' && req.query.action === 'unsubscribe');
    if (!publicGet && !(await requireAdmin(req, res))) return;
    const token = req.query.token as string;
    if (req.query.flow === 'onboarding' && token) return await onboardingGet(token, res);
    if (req.query.flow === 'cleaning' && token) return await cleaningGet(token, res);
    if (req.query.flow === 'cleaning-client' && token) return await cleaningClientGet(token, res);
    if (req.query.flow === 'cleaning-enroll' && token) return await cleaningEnrollGet(token, res);
    if (req.query.flow === 'cleaner-onboard' && token) return await cleanerOnboardGet(token, res);
    if (req.query.flow === 'cleaner-connect' && req.query.combined) return await cleanerConnectVerify(req.query.combined as string, res);
    if (req.query.flow === 'cleaner-dashboard' && req.query.cleanerId) return await cleanerDashboardGet(req.query.cleanerId as string, res);
    if (req.query.flow === 'cleaner-agreement-pdf') return await cleanerAgreementPdf(req, res);
    if (req.query.flow === 'client-enrollment-pdf') return await clientEnrollmentPdf(req, res);
    if (req.query.flow === 'sms') {
      if (req.query.action === 'templates') return await smsGetTemplates(res);
      if (req.query.action === 'campaigns') return await smsGetCampaigns(res);
    }
    if (req.query.flow === 'email-mkt') {
      if (req.query.action === 'templates') return await emailMktGetTemplates(res);
      if (req.query.action === 'campaigns') return await emailMktGetCampaigns(res);
      if (req.query.action === 'sequences') return await emailMktGetSequences(res);
      if (req.query.action === 'unsubscribe') return await emailMktUnsubscribe(req, res);
    }
    if (req.query.flow === 'scraper' && req.query.action === 'find-urls') return await scraperFindUrls(req, res);
    return res.status(405).end();
  }

  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body;

  // Resend webhook: body has { type: 'email.opened', data: { email_id: '...' } }
  if (typeof body.type === 'string' && body.type.startsWith('email.') && body.data?.email_id) {
    return await handleResendWebhook(body, res);
  }

  const action: string = body.action ?? req.query.action as string;
  const flow: string = body.flow ?? req.query.flow as string;

  // Public POST actions: each verifies its own link token (dispatch token, dashboard
  // token, onboarding token, share token) or is an inbound webhook. Everything else
  // is an admin action and requires the Clerk session token from the CRM.
  const PUBLIC_POST = new Set([
    'cleaner-onboard:complete',
    'cleaner:connect-url', 'cleaner:dashboard-accept', 'cleaner:dashboard-decline',
    'cleaning:accept', 'cleaning:decline', 'cleaning:submit', 'cleaning:upload-photo',
    'cleaning-client:setup-intent', 'cleaning-client:confirm',
    'cleaning-enroll:submit',
    'onboarding:submit',
    'agreement:complete', 'agreement:self-sign',
    'email-mkt:webhook',
    'sms:inbound',
  ]);
  if (!PUBLIC_POST.has(`${flow}:${action}`) && !(await requireAdmin(req, res))) return;

  if (flow === 'cleaner-onboard') {
    if (action === 'send')     return await cleanerOnboardSend(body, res);
    if (action === 'complete') return await cleanerOnboardComplete(body, res);
  } else if (flow === 'cleaner') {
    if (action === 'send-connect')    return await cleanerConnectSend(body, res);
    if (action === 'connect-url')     return await cleanerConnectUrl(body, res);
    if (action === 'dashboard-accept') return await cleanerDashboardAccept(body, res);
    if (action === 'dashboard-decline') return await cleanerDashboardDecline(body, res);
    if (action === 'send-portal-link')   return await cleanerSendPortalLink(body, res);
    if (action === 'broadcast-resetup')  return await cleanerBroadcastResetup(body, res);
  } else if (flow === 'cleaning') {
    if (action === 'cancellation')      return await cleaningCancellation(body, res);
    if (action === 'manual-charge')     return await manualClientCharge(body, res);
    if (action === 'manual-payout')     return await manualCleanerPayout(body, res);
    if (action === 'send-job-payout')   return await sendJobPayout(body, res);
    if (action === 'mark-payout-paid')  return await cleaningMarkPayoutPaid(body, res);
    if (action === 'upload-photo')      return await cleaningUploadPhoto(body, res);
    if (action === 'dispatch')          return await cleaningDispatch(body, res);
    if (action === 'accept')            return await cleaningAccept(body, res);
    if (action === 'decline')           return await cleaningDecline(body, res);
    if (action === 'submit')            return await cleaningSubmit(body, res);
    if (action === 'charge-and-payout') return await cleaningChargeAndPayout(body, res);
    if (action === 'remind-report')     return await cleaningRemindReport(body, res);
    if (action === 'waive-report')      return await cleaningWaiveReport(body, res);
    if (action === 'ical-sync') {
      const { propertyId } = body;
      if (!propertyId) return res.status(400).json({ error: 'propertyId required' });
      try {
        const supabase = getSupabase();
        const { data: config, error } = await supabase
          .from('cleaning_property_configs')
          .select('*')
          .eq('property_id', propertyId)
          .maybeSingle();
        if (error || !config) return res.status(404).json({ error: 'Property config not found.' });
        const result = await syncPropertyIcal(supabase, config, await getResend());
        return res.status(200).json({ ok: true, ...result });
      } catch (e) {
        return res.status(500).json({ error: e instanceof Error ? e.message : 'iCal sync failed.' });
      }
    }
    if (action === 'sync-now') {
      // Everything the daily cron does, on demand: iCal + Uplisting → jobs, then offer new jobs.
      const supabase = getSupabase();
      const resend = await getResend();
      const errors: string[] = [];
      let created = 0, updated = 0, cancelled = 0;
      const { data: configs } = await supabase.from('cleaning_property_configs').select('*');
      for (const config of configs ?? []) {
        if (!config.ical_urls?.length) continue;
        try { const r = await syncPropertyIcal(supabase, config, resend); created += r.created; updated += r.updated; cancelled += r.cancelled; errors.push(...r.errors.map((e: string) => `${config.property_name}: ${e}`)); }
        catch (e) { errors.push(`${config.property_name}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      try {
        const { data: settings } = await supabase.from('settings').select('uplisting_api_key').eq('id', 'default').maybeSingle();
        if (settings?.uplisting_api_key) { const u = await syncUplistingJobs(supabase, resend, settings.uplisting_api_key); created += u.created; updated += u.updated; cancelled += u.cancelled; errors.push(...u.errors); }
      } catch (e) { errors.push(`Uplisting: ${e instanceof Error ? e.message : String(e)}`); }
      let dispatched = 0;
      try { const t = await dispatchTick(supabase, resend); dispatched = t.dispatched; errors.push(...t.errors); }
      catch (e) { errors.push(`dispatch: ${e instanceof Error ? e.message : String(e)}`); }
      return res.status(200).json({ ok: true, created, updated, cancelled, dispatched, errors });
    }
    if (action === 'ical-sync-all') {
      try {
        const supabase = getSupabase();
        const { data: configs } = await supabase
          .from('cleaning_property_configs')
          .select('*');
        const resend = await getResend();
        let totalCreated = 0, totalCancelled = 0;
        const allErrors: string[] = [];
        const properties: { property: string; created: number; cancelled: number; errors: string[] }[] = [];
        for (const config of configs ?? []) {
          if (!config.ical_urls?.length) continue;
          const r = await syncPropertyIcal(supabase, config, resend);
          totalCreated += r.created;
          totalCancelled += r.cancelled;
          if (r.errors.length) allErrors.push(...r.errors.map((e: string) => `${config.property_name}: ${e}`));
          properties.push({ property: config.property_name, created: r.created, cancelled: r.cancelled, errors: r.errors });
        }
        return res.status(200).json({ ok: true, created: totalCreated, cancelled: totalCancelled, errors: allErrors, properties });
      } catch (e) {
        return res.status(500).json({ error: e instanceof Error ? e.message : 'Sync all failed.' });
      }
    }
  } else if (flow === 'cleaning-client') {
    if (action === 'send-onboarding') return await cleaningClientSend(body, res);
    if (action === 'setup-intent')    return await cleaningClientSetupIntent(body, res);
    if (action === 'confirm')         return await cleaningClientConfirm(body, res);
  } else if (flow === 'cleaning-enroll') {
    if (action === 'create-link') return await cleaningEnrollCreateLink(body, res);
    if (action === 'submit')      return await cleaningEnrollSubmit(body, res);
  } else if (flow === 'content') {
    if (action === 'generate') return await contentGenerate(body, res);
  } else if (flow === 'email-mkt') {
    if (action === 'upsert-template')     return await emailMktUpsertTemplate(body, res);
    if (action === 'delete-template')     return await emailMktDeleteTemplate(body, res);
    if (action === 'send-campaign')       return await emailMktSendCampaign(body, res);
    if (action === 'update-campaign-stats') return await emailMktUpdateStats(body, res);
    if (action === 'delete-campaign')     return await emailMktDeleteCampaign(body, res);
    if (action === 'webhook')             return await emailMktHandleWebhook(body, res);
    if (action === 'upsert-sequence')     return await emailMktUpsertSequence(body, res);
    if (action === 'delete-sequence')     return await emailMktDeleteSequence(body, res);
    if (action === 'enroll-sequence')     return await emailMktEnrollSequence(body, res);
    if (action === 'send-due-sequences')  return await emailMktSendDueSequences(body, res);
  } else if (flow === 'sms') {
    if (action === 'inbound') return await smsInbound(req, res);
    if (action === 'inbox')   return await smsGetInbox(res);
    if (action === 'reply')   return await smsSendReply(body, res);
    if (action === 'upsert-template') return await smsUpsertTemplate(body, res);
    if (action === 'delete-template') return await smsDeleteTemplate(body, res);
    if (action === 'send-campaign') return await smsSendCampaign(body, res);
    if (action === 'update-campaign-stats') return await smsUpdateStats(body, res);
    if (action === 'delete-campaign') return await smsDeleteCampaign(body, res);
  } else if (flow === 'meta') {
    if (action === 'connect')        return await metaConnect(body, res);
    if (action === 'post-facebook')  return await metaPostFacebook(body, res);
    if (action === 'post-instagram') return await metaPostInstagram(body, res);
    if (action === 'add-page')       return await metaAddPage(body, res);
    if (action === 'post-carousel')  return await metaPostCarousel(body, res);
    if (action === 'disconnect') {
      await getSupabase().from('app_cache').delete().eq('key', 'meta_connection');
      return res.status(200).json({ success: true });
    }
  } else if (flow === 'onboarding') {
    if (action === 'create') return await onboardingCreate(req, res);
    if (action === 'submit') return await onboardingSubmit(body, res);
  } else if (flow === 'agreement') {
    if (action === 'send')      return await agreementSend(body, res);
    if (action === 'complete')  return await agreementComplete(body, res);
    if (action === 'self-sign') return await agreementSelfSign(body, res);
  } else if (flow === 'scraper') {
    if (action === 'scrape-emails') return await scraperScrapeEmails(body, res);
  } else {
    if (action === 'send')     return await sigSend(body, res);
    if (action === 'complete') return await sigComplete(body, res);
  }

  return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('documents handler error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
}

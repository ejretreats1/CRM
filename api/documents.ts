import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { randomUUID } from 'crypto';
import { generateText, Output } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';

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

  const propInfo = {
    doorCode:        formData.lockCode       || undefined,
    wifiNetwork:     formData.wifiName       || undefined,
    wifiPassword:    formData.wifiPassword   || undefined,
    petPolicy:       formData.petsAllowed === 'Yes' ? 'Pets allowed ($75 fee)' : formData.petsAllowed === 'No' ? 'No pets' : undefined,
    houseRulesNotes: formData.houseRules     || undefined,
    generalNotes:    formData.otherAmenities || undefined,
  };

  if (request.owner_id) {
    // ── Existing client: update notes, don't create a new owner ──────────────
    const { error: updateErr } = await supabase
      .from('owners')
      .update({ notes, phone: formData.phone || undefined, email: formData.email || undefined })
      .eq('id', request.owner_id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Update existing property's property_info if the address matches, otherwise add new
    if (formData.propertyAddress?.trim()) {
      const { data: existingProps } = await supabase
        .from('properties')
        .select('id, address')
        .eq('owner_id', request.owner_id);
      const match = existingProps?.find(p =>
        p.address?.toLowerCase().trim() === formData.propertyAddress.toLowerCase().trim()
      );
      if (match) {
        await supabase.from('properties').update({
          type:        formData.propertyType || undefined,
          bedrooms:    parseInt(formData.bedrooms)  || undefined,
          bathrooms:   parseFloat(formData.bathrooms) || undefined,
          max_guests:  parseInt(formData.maxGuests) || undefined,
          platforms:   formData.platforms?.length ? formData.platforms : undefined,
          property_info: propInfo,
        }).eq('id', match.id).catch(() => {});
      } else {
        await supabase.from('properties').insert({
          id: `prop_${Date.now()}`, owner_id: request.owner_id,
          address: formData.propertyAddress, city: '', state: '',
          type: formData.propertyType || '',
          bedrooms: parseInt(formData.bedrooms) || 0,
          bathrooms: parseFloat(formData.bathrooms) || 0,
          max_guests: parseInt(formData.maxGuests) || 0,
          monthly_revenue: 0, occupancy_rate: 0,
          platforms: formData.platforms ?? [], status: 'onboarding', joined_at: now,
          property_info: propInfo,
        }).catch(() => {});
      }
    }

    await supabase.from('onboarding_requests').update({
      status: 'completed', form_data: formData, submitted_at: now,
    }).eq('token', token);

    return res.status(200).json({ success: true });
  }

  // ── New client: create owner + property ────────────────────────────────────
  const ownerId = `owner_${Date.now()}`;
  const portalToken = randomUUID();

  const { error: ownerErr } = await supabase.from('owners').insert({
    id: ownerId, name: formData.fullName, email: formData.email, phone: formData.phone,
    notes, source: 'website', vendors: [], created_at: now, archived: false, portal_token: portalToken,
  });
  if (ownerErr) return res.status(500).json({ error: ownerErr.message });

  if (formData.propertyAddress?.trim()) {
    await supabase.from('properties').insert({
      id: `prop_${Date.now()}`, owner_id: ownerId,
      address: formData.propertyAddress, city: '', state: '',
      type: formData.propertyType || '',
      bedrooms: parseInt(formData.bedrooms) || 0,
      bathrooms: parseFloat(formData.bathrooms) || 0,
      max_guests: parseInt(formData.maxGuests) || 0,
      monthly_revenue: 0, occupancy_rate: 0,
      platforms: formData.platforms ?? [], status: 'onboarding', joined_at: now,
      property_info: propInfo,
    }).catch(() => {});
  }

  await supabase.from('onboarding_requests').update({
    status: 'completed', owner_id: ownerId, form_data: formData, submitted_at: now,
  }).eq('token', token);

  return res.status(200).json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOnboardingNotes(f: any): string {
  const lines: string[] = ['=== ONBOARDING FORM SUBMISSION ==='];
  const add = (label: string, val: unknown) => { if (val) lines.push(`${label}: ${val}`); };
  add('Monthly costs', f.monthlyCosts); add('Property type', f.propertyType);
  add('Bedrooms', f.bedrooms); add('Bathrooms', f.bathrooms); add('Bed sizes', f.bedSizes);
  add('Max guests', f.maxGuests); add('Door codes', f.doorCodes);
  if (f.platforms?.length) lines.push(`Platforms: ${f.platforms.join(', ')}`);
  add('Listing links', f.listingLinks); add('Airbnb login', f.airbnbLogin);
  add('VRBO login', f.vrboLogin); add('Booking.com login', f.bookingLogin);
  add('Stripe login', f.stripeLogin); add('Average ratings', f.averageRatings);
  add('Account preference', f.accountPreference); add('Bank info', f.bankInfo);
  add('Entry type', f.entryType); add('Lock code', f.lockCode);
  if (f.wifiName) lines.push(`WiFi: ${f.wifiName} / ${f.wifiPassword ?? ''}`);
  if (f.amenities?.length) lines.push(`Amenities: ${f.amenities.join(', ')}`);
  add('Other amenities', f.otherAmenities); add('Stocked supplies', f.stockedSupplies);
  add('Supply ordering', f.supplyOrdering); add('Preferred cleaner', f.preferredCleaner);
  add('Cleaner contact', f.cleanerContact); add('Preferred handyman', f.preferredHandyman);
  add('Handyman contact', f.handymanContact); add('Pricing tool', f.pricingTool);
  add('PriceLabs', f.priceLabs); add('Blackout dates', f.blackoutDates); add('PMS', f.pms);
  add('Pets allowed', f.petsAllowed); add('House rules', f.houseRules);
  add('Professional photos', f.professionalPhotos); add('Additional info', f.additionalInfo);
  add('Questions', f.questions);
  return lines.join('\n');
}

// ── CONTENT STUDIO ───────────────────────────────────────────────────────────

export const config = { maxDuration: 60 };

const SlideSchema = z.object({
  slideNumber: z.number(),
  headline: z.string(),
  body: z.string(),
  emoji: z.string().optional(),
});

const ThreadTweetSchema = z.object({
  tweetNumber: z.number(),
  text: z.string(),
});

const ScriptSceneSchema = z.object({
  scene: z.string(),
  text: z.string(),
  duration: z.string(),
});

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

async function contentGenerate(body: any, res: VercelResponse) {
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
    'tweet-card': `Create exactly 3 tweet card variations. Each is a short, punchy tweet (max 240 chars) designed to be screenshotted and posted as a photo on Instagram. Make each a different angle: Variation 1 = bold statement or hot take, Variation 2 = data/stat-driven insight, Variation 3 = numbered list (max 5 items). Set the angle field to describe the approach (e.g. "Bold Statement", "Key Stats", "Quick List"). No hashtags inside the tweet text. Fill the tweetCards array. Do NOT fill slides, thread, caption, or script.`,
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

// ── ROUTER ────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET — onboarding token status check
  if (req.method === 'GET') {
    const token = req.query.token as string;
    if (req.query.flow === 'onboarding' && token) return onboardingGet(token, res);
    return res.status(405).end();
  }

  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body;

  // Resend webhook: body has { type: 'email.opened', data: { email_id: '...' } }
  if (typeof body.type === 'string' && body.type.startsWith('email.') && body.data?.email_id) {
    return handleResendWebhook(body, res);
  }

  const { action, flow } = body;
  if (flow === 'content') {
    if (action === 'generate') return contentGenerate(body, res);
  } else if (flow === 'meta') {
    if (action === 'connect')        return metaConnect(body, res);
    if (action === 'post-facebook')  return metaPostFacebook(body, res);
    if (action === 'post-instagram') return metaPostInstagram(body, res);
    if (action === 'add-page')       return metaAddPage(body, res);
    if (action === 'post-carousel')  return metaPostCarousel(body, res);
    if (action === 'disconnect') {
      await getSupabase().from('app_cache').delete().eq('key', 'meta_connection');
      return res.status(200).json({ success: true });
    }
  } else if (flow === 'onboarding') {
    if (action === 'create') return onboardingCreate(req, res);
    if (action === 'submit') return onboardingSubmit(body, res);
  } else if (flow === 'agreement') {
    if (action === 'send')     return agreementSend(body, res);
    if (action === 'complete') return agreementComplete(body, res);
  } else {
    if (action === 'send')     return sigSend(body, res);
    if (action === 'complete') return sigComplete(body, res);
  }

  return res.status(400).json({ error: 'Unknown action.' });
}

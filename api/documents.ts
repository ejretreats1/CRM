import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { randomUUID } from 'crypto';
import { generateText, Output } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import Stripe from 'stripe';

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

// ── CLEANING DISPATCH ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningGet(combined: string, res: VercelResponse) {
  const colonIdx = combined.indexOf(':');
  const jobId  = combined.slice(0, colonIdx);
  const token  = combined.slice(colonIdx + 1);
  if (!jobId || !token) return res.status(400).json({ error: 'Invalid link.' });

  const supabase = getSupabase();
  const { data: row } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).single();
  if (!row) return res.status(404).json({ error: 'Job not found.' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens = (row.dispatch_tokens ?? {}) as Record<string, any>;
  const cleanerInfo = tokens[token];
  if (!cleanerInfo) return res.status(401).json({ error: 'Invalid or expired link.' });

  return res.status(200).json({
    job: {
      id: row.id, propertyName: row.property_name, checkoutDate: row.checkout_date,
      checkinDate: row.checkin_date, guestName: row.guest_name, notes: row.notes,
      status: row.status, assignedCleanerId: row.assigned_cleaner_id,
      portalData: row.portal_data,
    },
    cleaner: cleanerInfo,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningDispatch(body: any, res: VercelResponse) {
  const { jobId, propertyName, checkoutDate, checkinDate, guestName, notes, cleaners, appUrl } = body;

  if (!cleaners?.length) return res.status(400).json({ error: 'No cleaners provided.' });

  const supabase = getSupabase();
  const dateLabel = new Date(checkoutDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Generate a unique token per cleaner and build dispatch_tokens map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatchTokens: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanerTokens: { cleaner: any; token: string }[] = (cleaners as any[]).map(c => {
    const token = randomUUID();
    dispatchTokens[token] = { cleanerId: c.id, cleanerName: c.name, cleanerEmail: c.email, payout: c.payout ?? 0 };
    return { cleaner: c, token };
  });

  // Store tokens + mark job as dispatched
  await supabase.from('cleaning_jobs').update({
    status: 'dispatched',
    dispatched_at: new Date().toISOString(),
    dispatch_tokens: dispatchTokens,
  }).eq('id', jobId);

  const base = (appUrl ?? 'https://crm-nine-delta-37.vercel.app').replace(/\/$/, '');

  const results = await Promise.allSettled(
    cleanerTokens.map(({ cleaner: c, token }) => {
      const portalLink = `${base}?cleaner=${jobId}:${token}`;
      return resend.emails.send({
        from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
        to: c.email,
        subject: `🧹 Cleaning Job Available: ${propertyName} – ${dateLabel}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
            <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
              <h2 style="color:#1e40af;margin:0 0 8px;font-size:20px">🧹 Cleaning Job Available</h2>
              <p style="color:#334155;margin:0 0 20px">Hi ${c.name},</p>
              <p style="color:#334155;margin:0 0 16px">A cleaning job is available for one of your assigned properties. This is <strong>first-come, first-served</strong> — tap the button below to claim it.</p>
              <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:0 0 20px">
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:4px 0;color:#64748b;font-size:14px;width:130px">Property</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${propertyName}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;font-size:14px">Cleaning Date</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${dateLabel}</td></tr>
                  ${checkinDate ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Next Check-in</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${new Date(checkinDate+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric'})}</td></tr>` : ''}
                  ${guestName ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Departing Guest</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${guestName}</td></tr>` : ''}
                  ${c.payout ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Your Payout</td><td style="padding:4px 0;font-weight:700;color:#16a34a;font-size:18px">$${c.payout}</td></tr>` : ''}
                  ${notes ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px;vertical-align:top">Notes</td><td style="padding:4px 0;color:#0f172a;font-size:14px">${notes}</td></tr>` : ''}
                </table>
              </div>
              <div style="text-align:center;margin:24px 0">
                <a href="${portalLink}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
                  Accept This Job
                </a>
              </div>
              <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">First cleaner to accept gets the job. Link expires when the job is claimed.<br>— E&amp;J Retreats</p>
            </div>
          </div>
        `,
      });
    })
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return res.status(200).json({ sent });
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
  const { error } = await supabase.from('cleaning_jobs').update({
    status: 'accepted',
    assigned_cleaner_id: cleanerInfo.cleanerId,
    assigned_cleaner_name: cleanerInfo.cleanerName,
    cleaner_payout: cleanerInfo.payout,
    accepted_at: now,
    updated_at: now,
  }).eq('id', jobId).in('status', ['dispatched', 'pending']);

  if (error) return res.status(500).json({ error: error.message });

  // Notify admin
  await resend.emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: 'ejretreats1@gmail.com',
    subject: `✅ ${cleanerInfo.cleanerName} accepted: ${row.property_name}`,
    html: `<div style="font-family:sans-serif;padding:24px"><p><strong>${cleanerInfo.cleanerName}</strong> accepted the cleaning job for <strong>${row.property_name}</strong> on ${new Date(row.checkout_date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}.</p></div>`,
  }).catch(() => {});

  return res.status(200).json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningSubmit(body: any, res: VercelResponse) {
  const { combined, checklist, photos, damageNotes } = body;
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

  const now = new Date().toISOString();
  const portalData = { checklist, photos: photos ?? [], damageNotes: damageNotes ?? '', submittedAt: now };

  await supabase.from('cleaning_jobs').update({
    status: 'completed',
    completed_at: now,
    updated_at: now,
    portal_data: portalData,
  }).eq('id', jobId);

  // Auto-charge client and initiate payout — don't fail the submit if payment errors
  const paymentResult = await doChargeAndPayout({ ...row, assigned_cleaner_id: row.assigned_cleaner_id ?? cleanerInfo.cleanerId, cleaner_payout: cleanerInfo.payout })
    .catch(e => ({ charged: false, payoutSent: false, error: (e as Error).message ?? 'Unexpected error' }));

  const dateLabel = new Date(row.checkout_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const photoCount = (photos ?? []).length;
  const checklistDone = Object.values(checklist as Record<string, boolean>).filter(Boolean).length;
  const checklistTotal = Object.keys(checklist as Record<string, boolean>).length;

  const paymentLine = paymentResult.charged
    ? `💳 <strong>$${paymentResult.cleaningFee} charged</strong> to client automatically${paymentResult.payoutSent ? ` · $${paymentResult.cleanerPayout} payout sent to cleaner via Stripe Connect ✓` : paymentResult.cleanerStripeId ? ` · Payout transfer failed — pay manually` : ` · Cleaner has no Stripe Connect account — pay manually`}`
    : `⚠️ <strong>Auto-charge failed:</strong> ${paymentResult.error ?? 'No payment method on file'} — use the CRM to retry`;

  await resend.emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: 'ejretreats1@gmail.com',
    subject: `${paymentResult.charged ? '✅' : '⚠️'} Job submitted: ${row.property_name} – ${cleanerInfo.cleanerName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#0f766e">🧹 Cleaning Job Submitted</h2>
        <p><strong>${cleanerInfo.cleanerName}</strong> has submitted the cleaning for <strong>${row.property_name}</strong> (${dateLabel}).</p>
        <p>✅ Checklist: ${checklistDone}/${checklistTotal} items completed<br>
           📸 Photos uploaded: ${photoCount}<br>
           ${damageNotes ? `⚠️ Damage notes: ${damageNotes}<br>` : ''}
           ${paymentLine}
        </p>
        ${photoCount > 0 ? `<p>${(photos as string[]).map((url: string) => `<img src="${url}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;margin:4px" />`).join('')}</p>` : ''}
      </div>
    `,
  }).catch(() => {});

  return res.status(200).json({ success: true });
}

// ── CLEANER STRIPE CONNECT ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanerConnectSend(body: any, res: VercelResponse) {
  const { cleanerId, appUrl, sendEmail } = body;
  if (!cleanerId) return res.status(400).json({ error: 'cleanerId required.' });

  const supabase = getSupabase();
  const { data: cleaner } = await supabase.from('cleaners').select('*').eq('id', cleanerId).single();
  if (!cleaner) return res.status(404).json({ error: 'Cleaner not found.' });

  const stripe = getStripe();
  const connectToken = randomUUID();

  // Create Express account if not yet created
  let stripeAccountId: string = cleaner.stripe_account_id ?? '';
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: cleaner.email,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { cleaner_id: cleanerId, cleaner_name: cleaner.name },
    });
    stripeAccountId = account.id;
  }

  await supabase.from('cleaners').update({
    stripe_account_id: stripeAccountId,
    connect_token: connectToken,
    stripe_connect_status: 'pending',
  }).eq('id', cleanerId);

  const base = (appUrl ?? 'https://crm-nine-delta-37.vercel.app').replace(/\/$/, '');
  const link = `${base}?cleaner-setup=${cleanerId}:${connectToken}`;

  if (sendEmail) {
    await resend.emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: cleaner.email,
      subject: 'Set up your Stripe account to receive cleaning payouts',
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
    }).catch(() => {});
  }

  return res.status(200).json({ link });
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

  const stripe = getStripe();
  const base = (appUrl ?? 'https://crm-nine-delta-37.vercel.app').replace(/\/$/, '');

  const accountLink = await stripe.accountLinks.create({
    account: cleaner.stripe_account_id,
    type: 'account_onboarding',
    return_url: `${base}?cleaner-connected=${cleanerId}:${token}`,
    refresh_url: `${base}?cleaner-setup=${cleanerId}:${token}`,
  });

  return res.status(200).json({ url: accountLink.url });
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

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(cleaner.stripe_account_id);

  if (account.details_submitted && cleaner.stripe_connect_status !== 'active') {
    await supabase.from('cleaners').update({ stripe_connect_status: 'active' }).eq('id', cleanerId);
    // Notify admin
    await resend.emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: 'ejretreats1@gmail.com',
      subject: `✅ Stripe connected: ${cleaner.name}`,
      html: `<div style="font-family:sans-serif;padding:24px"><p><strong>${cleaner.name}</strong> has connected their Stripe account (${cleaner.stripe_account_id}) and is ready to receive payouts.</p></div>`,
    }).catch(() => {});
  }

  return res.status(200).json({
    name: cleaner.name,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
  });
}

// ── CLEANING CLIENT ONBOARDING ────────────────────────────────────────────────

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
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
  return res.status(200).json({
    id: data.id,
    propertyConfigId: configIds[0] ?? data.property_config_id,
    propertyConfigIds: configIds,
    propertyName: data.property_name,
    clientName: data.client_name,
    clientEmail: data.client_email,
    status: data.status,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningClientSend(body: any, res: VercelResponse) {
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
  const id = `cco_${Date.now()}`;
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

  const base = (appUrl ?? 'https://crm-nine-delta-37.vercel.app').replace(/\/$/, '');
  const link = `${base}?cleaning-onboard=${token}`;

  if (copyOnly) {
    return res.status(200).json({ id, token, link });
  }

  const isMulti = propertyNames.length > 1;
  const subjectLabel = isMulti ? `${propertyNames.length} properties` : propertyNamesStr;
  const propListHtml = isMulti
    ? `<ul style="color:#334155;font-size:14px;margin:8px 0 16px;padding-left:20px">${propertyNames.map(n => `<li>${n}</li>`).join('')}</ul>`
    : `<p style="color:#334155">Your property <strong>${propertyNamesStr}</strong> is enrolled in E&amp;J Retreats' professional cleaning service.</p>`;

  await resend.emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: clientEmail,
    subject: `Action required: Set up cleaning service for ${subjectLabel}`,
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

  return res.status(200).json({ id, token, link });
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

  const stripe = getStripe();
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
  const { token, setupIntentId } = body;
  const supabase = getSupabase();

  const { data: record } = await supabase.from('cleaning_client_onboarding').select('*').eq('token', token).single();
  if (!record) return res.status(404).json({ error: 'Invalid link.' });

  const stripe = getStripe();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  if (setupIntent.status !== 'succeeded') return res.status(400).json({ error: 'Payment setup not completed.' });

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
  }).eq('token', token);

  await resend.emails.send({
    from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
    to: 'ejretreats1@gmail.com',
    subject: `✅ Client onboarded: ${record.property_name}`,
    html: `<div style="font-family:sans-serif;padding:24px"><p><strong>${record.client_name ?? record.client_email}</strong> completed onboarding for <strong>${record.property_name}</strong>. Card is on file and ready to charge after each cleaning.</p></div>`,
  }).catch(() => {});

  return res.status(200).json({ success: true });
}

// ── CLEANING CHARGE & PAYOUT ──────────────────────────────────────────────────

interface ChargeResult {
  charged: boolean;
  payoutSent: boolean;
  error?: string;
  paymentIntentId?: string;
  cleaningFee?: number;
  cleanerPayout?: number;
  cleanerStripeId?: string | null;
}

// Shared helper — called automatically on submit and manually as a retry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function doChargeAndPayout(job: Record<string, any>): Promise<ChargeResult> {
  const supabase = getSupabase();

  const { data: config } = await supabase
    .from('cleaning_property_configs')
    .select('*')
    .eq('property_id', job.property_id)
    .maybeSingle();

  if (!config?.stripe_customer_id || !config?.stripe_payment_method_id) {
    return { charged: false, payoutSent: false, error: 'No payment method on file — client onboarding not complete.' };
  }

  const stripe = getStripe();
  const amountCents = Math.round(Number(config.cleaning_fee) * 100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transferData: any = undefined;
  let cleanerStripeId: string | null = null;

  if (job.assigned_cleaner_id && Number(job.cleaner_payout) > 0) {
    const { data: cleaner } = await supabase
      .from('cleaners').select('stripe_account_id').eq('id', job.assigned_cleaner_id).single();
    if (cleaner?.stripe_account_id) {
      cleanerStripeId = cleaner.stripe_account_id;
      transferData = {
        amount: Math.round(Number(job.cleaner_payout) * 100),
        destination: cleanerStripeId,
      };
    }
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: config.stripe_customer_id,
      payment_method: config.stripe_payment_method_id,
      confirm: true,
      off_session: true,
      description: `Cleaning: ${job.property_name} — ${job.checkout_date}`,
      metadata: { job_id: job.id, property_id: job.property_id },
      ...(transferData ? { transfer_data: transferData } : {}),
    });
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : (err as { message?: string })?.message) ?? 'Payment failed.';
    return { charged: false, payoutSent: false, error: msg, cleanerStripeId };
  }

  const now = new Date().toISOString();
  const payoutSent = !!transferData && paymentIntent.status === 'succeeded';

  await supabase.from('cleaning_jobs').update({
    charged_at: now,
    stripe_charge_id: paymentIntent.id,
    payout_sent_at: payoutSent ? now : null,
    updated_at: now,
  }).eq('id', job.id);

  return {
    charged: true,
    payoutSent,
    paymentIntentId: paymentIntent.id,
    cleaningFee: Number(config.cleaning_fee),
    cleanerPayout: Number(job.cleaner_payout),
    cleanerStripeId,
  };
}

// Manual retry endpoint — guards against double-charging
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleaningChargeAndPayout(body: any, res: VercelResponse) {
  const { jobId } = body;
  if (!jobId) return res.status(400).json({ error: 'jobId required.' });

  const supabase = getSupabase();
  const { data: job } = await supabase.from('cleaning_jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'completed') return res.status(400).json({ error: 'Job must be completed before charging.' });
  if (job.charged_at) return res.status(400).json({ error: 'This job has already been charged.' });

  const result = await doChargeAndPayout(job);
  if (!result.charged) return res.status(402).json({ error: result.error ?? 'Charge failed.' });
  return res.status(200).json(result);
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
  // GET — token status checks
  if (req.method === 'GET') {
    const token = req.query.token as string;
    if (req.query.flow === 'onboarding' && token) return onboardingGet(token, res);
    if (req.query.flow === 'cleaning' && token) return cleaningGet(token, res);
    if (req.query.flow === 'cleaning-client' && token) return cleaningClientGet(token, res);
    if (req.query.flow === 'cleaner-connect' && req.query.combined) return cleanerConnectVerify(req.query.combined as string, res);
    return res.status(405).end();
  }

  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body;

  // Resend webhook: body has { type: 'email.opened', data: { email_id: '...' } }
  if (typeof body.type === 'string' && body.type.startsWith('email.') && body.data?.email_id) {
    return handleResendWebhook(body, res);
  }

  const { action, flow } = body;
  if (flow === 'cleaner') {
    if (action === 'send-connect') return cleanerConnectSend(body, res);
    if (action === 'connect-url')  return cleanerConnectUrl(body, res);
  } else if (flow === 'cleaning') {
    if (action === 'dispatch')          return cleaningDispatch(body, res);
    if (action === 'accept')            return cleaningAccept(body, res);
    if (action === 'submit')            return cleaningSubmit(body, res);
    if (action === 'charge-and-payout') return cleaningChargeAndPayout(body, res);
  } else if (flow === 'cleaning-client') {
    if (action === 'send-onboarding') return cleaningClientSend(body, res);
    if (action === 'setup-intent')    return cleaningClientSetupIntent(body, res);
    if (action === 'confirm')         return cleaningClientConfirm(body, res);
  } else if (flow === 'content') {
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

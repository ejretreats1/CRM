import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb } from 'pdf-lib';
import { randomUUID } from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

async function handleSend(body: any, res: VercelResponse) {
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

  const { error: emailError } = await resend.emails.send({
    from: 'E&J Retreats <signatures@ejretreats.com>',
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

async function handleComplete(body: any, res: VercelResponse) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { action } = req.body;
  if (action === 'send') return handleSend(req.body, res);
  if (action === 'complete') return handleComplete(req.body, res);
  return res.status(400).json({ error: 'action must be "send" or "complete"' });
}

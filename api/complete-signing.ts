import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb } from 'pdf-lib';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, signatureDataUrl } = req.body;

  // Get signature request
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

  // Download original PDF
  const pdfRes = await fetch(sigReq.document_url);
  if (!pdfRes.ok) return res.status(500).json({ error: 'Could not load document.' });
  const pdfBytes = await pdfRes.arrayBuffer();

  // Stamp signature onto PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width: pageWidth, height: pageHeight } = lastPage.getSize();

  // Convert stored fractions (0–1 from top) to PDF coords (0 = bottom)
  const pdfSigX  = (sigReq.sig_x  ?? 0.08) * pageWidth;
  const pdfSigY  = (1 - (sigReq.sig_y  ?? 0.78)) * pageHeight;
  const pdfDateX = (sigReq.date_x ?? 0.55) * pageWidth;
  const pdfDateY = (1 - (sigReq.date_y ?? 0.78)) * pageHeight;

  const sigBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
  const sigBytes = Buffer.from(sigBase64, 'base64');
  const sigImage = await pdfDoc.embedPng(sigBytes);
  const sigDims = sigImage.scale(0.35);

  // Signature image centered on placement point
  lastPage.drawImage(sigImage, {
    x: pdfSigX - sigDims.width / 2,
    y: pdfSigY - sigDims.height / 2,
    width: sigDims.width,
    height: sigDims.height,
  });

  // Underline beneath signature
  lastPage.drawLine({
    start: { x: pdfSigX - sigDims.width / 2, y: pdfSigY - sigDims.height / 2 - 3 },
    end:   { x: pdfSigX + sigDims.width / 2, y: pdfSigY - sigDims.height / 2 - 3 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });

  // Date text at date placement point
  const dateText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  lastPage.drawText(dateText, {
    x: pdfDateX,
    y: pdfDateY,
    size: 10,
    color: rgb(0.15, 0.15, 0.15),
  });

  // Underline beneath date
  lastPage.drawLine({
    start: { x: pdfDateX - 2,   y: pdfDateY - 4 },
    end:   { x: pdfDateX + 150, y: pdfDateY - 4 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });

  const signedPdfBytes = await pdfDoc.save();

  // Upload signed PDF to Supabase Storage
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

  return res.status(200).json({ signedDocumentUrl: publicUrl });
}

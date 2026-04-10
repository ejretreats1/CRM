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
  const { width } = lastPage.getSize();

  const sigBase64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
  const sigBytes = Buffer.from(sigBase64, 'base64');
  const sigImage = await pdfDoc.embedPng(sigBytes);
  const sigDims = sigImage.scale(0.35);

  lastPage.drawImage(sigImage, {
    x: 50,
    y: 90,
    width: sigDims.width,
    height: sigDims.height,
  });

  lastPage.drawText(
    `Signed electronically on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    { x: 50, y: 72, size: 9, color: rgb(0.4, 0.4, 0.4) }
  );

  lastPage.drawLine({
    start: { x: 50, y: 88 },
    end: { x: width - 50, y: 88 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
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

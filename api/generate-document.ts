import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ],
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    templateFileId,
    ownerName,
    ownerEmail,
    ownerPhone,
    propertyAddress,
    commissionPct,
    state,
    ownerId,
    documentName,
  } = req.body as {
    templateFileId: string;
    ownerName: string;
    ownerEmail?: string;
    ownerPhone?: string;
    propertyAddress?: string;
    commissionPct?: string;
    state?: string;
    ownerId: string;
    documentName?: string;
  };

  if (!templateFileId || !ownerName || !ownerId) {
    return res.status(400).json({ error: 'templateFileId, ownerName, and ownerId are required' });
  }

  const docName = documentName || `${ownerName} - Management Agreement`;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Named placeholders → values. Every placeholder in the template gets replaced.
  const placeholders: Record<string, string> = {
    '{{date}}':        today,
    '{{owner_name}}':  ownerName,
    '{{address}}':     propertyAddress ?? 'not provided',
    '{{email}}':       ownerEmail      ?? 'not provided',
    '{{phone}}':       ownerPhone      ?? 'not provided',
    '{{commission}}':  commissionPct   ?? 'not provided',
    '{{state}}':       state           ?? 'Florida',
  };

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const docs  = google.docs({ version: 'v1', auth });

    // 1. Fill every placeholder in one atomic batchUpdate
    const fillRequests = Object.entries(placeholders).map(([placeholder, value]) => ({
      replaceAllText: {
        containsText: { text: placeholder, matchCase: true },
        replaceText: value,
      },
    }));
    await docs.documents.batchUpdate({
      documentId: templateFileId,
      requestBody: { requests: fillRequests },
    });

    let pdfBuffer: Buffer;
    try {
      // 2. Export as PDF
      const exported = await drive.files.export(
        { fileId: templateFileId, mimeType: 'application/pdf', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      pdfBuffer = Buffer.from(exported.data as ArrayBuffer);
    } finally {
      // 3. Always restore — swap every filled value back to its placeholder
      const restoreRequests = Object.entries(placeholders).map(([placeholder, value]) => ({
        replaceAllText: {
          containsText: { text: value, matchCase: true },
          replaceText: placeholder,
        },
      }));
      await docs.documents.batchUpdate({
        documentId: templateFileId,
        requestBody: { requests: restoreRequests },
      }).catch(err => console.error('Template restore failed:', err));
    }

    // 4. Upload PDF to Supabase
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
    );

    const safeName = docName.replace(/[^a-z0-9]/gi, '_');
    const storagePath = `generated/${ownerId}/${Date.now()}_${safeName}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer!, { contentType: 'application/pdf', upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(storagePath);

    // 5. Save record to owner_documents table
    const id  = `doc_${Date.now()}`;
    const now = new Date().toISOString();
    const { error: dbErr } = await supabase.from('owner_documents').insert({
      id,
      owner_id:     ownerId,
      name:         docName,
      file_url:     publicUrl,
      file_type:    'application/pdf',
      file_size:    pdfBuffer!.length,
      storage_path: storagePath,
      uploaded_at:  now,
    });
    if (dbErr) throw dbErr;

    return res.status(200).json({
      id,
      ownerId,
      name:        docName,
      fileUrl:     publicUrl,
      fileType:    'application/pdf',
      fileSize:    pdfBuffer!.length,
      storagePath,
      uploadedAt:  now,
    });

  } catch (err) {
    console.error('generate-document error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate document' });
  }
}

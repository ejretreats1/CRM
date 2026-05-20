import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const BLANK_RE = /_{3,}/g;

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

interface BlankLocation {
  startIndex: number;
  endIndex: number;
  blankText: string;
  context: string;
}

function findBlanks(elements: any[]): BlankLocation[] {
  const blanks: BlankLocation[] = [];

  function extractText(elems: any[]): string {
    let t = '';
    for (const elem of elems ?? []) {
      if (elem.paragraph) {
        for (const part of elem.paragraph.elements ?? []) t += part.textRun?.content ?? '';
      }
      if (elem.table) {
        for (const row of (elem.table.tableRows ?? [])) {
          for (const cell of (row.tableCells ?? [])) t += extractText(cell.content ?? []);
        }
      }
    }
    return t;
  }

  function traverseParagraph(elem: any, context: string) {
    let paraText = '';
    for (const part of elem.paragraph.elements ?? []) paraText += part.textRun?.content ?? '';
    const ctx = (context || paraText).replace(/\n/g, ' ').trim().slice(0, 300);
    for (const part of elem.paragraph.elements ?? []) {
      const content: string = part.textRun?.content ?? '';
      const runStart: number = part.startIndex ?? 0;
      BLANK_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = BLANK_RE.exec(content)) !== null) {
        blanks.push({
          startIndex: runStart + match.index,
          endIndex: runStart + match.index + match[0].length,
          blankText: match[0],
          context: ctx,
        });
      }
    }
  }

  function traverse(elems: any[], inheritedContext = '') {
    for (const elem of elems ?? []) {
      if (elem.paragraph) traverseParagraph(elem, inheritedContext);
      if (elem.table) {
        for (const row of elem.table.tableRows ?? []) {
          const rowText = (row.tableCells ?? []).map((cell: any) => extractText(cell.content ?? [])).join(' ').replace(/\n/g, ' ').trim().slice(0, 300);
          for (const cell of row.tableCells ?? []) {
            traverse(cell.content ?? [], rowText);
          }
        }
      }
    }
  }

  traverse(elements);
  return blanks.sort((a, b) => a.startIndex - b.startIndex);
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

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const docs = google.docs({ version: 'v1', auth });

    // 1. Read template and find blanks
    const templateDoc = await docs.documents.get({ documentId: templateFileId });
    const blanks = findBlanks(templateDoc.data.body?.content ?? []);

    // 2. Copy the template — we fill the copy only, original is never modified
    const copyRes = await drive.files.copy({
      fileId: templateFileId,
      supportsAllDrives: true,
      requestBody: { name: `${docName}_tmp_${Date.now()}` },
    });
    const copyId = copyRes.data.id!;

    let pdfBuffer: Buffer;
    try {
      // 3. Pre-resolve blanks from context and build fill plan (skip unrecognised blanks)
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      type FillEntry = { blank: BlankLocation; value: string };
      const fillPlan: FillEntry[] = blanks.flatMap(b => {
        const ctx = b.context.toLowerCase();
        let value = '';
        if (/date|dated|as of|effective|agreement date|commencement/.test(ctx)) value = today;
        else if (/owner.*name|client.*name|name.*owner|name.*client|party.*name|landlord.*name/.test(ctx)) value = ownerName;
        else if (/email/.test(ctx)) value = ownerEmail ?? 'not provided';
        else if (/phone|telephone|cell|mobile/.test(ctx)) value = ownerPhone ?? 'not provided';
        else if (/address|property|premises|location/.test(ctx)) value = propertyAddress ?? 'not provided';
        else if (/commission|percent|management fee|fee %/.test(ctx)) value = commissionPct ?? 'not provided';
        else if (/state|governing law|jurisdiction/.test(ctx)) value = state ?? 'not provided';
        return value ? [{ blank: b, value }] : [];
      });

      // 4. Fill blanks last→first so earlier indices stay valid
      if (fillPlan.length > 0) {
        const fillRequests: object[] = fillPlan.slice().reverse().flatMap(({ blank, value }) => [
          { deleteContentRange: { range: { startIndex: blank.startIndex, endIndex: blank.endIndex } } },
          { insertText: { location: { index: blank.startIndex }, text: value } },
        ]);
        await docs.documents.batchUpdate({ documentId: copyId, requestBody: { requests: fillRequests } });
      }

      // 5. Export filled copy as PDF
      const exported = await drive.files.export(
        { fileId: copyId, mimeType: 'application/pdf', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      pdfBuffer = Buffer.from(exported.data as ArrayBuffer);
    } finally {
      // 6. Always delete the temporary copy — original template is untouched
      await drive.files.delete({ fileId: copyId, supportsAllDrives: true })
        .catch(err => console.error('Temp copy cleanup failed:', err));
    }

    // 7. Upload PDF to Supabase
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

    // 8. Save record to owner_documents table
    const id = `doc_${Date.now()}`;
    const now = new Date().toISOString();
    const { error: dbErr } = await supabase.from('owner_documents').insert({
      id,
      owner_id: ownerId,
      name: docName,
      file_url: publicUrl,
      file_type: 'application/pdf',
      file_size: pdfBuffer!.length,
      storage_path: storagePath,
      uploaded_at: now,
    });
    if (dbErr) throw dbErr;

    return res.status(200).json({
      id,
      ownerId,
      name: docName,
      fileUrl: publicUrl,
      fileType: 'application/pdf',
      fileSize: pdfBuffer!.length,
      storagePath,
      uploadedAt: now,
    });

  } catch (err) {
    console.error('generate-document error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate document' });
  }
}

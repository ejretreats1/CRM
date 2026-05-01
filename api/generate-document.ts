import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { generateText } from 'ai';
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

  function traverse(elems: any[]) {
    for (const elem of elems ?? []) {
      if (elem.paragraph) {
        let paraText = '';
        for (const part of elem.paragraph.elements ?? []) {
          paraText += part.textRun?.content ?? '';
        }
        for (const part of elem.paragraph.elements ?? []) {
          const content: string = part.textRun?.content ?? '';
          const runStart: number = part.startIndex ?? 0;
          let match: RegExpExecArray | null;
          BLANK_RE.lastIndex = 0;
          while ((match = BLANK_RE.exec(content)) !== null) {
            blanks.push({
              startIndex: runStart + match.index,
              endIndex: runStart + match.index + match[0].length,
              blankText: match[0],
              context: paraText.replace(/\n/g, ' ').trim().slice(0, 200),
            });
          }
        }
      }
      if (elem.table) {
        for (const row of elem.table.tableRows ?? []) {
          for (const cell of row.tableCells ?? []) {
            traverse(cell.content ?? []);
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
    propertyAddress,
    commissionPct,
    state,
    ownerId,
    documentName,
  } = req.body as {
    templateFileId: string;
    ownerName: string;
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

    // 1. Read the original template and find blank positions
    const doc = await docs.documents.get({ documentId: templateFileId });
    const blanks = findBlanks(doc.data.body?.content ?? []);

    let values: string[] = [];

    if (blanks.length > 0) {
      // 2. Ask Claude to map each blank to the right value based on context
      const blanksDesc = blanks
        .map((b, i) => `Blank ${i + 1}: "...${b.context}..."`)
        .join('\n');

      const { text } = await generateText({
        model: 'anthropic/claude-haiku-4.5',
        maxTokens: 256,
        prompt: `Fill in the blanks (____) in a property management contract.

Available data:
- Client name: ${ownerName}
- Property address: ${propertyAddress ?? 'not provided'}
- Commission %: ${commissionPct ?? 'not provided'}
- Governing state: ${state ?? 'not provided'}

Blanks and their surrounding text:
${blanksDesc}

Return ONLY a JSON array of strings, one per blank in order, using the available data.
If a blank's context is unclear, use the most logical value from the data above.
Example: ["John Smith", "123 Ocean Ave, Rehoboth Beach, DE 19971", "20", "Delaware"]`,
      });

      values = JSON.parse(text.trim());

      // 3. Fill blanks in the ORIGINAL template (last→first so earlier indices stay valid)
      // No Drive copy needed = no storage quota required
      const fillRequests: object[] = [];
      for (let i = blanks.length - 1; i >= 0; i--) {
        fillRequests.push(
          { deleteContentRange: { range: { startIndex: blanks[i].startIndex, endIndex: blanks[i].endIndex } } },
          { insertText: { location: { index: blanks[i].startIndex }, text: values[i] ?? '' } },
        );
      }
      await docs.documents.batchUpdate({
        documentId: templateFileId,
        requestBody: { requests: fillRequests },
      });
    }

    let pdfBuffer: Buffer;
    try {
      // 4. Export filled template as PDF
      const exported = await drive.files.export(
        { fileId: templateFileId, mimeType: 'application/pdf', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      pdfBuffer = Buffer.from(exported.data as ArrayBuffer);
    } finally {
      if (blanks.length > 0) {
        // 5. Restore original blanks (first→last, using original startIndex values)
        // Math: processing first-to-last in the batch means each subsequent blank's
        // original startIndex is still valid after restoring the preceding ones.
        const restoreRequests: object[] = blanks.flatMap((blank, i) => [
          { deleteContentRange: { range: { startIndex: blank.startIndex, endIndex: blank.startIndex + (values[i]?.length ?? 0) } } },
          { insertText: { location: { index: blank.startIndex }, text: blank.blankText } },
        ]);
        await docs.documents.batchUpdate({
          documentId: templateFileId,
          requestBody: { requests: restoreRequests },
        }).catch(err => console.error('Template restore failed:', err));
      }
    }

    // 6. Upload PDF to Supabase
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

    // 7. Save record to owner_documents table
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

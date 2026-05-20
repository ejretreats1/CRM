import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { generateObject } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
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
          // Build full row text so blanks in value-cells get the label from adjacent cells
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

    // 1. Read the original template and find blank positions
    const doc = await docs.documents.get({ documentId: templateFileId });
    const blanks = findBlanks(doc.data.body?.content ?? []);

    let values: string[] = [];

    if (blanks.length > 0) {
      // 2. Ask Claude to map each blank to the right value based on context
      const blanksDesc = blanks
        .map((b, i) => `Blank ${i + 1}: "...${b.context}..."`)
        .join('\n');

      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // Build explicit per-blank instructions so Claude can't confuse positional order
      const blankInstructions = blanks.map((b, i) => {
        const ctx = b.context.toLowerCase();
        let value = '';
        if (/date|dated|as of|effective|agreement date|commencement/.test(ctx)) value = today;
        else if (/owner.*name|client.*name|name.*owner|name.*client|party.*name|landlord.*name/.test(ctx)) value = ownerName;
        else if (/email/.test(ctx)) value = ownerEmail ?? 'not provided';
        else if (/phone|telephone|cell|mobile/.test(ctx)) value = ownerPhone ?? 'not provided';
        else if (/address|property|premises|location/.test(ctx)) value = propertyAddress ?? 'not provided';
        else if (/commission|percent|management fee|fee %/.test(ctx)) value = commissionPct ?? 'not provided';
        else if (/state|governing law|jurisdiction/.test(ctx)) value = state ?? 'not provided';
        return `Blank ${i + 1} — surrounding text: "...${b.context}..."\n  → The correct value for this blank is: "${value}"`;
      }).join('\n\n');

      const { object } = await generateObject({
        model: gateway('anthropic/claude-haiku-4-5-20251001'),
        schema: z.object({ values: z.array(z.string()) }),
        prompt: `Fill the blanks in a property management agreement. For each blank the correct value is already identified — just return them in order.

${blankInstructions}`,
      });

      values = object.values;

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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
  const key = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { folderId, mimeType, name } = req.body as { folderId?: string; mimeType?: string; name?: string };
  if (!folderId || !mimeType) return res.status(400).json({ error: 'folderId and mimeType are required' });

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const file = await drive.files.create({
      requestBody: {
        name: name || 'Untitled',
        mimeType,
        parents: [folderId],
      },
      fields: 'id,name,mimeType,webViewLink,modifiedTime',
    });

    return res.status(200).json({ file: file.data });
  } catch (err) {
    console.error('Drive create error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create file' });
  }
}

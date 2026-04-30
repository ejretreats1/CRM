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
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  // ── GET: list files ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { folderId } = req.query;
    try {
      const response = await drive.files.list({
        q: folderId && typeof folderId === 'string'
          ? `'${folderId}' in parents and trashed = false`
          : `sharedWithMe = true and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, parents)',
        orderBy: 'folder,name',
        pageSize: 200,
      });

      const files = (response.data.files ?? []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size) : null,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        parents: f.parents,
      }));

      res.setHeader('Cache-Control', 's-maxage=60');
      return res.status(200).json({ files });
    } catch (err) {
      console.error('Drive API error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Drive API error' });
    }
  }

  // ── POST: create file or folder ──────────────────────────────────────────
  if (req.method === 'POST') {
    const { folderId, mimeType, name } = req.body as { folderId?: string; mimeType?: string; name?: string };
    if (!folderId || !mimeType) return res.status(400).json({ error: 'folderId and mimeType are required' });

    try {
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

  return res.status(405).end();
}

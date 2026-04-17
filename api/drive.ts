import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
  const key = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { folderId } = req.query;

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    // If no folderId, list all top-level folders shared with the service account
    const query = folderId && typeof folderId === 'string'
      ? `'${folderId}' in parents and trashed = false`
      : `'root' in parents and trashed = false or sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

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

import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE_URL = 'https://api.uplisting.io/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { path, ...queryParams } = req.query;
  const apiKey = req.headers['x-uplisting-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({ error: 'Missing API key' });
  }
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing path' });
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (typeof v === 'string') params.set(k, v);
  }
  const query = params.toString() ? `?${params}` : '';

  const upstream = await fetch(`${BASE_URL}/${path}${query}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey.trim()}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  const body = await upstream.text();
  res.status(upstream.status).setHeader('Content-Type', 'application/json').send(body);
}

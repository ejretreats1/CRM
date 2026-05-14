import type { VercelRequest, VercelResponse } from '@vercel/node';

const UPLISTING_BASE = 'https://connect.uplisting.io';
const HOSTAWAY_BASE  = 'https://api.hostaway.com/v1';

async function getHostawayToken(accountId: string, secret: string): Promise<string> {
  const res = await fetch(`${HOSTAWAY_BASE}/accessTokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      scope:         'general',
      client_id:     accountId,
      client_secret: secret,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hostaway auth failed HTTP ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in Hostaway response');
  return String(data.access_token);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { path, ...queryParams } = req.query;
  if (!path || typeof path !== 'string') return res.status(400).json({ error: 'Missing path' });

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (typeof v === 'string') params.set(k, v);
  }
  const query = params.toString() ? `?${params}` : '';

  // ── Hostaway ────────────────────────────────────────────────────────────────
  const hostawayId     = req.headers['x-hostaway-account-id'];
  const hostawaySecret = req.headers['x-hostaway-secret'];
  if (hostawayId || hostawaySecret) {
    if (typeof hostawayId !== 'string' || typeof hostawaySecret !== 'string') {
      return res.status(401).json({ error: 'Invalid Hostaway credential headers' });
    }
    try {
      const token    = await getHostawayToken(hostawayId.trim(), hostawaySecret.trim());
      const upstream = await fetch(`${HOSTAWAY_BASE}/${path}${query}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const body = await upstream.text();
      if (!upstream.ok) return res.status(upstream.status).json({ error: body });
      return res.status(upstream.status).setHeader('Content-Type', 'application/json').send(body);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Hostaway proxy error' });
    }
  }

  // ── Uplisting ───────────────────────────────────────────────────────────────
  const apiKey = req.headers['x-uplisting-key'];
  if (!apiKey || typeof apiKey !== 'string') return res.status(401).json({ error: 'Missing API key' });

  const cleanKey  = apiKey.trim();
  const encoded   = Buffer.from(cleanKey).toString('base64');
  const authHeader = `Basic ${encoded}`;
  const upstreamUrl = `${UPLISTING_BASE}/${path}${query}`;

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Authorization:  authHeader,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
  });

  const body = await upstream.text();
  if (!upstream.ok) {
    return res.status(upstream.status).json({
      error: body,
      _debug: {
        url:                upstreamUrl,
        keyLength:          cleanKey.length,
        authHeaderPreview: `Basic base64(${cleanKey.slice(0, 6)}...)`,
      },
    });
  }

  res.status(upstream.status).setHeader('Content-Type', 'application/json').send(body);
}

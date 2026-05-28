import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Calendar helpers ──────────────────────────────────────────────

function parseICalDate(val: string): string | null {
  const dateOnly = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  const dateTime = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dateTime) return `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}T${dateTime[4]}:${dateTime[5]}:${dateTime[6]}${dateTime[7] === 'Z' ? 'Z' : ''}`;
  return null;
}

function extractField(block: string, key: string): string {
  const regex = new RegExp(`^${key}(?:;[^:\\r\\n]*)?:([^\\r\\n]*)`, 'm');
  const match = block.match(regex);
  return match ? match[1].trim() : '';
}

function unescapeICal(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function extractMeetLink(block: string, description: string): string {
  const confField = extractField(block, 'X-GOOGLE-CONFERENCE');
  if (confField && confField.startsWith('https://')) return confField;
  const confUri = block.match(/^CONFERENCE(?:;[^:\r\n]*)?:(\S+)/m);
  if (confUri && confUri[1].startsWith('https://')) return confUri[1];
  const location = unescapeICal(extractField(block, 'LOCATION'));
  const meetInLocation = location.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meetInLocation) return meetInLocation[0];
  const meetInDesc = description.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meetInDesc) return meetInDesc[0];
  return '';
}

function parseICal(ical: string) {
  const unfolded = ical.replace(/\r?\n[ \t]/g, '');
  const events: Array<{ id: string; title: string; start: string; end: string; description: string; location: string; meetLink?: string }> = [];
  const blocks = unfolded.split(/BEGIN:VEVENT/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const startRaw = extractField(block, 'DTSTART');
    const endRaw = extractField(block, 'DTEND');
    const start = parseICalDate(startRaw);
    if (!start) continue;
    const description = unescapeICal(extractField(block, 'DESCRIPTION'));
    const meetLink = extractMeetLink(block, description);
    events.push({
      id: extractField(block, 'UID') || `evt-${i}`,
      title: unescapeICal(extractField(block, 'SUMMARY') || 'Untitled'),
      start,
      end: parseICalDate(endRaw) || start,
      description,
      location: unescapeICal(extractField(block, 'LOCATION')),
      ...(meetLink ? { meetLink } : {}),
    });
  }
  return events;
}

// ── Main handler ──────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { service } = req.query;

  // ── Calendar proxy ──────────────────────────────────────────────
  if (service === 'calendar') {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url param' });
    try {
      const icalRes = await fetch(url, { headers: { 'User-Agent': 'EJRetreatsCRM/1.0' } });
      if (!icalRes.ok) return res.status(502).json({ error: `Failed to fetch calendar: ${icalRes.status}` });
      const text = await icalRes.text();
      const events = parseICal(text);
      const nowStr = new Date().toISOString().slice(0, 10);
      const upcoming = events.filter(e => e.start >= nowStr).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 10);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ events: upcoming });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  // ── Zillow scan proxy ──────────────────────────────────────────
  if (service === 'zillow-scan') {
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) return res.status(500).json({ error: 'RAPIDAPI_KEY not configured' });

    const { location, bedsMin, priceMin, priceMax, homeType, sort } = req.query;
    if (!location || typeof location !== 'string') return res.status(400).json({ error: 'location is required' });

    const params = new URLSearchParams({ location });
    if (bedsMin && typeof bedsMin === 'string')   params.set('beds_min', bedsMin);
    if (priceMin && typeof priceMin === 'string') params.set('price_min', priceMin);
    if (priceMax && typeof priceMax === 'string') params.set('price_max', priceMax);
    if (homeType && typeof homeType === 'string') params.set('home_type', homeType);
    if (sort && typeof sort === 'string')         params.set('sort', sort);

    try {
      const zillowRes = await fetch(
        `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${params}`,
        {
          headers: {
            'x-rapidapi-key': rapidApiKey,
            'x-rapidapi-host': 'zillow-com1.p.rapidapi.com',
          },
        }
      );
      if (!zillowRes.ok) {
        const txt = await zillowRes.text().catch(() => '');
        return res.status(zillowRes.status).json({ error: `Zillow API error: ${txt}` });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await zillowRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listings = (data.props ?? []).map((p: any) => ({
        zpid: String(p.zpid ?? ''),
        address: p.address ?? '',
        price: Number(p.price) || 0,
        bedrooms: p.bedrooms != null ? Number(p.bedrooms) : null,
        bathrooms: p.bathrooms != null ? Number(p.bathrooms) : null,
        homeType: p.homeType ?? '',
        imgSrc: p.imgSrc ?? null,
        zillowUrl: p.zpid ? `https://www.zillow.com/homedetails/${p.zpid}_zpid/` : '',
        zestimate: p.zestimate ? Number(p.zestimate) : null,
        rentZestimate: p.rentZestimate ? Number(p.rentZestimate) : null,
        daysOnZillow: p.daysOnZillow ?? null,
        listingType: p.listingType ?? '',
      }));
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ listings, total: data.totalResultCount ?? listings.length });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Zillow scan failed' });
    }
  }

  // ── PriceLabs proxy ─────────────────────────────────────────────
  if (service === 'pricelabs') {
    const { path } = req.query;
    const apiKey = req.headers['x-pricelabs-key'];
    if (!apiKey || typeof apiKey !== 'string') return res.status(401).json({ error: 'Missing PriceLabs API key' });
    if (!path || typeof path !== 'string') return res.status(400).json({ error: 'Missing path' });

    const upstream = await fetch(`https://api.pricelabs.co/v1/${path}?api_key=${encodeURIComponent(apiKey)}`, {
      headers: { Accept: 'application/json' },
    });
    const body = await upstream.text();
    return res.status(upstream.status).setHeader('Content-Type', 'application/json').send(body);
  }

  // ── Hostaway proxy ──────────────────────────────────────────────
  const hostawayAccountId = req.headers['x-hostaway-account-id'];
  const hostawaySecret    = req.headers['x-hostaway-secret'];

  if (hostawayAccountId && typeof hostawayAccountId === 'string' && hostawaySecret && typeof hostawaySecret === 'string') {
    const { path: hostawayPath, ...hostawayParams } = req.query;
    if (!hostawayPath || typeof hostawayPath !== 'string') return res.status(400).json({ error: 'Missing path' });

    // Exchange credentials for OAuth2 access token
    const tokenRes = await fetch('https://api.hostaway.com/v1/accessTokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: hostawayAccountId,
        client_secret: hostawaySecret,
        scope: 'general',
      }).toString(),
    });
    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => '');
      return res.status(tokenRes.status).json({ error: `Hostaway auth failed: ${txt}` });
    }
    const { access_token } = await tokenRes.json();

    const hwParams = new URLSearchParams();
    for (const [k, v] of Object.entries(hostawayParams)) {
      if (typeof v === 'string') hwParams.set(k, v);
    }
    const hwQuery = hwParams.toString() ? `?${hwParams}` : '';
    const hwUpstream = await fetch(`https://api.hostaway.com/v1/${hostawayPath}${hwQuery}`, {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });
    const hwBody = await hwUpstream.text();
    return res.status(hwUpstream.status).setHeader('Content-Type', 'application/json').send(hwBody);
  }

  // ── Uplisting proxy (default) ────────────────────────────────────────────
  const { path, ...queryParams } = req.query;
  const apiKey = req.headers['x-uplisting-key'];

  if (!apiKey || typeof apiKey !== 'string') return res.status(401).json({ error: 'Missing API key' });
  if (!path || typeof path !== 'string') return res.status(400).json({ error: 'Missing path' });

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (typeof v === 'string') params.set(k, v);
  }
  const query = params.toString() ? `?${params}` : '';
  const cleanKey = apiKey.trim();
  const encoded = Buffer.from(cleanKey).toString('base64');
  const upstreamUrl = `https://connect.uplisting.io/${path}${query}`;

  const upstream = await fetch(upstreamUrl, {
    headers: { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const body = await upstream.text();

  if (!upstream.ok) {
    return res.status(upstream.status).json({
      error: body,
      _debug: { url: upstreamUrl, keyLength: cleanKey.length, authHeaderPreview: `Basic base64(${cleanKey.slice(0, 6)}...)` },
    });
  }
  return res.status(upstream.status).setHeader('Content-Type', 'application/json').send(body);
}

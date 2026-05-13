import type { VercelRequest, VercelResponse } from '@vercel/node';

function parseICalDate(val: string): string | null {
  // DATE only: YYYYMMDD
  const dateOnly = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  // DATE-TIME: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const dateTime = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dateTime) {
    return `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}T${dateTime[4]}:${dateTime[5]}:${dateTime[6]}${dateTime[7] === 'Z' ? 'Z' : ''}`;
  }
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
  // X-GOOGLE-CONFERENCE is the most reliable source
  const confField = extractField(block, 'X-GOOGLE-CONFERENCE');
  if (confField && confField.startsWith('https://')) return confField;
  // CONFERENCE;VALUE=URI:https://meet.google.com/...
  const confUri = block.match(/^CONFERENCE(?:;[^:\r\n]*)?:(\S+)/m);
  if (confUri && confUri[1].startsWith('https://')) return confUri[1];
  // Scan description for meet.google.com URLs
  const meetInDesc = description.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meetInDesc) return meetInDesc[0];
  return '';
}

function parseICal(ical: string) {
  // Unfold continuation lines (CRLF or LF followed by whitespace)
  const unfolded = ical.replace(/\r?\n[ \t]/g, '');

  const events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    description: string;
    location: string;
    meetLink?: string;
  }> = [];

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url param' });
  }

  try {
    const icalRes = await fetch(url, {
      headers: { 'User-Agent': 'EJRetreatsCRM/1.0' },
    });
    if (!icalRes.ok) {
      return res.status(502).json({ error: `Failed to fetch calendar: ${icalRes.status}` });
    }

    const text = await icalRes.text();
    const events = parseICal(text);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nowStr = today.toISOString().slice(0, 10);

    const upcoming = events
      .filter(e => e.start >= nowStr)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 10);

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ events: upcoming });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

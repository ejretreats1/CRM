// Shared iCal parsing + property sync logic (not a Vercel function — _ prefix)

export interface IcalEvent {
  uid: string;
  start: string;   // YYYY-MM-DD
  end: string;     // YYYY-MM-DD (checkout = cleaning day)
  summary: string;
  status: string;  // CONFIRMED | CANCELLED | TENTATIVE
}

export interface IcalUrl {
  platform: string;
  url: string;
  lastSyncedAt?: string;
}

function parseIcalDate(val: string): string {
  const d = val.replace(/T.*$/, '').trim();
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

export function parseIcal(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  // Unfold RFC 5545 line continuations (CRLF + whitespace = continuation)
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let cur: Partial<IcalEvent> = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; cur = {}; continue; }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (cur.uid && cur.start && cur.end) events.push(cur as IcalEvent);
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).split(';')[0].toUpperCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === 'UID')     cur.uid     = val;
    if (key === 'DTSTART') cur.start   = parseIcalDate(val);
    if (key === 'DTEND')   cur.end     = parseIcalDate(val);
    if (key === 'SUMMARY') cur.summary = val.replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\;/g, ';');
    if (key === 'STATUS')  cur.status  = val.toUpperCase();
  }

  return events;
}

// Events that mean "owner blocked, no guest checkout" — skip these
const BLOCK_RE = /^(not available|airbnb \(not available\)|blocked|owner block|maintenance|hold|unavailable)$/i;

function isBlock(summary: string): boolean {
  return BLOCK_RE.test(summary.trim());
}

// ─── Sync one property's iCal URLs against cleaning_jobs ─────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncPropertyIcal(supabase: any, config: {
  id: string;
  property_id: string;
  property_name: string;
  cleaning_fee: number;
  ical_urls: IcalUrl[];
}): Promise<{ created: number; cancelled: number; errors: string[] }> {
  const ical_urls: IcalUrl[] = config.ical_urls ?? [];
  if (!ical_urls.length) return { created: 0, cancelled: 0, errors: [] };

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 120); // 4-month look-ahead
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Load existing jobs for this property (keyed by reservation_id = UID)
  const { data: existing } = await supabase
    .from('cleaning_jobs')
    .select('id, reservation_id, status')
    .eq('property_id', config.property_id);
  const byUid = new Map((existing ?? []).filter((j: { reservation_id: string }) => j.reservation_id).map((j: { reservation_id: string; id: string; status: string }) => [j.reservation_id, j]));

  let created = 0, cancelled = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const entry of ical_urls) {
    try {
      const r = await fetch(
        entry.url.replace(/^webcal:\/\//i, 'https://'),
        { headers: { 'User-Agent': 'EJRetreats-Cleaning/1.0' }, signal: AbortSignal.timeout(12000) },
      );
      if (!r.ok) { errors.push(`${entry.platform}: HTTP ${r.status}`); continue; }
      const text = await r.text();
      const events = parseIcal(text);

      for (const ev of events) {
        if (!ev.uid || !ev.end) continue;

        if (ev.status === 'CANCELLED') {
          const ex = byUid.get(ev.uid);
          if (ex && ex.status !== 'cancelled') {
            await supabase.from('cleaning_jobs').update({ status: 'cancelled', updated_at: now }).eq('id', ex.id);
            cancelled++;
          }
          continue;
        }

        if (isBlock(ev.summary)) continue;                // owner-blocked, no cleaning
        if (!ev.end || ev.end < today) continue;          // already past
        if (ev.end > cutoffStr) continue;                 // too far out
        if (byUid.has(ev.uid)) continue;                  // already have this reservation

        const jobId = `ical_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const guestName = (ev.summary && ev.summary !== 'Reserved' && !isBlock(ev.summary)) ? ev.summary : null;

        await supabase.from('cleaning_jobs').insert({
          id: jobId,
          reservation_id: ev.uid,
          property_id: config.property_id,
          property_name: config.property_name,
          guest_name: guestName,
          checkout_date: ev.end,
          checkin_date: (ev.start && ev.start !== ev.end) ? ev.start : null,
          status: 'pending',
          cleaning_fee: config.cleaning_fee,
          cleaner_payout: 0,
          source: 'ical',
          created_at: now,
          updated_at: now,
        });
        byUid.set(ev.uid, { id: jobId, reservation_id: ev.uid, status: 'pending' });
        created++;
      }
    } catch (e) {
      errors.push(`${entry.platform}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Stamp lastSyncedAt on each URL
  const updatedUrls = ical_urls.map(u => ({ ...u, lastSyncedAt: now }));
  await supabase.from('cleaning_property_configs').update({ ical_urls: updatedUrls }).eq('id', config.id);

  return { created, cancelled, errors };
}

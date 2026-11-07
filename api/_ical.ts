// Shared iCal parsing + property sync (not a Vercel function — _ prefix).
// Fetches every calendar feed on a property and hands the bookings to
// reconcileJobs(), which creates / moves / cancels cleaning jobs.

import { reconcileJobs, type BookingLike, type ReconcileResult } from './_jobs.js';

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
  unitName?: string;
}

/**
 * DATE and DATE-TIME values → YYYY-MM-DD. Date-times are converted to the
 * business timezone first so a UTC midnight doesn't land on the previous day.
 */
export function parseIcalDate(val: string): string {
  const v = val.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return v.includes('T') ? v.slice(0, 10) : v;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (!hh) return `${y}-${mo}-${d}`;
  if (z) {
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss ?? 0)));
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(utc);
  }
  return `${y}-${mo}-${d}`; // floating local time: take the date as written
}

export function parseIcal(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, ''); // RFC 5545 line folding
  const lines = unfolded.split(/\r?\n/);
  let inEvent = false;
  let cur: Partial<IcalEvent> = {};
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; cur = {}; continue; }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (cur.uid && cur.start && cur.end) events.push({ summary: '', status: 'CONFIRMED', ...cur } as IcalEvent);
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
    if (key === 'SUMMARY') cur.summary = val.replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\;/g, ';');
    if (key === 'STATUS')  cur.status  = val.toUpperCase();
  }
  return events;
}

// Events that mean "owner blocked, no guest checkout"
const BLOCK_RE = /^(not available|airbnb \(not available\)|blocked|owner block|maintenance|hold|unavailable|closed(?:\s*-\s*not available)?|unavailable \(.*\))$/i;
export function isBlock(summary: string): boolean { return BLOCK_RE.test((summary ?? '').trim()); }

export interface IcalFetchResult { bookings: BookingLike[]; errors: string[]; complete: boolean }

/** Fetch every feed on the property; `complete` is false if any feed failed. */
export async function fetchIcalBookings(icalUrls: IcalUrl[], parentPropertyId: string): Promise<IcalFetchResult> {
  const bookings: BookingLike[] = [];
  const errors: string[] = [];
  let complete = true;
  for (const entry of icalUrls) {
    try {
      const r = await fetch(entry.url.replace(/^webcal:\/\//i, 'https://'), {
        headers: { 'User-Agent': 'EJRetreats-Cleaning/1.0' }, signal: AbortSignal.timeout(12_000),
      });
      if (!r.ok) { errors.push(`${entry.platform}: HTTP ${r.status}`); complete = false; continue; }
      const text = await r.text();
      if (!/BEGIN:VCALENDAR/i.test(text)) { errors.push(`${entry.platform}: not an iCal feed`); complete = false; continue; }
      const unitKey = entry.unitName ? `${parentPropertyId}:${entry.unitName}` : parentPropertyId;
      for (const ev of parseIcal(text)) {
        if (!ev.uid || !ev.end) continue;
        if (isBlock(ev.summary)) continue;
        const guestName = ev.summary && ev.summary !== 'Reserved' && !/^reserved/i.test(ev.summary) ? ev.summary : null;
        bookings.push({ reservationId: ev.uid, unitKey, unitName: entry.unitName ?? null, checkIn: ev.start, checkOut: ev.end, guestName, cancelled: ev.status === 'CANCELLED' });
      }
    } catch (e) {
      errors.push(`${entry.platform}: ${e instanceof Error ? e.message : String(e)}`);
      complete = false;
    }
  }
  return { bookings, errors, complete };
}

/** Sync one property's iCal URLs against cleaning_jobs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncPropertyIcal(supabase: any, config: {
  id: string; property_id: string; property_name: string; cleaning_fee: number; ical_urls: IcalUrl[];
  linked_property_ids?: string[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}, resend?: any): Promise<ReconcileResult> {
  const icalUrls: IcalUrl[] = config.ical_urls ?? [];
  if (!icalUrls.length) return { created: 0, updated: 0, cancelled: 0, rebound: 0, errors: [] };
  const fetched = await fetchIcalBookings(icalUrls, config.property_id);
  const result = await reconcileJobs(supabase, config, fetched.bookings, { source: 'ical', complete: fetched.complete, resend });
  result.errors.push(...fetched.errors);
  const now = new Date().toISOString();
  const stamped = icalUrls.map(u => ({ ...u, lastSyncedAt: now }));
  await supabase.from('cleaning_property_configs').update({ ical_urls: stamped }).eq('id', config.id);
  return result;
}

// ── Feed preview ─────────────────────────────────────────────────────────────

export interface IcalPreview {
  ok: boolean;
  error?: string;
  /** Name the calendar gives itself (X-WR-CALNAME) — handy for telling two share links apart */
  calendarName?: string;
  events: number;        // VEVENTs the parser understood
  skipped: number;       // VEVENTs dropped for missing UID / DTSTART / DTEND
  bookings: number;      // would become cleaning jobs
  blocks: number;        // filtered out as owner blocks
  cancelled: number;     // STATUS:CANCELLED
  blockSummaries: string[];
  bookingSummaries: string[];
  upcoming: { checkOut: string; checkIn: string; guestName: string | null }[];
}

/**
 * Fetch a calendar the way the sync does and report what it would make of it,
 * so a feed can be checked before it's saved. It runs the same parse and the
 * same block filter, so it can't disagree with the sync that follows.
 */
export async function previewIcalFeed(rawUrl: string, today: string): Promise<IcalPreview> {
  const empty = { events: 0, skipped: 0, bookings: 0, blocks: 0, cancelled: 0, blockSummaries: [], bookingSummaries: [], upcoming: [] };
  const url = rawUrl.trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'That is not a web address — paste the calendar export URL (https:// or webcal://).', ...empty };

  let text: string;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'EJRetreats-Cleaning/1.0' }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return { ok: false, error: `The calendar host answered HTTP ${r.status}. Check the link is still shared and hasn't expired.`, ...empty };
    text = await r.text();
  } catch (e) {
    return { ok: false, error: `Couldn't reach the calendar: ${e instanceof Error ? e.message : String(e)}`, ...empty };
  }
  if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, error: "That link doesn't return a calendar (no BEGIN:VCALENDAR). It may be a web page rather than the iCal export URL.", ...empty };

  const rawEvents = (text.match(/BEGIN:VEVENT/gi) ?? []).length;
  const parsed = parseIcal(text);
  const calendarName = text.replace(/\r?\n[ \t]/g, '').match(/^X-WR-CALNAME:(.*)$/im)?.[1]?.trim() || undefined;

  const blockSummaries = new Set<string>();
  const bookingSummaries = new Set<string>();
  let blocks = 0, cancelled = 0;
  const upcoming: { checkOut: string; checkIn: string; guestName: string | null }[] = [];
  for (const ev of parsed) {
    if (isBlock(ev.summary)) { blocks++; blockSummaries.add(ev.summary.trim()); continue; }
    if (ev.status === 'CANCELLED') { cancelled++; continue; }
    if (ev.summary.trim()) bookingSummaries.add(ev.summary.trim());
    if (ev.end >= today) {
      upcoming.push({
        checkOut: ev.end,
        checkIn: ev.start,
        guestName: ev.summary && !/^reserved/i.test(ev.summary) ? ev.summary : null,
      });
    }
  }
  upcoming.sort((a, b) => a.checkOut.localeCompare(b.checkOut));

  return {
    ok: true,
    calendarName,
    events: parsed.length,
    skipped: rawEvents - parsed.length,
    bookings: parsed.length - blocks - cancelled,
    blocks,
    cancelled,
    blockSummaries: [...blockSummaries].slice(0, 8),
    bookingSummaries: [...bookingSummaries].slice(0, 8),
    upcoming: upcoming.slice(0, 5),
  };
}

// ── Cleaning job lifecycle: bookings → jobs → dispatch → escalation ──────────
//
// reconcileJobs(): one function that turns the current set of bookings for a
// property (from iCal feeds and/or Uplisting) into cleaning jobs — creating new
// ones, moving jobs whose checkout changed, cancelling jobs whose booking
// disappeared, and computing the next check-in / same-day turnover flag.
// Cancellations only happen when every feed for the property was fetched
// successfully, so a flaky calendar never cancels real work.
//
// dispatchJob() / advanceDispatch(): the sequential cleaner cascade (one cleaner
// at a time, in roster order), shared by the API, the cron and the hourly tick.
//
// dispatchTick(): hourly — dispatches pending jobs inside the dispatch window,
// moves on from cleaners who haven't answered, and alerts the admin when a job
// is still unassigned close to checkout.

import { randomUUID } from 'crypto';
import { APP_URL, ADMIN_EMAIL, escapeHtml } from './_auth.js';
import { CLEANING_FROM, sendJobOfferEmail, sendJobCancelledEmail, sendJobRescheduledEmail } from './_emails.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resend = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export const DISPATCH_WINDOW_DAYS = 14;      // start offering a job this many days before checkout
export const ESCALATE_AFTER_HOURS = 4;        // move to the next cleaner after this long with no answer
export const ESCALATE_URGENT_AFTER_HOURS = 1; // …or this long when checkout is within 48h
export const URGENT_WINDOW_HOURS = 48;
const ACTIVE_STATUSES = ['pending', 'dispatched', 'accepted', 'in_progress'];

/** YYYY-MM-DD for today in the business's timezone. */
export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dateLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export interface BookingLike {
  reservationId: string;
  /** Uplisting listing id (parent or sub-unit) or the iCal feed key for the unit */
  unitKey: string;
  unitName?: string | null;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD = cleaning day
  guestName?: string | null;
  cancelled: boolean;
}

export interface ReconcileResult { created: number; updated: number; cancelled: number; errors: string[] }

interface ReconcileOpts {
  source: 'ical' | 'uplisting';
  /** true only when every feed/listing for this property was fetched OK — enables cancellation of missing bookings */
  complete: boolean;
  lookbackDays?: number;
  resend?: Resend;
  today?: string;
}

/** Next check-in after each booking's checkout, within the same unit. */
export function withNextCheckIn(bookings: BookingLike[]): Map<string, { nextCheckIn: string | null; sameDay: boolean }> {
  const out = new Map<string, { nextCheckIn: string | null; sameDay: boolean }>();
  const byUnit = new Map<string, BookingLike[]>();
  for (const b of bookings) {
    if (b.cancelled) continue;
    const list = byUnit.get(b.unitKey) ?? [];
    list.push(b);
    byUnit.set(b.unitKey, list);
  }
  for (const list of byUnit.values()) {
    const sorted = [...list].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (const b of sorted) {
      const next = sorted.find(o => o !== b && o.checkIn >= b.checkOut);
      const nextCheckIn = next?.checkIn ?? null;
      out.set(b.reservationId, { nextCheckIn, sameDay: nextCheckIn === b.checkOut });
    }
  }
  return out;
}

export async function reconcileJobs(db: Db, config: Row, bookings: BookingLike[], opts: ReconcileOpts): Promise<ReconcileResult> {
  const result: ReconcileResult = { created: 0, updated: 0, cancelled: 0, errors: [] };
  const today = opts.today ?? todayET();
  const lookback = addDays(today, -(opts.lookbackDays ?? 7));
  const now = new Date().toISOString();

  const propertyIds = [config.property_id, ...((config.linked_property_ids ?? []) as string[])].filter(Boolean);
  const { data: existing, error } = await db
    .from('cleaning_jobs')
    .select('*')
    .in('property_id', propertyIds)
    .not('reservation_id', 'is', null);
  if (error) { result.errors.push(`load jobs: ${error.message}`); return result; }
  const byUid = new Map<string, Row>((existing ?? []).map((j: Row) => [j.reservation_id, j]));

  const nextInfo = withNextCheckIn(bookings);
  const seen = new Set<string>();

  for (const b of bookings) {
    if (!b.reservationId || !b.checkOut) continue;
    seen.add(b.reservationId);
    const job = byUid.get(b.reservationId);

    if (b.cancelled) {
      if (job && ACTIVE_STATUSES.includes(job.status)) await cancelJob(db, job, 'The booking was cancelled.', result, opts.resend);
      continue;
    }
    if (b.checkOut < lookback) continue;

    const info = nextInfo.get(b.reservationId) ?? { nextCheckIn: null, sameDay: false };
    const propertyName = b.unitName ? `${config.property_name} — ${b.unitName}` : config.property_name;

    if (!job) {
      const { error: insErr } = await db.from('cleaning_jobs').insert({
        id: `${opts.source === 'ical' ? 'ical' : 'cj'}_${randomUUID().slice(0, 12)}`,
        reservation_id: b.reservationId,
        property_id: config.property_id,          // always the enrolled (parent) property
        unit_id: b.unitKey !== config.property_id ? b.unitKey : null,
        property_name: propertyName,
        guest_name: b.guestName || null,
        checkout_date: b.checkOut,
        checkin_date: info.nextCheckIn,
        same_day: info.sameDay,
        status: 'pending',
        cleaning_fee: config.cleaning_fee ?? 0,
        cleaner_payout: 0,
        source: opts.source,
        created_at: now,
        updated_at: now,
      });
      if (insErr) {
        // A concurrent sync may have inserted it (unique index) — not an error worth alerting on.
        if (!/duplicate|23505/i.test(insErr.message ?? '')) result.errors.push(`insert ${b.reservationId}: ${insErr.message}`);
      } else {
        result.created++;
      }
      continue;
    }

    // Existing job: keep its dates in step with the booking.
    if (!ACTIVE_STATUSES.includes(job.status)) continue;
    const patch: Row = {};
    if (job.checkout_date !== b.checkOut) patch.checkout_date = b.checkOut;
    if ((job.checkin_date ?? null) !== info.nextCheckIn) patch.checkin_date = info.nextCheckIn;
    if (!!job.same_day !== info.sameDay) patch.same_day = info.sameDay;
    if (b.guestName && job.guest_name !== b.guestName) patch.guest_name = b.guestName;
    if (Object.keys(patch).length === 0) continue;
    const rescheduled = !!patch.checkout_date;
    if (rescheduled) patch.reschedule_count = Number(job.reschedule_count ?? 0) + 1;
    patch.updated_at = now;
    const { error: updErr } = await db.from('cleaning_jobs').update(patch).eq('id', job.id);
    if (updErr) { result.errors.push(`update ${job.id}: ${updErr.message}`); continue; }
    result.updated++;
    if (rescheduled && opts.resend) {
      const recipients = currentCleanerContacts(job);
      for (const c of recipients) {
        try { await sendJobRescheduledEmail(opts.resend, { to: c.email, name: c.name, propertyName: job.property_name, oldDate: job.checkout_date, newDate: b.checkOut, nextCheckIn: info.nextCheckIn, sameDay: info.sameDay }); } catch { /* best effort */ }
      }
    }
  }

  // Bookings that vanished from the feed (Airbnb drops cancelled reservations
  // rather than flagging them). Only when every feed was read successfully.
  if (opts.complete) {
    for (const job of existing ?? []) {
      if (job.source !== opts.source) continue;
      if (seen.has(job.reservation_id)) continue;
      if (!ACTIVE_STATUSES.includes(job.status)) continue;
      if (job.checkout_date < today) continue; // keep history; don't rewrite the past
      await cancelJob(db, job, 'The booking no longer appears in the calendar.', result, opts.resend);
    }
  }
  return result;
}

function currentCleanerContacts(job: Row): { name: string; email: string }[] {
  const tokens = (job.dispatch_tokens ?? {}) as Record<string, { cleanerId: string; cleanerName: string; cleanerEmail?: string }>;
  if (job.assigned_cleaner_id) {
    const t = Object.values(tokens).find(x => x.cleanerId === job.assigned_cleaner_id);
    return t?.cleanerEmail ? [{ name: t.cleanerName, email: t.cleanerEmail }] : [];
  }
  if (job.status === 'dispatched') {
    const order = (job.dispatch_order ?? []) as string[];
    const cur = tokens[order[job.dispatch_index ?? 0]];
    return cur?.cleanerEmail ? [{ name: cur.cleanerName, email: cur.cleanerEmail }] : [];
  }
  return [];
}

async function cancelJob(db: Db, job: Row, reason: string, result: ReconcileResult, resend?: Resend) {
  if (job.charged_at) {
    // Money already moved — a human decides about refunds.
    if (resend) await adminAlert(resend, `⚠️ Booking cancelled after charge: ${job.property_name}`, `<p>The booking behind the ${escapeHtml(job.checkout_date)} cleaning at <strong>${escapeHtml(job.property_name)}</strong> was cancelled, but the client was already charged. Review in the CRM (refund?).</p>`);
    return;
  }
  const { error } = await db.from('cleaning_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', job.id).in('status', ACTIVE_STATUSES);
  if (error) { result.errors.push(`cancel ${job.id}: ${error.message}`); return; }
  result.cancelled++;
  if (!resend) return;
  for (const c of currentCleanerContacts(job)) {
    try { await sendJobCancelledEmail(resend, { to: c.email, name: c.name, propertyName: job.property_name, checkoutDate: job.checkout_date, reason }); } catch { /* best effort */ }
  }
  if (job.status === 'accepted' || job.status === 'in_progress') {
    await adminAlert(resend, `Cleaning cancelled: ${job.property_name} – ${dateLabel(job.checkout_date)}`, `<p>${escapeHtml(reason)} ${escapeHtml(job.assigned_cleaner_name ?? 'The cleaner')} has been notified.</p>`);
  }
}

export async function adminAlert(resend: Resend, subject: string, html: string) {
  try { await resend.emails.send({ from: CLEANING_FROM, to: ADMIN_EMAIL, subject, html: `<div style="font-family:sans-serif;padding:24px">${html}</div>` }); } catch { /* best effort */ }
}

// ── Uplisting bookings (server side) ─────────────────────────────────────────

const CANCELLED = new Set(['cancelled', 'canceled', 'declined', 'expired', 'rejected', 'request_denied', 'denied', 'no_show']);

export async function fetchUplistingBookings(apiKey: string, listingId: string, from: string, to: string): Promise<BookingLike[]> {
  const encoded = Buffer.from(apiKey.trim()).toString('base64');
  const r = await fetch(`https://connect.uplisting.io/bookings/${listingId}?from=${from}&to=${to}`, {
    headers: { Authorization: `Basic ${encoded}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Uplisting ${listingId}: HTTP ${r.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await r.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = data?.bookings ?? data?.data ?? (Array.isArray(data) ? data : []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.map((b: any) => {
    const a = b.attributes ?? b;
    const status = String(a.status ?? 'confirmed').toLowerCase();
    return {
      reservationId: String(b.id ?? a.id ?? ''),
      unitKey: listingId,
      checkIn: String(a.check_in ?? a.start_date ?? '').slice(0, 10),
      checkOut: String(a.check_out ?? a.end_date ?? '').slice(0, 10),
      guestName: a.guest_name ?? a.guest?.name ?? null,
      cancelled: CANCELLED.has(status),
    } as BookingLike;
  }).filter(b => b.reservationId && b.checkOut);
}

/** Uplisting listing names (nickname preferred) for sub-unit labels. */
export async function fetchUplistingListingNames(apiKey: string): Promise<Map<string, string>> {
  const encoded = Buffer.from(apiKey.trim()).toString('base64');
  const names = new Map<string, string>();
  try {
    const r = await fetch('https://connect.uplisting.io/properties', { headers: { Authorization: `Basic ${encoded}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return names;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (data?.properties ?? data?.data ?? (Array.isArray(data) ? data : [])) as any[]) {
      const a = p.attributes ?? p;
      const id = String(p.id ?? a.id ?? '');
      if (id) names.set(id, a.nickname || a.name || a.title || id);
    }
  } catch { /* names are cosmetic */ }
  return names;
}

/** Sync Uplisting bookings for every enrolled property whose id is an Uplisting listing. */
export async function syncUplistingJobs(db: Db, resend: Resend | undefined, apiKey: string): Promise<{ properties: number; created: number; updated: number; cancelled: number; errors: string[] }> {
  const summary = { properties: 0, created: 0, updated: 0, cancelled: 0, errors: [] as string[] };
  const { data: configs } = await db.from('cleaning_property_configs').select('*');
  const names = await fetchUplistingListingNames(apiKey);
  const today = todayET();
  const from = addDays(today, -14);
  const to = addDays(today, 180);
  for (const config of (configs ?? []) as Row[]) {
    // Only properties that came from Uplisting (listing ids are numeric or known listings)
    const ids = [config.property_id, ...((config.linked_property_ids ?? []) as string[])].filter(Boolean);
    const upIds = ids.filter(id => names.has(id) || /^\d+$/.test(id));
    if (!upIds.length) continue;
    summary.properties++;
    const bookings: BookingLike[] = [];
    let complete = true;
    for (const listingId of upIds) {
      try {
        const got = await fetchUplistingBookings(apiKey, listingId, from, to);
        const unitName = listingId !== config.property_id ? (names.get(listingId) ?? listingId) : null;
        bookings.push(...got.map(b => ({ ...b, unitName })));
      } catch (e) {
        complete = false;
        summary.errors.push(`${config.property_name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const r = await reconcileJobs(db, config, bookings, { source: 'uplisting', complete, resend, today });
    summary.created += r.created; summary.updated += r.updated; summary.cancelled += r.cancelled; summary.errors.push(...r.errors.map(e => `${config.property_name}: ${e}`));
  }
  return summary;
}

// ── Dispatch cascade ─────────────────────────────────────────────────────────

export interface RosterCleaner { id: string; name: string; email: string; payout: number }

/** Active cleaners on a property's roster, in priority order. */
export function resolveRoster(config: Row, cleaners: Row[]): RosterCleaner[] {
  const byId = new Map(cleaners.map(c => [c.id, c]));
  return ((config.assigned_cleaners ?? []) as { id: string; payout?: number }[])
    .map(ac => {
      const c = byId.get(ac.id);
      return c && c.status === 'active' ? { id: c.id, name: c.name, email: c.email, payout: Number(ac.payout ?? 0) } : null;
    })
    .filter((c): c is RosterCleaner => !!c);
}

/** Offer a job to a roster: tokens for everyone, email to #1 only. */
export async function dispatchJob(db: Db, resend: Resend, job: Row, roster: RosterCleaner[]): Promise<{ ok: boolean; error?: string }> {
  if (!roster.length) return { ok: false, error: 'No active cleaners on the roster.' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatchTokens: Record<string, any> = {};
  const dispatchOrder: string[] = [];
  for (const c of roster) {
    const token = randomUUID();
    dispatchTokens[token] = { cleanerId: c.id, cleanerName: c.name, cleanerEmail: c.email, payout: c.payout };
    dispatchOrder.push(token);
  }
  const now = new Date().toISOString();
  const { data: updated, error } = await db.from('cleaning_jobs').update({
    status: 'dispatched', dispatched_at: now, dispatch_advanced_at: now,
    dispatch_tokens: dispatchTokens, dispatch_order: dispatchOrder, dispatch_index: 0, updated_at: now,
  }).eq('id', job.id).in('status', ['pending']).select('id');
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: 'Job is no longer pending.' };

  const first = roster[0];
  const emailError = await offerByEmail(db, resend, job, first, dispatchOrder[0]);
  if (emailError) return { ok: true, error: `Dispatched, but the email to ${first.name} failed: ${emailError}` };
  return { ok: true };
}

/**
 * Email the offer to one cleaner and record the outcome on the job, so a
 * bounced/failed offer is visible in the Jobs tab and to the admin instead of
 * silently stalling the cascade. Returns the error message, or null on success.
 */
async function offerByEmail(db: Db, resend: Resend, job: Row, cleaner: RosterCleaner, token: string): Promise<string | null> {
  if (!cleaner.email) return 'no email on file';
  try {
    await sendJobOfferEmail(resend, { to: cleaner.email, name: cleaner.name, job, payout: cleaner.payout, portalLink: `${APP_URL}?cleaner=${job.id}:${token}` });
    await db.from('cleaning_jobs').update({ dispatch_email_error: null }).eq('id', job.id);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('cleaning_jobs').update({ dispatch_email_error: `${cleaner.name}: ${msg}` }).eq('id', job.id);
    await adminAlert(resend, `⚠️ Job offer email failed: ${job.property_name} – ${dateLabel(job.checkout_date)}`,
      `<p>The offer email to <strong>${escapeHtml(cleaner.name)}</strong> (${escapeHtml(cleaner.email)}) failed: ${escapeHtml(msg)}.</p><p>They can still see the job in their Cleaner Portal; otherwise call or text them, or re-dispatch from the Jobs tab.</p>`);
    return msg;
  }
}

/**
 * Move a dispatched job to the next cleaner (because the current one passed or
 * didn't answer). When the list is exhausted the job goes back to pending and
 * the admin is alerted.
 */
export async function advanceDispatch(db: Db, resend: Resend, job: Row, reason: 'passed' | 'no_response'): Promise<{ next: RosterCleaner | null; exhausted: boolean; error?: string }> {
  const tokens = (job.dispatch_tokens ?? {}) as Record<string, { cleanerId: string; cleanerName: string; cleanerEmail?: string; payout?: number }>;
  const order = (job.dispatch_order ?? []) as string[];
  const currentIndex = Number(job.dispatch_index ?? 0);
  const nextIndex = currentIndex + 1;
  const now = new Date().toISOString();
  const current = tokens[order[currentIndex]];
  const label = dateLabel(job.checkout_date);

  if (nextIndex >= order.length) {
    const { data: upd, error } = await db.from('cleaning_jobs').update({ status: 'pending', dispatch_index: nextIndex, dispatch_advanced_at: now, updated_at: now })
      .eq('id', job.id).eq('status', 'dispatched').eq('dispatch_index', currentIndex).select('id');
    if (error) return { next: null, exhausted: true, error: error.message };
    if (!upd?.length) return { next: null, exhausted: true, error: 'Job changed under us.' };
    await adminAlert(resend, `⚠️ No cleaners available: ${job.property_name} – ${label}`,
      `<p>Every cleaner on the roster ${reason === 'passed' ? 'passed on' : 'has not responded to'} the ${label} cleaning at <strong>${escapeHtml(job.property_name)}</strong>. The job is back to <strong>pending</strong> — assign someone or add a cleaner to the roster and dispatch again.</p>`);
    return { next: null, exhausted: true };
  }

  const nextToken = order[nextIndex];
  const nextInfo = tokens[nextToken];
  const { data: upd, error } = await db.from('cleaning_jobs').update({ dispatch_index: nextIndex, dispatch_advanced_at: now, updated_at: now })
    .eq('id', job.id).eq('status', 'dispatched').eq('dispatch_index', currentIndex).select('id');
  if (error) return { next: null, exhausted: false, error: error.message };
  if (!upd?.length) return { next: null, exhausted: false, error: 'Job changed under us.' };

  const next: RosterCleaner = { id: nextInfo.cleanerId, name: nextInfo.cleanerName, email: nextInfo.cleanerEmail ?? '', payout: Number(nextInfo.payout ?? 0) };
  await offerByEmail(db, resend, job, next, nextToken);
  await adminAlert(resend, `${reason === 'passed' ? '👋' : '⏭️'} ${escapeHtml(current?.cleanerName ?? 'A cleaner')} ${reason === 'passed' ? 'passed' : "didn't respond"}: ${job.property_name} – ${label}`,
    `<p>${escapeHtml(next.name)} has been offered the job next (#${nextIndex + 1} of ${order.length}).</p>`);
  return { next, exhausted: false };
}

// ── Hourly tick ──────────────────────────────────────────────────────────────

export interface TickResult { dispatched: number; escalated: number; exhausted: number; urgentAlerts: number; blocked: string[]; errors: string[] }

/** A property can only be auto-dispatched once the client has a card on file and a fee is set. */
export function dispatchBlocker(job: Row, config: Row): string | null {
  const fee = Number(job.cleaning_fee ?? 0) > 0 ? Number(job.cleaning_fee) : Number(config.cleaning_fee ?? 0);
  if (!config.stripe_payment_method_id) return 'no card on file — send the client the payment-setup link';
  if (fee <= 0) return 'cleaning fee not set';
  return null;
}

/**
 * New cleaners start as "pending" and become active automatically once the
 * agreement is signed AND Stripe payouts are connected. Admins can still flip
 * the status by hand.
 */
export async function maybeActivateCleaner(db: Db, cleanerId: string): Promise<boolean> {
  const { data: c } = await db.from('cleaners').select('id, status, agreement_signed_at, stripe_connect_status').eq('id', cleanerId).maybeSingle();
  if (!c || c.status !== 'pending') return false;
  if (!c.agreement_signed_at || c.stripe_connect_status !== 'active') return false;
  const { error } = await db.from('cleaners').update({ status: 'active' }).eq('id', cleanerId).eq('status', 'pending');
  return !error;
}

export async function dispatchTick(db: Db, resend: Resend, now: Date = new Date()): Promise<TickResult> {
  const result: TickResult = { dispatched: 0, escalated: 0, exhausted: 0, urgentAlerts: 0, blocked: [], errors: [] };
  const blockedProps = new Set<string>();
  const today = todayET(now);
  const windowEnd = addDays(today, DISPATCH_WINDOW_DAYS);
  const nowIso = now.toISOString();

  const [{ data: configs }, { data: cleaners }] = await Promise.all([
    db.from('cleaning_property_configs').select('*'),
    db.from('cleaners').select('*'),
  ]);
  const configByProperty = new Map<string, Row>();
  for (const c of (configs ?? []) as Row[]) {
    configByProperty.set(c.property_id, c);
    for (const sub of (c.linked_property_ids ?? []) as string[]) configByProperty.set(sub, c);
  }

  // 1. Dispatch pending, never-offered jobs inside the window (same-day jobs always).
  const { data: pending } = await db.from('cleaning_jobs').select('*')
    .eq('status', 'pending').is('dispatch_tokens', null).gte('checkout_date', addDays(today, -1)).order('checkout_date', { ascending: true }).limit(100);
  for (const job of (pending ?? []) as Row[]) {
    if (job.checkout_date > windowEnd && !job.same_day) continue;
    const config = configByProperty.get(job.property_id);
    if (!config) continue;
    const blocker = dispatchBlocker(job, config);
    if (blocker) {
      if (!blockedProps.has(config.property_id)) { blockedProps.add(config.property_id); result.blocked.push(`${config.property_name}: ${blocker}`); }
      continue;
    }
    const roster = resolveRoster(config, (cleaners ?? []) as Row[]);
    if (!roster.length) {
      if (!blockedProps.has(config.property_id)) { blockedProps.add(config.property_id); result.blocked.push(`${config.property_name}: no active cleaners on the roster`); }
      continue;
    }
    const r = await dispatchJob(db, resend, job, roster);
    if (r.ok) result.dispatched++;
    if (r.error) result.errors.push(`${job.property_name}: ${r.error}`);
  }

  // 2. Escalate dispatched jobs nobody has answered.
  const { data: dispatched } = await db.from('cleaning_jobs').select('*').eq('status', 'dispatched').gte('checkout_date', addDays(today, -1)).limit(200);
  for (const job of (dispatched ?? []) as Row[]) {
    const since = new Date(job.dispatch_advanced_at ?? job.dispatched_at ?? job.updated_at).getTime();
    const hoursToCheckout = (new Date(job.checkout_date + 'T11:00:00-04:00').getTime() - now.getTime()) / 3_600_000;
    const limitHours = hoursToCheckout <= URGENT_WINDOW_HOURS ? ESCALATE_URGENT_AFTER_HOURS : ESCALATE_AFTER_HOURS;
    if (now.getTime() - since < limitHours * 3_600_000) continue;
    const r = await advanceDispatch(db, resend, job, 'no_response');
    if (r.error) { result.errors.push(`${job.property_name}: ${r.error}`); continue; }
    if (r.exhausted) result.exhausted++; else result.escalated++;
  }

  // 3. Unassigned within 24h of checkout → one urgent alert.
  const { data: urgent } = await db.from('cleaning_jobs').select('*')
    .in('status', ['pending', 'dispatched']).gte('checkout_date', today).lte('checkout_date', addDays(today, 1)).is('escalation_notified_at', null).limit(50);
  for (const job of (urgent ?? []) as Row[]) {
    const who = job.status === 'dispatched' ? 'is waiting on a cleaner to accept' : 'has no cleaner assigned';
    await adminAlert(resend, `🚨 Tomorrow's clean unassigned: ${job.property_name} – ${dateLabel(job.checkout_date)}`,
      `<p>The ${escapeHtml(job.checkout_date)} cleaning at <strong>${escapeHtml(job.property_name)}</strong> ${who}${job.same_day ? ' and it is a <strong>same-day turnover</strong>' : ''}. Assign someone from the Jobs tab.</p>`);
    await db.from('cleaning_jobs').update({ escalation_notified_at: nowIso }).eq('id', job.id);
    result.urgentAlerts++;
  }
  return result;
}

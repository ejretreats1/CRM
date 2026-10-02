// Booking reconcile + dispatch cascade checks. Run: node --experimental-strip-types scripts/jobs.test.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { execSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
type Row = Record<string, any>;

class FakeDb {
  tables: Record<string, Row[]>;
  constructor(t: Record<string, Row[]>) { this.tables = t; }
  from(table: string) {
    const rows = this.tables[table] ??= []; const filters: ((r: Row) => boolean)[] = []; let patch: Row | null = null; let limitN = Infinity;
    const run = async () => { const matched = rows.filter(r => filters.every(f => f(r))).slice(0, limitN); if (patch) for (const r of matched) Object.assign(r, patch); return { data: matched.map(r => ({ ...r })), error: null }; };
    const q: any = {
      select() { return q; }, update(p: Row) { patch = p; return q; },
      insert(p: Row) {
        if (table === 'cleaning_jobs' && p.reservation_id && rows.some(r => r.property_id === p.property_id && r.reservation_id === p.reservation_id)) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
        rows.push(p); return Promise.resolve({ data: null, error: null });
      },
      eq(c: string, v: any) { filters.push(r => r[c] === v); return q; }, neq(c: string, v: any) { filters.push(r => r[c] !== v); return q; },
      is(c: string, v: any) { filters.push(r => v === null ? r[c] == null : r[c] === v); return q; }, not(c: string, _o: string, v: any) { filters.push(r => !(v === null ? r[c] == null : r[c] === v)); return q; },
      gt(c: string, v: any) { filters.push(r => r[c] > v); return q; }, gte(c: string, v: any) { filters.push(r => r[c] >= v); return q; }, lt(c: string, v: any) { filters.push(r => r[c] < v); return q; }, lte(c: string, v: any) { filters.push(r => r[c] <= v); return q; },
      in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return q; }, contains(c: string, vs: any[]) { filters.push(r => Array.isArray(r[c]) && vs.every(v => r[c].includes(v))); return q; },
      order() { return q; }, limit(n: number) { limitN = n; return q; },
      async maybeSingle() { const { data } = await run(); return { data: data[0] ?? null, error: null }; }, async single() { const { data } = await run(); return { data: data[0] ?? null, error: data[0] ? null : { message: 'no rows' } }; },
      then(res: any, rej: any) { return run().then(res, rej); },
    };
    return q;
  }
}
class FakeResend { sent: any[] = []; failFor = new Set<string>(); emails = { send: async (m: any) => { if (this.failFor.has(m.to)) return { data: null, error: { message: 'Invalid `to` address' } }; this.sent.push(m); return { data: { id: `em_${this.sent.length}` }, error: null }; } }; to(addr: string) { return this.sent.filter(m => m.to === addr); } }

const jobsBundle = process.cwd() + '/_jobs.test-bundle.mjs';
const icalBundle = process.cwd() + '/_ical.test-bundle.mjs';
const smsBundle = process.cwd() + '/_sms.test-bundle.mjs';
execSync(`npx esbuild api/_jobs.ts --bundle --platform=node --format=esm --packages=external --log-level=error --outfile=${jobsBundle}`, { stdio: 'inherit' });
execSync(`npx esbuild api/_sms.ts --bundle --platform=node --format=esm --packages=external --log-level=error --outfile=${smsBundle}`, { stdio: 'inherit' });
execSync(`npx esbuild api/_ical.ts --bundle --platform=node --format=esm --packages=external --log-level=error --outfile=${icalBundle}`, { stdio: 'inherit' });
const { reconcileJobs, withNextCheckIn, dispatchJob, advanceDispatch, dispatchTick, resolveRoster } = await import(jobsBundle);
const { parseIcal, isBlock, syncPropertyIcal } = await import(icalBundle);
const { sendMorningReminders, normalizePhone } = await import(smsBundle);
try { unlinkSync(jobsBundle); unlinkSync(icalBundle); unlinkSync(smsBundle); } catch { /* ignore */ }

const ADMIN = process.env.ADMIN_EMAIL ?? 'ejretreats1@gmail.com';
const TODAY = '2026-10-02';
const config = { id: 'cpc1', property_id: 'p1', property_name: 'Beach House', cleaning_fee: 150, stripe_payment_method_id: 'pm_1', linked_property_ids: ['p1b'], assigned_cleaners: [{ id: 'c1', payout: 90 }, { id: 'c2', payout: 85 }, { id: 'c3', payout: 80 }] };
const cleaners = [
  { id: 'c1', name: 'Pat', email: 'pat@x.com', status: 'active' },
  { id: 'c2', name: 'Sam', email: 'sam@x.com', status: 'active' },
  { id: 'c3', name: 'Lee', email: 'lee@x.com', status: 'inactive' },
];
const bk = (id: string, checkIn: string, checkOut: string, extra: Row = {}) => ({ reservationId: id, unitKey: 'p1', checkIn, checkOut, guestName: `Guest ${id}`, cancelled: false, ...extra });
const results: Record<string, boolean> = {};

// ── next check-in / same-day ──
{ const m = withNextCheckIn([bk('a', '2026-10-01', '2026-10-05'), bk('b', '2026-10-05', '2026-10-08'), bk('c', '2026-10-10', '2026-10-12'), bk('u2', '2026-10-06', '2026-10-07', { unitKey: 'p1b' })]);
  results.sameDayDetected = m.get('a')!.sameDay === true && m.get('a')!.nextCheckIn === '2026-10-05';
  results.gapNotSameDay = m.get('b')!.sameDay === false && m.get('b')!.nextCheckIn === '2026-10-10';
  results.lastHasNoNext = m.get('c')!.nextCheckIn === null;
  results.unitsIsolated = m.get('u2')!.nextCheckIn === null; }

// ── reconcile: create / move / cancel ──
{ const db = new FakeDb({ cleaning_jobs: [] }); const rs = new FakeResend();
  const r = await reconcileJobs(db, config, [bk('a', '2026-10-01', '2026-10-05'), bk('b', '2026-10-05', '2026-10-08'), bk('old', '2026-09-01', '2026-09-10'), bk('x', '2026-10-20', '2026-10-22', { cancelled: true })], { source: 'ical', complete: true, resend: rs, today: TODAY });
  const jobs = db.tables.cleaning_jobs;
  results.createsJobs = r.created === 2 && jobs.length === 2 && jobs.every(j => j.status === 'pending' && j.property_id === 'p1' && j.cleaning_fee === 150 && j.source === 'ical');
  results.createdWithNextCheckIn = jobs[0].checkin_date === '2026-10-05' && jobs[0].same_day === true && jobs[1].checkin_date === null && jobs[1].same_day === false;
  results.lookbackSkipsOld = !jobs.some(j => j.reservation_id === 'old');
  results.cancelledBookingNotCreated = !jobs.some(j => j.reservation_id === 'x');
  // second run, nothing changed → no-op
  const r2 = await reconcileJobs(db, config, [bk('a', '2026-10-01', '2026-10-05'), bk('b', '2026-10-05', '2026-10-08')], { source: 'ical', complete: true, resend: rs, today: TODAY });
  results.idempotent = r2.created === 0 && r2.updated === 0 && r2.cancelled === 0 && jobs.length === 2;
  // guest extends: a moves to 10-06, b's check-in follows → a is no longer same-day; cleaner Pat already accepted a
  Object.assign(jobs[0], { status: 'accepted', assigned_cleaner_id: 'c1', assigned_cleaner_name: 'Pat', dispatch_tokens: { t1: { cleanerId: 'c1', cleanerName: 'Pat', cleanerEmail: 'pat@x.com' } } });
  const r3 = await reconcileJobs(db, config, [bk('a', '2026-10-01', '2026-10-06'), bk('b', '2026-10-07', '2026-10-08')], { source: 'ical', complete: true, resend: rs, today: TODAY });
  results.rescheduleMovesDate = r3.updated === 1 && jobs[0].checkout_date === '2026-10-06' && jobs[0].checkin_date === '2026-10-07' && jobs[0].same_day === false && jobs[0].reschedule_count === 1 && jobs[0].status === 'accepted';
  results.rescheduleEmailsCleaner = rs.to('pat@x.com').length === 1 && /Date changed/.test(rs.to('pat@x.com')[0].subject);
  // b disappears from the feed → cancelled (feed complete)
  const r4 = await reconcileJobs(db, config, [bk('a', '2026-10-01', '2026-10-06')], { source: 'ical', complete: true, resend: rs, today: TODAY });
  results.missingBookingCancelled = r4.cancelled === 1 && jobs[1].status === 'cancelled' && jobs[0].status === 'accepted';
}
{ // incomplete fetch never cancels; other-source jobs never cancelled; charged job → admin alert instead; past checkout kept
  const db = new FakeDb({ cleaning_jobs: [
    { id: 'j1', property_id: 'p1', reservation_id: 'a', property_name: 'Beach House', checkout_date: '2026-10-05', status: 'pending', source: 'ical' },
    { id: 'j2', property_id: 'p1', reservation_id: 'up1', property_name: 'Beach House', checkout_date: '2026-10-06', status: 'pending', source: 'uplisting' },
    { id: 'j3', property_id: 'p1', reservation_id: 'paid', property_name: 'Beach House', checkout_date: '2026-10-07', status: 'in_progress', source: 'ical', charged_at: 'x' },
    { id: 'j4', property_id: 'p1', reservation_id: 'past', property_name: 'Beach House', checkout_date: '2026-09-30', status: 'accepted', source: 'ical' },
  ] }); const rs = new FakeResend();
  const r = await reconcileJobs(db, config, [], { source: 'ical', complete: false, resend: rs, today: TODAY });
  results.incompleteFeedNoCancel = r.cancelled === 0 && db.tables.cleaning_jobs.every(j => j.status !== 'cancelled');
  const r2 = await reconcileJobs(db, config, [], { source: 'ical', complete: true, resend: rs, today: TODAY });
  const [j1, j2, j3, j4] = db.tables.cleaning_jobs;
  results.completeFeedCancelsOnlyOwnSource = r2.cancelled === 1 && j1.status === 'cancelled' && j2.status === 'pending';
  results.pastCheckoutKept = j4.status === 'accepted';
  results.chargedJobNotCancelled = j3.status === 'in_progress' && rs.to(ADMIN).some(m => /cancelled after charge/i.test(m.subject));
  rs.sent.length = 0;
  // explicit cancelled flag on a charged booking → alert, not cancel
  await reconcileJobs(db, config, [bk('paid', '2026-10-05', '2026-10-07', { cancelled: true })], { source: 'ical', complete: true, resend: rs, today: TODAY });
  results.chargedCancelAlertsAdmin = j3.status === 'in_progress' && rs.to(ADMIN).some(m => /cancelled after charge/i.test(m.subject));
}
{ // sub-unit bookings: parent property id + unit_id + suffixed name; legacy sub-unit rows still matched by reservation id
  const db = new FakeDb({ cleaning_jobs: [{ id: 'legacy', property_id: 'p1b', reservation_id: 'L', property_name: 'Beach House — Unit B', checkout_date: '2026-10-09', status: 'pending', source: 'uplisting' }] });
  const r = await reconcileJobs(db, config, [bk('L', '2026-10-05', '2026-10-10', { unitKey: 'p1b', unitName: 'Unit B' }), bk('N', '2026-10-10', '2026-10-12', { unitKey: 'p1b', unitName: 'Unit B' })], { source: 'uplisting', complete: true, today: TODAY });
  const n = db.tables.cleaning_jobs.find(j => j.reservation_id === 'N')!;
  results.legacySubUnitRowUpdatedNotDuplicated = r.created === 1 && r.updated === 1 && db.tables.cleaning_jobs.length === 2 && db.tables.cleaning_jobs[0].checkout_date === '2026-10-10';
  results.subUnitJobShape = n.property_id === 'p1' && n.unit_id === 'p1b' && n.property_name === 'Beach House — Unit B' && n.id.startsWith('cj_');
}

// ── iCal parsing + per-feed completeness ──
{ const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc@airbnb.com\r\nDTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261008\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:blk\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261010\r\nSUMMARY:Airbnb (Not available)\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:tz\r\nDTSTART:20261011T030000Z\r\nDTEND:20261013T030000Z\r\nSUMMARY:Jane\r\n Doe\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const ev = parseIcal(ics);
  results.parsesEvents = ev.length === 3 && ev[0].start === '2026-10-05' && ev[0].end === '2026-10-08';
  results.blocksDetected = isBlock(ev[1].summary) && isBlock('Not available') && isBlock('CLOSED - Not available') && !isBlock('Reserved');
  results.utcMidnightKeepsLocalDate = ev[2].start === '2026-10-10' && ev[2].end === '2026-10-12' && ev[2].summary === 'JaneDoe' && ev[2].status === 'CANCELLED';
  const feeds: Record<string, string | null> = { 'https://a/feed.ics': ics, 'https://b/feed.ics': null };
  (globalThis as any).fetch = async (url: string) => { const body = feeds[url]; return body == null ? { ok: false, status: 503, text: async () => '' } : { ok: true, status: 200, text: async () => body }; };
  const db = new FakeDb({ cleaning_jobs: [{ id: 'gone', property_id: 'p1', reservation_id: 'vanished', property_name: 'Beach House', checkout_date: '2026-10-20', status: 'pending', source: 'ical' }], cleaning_property_configs: [{ id: 'cpc1', ical_urls: [] }] });
  const cfg = { ...config, ical_urls: [{ platform: 'airbnb', url: 'https://a/feed.ics' }, { platform: 'vrbo', url: 'https://b/feed.ics' }] };
  const r = await syncPropertyIcal(db, cfg as any);
  results.feedFailureBlocksCancels = r.created === 1 && r.cancelled === 0 && r.errors.length === 1 && /503/.test(r.errors[0]) && db.tables.cleaning_jobs.find(j => j.id === 'gone')!.status === 'pending';
  results.feedsStamped = db.tables.cleaning_property_configs[0].ical_urls.every((u: any) => !!u.lastSyncedAt);
  feeds['https://b/feed.ics'] = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
  const r2 = await syncPropertyIcal(db, cfg as any);
  results.allFeedsOkCancelsMissing = r2.cancelled === 1 && db.tables.cleaning_jobs.find(j => j.id === 'gone')!.status === 'cancelled';
}

// ── dispatch cascade ──
const freshJob = (over: Row = {}) => ({ id: 'j1', property_id: 'p1', property_name: 'Beach House', checkout_date: '2026-10-05', checkin_date: '2026-10-05', same_day: true, status: 'pending', dispatch_tokens: null, cleaning_fee: 150, source: 'ical', ...over });
{ const db = new FakeDb({ cleaning_jobs: [freshJob()] }); const rs = new FakeResend();
  const roster = resolveRoster(config, cleaners);
  results.rosterSkipsInactive = roster.length === 2 && roster[0].id === 'c1' && roster[0].payout === 90 && roster[1].id === 'c2';
  const d = await dispatchJob(db, rs, db.tables.cleaning_jobs[0], roster); const job = db.tables.cleaning_jobs[0];
  results.dispatchSetsTokens = d.ok && job.status === 'dispatched' && job.dispatch_order.length === 2 && job.dispatch_index === 0 && !!job.dispatch_advanced_at && Object.values(job.dispatch_tokens).every((t: any) => t.cleanerEmail);
  results.dispatchEmailsFirstOnly = rs.sent.length === 1 && rs.sent[0].to === 'pat@x.com' && /Same-day|same-day/.test(rs.sent[0].subject) && rs.sent[0].html.includes(`?cleaner=j1:${job.dispatch_order[0]}`) && rs.sent[0].html.includes('$90');
  results.dispatchTwiceRefused = !(await dispatchJob(db, rs, job, roster)).ok && rs.sent.length === 1;
  // Pat passes → Sam offered; admin told
  const a1 = await advanceDispatch(db, rs, { ...job }, 'passed');
  results.advanceOffersNext = a1.next?.id === 'c2' && !a1.exhausted && job.dispatch_index === 1 && rs.to('sam@x.com').length === 1 && rs.to(ADMIN).some(m => /Pat passed/.test(m.subject));
  // stale caller (still thinks index 0) cannot advance again
  const stale = await advanceDispatch(db, rs, { ...job, dispatch_index: 0 }, 'passed');
  results.staleAdvanceRejected = !!stale.error && job.dispatch_index === 1;
  // Sam passes → exhausted → pending + alert
  const a2 = await advanceDispatch(db, rs, { ...job }, 'passed');
  results.exhaustedBackToPending = a2.exhausted && job.status === 'pending' && rs.to(ADMIN).some(m => /No cleaners available/.test(m.subject));
}

// ── hourly tick ──
{ const now = new Date('2026-10-02T15:00:00Z');
  const db = new FakeDb({
    cleaning_property_configs: [config, { id: 'cpc2', property_id: 'nocard', property_name: 'No Card Villa', cleaning_fee: 100, assigned_cleaners: [{ id: 'c1', payout: 50 }] }, { id: 'cpc3', property_id: 'nofee', property_name: 'Free Villa', cleaning_fee: 0, stripe_payment_method_id: 'pm_2', assigned_cleaners: [{ id: 'c1', payout: 50 }] }], cleaners,
    cleaning_jobs: [
      freshJob({ id: 'blocked-card', property_id: 'nocard', checkout_date: '2026-10-06', same_day: false }),
      freshJob({ id: 'blocked-card2', property_id: 'nocard', checkout_date: '2026-10-07', same_day: false }),
      freshJob({ id: 'blocked-fee', property_id: 'nofee', checkout_date: '2026-10-06', same_day: false, cleaning_fee: 0 }),
      freshJob({ id: 'in-window', checkout_date: '2026-10-10', same_day: false }),
      freshJob({ id: 'far', checkout_date: '2026-11-20', same_day: false }),
      freshJob({ id: 'far-same-day', checkout_date: '2026-11-21', same_day: true }),
      freshJob({ id: 'no-config', property_id: 'zzz', checkout_date: '2026-10-04' }),
      freshJob({ id: 'sub-unit', property_id: 'p1b', checkout_date: '2026-10-06', same_day: false }),
      freshJob({ id: 'yesterday', checkout_date: '2026-09-25' }),
      freshJob({ id: 'waiting-ok', status: 'dispatched', checkout_date: '2026-10-12', dispatch_advanced_at: '2026-10-02T12:30:00Z', dispatch_index: 0, dispatch_order: ['t1', 't2'], dispatch_tokens: { t1: { cleanerId: 'c1', cleanerName: 'Pat', cleanerEmail: 'pat@x.com' }, t2: { cleanerId: 'c2', cleanerName: 'Sam', cleanerEmail: 'sam@x.com', payout: 85 } } }),
      freshJob({ id: 'waiting-late', status: 'dispatched', checkout_date: '2026-10-12', dispatch_advanced_at: '2026-10-02T10:00:00Z', dispatch_index: 0, dispatch_order: ['t1', 't2'], dispatch_tokens: { t1: { cleanerId: 'c1', cleanerName: 'Pat', cleanerEmail: 'pat@x.com' }, t2: { cleanerId: 'c2', cleanerName: 'Sam', cleanerEmail: 'sam@x.com', payout: 85 } } }),
      freshJob({ id: 'urgent-late', status: 'dispatched', checkout_date: '2026-10-03', dispatch_advanced_at: '2026-10-02T13:30:00Z', dispatch_index: 0, dispatch_order: ['t1', 't2'], dispatch_tokens: { t1: { cleanerId: 'c1', cleanerName: 'Pat', cleanerEmail: 'pat@x.com' }, t2: { cleanerId: 'c2', cleanerName: 'Sam', cleanerEmail: 'sam@x.com', payout: 85 } } }),
      freshJob({ id: 'tomorrow-unassigned', checkout_date: '2026-10-03', property_id: 'zzz' }),
    ],
  }); const rs = new FakeResend();
  const t = await dispatchTick(db, rs, now);
  const by = (id: string) => db.tables.cleaning_jobs.find(j => j.id === id)!;
  results.tickDispatchesInWindow = by('in-window').status === 'dispatched' && by('sub-unit').status === 'dispatched' && by('far-same-day').status === 'dispatched';
  results.tickLeavesFarAndOrphans = by('far').status === 'pending' && by('no-config').status === 'pending' && by('yesterday').status === 'pending' && t.dispatched === 3;
  results.tickBlocksUnbillable = by('blocked-card').status === 'pending' && by('blocked-card2').status === 'pending' && by('blocked-fee').status === 'pending' && t.blocked.length === 2 && /No Card Villa: no card/.test(t.blocked[0]) && /Free Villa: cleaning fee not set/.test(t.blocked[1]);
  results.tickEscalatesOnlyOverdue = by('waiting-ok').dispatch_index === 0 && by('waiting-late').dispatch_index === 1 && by('urgent-late').dispatch_index === 1 && t.escalated === 2;
  results.tickUrgentAlertOnce = !!by('tomorrow-unassigned').escalation_notified_at && !!by('urgent-late').escalation_notified_at && t.urgentAlerts === 2 && rs.to(ADMIN).filter(m => /Tomorrow's clean unassigned/.test(m.subject)).length === 2;
  const t2 = await dispatchTick(db, rs, new Date('2026-10-02T15:30:00Z'));
  results.tickIdempotent = t2.dispatched === 0 && t2.escalated === 0 && t2.urgentAlerts === 0;
}

// ── offer email failure is visible, cascade continues ──
{ const db = new FakeDb({ cleaning_jobs: [freshJob()] }); const rs = new FakeResend(); rs.failFor.add('pat@x.com');
  const d = await dispatchJob(db, rs, db.tables.cleaning_jobs[0], resolveRoster(config, cleaners)); const job = db.tables.cleaning_jobs[0];
  results.failedOfferFlagged = d.ok && /email to Pat failed/.test(d.error ?? '') && job.status === 'dispatched' && /Pat: Invalid/.test(job.dispatch_email_error) && rs.to(ADMIN).some(m => /offer email failed/i.test(m.subject));
  const a = await advanceDispatch(db, rs, { ...job }, 'no_response');
  results.failedOfferClearedOnNext = a.next?.id === 'c2' && job.dispatch_email_error === null && rs.to('sam@x.com').length === 1; }

// ── morning SMS ──
{ const now = new Date('2026-10-02T11:00:00Z');
  const db = new FakeDb({
    cleaners: [{ id: 'c1', name: 'Pat Lee', phone: '(555) 123-4567', dashboard_token: 'tok' }, { id: 'c2', name: 'Sam', phone: null }],
    cleaning_property_configs: [{ ...config, door_code: '4321', checkout_time: '11:00 AM', checkin_time: '4:00 PM' }],
    cleaning_jobs: [
      freshJob({ id: 'a', status: 'accepted', checkout_date: '2026-10-02', assigned_cleaner_id: 'c1', same_day: true }),
      freshJob({ id: 'b', status: 'in_progress', checkout_date: '2026-10-02', assigned_cleaner_id: 'c1', same_day: false, property_id: 'p1b', property_name: 'Beach House — Unit B', checkin_date: '2026-10-05' }),
      freshJob({ id: 'nophone', status: 'accepted', checkout_date: '2026-10-02', assigned_cleaner_id: 'c2' }),
      freshJob({ id: 'tomorrow', status: 'accepted', checkout_date: '2026-10-03', assigned_cleaner_id: 'c1' }),
      freshJob({ id: 'unassigned', status: 'dispatched', checkout_date: '2026-10-02' }),
    ],
  });
  const texts: { to: string; body: string }[] = [];
  const r = await sendMorningReminders(db, async (to: string, body: string) => { texts.push({ to, body }); return 'SM1'; }, now);
  const by = (id: string) => db.tables.cleaning_jobs.find(j => j.id === id)!;
  results.phoneNormalised = normalizePhone('(555) 123-4567') === '+15551234567' && normalizePhone('1-555-123-4567') === '+15551234567' && normalizePhone('12345') === null;
  results.oneTextPerCleaner = r.sent === 1 && texts.length === 1 && texts[0].to === '+15551234567' && /Good morning Pat!/.test(texts[0].body) && /Beach House — Unit B/.test(texts[0].body) && /SAME-DAY/.test(texts[0].body) && /door 4321/.test(texts[0].body) && /cleaner-dashboard=Pat-Lee:c1:tok/.test(texts[0].body);
  results.smsStampsOnlyToday = !!by('a').morning_sms_sent_at && !!by('b').morning_sms_sent_at && !by('tomorrow').morning_sms_sent_at && !by('unassigned').morning_sms_sent_at && !by('nophone').morning_sms_sent_at && r.skipped === 1;
  const r2 = await sendMorningReminders(db, async () => 'SM2', now);
  results.smsIdempotent = r2.sent === 0 && texts.length === 1;
  const r3 = await sendMorningReminders(new FakeDb({ cleaners: [{ id: 'c1', name: 'Pat', phone: '5551234567' }], cleaning_property_configs: [], cleaning_jobs: [freshJob({ id: 'x', status: 'accepted', checkout_date: '2026-10-02', assigned_cleaner_id: 'c1' })] }), async () => null, now);
  results.smsSkipsWhenTwilioMissing = r3.sent === 0 && r3.skipped === 1; }

const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
console.log(`${Object.keys(results).length - failed.length}/${Object.keys(results).length} job lifecycle checks passed${failed.length ? ' — FAILED: ' + failed.join(', ') : ''}`);
if (failed.length) process.exit(1);

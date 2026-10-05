// Tests for api/_billing.ts against in-memory Supabase + Stripe fakes.
// Run: node --experimental-strip-types scripts/billing.test.mts
type Row = Record<string, any>;
function splitTop(expr: string) { const out: string[] = []; let d = 0, c = ''; for (const ch of expr) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(c); c = ''; } else c += ch; } if (c) out.push(c); return out; }
function term(t: string): (r: Row) => boolean {
  if (t.startsWith('and(')) { const subs = splitTop(t.slice(4, -1)).map(term); return r => subs.every(f => f(r)); }
  const neg = t.match(/^(\w+)\.not\.(is|neq|eq|lt|lte|gt|gte|in)\.(.*)$/s);
  if (neg) { const inner = term(`${neg[1]}.${neg[2]}.${neg[3]}`); return r => !inner(r); }
  const m = t.match(/^(\w+)\.(is|neq|eq|lt|lte|gt|gte|in)\.(.*)$/s); if (!m) throw new Error('bad or-term ' + t);
  const [, col, op, val] = m;
  return r => { const v = r[col]; if (op === 'is') return val === 'null' ? v == null : v === (val === 'true'); if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(v)); if (v == null) return false; if (op === 'eq') return String(v) === val; if (op === 'neq') return String(v) !== val; if (op === 'lt') return v < val; if (op === 'lte') return v <= val; if (op === 'gt') return Number(v) > Number(val); return Number(v) >= Number(val); };
}
const parseOr = (e: string) => { const fns = splitTop(e).map(term); return (r: Row) => fns.some(f => f(r)); };
class FakeDb {
  tables: Record<string, Row[]>;
  constructor(t: Record<string, Row[]>) { this.tables = t; }
  from(table: string) {
    const rows = this.tables[table] ??= []; const filters: ((r: Row) => boolean)[] = []; let patch: Row | null = null; let limitN = Infinity;
    const run = async () => { const matched = rows.filter(r => filters.every(f => f(r))).slice(0, limitN); if (patch) for (const r of matched) Object.assign(r, patch); return { data: matched.map(r => ({ ...r })), error: null }; };
    const q: any = {
      select() { return q; }, update(p: Row) { patch = p; return q; }, insert(p: Row) { rows.push(p); return Promise.resolve({ data: null, error: null }); },
      eq(c: string, v: any) { filters.push(r => r[c] === v); return q; }, neq(c: string, v: any) { filters.push(r => r[c] !== v); return q; },
      is(c: string, v: any) { filters.push(r => v === null ? r[c] == null : r[c] === v); return q; }, not(c: string, _o: string, v: any) { filters.push(r => !(v === null ? r[c] == null : r[c] === v)); return q; },
      gt(c: string, v: any) { filters.push(r => Number(r[c]) > Number(v)); return q; }, lt(c: string, v: any) { filters.push(r => r[c] < v); return q; }, lte(c: string, v: any) { filters.push(r => r[c] <= v); return q; },
      in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return q; }, or(e: string) { filters.push(parseOr(e)); return q; }, order() { return q; }, limit(n: number) { limitN = n; return q; },
      async maybeSingle() { const { data } = await run(); return { data: data[0] ?? null, error: null }; }, async single() { const { data } = await run(); return { data: data[0] ?? null, error: data[0] ? null : { message: 'no rows' } }; },
      then(res: any, rej: any) { return run().then(res, rej); },
    };
    return q;
  }
}
class FakeStripe {
  piLog: any[] = []; transferLog: any[] = []; createCalls = 0; failNext: any = null; searchResults: any[] = []; payoutsEnabled: Record<string, boolean> = {};
  paymentIntents = {
    create: async (p: any, o: any) => { this.createCalls++; if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } const pi = { id: `pi_${this.piLog.length + 1}`, status: 'succeeded', amount: p.amount, latest_charge: `ch_${this.piLog.length + 1}`, metadata: p.metadata, key: o.idempotencyKey, params: p }; this.piLog.push(pi); return pi; },
    search: async () => ({ data: this.searchResults }), retrieve: async (id: string) => this.piLog.find(p => p.id === id),
  };
  transfers = { create: async (p: any, o: any) => { const t = { id: `tr_${this.transferLog.length + 1}`, amount: p.amount, metadata: p.metadata, key: o.idempotencyKey, params: p }; this.transferLog.push(t); return t; }, list: async () => ({ data: this.transferLog }) };
  accounts = { retrieve: async (id: string) => ({ payouts_enabled: !!this.payoutsEnabled[id] }) };
}
import { execSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
const bundle = process.cwd() + '/_billing.test-bundle.mjs';
execSync(`npx esbuild api/_billing.ts --bundle --platform=node --format=esm --packages=external --log-level=error --outfile=${bundle}`, { stdio: 'inherit' });
const { chargeJob, payoutJob, markPayoutPaid, findChargeableJobs, findPayableJobs } = await import(bundle);
try { unlinkSync(bundle); } catch { /* ignore */ }
const base = () => ({
  cleaning_jobs: [
    { id: 'j1', property_id: 'p1', property_name: 'Beach', checkout_date: '2026-10-01', status: 'completed', cleaning_fee: 120, cleaner_payout: 80, assigned_cleaner_id: 'c1', assigned_cleaner_name: 'Pat', portal_data: { submittedAt: 'x' }, charged_at: null, payout_sent_at: null, charge_status: null, charge_attempts: 0, updated_at: '2026-10-01T00:00:00Z' },
    { id: 'j2', property_id: 'p1', property_name: 'Beach', checkout_date: '2026-10-02', status: 'accepted', cleaning_fee: 120, cleaner_payout: 80, assigned_cleaner_id: 'c1', portal_data: null, charged_at: null },
    { id: 'j3', property_id: 'p1', property_name: 'Beach', checkout_date: '2026-10-02', status: 'completed', cleaning_fee: 0, cleaner_payout: 50, assigned_cleaner_id: 'c2', portal_data: null, charged_at: null },
    { id: 'j4', property_id: 'p1', property_name: 'Beach', checkout_date: '2026-09-20', status: 'cancelled', cleaning_fee: 120, cleaner_payout: 80, assigned_cleaner_id: 'c1', portal_data: { submittedAt: 'x' }, charged_at: null },
    { id: 'j5', property_id: 'p1', property_name: 'Beach', checkout_date: '2026-09-21', status: 'completed', cleaning_fee: 120, cleaner_payout: 80, assigned_cleaner_id: 'c1', portal_data: { submittedAt: 'x' }, charged_at: null, charge_status: 'failed', next_charge_attempt_at: '2099-01-01T00:00:00Z' },
  ],
  cleaning_property_configs: [{ id: 'cpc1', property_id: 'p1', cleaning_fee: 100, stripe_customer_id: 'cus_1', stripe_payment_method_id: 'pm_1', client_email: 'o@x.com' }],
  cleaners: [{ id: 'c1', name: 'Pat', stripe_account_id: 'acct_1', stripe_connect_status: 'active' }, { id: 'c2', name: 'Sam', stripe_account_id: null }, { id: 'c3', name: 'Lee', stripe_account_id: 'acct_3', stripe_connect_status: 'pending' }],
});
const results: Record<string, boolean> = {};
// 1. happy path: job fee wins over property fee; payout rides the charge
{ const db = new FakeDb(base()); const st = new FakeStripe(); const r = await chargeJob(db, st as any, 'j1', { trigger: 'submit' }); const job = db.tables.cleaning_jobs[0];
  results.chargesJobFee = r.ok && st.piLog[0].amount === 12000 && st.piLog[0].key === 'cleaning_charge_j1_1' && st.piLog[0].params.receipt_email === 'o@x.com' && st.piLog[0].params.off_session === true;
  results.recorded = job.charge_status === 'charged' && !!job.charged_at && job.stripe_charge_id === 'pi_1' && job.status === 'completed';
  results.payoutDeferred = r.payout === undefined && !job.payout_sent_at && st.transferLog.length === 0;
  job.payout_due_at = '2099-01-01T00:00:00Z'; const nd = await payoutJob(db, st as any, 'j1');
  results.payoutNotDueYet = nd.status === 'skipped' && nd.reason === 'not_due' && nd.dueAt === '2099-01-01T00:00:00Z' && st.transferLog.length === 0;
  job.payout_due_at = '2000-01-01T00:00:00Z'; const pd = await payoutJob(db, st as any, 'j1');
  results.payoutOnceDueTiedToCharge = pd.status === 'sent' && st.transferLog[0].params.source_transaction === 'ch_1' && st.transferLog[0].amount === 8000 && st.transferLog[0].key === 'payout_j1' && job.payout_status === 'sent' && !!job.payout_sent_at;
  results.secondCallSkips = (await chargeJob(db, st as any, 'j1', { trigger: 'cron' })).reason === 'already_charged' && st.createCalls === 1; }
// 2. concurrency: two callers, one charge
{ const db = new FakeDb(base()); const st = new FakeStripe(); const [a, b] = await Promise.all([chargeJob(db, st as any, 'j1', { trigger: 'submit' }), chargeJob(db, st as any, 'j1', { trigger: 'cron' })]);
  results.concurrentSingleCharge = st.createCalls === 1 && st.transferLog.length === 0 && [a, b].filter(x => x.ok && !x.skipped).length === 1; }
// 3. eligibility rules
{ const db = new FakeDb(base()); const st = new FakeStripe();
  results.notCompletedSkipped = (await chargeJob(db, st as any, 'j2', { trigger: 'cron' })).reason === 'not_completed';
  results.noReportSkipped = (await chargeJob(db, st as any, 'j3', { trigger: 'cron' })).reason === 'no_report';
  results.cancelledSkipped = (await chargeJob(db, st as any, 'j4', { trigger: 'cron' })).reason === 'cancelled';
  results.nothingChargedSoFar = st.createCalls === 0; }
{ const db = new FakeDb(base()); const st = new FakeStripe(); db.tables.cleaning_property_configs[0].cleaning_fee = 0;
  const z = await chargeJob(db, st as any, 'j3', { trigger: 'manual', allowWithoutReport: true });
  results.zeroFeeRefused = !z.ok && /fee is not set/i.test(z.error ?? '') && st.createCalls === 0; }
{ const db = new FakeDb(base()); const st = new FakeStripe(); // legacy row: job fee 0 → falls back to property fee
  const m = await chargeJob(db, st as any, 'j3', { trigger: 'manual', allowWithoutReport: true }); const job = db.tables.cleaning_jobs[2];
  results.adminOverridesReportAndUsesPropertyFee = m.ok && st.piLog[0].amount === 10000;
  results.manualDueWithoutStripe = (await payoutJob(db, st as any, 'j3', { manual: true })).status === 'manual_due' && job.payout_status === 'manual_due' && !job.payout_sent_at && st.transferLog.length === 0;
  const mp = await markPayoutPaid(db, 'j3', { method: 'Zelle', reference: 'Z123' });
  results.markPaid = mp.ok && job.payout_status === 'sent_manual' && job.payout_method === 'Zelle' && job.payout_reference === 'Z123' && !!job.payout_sent_at;
  results.markPaidTwiceRefused = !(await markPayoutPaid(db, 'j3', { method: 'cash' })).ok; }
// 4. declined card → failed + retry schedule; retry uses attempt-2 key; adopts an existing succeeded intent
{ const db = new FakeDb(base()); const st = new FakeStripe(); st.failNext = Object.assign(new Error('Your card was declined.'), { code: 'card_declined', decline_code: 'insufficient_funds' });
  const r = await chargeJob(db, st as any, 'j1', { trigger: 'cron' }); const job = db.tables.cleaning_jobs[0]; const inADay = new Date(job.next_charge_attempt_at).getTime() - Date.now();
  results.declineRecorded = !r.ok && job.charge_status === 'failed' && job.charge_attempts === 1 && /insufficient_funds/.test(job.last_charge_error) && inADay > 23 * 3600e3 && inADay < 25 * 3600e3 && !job.charged_at && st.transferLog.length === 0;
  job.next_charge_attempt_at = '2000-01-01T00:00:00Z'; const r2 = await chargeJob(db, st as any, 'j1', { trigger: 'cron' });
  results.retryAttempt2 = r2.ok && st.piLog[0].key === 'cleaning_charge_j1_2' && job.charge_attempts === 2 && job.charge_status === 'charged'; }
{ const db = new FakeDb(base()); const st = new FakeStripe(); db.tables.cleaning_jobs[0].charge_status = 'failed'; db.tables.cleaning_jobs[0].charge_attempts = 1; st.searchResults = [{ id: 'pi_old', amount: 12000, latest_charge: 'ch_old' }];
  const r3 = await chargeJob(db, st as any, 'j1', { trigger: 'cron' });
  results.adoptsExistingIntent = r3.ok && r3.paymentIntentId === 'pi_old' && st.createCalls === 0 && db.tables.cleaning_jobs[0].stripe_charge_id === 'pi_old' && st.transferLog.length === 0; }
// 5. give up after the schedule; stale processing claim can be taken over
{ const db = new FakeDb(base()); const st = new FakeStripe(); const job = db.tables.cleaning_jobs[0]; job.charge_status = 'failed'; job.charge_attempts = 3; job.next_charge_attempt_at = '2000-01-01T00:00:00Z';
  st.failNext = new Error('declined'); const r = await chargeJob(db, st as any, 'j1', { trigger: 'cron' });
  results.givesUpAfterSchedule = !r.ok && job.charge_attempts === 4 && job.next_charge_attempt_at === null;
  const db2 = new FakeDb(base()); const st2 = new FakeStripe(); db2.tables.cleaning_jobs[0].charge_status = 'processing'; db2.tables.cleaning_jobs[0].updated_at = new Date().toISOString();
  results.freshClaimBlocks = (await chargeJob(db2, st2 as any, 'j1', { trigger: 'cron' })).reason === 'claimed_elsewhere' && st2.createCalls === 0;
  db2.tables.cleaning_jobs[0].updated_at = new Date(Date.now() - 20 * 60_000).toISOString();
  results.staleClaimTakenOver = (await chargeJob(db2, st2 as any, 'j1', { trigger: 'cron' })).ok && st2.createCalls === 1; }
// 6. payouts: never before charge; pending Connect → manual_due until payouts_enabled; queues
{ const db = new FakeDb(base()); const st = new FakeStripe();
  // paid even though the client was never charged, once the delay has passed; no charge to tie to
  db.tables.cleaning_jobs[0].payout_due_at = '2000-01-01T00:00:00Z';
  const unch = await payoutJob(db, st as any, 'j1');
  results.paidWithoutClientCharge = unch.status === 'sent' && st.transferLog.length === 1 && st.transferLog[0].params.source_transaction === undefined && !!db.tables.cleaning_jobs[0].payout_sent_at;
  results.notCompletedNotPaid = (await payoutJob(db, st as any, 'j2', { manual: true })).reason === 'not_completed';
  db.tables.cleaning_jobs[0].payout_sent_at = null; db.tables.cleaning_jobs[0].payout_status = null; db.tables.cleaning_jobs[0].stripe_transfer_id = null; st.transferLog.length = 0;
  db.tables.cleaning_jobs[0].charged_at = '2026-10-01T18:00:00Z'; db.tables.cleaning_jobs[0].assigned_cleaner_id = 'c3';
  results.pendingConnectManualDue = (await payoutJob(db, st as any, 'j1')).status === 'manual_due';
  st.payoutsEnabled['acct_3'] = true; const p2 = await payoutJob(db, st as any, 'j1');
  results.paysOnceConnectActive = p2.status === 'sent' && db.tables.cleaners[2].stripe_connect_status === 'active' && st.transferLog.length === 1;
  results.payoutIdempotentOnRepeat = (await payoutJob(db, st as any, 'j1')).status === 'already_sent' && st.transferLog.length === 1; }
{ const db = new FakeDb(base());
  results.chargeQueue = (await findChargeableJobs(db)).map((j: any) => j.id).join() === 'j1';
  db.tables.cleaning_jobs[4].next_charge_attempt_at = '2000-01-01T00:00:00Z'; results.chargeQueueRetryDue = (await findChargeableJobs(db)).map((j: any) => j.id).sort().join() === 'j1,j5';
  db.tables.cleaning_jobs[0].charged_at = 'x'; db.tables.cleaning_jobs[0].payout_status = 'manual_due'; db.tables.cleaning_jobs[0].payout_due_at = '2000-01-01T00:00:00Z'; results.payQueueIncludesManualDue = (await findPayableJobs(db)).map((j: any) => j.id).join() === 'j1'; }
// 7. externally billed property: no charge, cleaner paid from platform balance; cron never retries the charge
{ const db = new FakeDb(base()); const st = new FakeStripe(); db.tables.cleaning_property_configs[0].billing_mode = 'external'; db.tables.cleaning_property_configs[0].stripe_payment_method_id = null;
  const r = await chargeJob(db, st as any, 'j1', { trigger: 'submit' }); const job = db.tables.cleaning_jobs[0];
  results.externalNoCharge = r.skipped === true && r.reason === 'external_billing' && r.amount === 120 && st.createCalls === 0 && !job.charged_at && job.charge_status === 'external';
  job.payout_due_at = '2000-01-01T00:00:00Z'; const ep = await payoutJob(db, st as any, 'j1');
  results.externalPaysCleaner = r.payout === undefined && ep.status === 'sent' && st.transferLog.length === 1 && st.transferLog[0].amount === 8000 && st.transferLog[0].params.source_transaction === undefined && job.payout_status === 'sent' && !!job.payout_sent_at;
  results.externalNotInChargeQueue = !(await findChargeableJobs(db)).some((j: any) => j.id === 'j1');
  results.externalRepeatIsNoop = (await chargeJob(db, st as any, 'j1', { trigger: 'cron' })).reason === 'external_billing' && st.createCalls === 0 && st.transferLog.length === 1; }
{ const db = new FakeDb(base()); const st = new FakeStripe(); db.tables.cleaning_property_configs[0].billing_mode = 'external'; db.tables.cleaning_jobs[0].assigned_cleaner_id = 'c2'; // no Stripe
  const r = await chargeJob(db, st as any, 'j1', { trigger: 'submit' }); const job = db.tables.cleaning_jobs[0]; job.payout_due_at = '2000-01-01T00:00:00Z';
  results.externalManualDue = r.reason === 'external_billing' && (await payoutJob(db, st as any, 'j1')).status === 'manual_due' && job.payout_status === 'manual_due' && job.charge_status === 'external';
  results.externalInPayQueue = (await findPayableJobs(db)).some((j: any) => j.id === 'j1');
  const mp = await markPayoutPaid(db, 'j1', { method: 'Zelle' }); results.externalMarkPaid = mp.ok && !(await findPayableJobs(db)).some((j: any) => j.id === 'j1'); }

const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
console.log(`${Object.keys(results).length - failed.length}/${Object.keys(results).length} billing checks passed${failed.length ? ' — FAILED: ' + failed.join(', ') : ''}`);
if (failed.length) process.exit(1);

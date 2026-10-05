// Tests for api/_stripe_webhook.ts with a real Stripe signature and in-memory fakes.
// Run: node --experimental-strip-types scripts/stripe-webhook.test.mts
import Stripe from 'stripe';
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
  tables: Record<string, Row[]>; pk: Record<string, string> = { stripe_events: 'id' };
  constructor(t: Record<string, Row[]>) { this.tables = t; }
  from(table: string) {
    const rows = this.tables[table] ??= []; const filters: ((r: Row) => boolean)[] = []; let patch: Row | null = null; let limitN = Infinity;
    const run = async () => { const matched = rows.filter(r => filters.every(f => f(r))).slice(0, limitN); if (patch) for (const r of matched) Object.assign(r, patch); return { data: matched.map(r => ({ ...r })), error: null }; };
    const q: any = {
      select() { return q; }, update(p: Row) { patch = p; return q; },
      insert(p: Row) { const pk = this.pk?.[table] ?? 'id'; if (p[pk] && rows.some(r => r[pk] === p[pk])) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }); rows.push(p); return Promise.resolve({ data: null, error: null }); },
      eq(c: string, v: any) { filters.push(r => r[c] === v); return q; }, neq(c: string, v: any) { filters.push(r => r[c] !== v); return q; },
      is(c: string, v: any) { filters.push(r => v === null ? r[c] == null : r[c] === v); return q; }, not(c: string, _o: string, v: any) { filters.push(r => !(v === null ? r[c] == null : r[c] === v)); return q; },
      gt(c: string, v: any) { filters.push(r => Number(r[c]) > Number(v)); return q; }, lt(c: string, v: any) { filters.push(r => r[c] < v); return q; }, lte(c: string, v: any) { filters.push(r => r[c] <= v); return q; },
      in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return q; }, or(e: string) { filters.push(parseOr(e)); return q; }, order() { return q; }, limit(n: number) { limitN = n; return q; },
      async maybeSingle() { const { data } = await run(); return { data: data[0] ?? null, error: null }; }, async single() { const { data } = await run(); return { data: data[0] ?? null, error: data[0] ? null : { message: 'no rows' } }; },
      then(res: any, rej: any) { return run().then(res, rej); },
    };
    q.insert = q.insert.bind(this);
    return q;
  }
}
class FakeStripeApi {
  piLog: any[] = []; transferLog: any[] = []; createCalls = 0; failNext: any = null; searchResults: any[] = []; payoutsEnabled: Record<string, boolean> = {};
  webhooks = new Stripe('sk_test_fake').webhooks;
  paymentIntents = { create: async (p: any, o: any) => { this.createCalls++; if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } const pi = { id: `pi_${this.piLog.length + 1}`, status: 'succeeded', amount: p.amount, latest_charge: `ch_${this.piLog.length + 1}`, metadata: p.metadata, key: o.idempotencyKey, params: p }; this.piLog.push(pi); return pi; }, search: async () => ({ data: this.searchResults }), retrieve: async (id: string) => this.piLog.find(p => p.id === id) ?? { id, amount: 12000, latest_charge: 'ch_x' } };
  transfers = { create: async (p: any, o: any) => { const t = { id: `tr_${this.transferLog.length + 1}`, amount: p.amount, metadata: p.metadata, key: o.idempotencyKey, params: p }; this.transferLog.push(t); return t; }, list: async () => ({ data: this.transferLog }) };
  accounts = { retrieve: async (id: string) => ({ payouts_enabled: !!this.payoutsEnabled[id] }) };
}
class FakeResend { sent: any[] = []; emails = { send: async (m: any) => { this.sent.push(m); return { data: { id: `em_${this.sent.length}` }, error: null }; } }; }
const SECRET = 'whsec_test_secret';
// Relative imports inside api/ have no extensions (Vercel resolves them), so bundle first.
import { execSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
const bundle = process.cwd() + '/_stripe_webhook.test-bundle.mjs';
execSync(`npx esbuild api/_stripe_webhook.ts --bundle --platform=node --format=esm --packages=external --log-level=error --outfile=${bundle}`, { stdio: 'inherit' });
const { handleStripeWebhook } = await import(bundle);
try { unlinkSync(bundle); } catch { /* ignore */ }
const stripeSig = new Stripe('sk_test_fake').webhooks;
let evtN = 0;
function deliver(deps: any, type: string, object: any, opts: { id?: string; badSig?: boolean } = {}) {
  const payload = JSON.stringify({ id: opts.id ?? `evt_${++evtN}`, object: 'event', type, data: { object }, created: Math.floor(Date.now() / 1000) });
  const header = stripeSig.generateTestHeaderString({ payload, secret: opts.badSig ? 'whsec_wrong' : SECRET });
  let status = 0, body: any = null;
  const res: any = { status(c: number) { status = c; return res; }, json(b: any) { body = b; return res; }, end() { return res; } };
  return handleStripeWebhook({ headers: { 'stripe-signature': header } } as any, res, Buffer.from(payload), { ...deps, secret: SECRET }).then(() => ({ status, body }));
}
const base = () => ({
  cleaning_jobs: [
    { id: 'j1', property_id: 'p1', property_name: 'Beach', checkout_date: '2026-10-01', status: 'completed', cleaning_fee: 120, cleaner_payout: 80, assigned_cleaner_id: 'c1', assigned_cleaner_name: 'Pat', portal_data: { submittedAt: '2026-10-01T15:00:00Z', photos: ['https://x/1.jpg'], checklist: { a: true, b: false } }, completed_at: '2026-10-01T15:00:00Z', payout_due_at: '2026-10-03T15:00:00Z', charged_at: null, payout_sent_at: null, updated_at: '2026-10-01T00:00:00Z' },
    { id: 'j2', property_id: 'p1', property_name: 'Beach', checkout_date: '2026-09-25', status: 'completed', cleaning_fee: 120, cleaner_payout: 80, assigned_cleaner_id: 'c2', portal_data: { submittedAt: '2026-09-25T15:00:00Z' }, completed_at: '2026-09-25T15:00:00Z', payout_due_at: '2026-09-27T15:00:00Z', charged_at: null, charge_status: 'failed', charge_attempts: 1, next_charge_attempt_at: '2099-01-01T00:00:00Z', updated_at: '2026-09-25T00:00:00Z' },
  ],
  cleaning_property_configs: [{ id: 'cpc1', property_id: 'p1', property_name: 'Beach', cleaning_fee: 100, stripe_customer_id: 'cus_1', stripe_payment_method_id: 'pm_old', client_email: 'owner@x.com', client_name: 'Olive' }],
  cleaners: [{ id: 'c1', name: 'Pat Lee', email: 'pat@x.com', stripe_account_id: 'acct_1', stripe_connect_status: 'active' }, { id: 'c2', name: 'Sam Roe', email: 'sam@x.com', stripe_account_id: 'acct_2', stripe_connect_status: 'pending', dashboard_token: null }],
  cleaning_client_onboarding: [{ id: 'ob1', token: 'tok_setup', property_config_ids: ['cpc1'], property_name: 'Beach', client_name: 'Olive', client_email: 'owner@x.com', status: 'pending' }],
  stripe_events: [],
});
const results: Record<string, boolean> = {};
{ const db = new FakeDb(base()), stripe = new FakeStripeApi(), resend = new FakeResend(); const deps = { db, stripe, resend };
  results.badSignature400 = (await deliver(deps, 'payment_intent.succeeded', { id: 'pi_1', metadata: { job_id: 'j1' }, amount: 12000 }, { badSig: true })).status === 400 && db.tables.stripe_events.length === 0;
  const r = await deliver(deps, 'payment_intent.succeeded', { id: 'pi_1', metadata: { job_id: 'j1' }, amount: 12000, latest_charge: 'ch_1', receipt_email: 'owner@x.com' }, { id: 'evt_pay' });
  const job = db.tables.cleaning_jobs[0];
  results.succeededRecordsCharge = r.status === 200 && job.charge_status === 'charged' && job.stripe_charge_id === 'pi_1' && !!job.charged_at;
  results.succeededPaysCleaner = job.payout_status === 'sent' && stripe.transferLog[0]?.params.source_transaction === 'ch_1';
  results.receiptEmailed = resend.sent.length === 1 && resend.sent[0].to === 'owner@x.com' && /Cleaning complete/.test(resend.sent[0].subject) && /1\.jpg/.test(resend.sent[0].html) && !!job.receipt_sent_at;
  const dup = await deliver(deps, 'payment_intent.succeeded', { id: 'pi_1', metadata: { job_id: 'j1' }, amount: 12000 }, { id: 'evt_pay' });
  results.duplicateEventIgnored = dup.body?.duplicate === true && resend.sent.length === 1 && stripe.transferLog.length === 1; }
{ const db = new FakeDb(base()), stripe = new FakeStripeApi(), resend = new FakeResend(); const deps = { db, stripe, resend };
  const r = await deliver(deps, 'payment_intent.payment_failed', { id: 'pi_f', metadata: { job_id: 'j1' }, amount: 12000, last_payment_error: { message: 'Your card has insufficient funds.' } });
  const job = db.tables.cleaning_jobs[0]; const cfg = db.tables.cleaning_property_configs[0];
  const clientMail = resend.sent.find(m => m.to === 'owner@x.com'); const link = db.tables.cleaning_client_onboarding.find(o => o.token !== 'tok_setup');
  results.failedMarksJob = r.status === 200 && job.charge_status === 'failed' && /insufficient/.test(job.last_charge_error) && !!job.next_charge_attempt_at && !job.charged_at;
  results.failedEmailsCardLink = !!clientMail && /update your card/i.test(clientMail.subject) && !!link && clientMail.html.includes(`cleaning-onboard=${link.token}`) && !!cfg.card_update_requested_at;
  results.failedAlertsAdmin = resend.sent.some(m => /Card declined/.test(m.subject));
  await deliver(deps, 'payment_intent.payment_failed', { id: 'pi_f2', metadata: { job_id: 'j1' }, amount: 12000, last_payment_error: { message: 'declined' } });
  results.dunningThrottled = resend.sent.filter(m => m.to === 'owner@x.com').length === 1; }
{ const db = new FakeDb(base()), stripe = new FakeStripeApi(), resend = new FakeResend(); const deps = { db, stripe, resend };
  const r = await deliver(deps, 'setup_intent.succeeded', { id: 'seti_1', metadata: { token: 'tok_setup' }, payment_method: 'pm_new', customer: 'cus_1' });
  const cfg = db.tables.cleaning_property_configs[0]; const ob = db.tables.cleaning_client_onboarding[0];
  results.setupSavesCard = r.status === 200 && cfg.stripe_payment_method_id === 'pm_new' && !!cfg.onboarded_at && ob.status === 'completed' && !!ob.completed_at;
  results.setupRetriesFailedCharges = stripe.piLog.length === 1 && stripe.piLog[0].metadata.job_id === 'j2' && db.tables.cleaning_jobs[1].charge_status === 'charged' && stripe.piLog[0].params.payment_method === 'pm_new'; }
{ const db = new FakeDb(base()), stripe = new FakeStripeApi(), resend = new FakeResend(); const deps = { db, stripe, resend };
  db.tables.cleaning_jobs[1].charged_at = '2026-09-26T00:00:00Z'; db.tables.cleaning_jobs[1].charge_status = 'charged'; db.tables.cleaning_jobs[1].payout_status = 'manual_due'; stripe.payoutsEnabled['acct_2'] = true;
  const r = await deliver(deps, 'account.updated', { id: 'acct_2', object: 'account', payouts_enabled: true, details_submitted: true });
  const sam = db.tables.cleaners[1]; const portal = resend.sent.find(m => m.to === 'sam@x.com');
  results.accountActivates = r.status === 200 && sam.stripe_connect_status === 'active' && !!sam.dashboard_token && !!portal && portal.html.includes(`cleaner-dashboard=Sam-Roe:c2:${sam.dashboard_token}`);
  results.accountReleasesManualDue = db.tables.cleaning_jobs[1].payout_status === 'sent' && stripe.transferLog.length === 1 && stripe.transferLog[0].metadata.job_id === 'j2';
  const again = await deliver(deps, 'account.updated', { id: 'acct_2', object: 'account', payouts_enabled: true });
  // Sam gets the portal email + one "payout sent" email for the released payout; a repeat event sends nothing more.
  const samMails = () => resend.sent.filter(m => m.to === 'sam@x.com');
  results.accountPayoutEmailed = samMails().some(m => /payout sent/i.test(m.subject) && /\$80\.00/.test(m.subject));
  results.accountNoRepeatEmail = again.body?.handled === 'account_updated:no_change' && samMails().length === 2; }
{ const db = new FakeDb(base()), stripe = new FakeStripeApi(), resend = new FakeResend(); const deps = { db, stripe, resend };
  db.tables.cleaning_jobs[0].payout_sent_at = 'x'; db.tables.cleaning_jobs[0].payout_status = 'sent';
  const r = await deliver(deps, 'transfer.reversed', { id: 'tr_9', amount: 8000, metadata: { job_id: 'j1' } });
  results.reversedFlagged = r.status === 200 && db.tables.cleaning_jobs[0].payout_status === 'reversed' && resend.sent.some(m => /reversed/.test(m.subject));
  results.unknownEventIgnored = (await deliver(deps, 'customer.created', { id: 'cus_9' })).body?.handled === 'ignored'; }
const failed = Object.entries(results).filter(([, v]) => !v).map(([k]) => k);
console.log(`${Object.keys(results).length - failed.length}/${Object.keys(results).length} webhook checks passed${failed.length ? ' — FAILED: ' + failed.join(', ') : ''}`);
if (failed.length) process.exit(1);

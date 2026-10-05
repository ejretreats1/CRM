// ── Cleaning billing: one way to charge a client and pay a cleaner ──────────────
//
// Every charge and payout in the cleaning CRM goes through here (cleaner submit,
// daily cron, admin retry, manual "Send Now"). Rules:
//   • A job is charged only once it is `completed` and has a submitted report
//     (an admin retry may override the report requirement).
//   • The amount is the job's own fee (falling back to the property fee for old
//     rows). $0 is never charged.
//   • The job is claimed atomically before Stripe is called, so the cron and a
//     cleaner submitting at the same moment can't both charge.
//   • Idempotency keys are stable per job + attempt. Before a retry we look for an
//     existing successful PaymentIntent for the job, so a charge that succeeded but
//     failed to record is never repeated.
//   • Payouts happen right after the charge using Stripe's `source_transaction`,
//     which ties the transfer to the charge and waits for the funds to settle.
//     Cleaners without an active Stripe account are marked `manual_due` until the
//     admin records the payment.
//   • Charging never changes a job's status.
//
// Requires the columns added by supabase-cleaning-billing-migration.sql.

import type Stripe from 'stripe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobRow = Record<string, any>;

export type ChargeTrigger = 'submit' | 'cron' | 'manual';

export interface PayoutOutcome {
  status: 'sent' | 'manual_due' | 'failed' | 'skipped' | 'already_sent';
  reason?: string;
  error?: string;
  transferId?: string;
  amount?: number;
}

export interface ChargeOutcome {
  ok: boolean;
  /** true when nothing was attempted (already charged, not eligible, claimed elsewhere) */
  skipped?: boolean;
  reason?: 'already_charged' | 'cancelled' | 'not_completed' | 'no_report' | 'claimed_elsewhere' | 'not_found' | 'external_billing';
  error?: string;
  errorCode?: string;
  paymentIntentId?: string;
  amount?: number;
  attempt?: number;
  willRetryAt?: string | null;
  payout?: PayoutOutcome;
}

/** Days until the next automatic retry after the Nth failed attempt; null = stop retrying. */
const RETRY_SCHEDULE_DAYS: (number | null)[] = [1, 3, 5, null];
const STALE_CLAIM_MS = 10 * 60_000;

function nowIso() { return new Date().toISOString(); }

function nextRetryAt(attempt: number): string | null {
  const days = RETRY_SCHEDULE_DAYS[Math.min(attempt, RETRY_SCHEDULE_DAYS.length) - 1];
  if (days === null || days === undefined) return null;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function stripeErrorMessage(err: unknown): { message: string; code?: string } {
  const e = err as { message?: string; code?: string; decline_code?: string; raw?: { message?: string } };
  const code = e?.decline_code ?? e?.code;
  const message = e?.raw?.message ?? e?.message ?? 'Stripe request failed.';
  return { message: code ? `${message} (${code})` : message, code };
}

async function loadJob(db: Db, jobId: string): Promise<JobRow | null> {
  const { data } = await db.from('cleaning_jobs').select('*').eq('id', jobId).maybeSingle();
  return data ?? null;
}

async function loadConfig(db: Db, propertyId: string): Promise<JobRow | null> {
  const { data } = await db.from('cleaning_property_configs').select('*').eq('property_id', propertyId).maybeSingle();
  if (data) return data;
  // Jobs created for an Uplisting sub-unit carry the sub-listing id; the card and fee live on the parent.
  const { data: parent } = await db.from('cleaning_property_configs').select('*').contains('linked_property_ids', [propertyId]).maybeSingle();
  return parent ?? null;
}

/** The fee to bill: the job's own fee, else the property fee for rows created before fees were copied. */
export function billableFee(job: JobRow, config: JobRow | null): number {
  const jobFee = Number(job.cleaning_fee ?? 0);
  if (jobFee > 0) return jobFee;
  return Number(config?.cleaning_fee ?? 0);
}

// ── Charge ──────────────────────────────────────────────────────────────────

export async function chargeJob(
  db: Db,
  stripe: Stripe,
  jobId: string,
  opts: { trigger: ChargeTrigger; allowWithoutReport?: boolean; payout?: boolean } = { trigger: 'manual' },
): Promise<ChargeOutcome> {
  const job = await loadJob(db, jobId);
  if (!job) return { ok: false, skipped: true, reason: 'not_found', error: 'Job not found.' };
  if (job.status === 'cancelled') return { ok: false, skipped: true, reason: 'cancelled', error: 'Job is cancelled.' };
  if (job.charged_at) return { ok: true, skipped: true, reason: 'already_charged', paymentIntentId: job.stripe_charge_id ?? undefined, amount: Number(job.cleaning_fee) };
  if (job.status !== 'completed') return { ok: false, skipped: true, reason: 'not_completed', error: 'Job is not completed yet.' };
  const hasReport = !!job.portal_data?.submittedAt;
  if (!hasReport && !opts.allowWithoutReport) {
    return { ok: false, skipped: true, reason: 'no_report', error: 'No cleaning report submitted yet.' };
  }

  const config = await loadConfig(db, job.property_id);
  if (!config) return { ok: false, error: 'Property is not enrolled in cleaning (no config).' };
  const fee = billableFee(job, config);

  // Client is invoiced outside Stripe (not on card billing yet): nothing to
  // charge here, but the cleaner is still paid now. Mark the job so the cron
  // doesn't keep trying to charge it and the admin can see what to invoice.
  if (config.billing_mode === 'external') {
    if (job.charge_status !== 'external') {
      await db.from('cleaning_jobs').update({ charge_status: 'external', last_charge_error: null, next_charge_attempt_at: null, updated_at: nowIso() }).eq('id', jobId).is('charged_at', null);
    }
    const payout = opts.payout === false ? undefined : await payoutJob(db, stripe, jobId, { external: true });
    return { ok: true, skipped: true, reason: 'external_billing', amount: fee, payout };
  }

  if (!(fee > 0)) return { ok: false, error: 'Cleaning fee is not set for this job.' };
  if (!config.stripe_customer_id || !config.stripe_payment_method_id) {
    return { ok: false, error: 'No payment method on file — client has not completed card setup.' };
  }

  // Claim the job. Only one caller gets the row back; a stale 'processing' claim
  // (crashed run) can be taken over after STALE_CLAIM_MS.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('cleaning_jobs')
    .update({ charge_status: 'processing', updated_at: nowIso() })
    .eq('id', jobId)
    .is('charged_at', null)
    .or(`charge_status.is.null,charge_status.neq.processing,updated_at.lt.${staleBefore}`)
    .select('id, charge_attempts');
  if (claimErr) return { ok: false, error: `Could not claim job for charging: ${claimErr.message}` };
  if (!claimed?.length) return { ok: false, skipped: true, reason: 'claimed_elsewhere', error: 'Charge already in progress.' };

  const attempt = Number(claimed[0].charge_attempts ?? job.charge_attempts ?? 0) + 1;
  const amountCents = Math.round(fee * 100);

  // Safety net for retries: if an earlier attempt succeeded at Stripe but we failed
  // to record it, adopt that PaymentIntent instead of charging again.
  if (attempt > 1) {
    try {
      const found = await stripe.paymentIntents.search({
        query: `metadata['job_id']:'${jobId}' AND status:'succeeded'`,
        limit: 1,
      });
      const existing = found.data[0];
      if (existing) {
        await recordCharged(db, jobId, existing.id, attempt);
        const payout = opts.payout === false ? undefined : await payoutJob(db, stripe, jobId, { chargeId: chargeIdOf(existing) });
        return { ok: true, paymentIntentId: existing.id, amount: existing.amount / 100, attempt, payout };
      }
    } catch { /* search unavailable — fall through to a normal charge */ }
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: config.stripe_customer_id,
      payment_method: config.stripe_payment_method_id,
      confirm: true,
      off_session: true,
      description: `Cleaning: ${job.property_name} — ${job.checkout_date}`,
      receipt_email: config.client_email || undefined,
      metadata: { job_id: jobId, property_id: job.property_id, attempt: String(attempt), trigger: opts.trigger },
      expand: ['latest_charge'],
    }, { idempotencyKey: `cleaning_charge_${jobId}_${attempt}` });
  } catch (err) {
    const { message, code } = stripeErrorMessage(err);
    const willRetryAt = nextRetryAt(attempt);
    await db.from('cleaning_jobs').update({
      charge_status: 'failed',
      charge_attempts: attempt,
      last_charge_error: message,
      next_charge_attempt_at: willRetryAt,
      updated_at: nowIso(),
    }).eq('id', jobId);
    return { ok: false, error: message, errorCode: code, attempt, willRetryAt };
  }

  if (intent.status !== 'succeeded') {
    const message = `Payment needs attention (status: ${intent.status}).`;
    const willRetryAt = nextRetryAt(attempt);
    await db.from('cleaning_jobs').update({
      charge_status: 'failed',
      charge_attempts: attempt,
      last_charge_error: message,
      next_charge_attempt_at: willRetryAt,
      stripe_charge_id: intent.id,
      updated_at: nowIso(),
    }).eq('id', jobId);
    return { ok: false, error: message, errorCode: intent.status, attempt, willRetryAt, paymentIntentId: intent.id };
  }

  const recordErr = await recordCharged(db, jobId, intent.id, attempt);
  const payout = opts.payout === false ? undefined : await payoutJob(db, stripe, jobId, { chargeId: chargeIdOf(intent) });
  return {
    ok: true,
    paymentIntentId: intent.id,
    amount: amountCents / 100,
    attempt,
    payout,
    ...(recordErr ? { error: `Charged, but recording it failed: ${recordErr}` } : {}),
  };
}

function chargeIdOf(intent: Stripe.PaymentIntent): string | undefined {
  const lc = intent.latest_charge;
  if (!lc) return undefined;
  return typeof lc === 'string' ? lc : lc.id;
}

async function recordCharged(db: Db, jobId: string, paymentIntentId: string, attempt: number): Promise<string | null> {
  const now = nowIso();
  const { error } = await db.from('cleaning_jobs').update({
    charged_at: now,
    stripe_charge_id: paymentIntentId,
    charge_status: 'charged',
    charge_attempts: attempt,
    last_charge_error: null,
    next_charge_attempt_at: null,
    updated_at: now,
  }).eq('id', jobId);
  return error ? error.message : null;
}

// ── Payout ──────────────────────────────────────────────────────────────────

/** True when the connected account can actually receive transfers. Updates the stored status. */
async function cleanerCanBePaid(db: Db, stripe: Stripe, cleaner: JobRow): Promise<boolean> {
  if (!cleaner?.stripe_account_id) return false;
  if (cleaner.stripe_connect_status === 'active') return true;
  try {
    const account = await stripe.accounts.retrieve(cleaner.stripe_account_id);
    if (account.payouts_enabled) {
      await db.from('cleaners').update({ stripe_connect_status: 'active' }).eq('id', cleaner.id);
      return true;
    }
  } catch { /* treat as not ready */ }
  return false;
}

export async function payoutJob(
  db: Db,
  stripe: Stripe,
  jobId: string,
  opts: { chargeId?: string; manual?: boolean; external?: boolean } = {},
): Promise<PayoutOutcome> {
  const job = await loadJob(db, jobId);
  if (!job) return { status: 'skipped', reason: 'not_found' };
  if (job.payout_sent_at) return { status: 'already_sent', transferId: job.stripe_transfer_id ?? undefined, amount: Number(job.cleaner_payout) };
  if (job.status === 'cancelled') return { status: 'skipped', reason: 'cancelled' };
  if (!job.assigned_cleaner_id) return { status: 'skipped', reason: 'no_cleaner' };
  const amount = Number(job.cleaner_payout ?? 0);
  if (!(amount > 0)) return { status: 'skipped', reason: 'zero_payout' };
  // Externally billed jobs (client pays E&J outside Stripe) are paid from the
  // platform balance without a client charge to tie to.
  const external = opts.external || job.charge_status === 'external';
  if (!job.charged_at && !external) return { status: 'skipped', reason: 'not_charged', error: 'Client has not been charged for this job yet.' };

  const { data: cleaner } = await db.from('cleaners').select('*').eq('id', job.assigned_cleaner_id).maybeSingle();
  if (!cleaner) return { status: 'skipped', reason: 'cleaner_missing', error: 'Cleaner record not found.' };

  if (!(await cleanerCanBePaid(db, stripe, cleaner))) {
    if (job.payout_status !== 'manual_due') {
      await db.from('cleaning_jobs').update({ payout_status: 'manual_due', updated_at: nowIso() }).eq('id', jobId);
    }
    return { status: 'manual_due', amount, reason: cleaner.stripe_account_id ? 'stripe_not_ready' : 'no_stripe' };
  }

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('cleaning_jobs')
    .update({ payout_status: 'processing', updated_at: nowIso() })
    .eq('id', jobId)
    .is('payout_sent_at', null)
    .or(`payout_status.is.null,payout_status.in.(failed,manual_due),updated_at.lt.${staleBefore}`)
    .select('id, payout_attempts, payout_status');
  if (claimErr) return { status: 'failed', error: `Could not claim payout: ${claimErr.message}` };
  if (!claimed?.length) return { status: 'skipped', reason: 'claimed_elsewhere' };

  const attempt = Number(claimed[0].payout_attempts ?? job.payout_attempts ?? 0) + 1;
  const amountCents = Math.round(amount * 100);

  // Retry safety net: a transfer may have gone through on an earlier attempt.
  if (attempt > 1) {
    try {
      const recent = await stripe.transfers.list({ destination: cleaner.stripe_account_id, limit: 50 });
      const existing = recent.data.find(t => t.metadata?.job_id === jobId && !t.reversed);
      if (existing) {
        await recordPaid(db, jobId, existing.id, attempt);
        return { status: 'sent', transferId: existing.id, amount: existing.amount / 100 };
      }
    } catch { /* fall through */ }
  }

  // Tie the transfer to the client's charge so Stripe releases it when the funds
  // settle (no more waiting 2 business days ourselves). Only possible when the
  // payout doesn't exceed the charge.
  let chargeId = opts.chargeId;
  if (!chargeId && job.stripe_charge_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(job.stripe_charge_id);
      chargeId = chargeIdOf(pi);
      if (pi.amount < amountCents) chargeId = undefined;
    } catch { chargeId = undefined; }
  }

  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: cleaner.stripe_account_id,
      description: `Payout: ${job.property_name} — ${job.checkout_date}`,
      metadata: { job_id: jobId, cleaner_id: job.assigned_cleaner_id, attempt: String(attempt) },
      ...(chargeId ? { source_transaction: chargeId } : {}),
    }, { idempotencyKey: attempt === 1 ? `payout_${jobId}` : `payout_${jobId}_${attempt}` });
  } catch (err) {
    const { message } = stripeErrorMessage(err);
    await db.from('cleaning_jobs').update({
      payout_status: 'failed',
      payout_attempts: attempt,
      payout_error: message,
      updated_at: nowIso(),
    }).eq('id', jobId);
    return { status: 'failed', error: message, amount };
  }

  const recordErr = await recordPaid(db, jobId, transfer.id, attempt);
  return { status: 'sent', transferId: transfer.id, amount, ...(recordErr ? { error: `Sent, but recording it failed: ${recordErr}` } : {}) };
}

async function recordPaid(db: Db, jobId: string, transferId: string, attempt: number): Promise<string | null> {
  const now = nowIso();
  const { error } = await db.from('cleaning_jobs').update({
    payout_sent_at: now,
    stripe_transfer_id: transferId,
    payout_status: 'sent',
    payout_attempts: attempt,
    payout_error: null,
    updated_at: now,
  }).eq('id', jobId);
  return error ? error.message : null;
}

/** Admin records that a cleaner was paid outside Stripe (Zelle, Venmo, cash…). */
export async function markPayoutPaid(
  db: Db,
  jobId: string,
  details: { method?: string; reference?: string; paidAt?: string },
): Promise<{ ok: boolean; error?: string }> {
  const job = await loadJob(db, jobId);
  if (!job) return { ok: false, error: 'Job not found.' };
  if (job.payout_sent_at) return { ok: false, error: 'Payout already recorded for this job.' };
  const now = nowIso();
  const { error } = await db.from('cleaning_jobs').update({
    payout_sent_at: details.paidAt ?? now,
    payout_status: 'sent_manual',
    payout_method: details.method?.trim() || 'manual',
    payout_reference: details.reference?.trim() || null,
    payout_error: null,
    updated_at: now,
  }).eq('id', jobId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Jobs the daily cron should try to charge right now. */
export async function findChargeableJobs(db: Db, limit = 50): Promise<JobRow[]> {
  const now = nowIso();
  const { data } = await db
    .from('cleaning_jobs')
    .select('*')
    .eq('status', 'completed')
    .is('charged_at', null)
    .not('portal_data', 'is', null)
    .or(`charge_status.is.null,and(charge_status.eq.failed,next_charge_attempt_at.lte.${now})`)
    .order('checkout_date', { ascending: true })
    .limit(limit);
  return data ?? [];
}

/** Charged (or externally billed) jobs whose cleaner payout hasn't gone out (includes manual_due, re-checked daily). */
export async function findPayableJobs(db: Db, limit = 50): Promise<JobRow[]> {
  const { data } = await db
    .from('cleaning_jobs')
    .select('*')
    .or('charged_at.not.is.null,charge_status.eq.external')
    .is('payout_sent_at', null)
    .not('assigned_cleaner_id', 'is', null)
    .gt('cleaner_payout', 0)
    .neq('status', 'cancelled')
    .or('payout_status.is.null,payout_status.in.(failed,manual_due)')
    .order('checkout_date', { ascending: true })
    .limit(limit);
  return data ?? [];
}

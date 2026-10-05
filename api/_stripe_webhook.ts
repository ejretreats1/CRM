// ── Stripe webhook ───────────────────────────────────────────────────────────
// Mounted at /api/stripe-webhook (vercel.json rewrites it into the facebook-lead
// function, which already reads raw request bodies — Stripe signatures need the
// exact bytes). Every event is recorded in `stripe_events` so retries are no-ops.
//
// Events handled:
//   payment_intent.succeeded      → confirm charge recorded, pay cleaner, email client receipt
//   payment_intent.payment_failed → mark job failed (+retry schedule), email client a card-update link
//   setup_intent.succeeded        → finish card setup even if the browser never called "confirm"
//                                   (3-D Secure redirects), then retry failed charges for that client
//   account.updated               → mark cleaner Stripe-active, send portal email, release manual_due payouts
//   transfer.reversed             → flag the job's payout
//   charge.dispute.created / charge.refunded → alert admin

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { APP_URL, ADMIN_EMAIL, escapeHtml } from './_auth.js';
import { payoutJob, chargeJob, findPayableJobs } from './_billing.js';
import { CLEANING_FROM, sendCleanerPortalEmail, sendClientReceiptEmail, sendCardUpdateEmail } from './_emails.js';
import { maybeActivateCleaner } from './_jobs.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resend = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface WebhookDeps { db: Db; stripe: Stripe; resend: Resend; secret: string | undefined }

const nowIso = () => new Date().toISOString();

async function adminEmail(resend: Resend, subject: string, html: string) {
  try { await resend.emails.send({ from: CLEANING_FROM, to: ADMIN_EMAIL, subject, html: `<div style="font-family:sans-serif;padding:24px">${html}</div>` }); } catch { /* best effort */ }
}

async function loadJob(db: Db, jobId: string): Promise<Row | null> {
  const { data } = await db.from('cleaning_jobs').select('*').eq('id', jobId).maybeSingle();
  return data ?? null;
}
async function loadConfigByProperty(db: Db, propertyId: string): Promise<Row | null> {
  const { data } = await db.from('cleaning_property_configs').select('*').eq('property_id', propertyId).maybeSingle();
  return data ?? null;
}

export async function handleStripeWebhook(req: VercelRequest, res: VercelResponse, rawBody: Buffer, deps: WebhookDeps) {
  const { db, stripe, resend, secret } = deps;
  if (!secret) return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET is not configured' });
  const sig = String(req.headers['stripe-signature'] ?? '');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return res.status(400).json({ error: `Invalid signature: ${(err as Error).message}` });
  }

  // Idempotency: Stripe retries until it gets a 2xx, and may deliver twice.
  const { error: insErr } = await db.from('stripe_events').insert({ id: event.id, type: event.type, created_at: nowIso() });
  if (insErr) {
    const dup = /duplicate|23505|already exists/i.test(insErr.message ?? '') || insErr.code === '23505';
    if (dup) return res.status(200).json({ received: true, duplicate: true });
    // Table missing or other DB issue: still process (better than dropping the event), but say so.
    console.error('[stripe-webhook] could not record event:', insErr.message);
  }

  let handled = 'ignored';
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        handled = await onPaymentSucceeded(deps, event.data.object as Stripe.PaymentIntent); break;
      case 'payment_intent.payment_failed':
        handled = await onPaymentFailed(deps, event.data.object as Stripe.PaymentIntent); break;
      case 'setup_intent.succeeded':
        handled = await onSetupSucceeded(deps, event.data.object as Stripe.SetupIntent); break;
      case 'account.updated':
        handled = await onAccountUpdated(deps, event.data.object as Stripe.Account); break;
      case 'transfer.reversed':
        handled = await onTransferReversed(deps, event.data.object as Stripe.Transfer); break;
      case 'charge.dispute.created':
        handled = await onDispute(deps, event.data.object as Stripe.Dispute); break;
      case 'charge.refunded':
        handled = await onRefund(deps, event.data.object as Stripe.Charge); break;
    }
  } catch (err) {
    // Don't make Stripe retry forever on our own bug — record and alert instead.
    console.error('[stripe-webhook] handler error:', event.type, err);
    await adminEmail(resend, `⚠️ Stripe webhook handler error (${event.type})`, `<p>${escapeHtml((err as Error).message)}</p><p>Event ${event.id}</p>`);
    return res.status(200).json({ received: true, error: (err as Error).message });
  }
  return res.status(200).json({ received: true, handled });
}

// ── payment_intent.succeeded ──────────────────────────────────────────────────
async function onPaymentSucceeded({ db, stripe, resend }: WebhookDeps, pi: Stripe.PaymentIntent): Promise<string> {
  const jobId = pi.metadata?.job_id;
  if (!jobId) return 'ignored:no_job';
  const job = await loadJob(db, jobId);
  if (!job) return 'ignored:job_missing';

  if (!job.charged_at) {
    await db.from('cleaning_jobs').update({
      charged_at: nowIso(), stripe_charge_id: pi.id, charge_status: 'charged', last_charge_error: null, next_charge_attempt_at: null, updated_at: nowIso(),
    }).eq('id', jobId);
  }
  const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
  if (!job.payout_sent_at) await payoutJob(db, stripe, jobId, { chargeId });

  if (!job.receipt_sent_at) {
    const config = await loadConfigByProperty(db, job.property_id);
    const to = pi.receipt_email || config?.client_email;
    if (to) {
      const checklist = (job.portal_data?.checklist ?? {}) as Record<string, boolean>;
      try {
        await sendClientReceiptEmail(resend, {
          to, clientName: config?.client_name, propertyName: job.property_name, checkoutDate: job.checkout_date, amount: pi.amount / 100,
          photos: job.portal_data?.photos ?? [], checklistDone: Object.values(checklist).filter(Boolean).length, checklistTotal: Object.keys(checklist).length,
        });
        await db.from('cleaning_jobs').update({ receipt_sent_at: nowIso() }).eq('id', jobId);
      } catch (err) {
        console.error('[stripe-webhook] receipt email failed:', (err as Error).message);
      }
    }
  }
  return 'payment_succeeded';
}

// ── payment_intent.payment_failed ─────────────────────────────────────────────
async function onPaymentFailed({ db, resend }: WebhookDeps, pi: Stripe.PaymentIntent): Promise<string> {
  const jobId = pi.metadata?.job_id;
  if (!jobId) return 'ignored:no_job';
  const job = await loadJob(db, jobId);
  if (!job || job.charged_at) return 'ignored';
  const reason = pi.last_payment_error?.message ?? 'Card declined';

  const patch: Row = { charge_status: 'failed', last_charge_error: reason, updated_at: nowIso() };
  if (!job.next_charge_attempt_at) patch.next_charge_attempt_at = new Date(Date.now() + 86_400_000).toISOString();
  await db.from('cleaning_jobs').update(patch).eq('id', jobId);

  const config = await loadConfigByProperty(db, job.property_id);
  if (!config?.client_email) return 'payment_failed:no_client_email';

  // Dunning: one card-update email per 3 days per property.
  const lastAsk = config.card_update_requested_at ? new Date(config.card_update_requested_at).getTime() : 0;
  if (Date.now() - lastAsk < 3 * 86_400_000) return 'payment_failed:already_asked';

  const token = randomUUID();
  const { error } = await db.from('cleaning_client_onboarding').insert({
    id: randomUUID(), token,
    property_config_id: config.id, property_config_ids: [config.id],
    property_name: config.property_name, client_name: config.client_name ?? null, client_email: config.client_email,
    status: 'pending', created_at: nowIso(), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  if (error) { console.error('[stripe-webhook] could not create card-update link:', error.message); return 'payment_failed:link_error'; }

  const link = `${APP_URL}?cleaning-onboard=${token}`;
  try {
    await sendCardUpdateEmail(resend, { to: config.client_email, clientName: config.client_name, propertyName: job.property_name, amount: pi.amount / 100, reason, link });
    await db.from('cleaning_property_configs').update({ card_update_requested_at: nowIso() }).eq('id', config.id);
  } catch (err) {
    console.error('[stripe-webhook] card-update email failed:', (err as Error).message);
  }
  await adminEmail(resend, `⚠️ Card declined: ${job.property_name} ($${(pi.amount / 100).toFixed(2)})`,
    `<p><strong>${escapeHtml(config.client_name ?? config.client_email)}</strong>'s card was declined for <strong>${escapeHtml(job.property_name)}</strong> (${escapeHtml(job.checkout_date)}): ${escapeHtml(reason)}.</p><p>The client has been emailed a card-update link. The charge retries automatically.</p>`);
  return 'payment_failed:client_emailed';
}

// ── setup_intent.succeeded ────────────────────────────────────────────────────
async function onSetupSucceeded({ db, stripe, resend }: WebhookDeps, si: Stripe.SetupIntent): Promise<string> {
  const token = si.metadata?.token;
  if (!token) return 'ignored:no_token';
  const { data: record } = await db.from('cleaning_client_onboarding').select('*').eq('token', token).maybeSingle();
  if (!record) return 'ignored:no_record';
  const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id;
  if (!pmId) return 'ignored:no_payment_method';

  const configIds: string[] = record.property_config_ids ?? (record.property_config_id ? [record.property_config_id] : []);
  const customerId = typeof si.customer === 'string' ? si.customer : si.customer?.id;
  const now = nowIso();
  for (const configId of configIds) {
    await db.from('cleaning_property_configs').update({
      stripe_payment_method_id: pmId,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      client_name: record.client_name, client_email: record.client_email,
      onboarded_at: now, card_update_requested_at: null,
    }).eq('id', configId);
  }
  if (record.status !== 'completed') {
    await db.from('cleaning_client_onboarding').update({ status: 'completed', completed_at: now }).eq('token', token);
  }

  // A fresh card means failed charges for these properties can be retried right away.
  const { data: configs } = await db.from('cleaning_property_configs').select('property_id').in('id', configIds);
  const propertyIds = (configs ?? []).map((c: Row) => c.property_id);
  let retried = 0;
  if (propertyIds.length) {
    const { data: failed } = await db.from('cleaning_jobs').select('id').in('property_id', propertyIds).eq('charge_status', 'failed').is('charged_at', null).limit(20);
    for (const j of failed ?? []) { await chargeJob(db, stripe, j.id, { trigger: 'cron' }); retried++; }
  }
  await adminEmail(resend, `✅ Card on file: ${record.property_name}`,
    `<p><strong>${escapeHtml(record.client_name ?? record.client_email)}</strong> saved a card for <strong>${escapeHtml(record.property_name)}</strong>.${retried ? ` Retried ${retried} failed charge${retried === 1 ? '' : 's'}.` : ''}</p>`);
  return `setup_succeeded:${configIds.length}_configs,${retried}_retried`;
}

// ── account.updated ───────────────────────────────────────────────────────────
async function onAccountUpdated({ db, stripe, resend }: WebhookDeps, account: Stripe.Account): Promise<string> {
  const { data: cleaner } = await db.from('cleaners').select('*').eq('stripe_account_id', account.id).maybeSingle();
  if (!cleaner) return 'ignored:no_cleaner';
  const ready = !!(account.payouts_enabled || account.details_submitted);
  if (!ready || cleaner.stripe_connect_status === 'active') return 'account_updated:no_change';

  const dashToken: string = cleaner.dashboard_token || randomUUID();
  await db.from('cleaners').update({ stripe_connect_status: 'active', dashboard_token: dashToken }).eq('id', cleaner.id);
  await maybeActivateCleaner(db, cleaner.id);
  try { await sendCleanerPortalEmail(resend, cleaner, dashToken); } catch (err) { console.error('[stripe-webhook] portal email failed:', (err as Error).message); }

  // Anything waiting on this cleaner's Stripe account can go out now.
  let paid = 0;
  for (const job of await findPayableJobs(db)) {
    if (job.assigned_cleaner_id !== cleaner.id) continue;
    const r = await payoutJob(db, stripe, job.id, { notify: { resend } });
    if (r.status === 'sent') paid++;
  }
  await adminEmail(resend, `✅ Stripe connected: ${cleaner.name}`,
    `<p><strong>${escapeHtml(cleaner.name)}</strong> finished Stripe setup (${escapeHtml(account.id)}).${paid ? ` Released ${paid} waiting payout${paid === 1 ? '' : 's'}.` : ''}</p>`);
  return `account_updated:active,${paid}_paid`;
}

// ── transfer.reversed / disputes / refunds ───────────────────────────────────
async function onTransferReversed({ db, resend }: WebhookDeps, tr: Stripe.Transfer): Promise<string> {
  const jobId = tr.metadata?.job_id;
  if (!jobId) return 'ignored:no_job';
  await db.from('cleaning_jobs').update({ payout_status: 'reversed', payout_error: 'Transfer reversed by Stripe', updated_at: nowIso() }).eq('id', jobId);
  await adminEmail(resend, `⚠️ Cleaner payout reversed (job ${jobId})`, `<p>Transfer ${escapeHtml(tr.id)} for $${(tr.amount / 100).toFixed(2)} was reversed. Check the cleaner's Stripe account.</p>`);
  return 'transfer_reversed';
}

async function onDispute({ db, resend }: WebhookDeps, dispute: Stripe.Dispute): Promise<string> {
  const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
  const { data: job } = piId ? await db.from('cleaning_jobs').select('id, property_name, checkout_date').eq('stripe_charge_id', piId).maybeSingle() : { data: null };
  await adminEmail(resend, `🚨 Chargeback opened${job ? `: ${job.property_name}` : ''} ($${(dispute.amount / 100).toFixed(2)})`,
    `<p>A client disputed a cleaning charge${job ? ` for <strong>${escapeHtml(job.property_name)}</strong> (${escapeHtml(job.checkout_date)})` : ''}. Reason: ${escapeHtml(dispute.reason ?? 'unknown')}. Respond in the Stripe dashboard by ${dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString('en-US') : 'the deadline'}; the cleaner's photo report is your evidence.</p>`);
  return 'dispute_alerted';
}

async function onRefund({ db, resend }: WebhookDeps, charge: Stripe.Charge): Promise<string> {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  const { data: job } = piId ? await db.from('cleaning_jobs').select('id, property_name, checkout_date').eq('stripe_charge_id', piId).maybeSingle() : { data: null };
  await adminEmail(resend, `↩️ Refund issued${job ? `: ${job.property_name}` : ''} ($${(charge.amount_refunded / 100).toFixed(2)})`,
    `<p>A refund of $${(charge.amount_refunded / 100).toFixed(2)} was issued${job ? ` for <strong>${escapeHtml(job.property_name)}</strong> (${escapeHtml(job.checkout_date)})` : ''}. If the cleaner was already paid, reverse the transfer in Stripe if appropriate.</p>`);
  return 'refund_alerted';
}

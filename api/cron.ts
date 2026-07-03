import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Stripe from 'stripe';

export const config = { maxDuration: 60 };

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
const resend = new Resend(process.env.RESEND_API_KEY);

// Add N business days to a YYYY-MM-DD string (skips Sat/Sun)
function addBusinessDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  let remaining = Math.abs(n);
  const direction = n >= 0 ? 1 : -1;
  while (remaining > 0) {
    d.setDate(d.getDate() + direction);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

// ── AUTO-CHARGE ───────────────────────────────────────────────────────────────
// Charges the client for jobs whose checkout date is today.
// Does NOT transfer to the cleaner yet — that happens 2 business days later.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autoCharge(job: Record<string, any>): Promise<{ ok: boolean; error?: string; fee?: number }> {
  const supabase = getSupabase();

  const { data: config } = await supabase
    .from('cleaning_property_configs')
    .select('stripe_customer_id,stripe_payment_method_id,cleaning_fee')
    .eq('property_id', job.property_id)
    .maybeSingle();

  if (!config?.stripe_customer_id || !config?.stripe_payment_method_id) {
    return { ok: false, error: 'No payment method on file.' };
  }

  const stripe = getStripe();
  const amountCents = Math.round(Number(config.cleaning_fee) * 100);

  if (amountCents === 0) {
    return { ok: false, error: 'Cleaning fee is $0 — skipping charge.' };
  }

  // Re-fetch job to guard against cancellation between query and charge
  const { data: freshJob } = await supabase.from('cleaning_jobs').select('status,charged_at').eq('id', job.id).single();
  if (!freshJob || freshJob.status === 'cancelled') {
    return { ok: false, error: 'Job cancelled before charge could be processed.' };
  }
  if (freshJob.charged_at) {
    return { ok: false, error: 'Already charged (race condition avoided).' };
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: config.stripe_customer_id,
      payment_method: config.stripe_payment_method_id,
      confirm: true,
      off_session: true,
      description: `Cleaning: ${job.property_name} — ${job.checkout_date}`,
      metadata: { job_id: job.id, property_id: job.property_id },
      // No transfer_data — we keep funds in platform balance until payout day
    }, { idempotencyKey: `charge_${job.id}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Stripe charge failed.';
    return { ok: false, error: msg };
  }

  const now = new Date().toISOString();
  const { error: dbErr } = await supabase.from('cleaning_jobs').update({
    charged_at: now,
    stripe_charge_id: paymentIntent.id,
    updated_at: now,
  }).eq('id', job.id);
  if (dbErr) {
    return { ok: false, error: `Charged but DB update failed: ${dbErr.message}` };
  }

  return { ok: true, fee: Number(config.cleaning_fee) };
}

// ── AUTO-PAYOUT ───────────────────────────────────────────────────────────────
// Transfers to the cleaner's connected Stripe account for jobs charged
// exactly 2 business days ago (funds now available in platform balance).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autoPayout(job: Record<string, any>): Promise<{ ok: boolean; error?: string; payout?: number }> {
  if (!job.assigned_cleaner_id || Number(job.cleaner_payout) <= 0) {
    return { ok: false, error: 'No cleaner assigned or payout is $0.' };
  }

  const supabase = getSupabase();
  const stripe = getStripe();

  const { data: cleaner } = await supabase
    .from('cleaners')
    .select('stripe_account_id, name')
    .eq('id', job.assigned_cleaner_id)
    .single();

  if (!cleaner?.stripe_account_id) {
    return { ok: false, error: 'Cleaner has no Stripe account connected.' };
  }

  const amountCents = Math.round(Number(job.cleaner_payout) * 100);

  let transfer;
  try {
    transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: cleaner.stripe_account_id,
      description: `Payout: ${job.property_name} — ${job.checkout_date}`,
      metadata: { job_id: job.id, cleaner_id: job.assigned_cleaner_id },
    }, { idempotencyKey: `payout_${job.id}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Stripe transfer failed.';
    return { ok: false, error: msg };
  }

  const now = new Date().toISOString();
  const { error: dbErr } = await supabase.from('cleaning_jobs').update({
    payout_sent_at: now,
    stripe_transfer_id: transfer.id,
    updated_at: now,
  }).eq('id', job.id);
  if (dbErr) {
    return { ok: false, error: `Transfer sent but DB update failed: ${dbErr.message}` };
  }

  return { ok: true, payout: Number(job.cleaner_payout) };
}

// ── HANDLER ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel sends Authorization: Bearer {CRON_SECRET} for cron jobs
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const payoutCutoff = addBusinessDays(today, -2); // jobs charged on or before this date are ready

  const results = {
    chargesAttempted: 0,
    chargesSucceeded: 0,
    chargeFailed: [] as { jobId: string; property: string; error: string }[],
    payoutsAttempted: 0,
    payoutsSucceeded: 0,
    payoutFailed: [] as { jobId: string; property: string; error: string }[],
  };

  // ── Step 1: charge clients whose checkout is today ────────────────────────
  const { data: toCharge } = await supabase
    .from('cleaning_jobs')
    .select('*')
    .eq('checkout_date', today)
    .in('status', ['accepted', 'in_progress', 'completed'])
    .is('charged_at', null);

  for (const job of toCharge ?? []) {
    results.chargesAttempted++;
    const r = await autoCharge(job);
    if (r.ok) {
      results.chargesSucceeded++;
    } else {
      results.chargeFailed.push({ jobId: job.id, property: job.property_name, error: r.error ?? 'unknown' });
    }
  }

  // ── Step 2: pay cleaners for jobs charged 2+ business days ago ────────────
  // Find jobs where charged_at date portion <= payoutCutoff and payout not yet sent
  const { data: toPay } = await supabase
    .from('cleaning_jobs')
    .select('*')
    .lte('charged_at', payoutCutoff + 'T23:59:59Z')
    .is('payout_sent_at', null)
    .not('charged_at', 'is', null)
    .not('assigned_cleaner_id', 'is', null)
    .not('status', 'in', '("cancelled")')
    .gt('cleaner_payout', 0);

  for (const job of toPay ?? []) {
    results.payoutsAttempted++;
    const r = await autoPayout(job);
    if (r.ok) {
      results.payoutsSucceeded++;
    } else {
      results.payoutFailed.push({ jobId: job.id, property: job.property_name, error: r.error ?? 'unknown' });
    }
  }

  // ── Notify admin if anything happened ────────────────────────────────────
  const total = results.chargesAttempted + results.payoutsAttempted;
  if (total > 0) {
    const hasErrors = results.chargeFailed.length > 0 || results.payoutFailed.length > 0;
    const subject = hasErrors
      ? `⚠️ Cleaning automation ran with errors — ${today}`
      : `✅ Cleaning automation complete — ${today}`;

    const errorRows = [
      ...results.chargeFailed.map(e => `<tr><td style="padding:4px 8px;color:#ef4444">Charge failed</td><td style="padding:4px 8px">${e.property}</td><td style="padding:4px 8px;color:#94a3b8">${e.error}</td></tr>`),
      ...results.payoutFailed.map(e => `<tr><td style="padding:4px 8px;color:#ef4444">Payout failed</td><td style="padding:4px 8px">${e.property}</td><td style="padding:4px 8px;color:#94a3b8">${e.error}</td></tr>`),
    ].join('');

    await resend.emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: 'ejretreats1@gmail.com',
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc">
          <div style="background:white;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
            <h2 style="margin:0 0 16px;color:#1e293b">🧹 Daily Cleaning Automation — ${today}</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
              <tr style="background:#f1f5f9">
                <td style="padding:8px;font-weight:600;color:#334155">Charges</td>
                <td style="padding:8px;color:#16a34a">${results.chargesSucceeded} succeeded</td>
                <td style="padding:8px;color:${results.chargeFailed.length > 0 ? '#dc2626' : '#94a3b8'}">${results.chargeFailed.length} failed</td>
              </tr>
              <tr>
                <td style="padding:8px;font-weight:600;color:#334155">Payouts</td>
                <td style="padding:8px;color:#16a34a">${results.payoutsSucceeded} succeeded</td>
                <td style="padding:8px;color:${results.payoutFailed.length > 0 ? '#dc2626' : '#94a3b8'}">${results.payoutFailed.length} failed</td>
              </tr>
            </table>
            ${errorRows ? `
            <h3 style="margin:16px 0 8px;color:#dc2626;font-size:14px">Errors to investigate:</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              ${errorRows}
            </table>` : ''}
          </div>
        </div>
      `,
    }).catch(() => {});
  }

  return res.status(200).json(results);
}

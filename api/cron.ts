import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Stripe from 'stripe';

export const config = { maxDuration: 60 };

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}
function getSupabaseAdmin() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
const resend = new Resend(process.env.RESEND_API_KEY);

// ── WARMUP ────────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function dailyTarget(days: number): number {
  if (days <= 7)  return 12;
  if (days <= 14) return 25;
  if (days <= 21) return 50;
  if (days <= 28) return 87;
  if (days <= 35) return 125;
  if (days <= 42) return 175;
  return 200;
}

const WARMUP_TEMPLATES = [
  { subject: 'Quick question',       body: `Hi,\n\nHope things are going well on your end. Had a quick question for you — do you have a few minutes this week?\n\nLet me know what works.\n\nBest,\nEthan` },
  { subject: 'Following up',         body: `Hi,\n\nJust wanted to follow up and make sure this landed in your inbox. Feel free to reply whenever you get a chance.\n\nThanks,\nEthan` },
  { subject: 'Hey!',                 body: `Hey,\n\nWanted to reach out and say hello. Hope things are good on your end — would love to catch up soon.\n\nTalk soon,\nEthan` },
  { subject: 'Checking in',          body: `Hi,\n\nJust checking in to see how things are going. We've been busy on our end and wanted to stay in touch.\n\nHope to connect soon!\n\nEthan` },
  { subject: 'Update from E&J',      body: `Hi,\n\nThings have been moving fast on our end — lots of exciting stuff happening with E&J Retreats. Wanted to keep you in the loop.\n\nMore soon!\n\nEthan` },
  { subject: 'Wanted to reach out',  body: `Hi,\n\nBeen meaning to reach out for a while now. How have things been? Would love to connect when you have a moment.\n\nBest,\nEthan` },
  { subject: 'Quick note',           body: `Hi,\n\nJust a quick note — wanted to make sure we stay connected. Reply whenever you get a chance.\n\nThanks!\nEthan` },
  { subject: 'Hope you\'re well',    body: `Hi,\n\nHope you and yours are doing well! Just reaching out to stay in touch. Looking forward to catching up sometime.\n\nWarmly,\nEthan` },
  { subject: 'Connecting',           body: `Hi,\n\nWanted to reach out and stay connected. Things are going great with the properties and I'd love to fill you in.\n\nLet's catch up soon!\n\nEthan` },
  { subject: 'A note from Ethan',    body: `Hi,\n\nJust wanted to send a quick note your way. Been thinking about reaching out and finally doing it!\n\nHope to hear from you.\n\nEthan` },
  { subject: 'Staying in touch',     body: `Hi,\n\nJust reaching out to stay in touch. Hope things are great on your end — would love to connect.\n\nBest,\nEthan` },
  { subject: 'Touching base',        body: `Hi,\n\nWanted to touch base and see how things are going. We've had a great stretch lately and wanted to share the energy.\n\nHope you're doing well!\n\nEthan` },
];

function buildWarmupHtml(body: string, fromName: string): string {
  const escaped = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:32px">
<p style="margin:0;font-size:15px;line-height:1.7;color:#1a1a1a">${escaped}</p>
<hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0 16px">
<p style="margin:0;font-size:12px;color:#94a3b8">${fromName} · ejretreats.com</p>
</div></body></html>`;
}

interface WarmupRow {
  id: string; email: string; name: string; start_date: string; status: string; seed_emails: string[] | null;
}

async function runWarmup(res: VercelResponse) {
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data: entries, error } = await sb.from('warmup_addresses').select('*').neq('status', 'paused');
  if (error) return res.status(500).json({ error: error.message });

  const results: { email: string; sent: number; skipped: string }[] = [];

  for (const entry of (entries as WarmupRow[])) {
    const seeds = (entry.seed_emails ?? []).filter(Boolean);
    if (!seeds.length) { results.push({ email: entry.email, sent: 0, skipped: 'no seed addresses' }); continue; }

    const days    = daysSince(entry.start_date);
    const target  = dailyTarget(days);
    const perSeed = Math.min(5, Math.ceil(target / seeds.length));
    const displayName = entry.name || 'E&J Retreats';
    const from    = `${displayName} <${entry.email}>`;

    const batch: { from: string; to: string[]; subject: string; html: string }[] = [];
    let idx = 0;
    for (const seed of seeds) {
      for (let i = 0; i < perSeed; i++) {
        const tpl = WARMUP_TEMPLATES[(days + idx++) % WARMUP_TEMPLATES.length];
        batch.push({ from, to: [seed], subject: tpl.subject, html: buildWarmupHtml(tpl.body, displayName) });
      }
    }

    try {
      const { data: sent } = await resend.batch.send(batch);
      const sentIds = (sent ?? []).map((s: { id: string }) => s.id).filter(Boolean);
      if (sentIds.length) {
        await sb.from('email_logs').insert(
          sentIds.map((id, i) => ({ id, email_type: 'warmup', recipient_email: batch[i]?.to[0] ?? '', subject: batch[i]?.subject ?? '', sent_at: new Date().toISOString(), status: 'sent' }))
        );
      }
      results.push({ email: entry.email, sent: sentIds.length, skipped: '' });
    } catch (e) {
      results.push({ email: entry.email, sent: 0, skipped: String(e) });
    }

    if (days >= 42 && entry.status !== 'ready') {
      await sb.from('warmup_addresses').update({ status: 'ready' }).eq('id', entry.id);
    }
  }

  return res.status(200).json({ date: today, results });
}

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

// ── ICAL SYNC ─────────────────────────────────────────────────────────────────

async function runIcalSync(res: VercelResponse) {
  const supabase = getSupabase();
  const { data: configs, error } = await supabase
    .from('cleaning_property_configs')
    .select('id, property_id, property_name, cleaning_fee, ical_urls')
    .not('ical_urls', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const toSync = (configs ?? []).filter((c: { ical_urls: unknown[] }) => Array.isArray(c.ical_urls) && c.ical_urls.length > 0);
  if (!toSync.length) return res.status(200).json({ synced: 0, message: 'No iCal URLs configured.' });

  const { syncPropertyIcal } = await import('./_ical');
  const results = [];
  for (const config of toSync) {
    const r = await syncPropertyIcal(supabase, config);
    results.push({ property: config.property_name, ...r });
  }

  return res.status(200).json({ synced: toSync.length, results });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel sends Authorization: Bearer {CRON_SECRET} for cron jobs
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ?job=warmup → email warmup sequences; ?job=ical-sync → iCal calendar sync; default → charge/payout
  if (req.query.job === 'warmup') return runWarmup(res);
  if (req.query.job === 'ical-sync') return runIcalSync(res);

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

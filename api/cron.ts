import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { syncPropertyIcal } from './_ical';

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
function getResend() { return new Resend(process.env.RESEND_API_KEY); }

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
      const { data: sent } = await getResend().batch.send(batch);
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
    }, { idempotencyKey: `charge_${job.id}_${Date.now()}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Stripe charge failed.';
    return { ok: false, error: msg };
  }

  const now = new Date().toISOString();
  const { error: dbErr } = await supabase.from('cleaning_jobs').update({
    charged_at: now,
    stripe_charge_id: paymentIntent.id,
    status: 'completed',
    completed_at: now,
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
    .select('stripe_account_id, name, payout_info')
    .eq('id', job.assigned_cleaner_id)
    .single();

  if (!cleaner?.stripe_account_id) {
    // No Stripe — send actionable manual payment reminder then mark as sent so it doesn't repeat
    const payoutRow = cleaner?.payout_info
      ? `<tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Pay via</td><td style="padding:6px 12px;color:#1e40af;font-weight:700">${cleaner.payout_info}</td></tr>`
      : `<tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Pay via</td><td style="padding:6px 12px;color:#dc2626">⚠️ No payout info on file — update cleaner profile</td></tr>`;
    await getResend().emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: 'ejretreats1@gmail.com',
      subject: `💳 Manual Payout Due — Pay ${cleaner?.name ?? 'cleaner'} $${job.cleaner_payout}`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#dc2626;margin:0 0 12px">Manual Payment Required</h2>
        <p style="color:#334155;margin:0 0 16px">${cleaner?.name ?? 'A cleaner'} completed a job and needs to be paid manually (no Stripe account connected).</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:16px">
          <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Cleaner</td><td style="padding:6px 12px">${cleaner?.name ?? job.assigned_cleaner_id}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Amount Due</td><td style="padding:6px 12px;font-size:22px;color:#16a34a;font-weight:700">$${job.cleaner_payout}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Property</td><td style="padding:6px 12px">${job.property_name}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5">Job Date</td><td style="padding:6px 12px">${job.checkout_date}</td></tr>
          ${payoutRow}
        </table>
        <p style="color:#94a3b8;font-size:12px">This reminder won't repeat — the job is marked as paid in the system. Send the cleaner their money and you're all set.</p>
      </div>`,
    }).catch(() => {});
    const now = new Date().toISOString();
    await supabase.from('cleaning_jobs').update({ payout_sent_at: now, updated_at: now }).eq('id', job.id);
    return { ok: true, payout: Number(job.cleaner_payout) };
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

  // Fetch configs + assigned_cleaners so we can auto-dispatch new jobs
  const { data: configs, error } = await supabase
    .from('cleaning_property_configs')
    .select('id, property_id, property_name, cleaning_fee, ical_urls, assigned_cleaners')
    .not('ical_urls', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toSync = (configs ?? []).filter((c: any) => Array.isArray(c.ical_urls) && c.ical_urls.length > 0);
  if (!toSync.length) return res.status(200).json({ synced: 0, message: 'No iCal URLs configured.' });

  // Load active cleaners once for name/email lookup
  const { data: cleanerRows } = await supabase.from('cleaners').select('id, name, email').eq('status', 'active');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanerMap = new Map<string, { id: string; name: string; email: string }>((cleanerRows ?? []).map((c: any) => [c.id, c]));

  const results = [];
  let totalDispatched = 0;

  for (const config of toSync) {
    const syncResult = await syncPropertyIcal(supabase, config);
    results.push({ property: config.property_name, ...syncResult });

    if (syncResult.created === 0) continue;

    // Resolve active assigned cleaners for this property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roster = ((config.assigned_cleaners ?? []) as Array<{ id: string; payout: number }>)
      .map(ac => {
        const profile = cleanerMap.get(ac.id);
        return profile ? { id: profile.id, name: profile.name, email: profile.email, payout: ac.payout ?? 0 } : null;
      })
      .filter((c): c is { id: string; name: string; email: string; payout: number } => !!c);

    if (roster.length === 0) continue; // no roster yet — jobs stay pending for manual dispatch

    // Dispatch every pending ical job for this property that hasn't been dispatched yet
    const { data: pendingJobs } = await supabase
      .from('cleaning_jobs')
      .select('id, property_name, checkout_date, checkin_date, guest_name, notes')
      .eq('property_id', config.property_id)
      .eq('status', 'pending')
      .eq('source', 'ical')
      .is('dispatch_tokens', null);

    const base = 'https://crm-nine-delta-37.vercel.app';

    for (const job of pendingJobs ?? []) {
      // Build one unique token per cleaner in priority order
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dispatchTokens: Record<string, any> = {};
      const dispatchOrder: string[] = [];
      const cleanerTokens = roster.map(c => {
        const token = randomUUID();
        dispatchTokens[token] = { cleanerId: c.id, cleanerName: c.name, cleanerEmail: c.email, payout: c.payout };
        dispatchOrder.push(token);
        return { cleaner: c, token };
      });

      // Mark as dispatched — sequential: only email #1 priority cleaner
      await supabase.from('cleaning_jobs').update({
        status: 'dispatched',
        dispatched_at: new Date().toISOString(),
        dispatch_tokens: dispatchTokens,
        dispatch_order: dispatchOrder,
        dispatch_index: 0,
      }).eq('id', job.id);

      const dateLabel = new Date(job.checkout_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });

      const { cleaner: first, token: firstToken } = cleanerTokens[0];
      const portalLink = `${base}?cleaner=${job.id}:${firstToken}`;
      await getResend().emails.send({
        from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
        to: first.email,
        subject: `🧹 Cleaning Job Available: ${job.property_name} – ${dateLabel}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
            <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
              <h2 style="color:#1e40af;margin:0 0 8px;font-size:20px">🧹 Cleaning Job Available</h2>
              <p style="color:#334155;margin:0 0 20px">Hi ${first.name},</p>
              <p style="color:#334155;margin:0 0 16px">A cleaning job is available for one of your assigned properties. Tap the button below to accept or pass.</p>
              <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:0 0 20px">
                <table style="width:100%;border-collapse:collapse">
                  <tr><td style="padding:4px 0;color:#64748b;font-size:14px;width:130px">Property</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${job.property_name}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;font-size:14px">Cleaning Date</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${dateLabel}</td></tr>
                  ${job.checkin_date ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Next Check-in</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${new Date(job.checkin_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</td></tr>` : ''}
                  ${job.guest_name ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Departing Guest</td><td style="padding:4px 0;font-weight:600;color:#0f172a;font-size:14px">${job.guest_name}</td></tr>` : ''}
                  ${first.payout ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px">Your Payout</td><td style="padding:4px 0;font-weight:700;color:#16a34a;font-size:18px">$${first.payout}</td></tr>` : ''}
                  ${job.notes ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px;vertical-align:top">Notes</td><td style="padding:4px 0;color:#0f172a;font-size:14px">${job.notes}</td></tr>` : ''}
                </table>
              </div>
              <div style="text-align:center;margin:24px 0">
                <a href="${portalLink}" style="background:#1e40af;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
                  View &amp; Accept Job
                </a>
              </div>
              <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">— E&amp;J Retreats</p>
            </div>
          </div>
        `,
      }).catch(() => {});

      totalDispatched++;
    }
  }

  return res.status(200).json({ synced: toSync.length, dispatched: totalDispatched, results });
}

// ── CAMPAIGN AUTO-SEND ────────────────────────────────────────────────────────

function replaceTokensServer(text: string, r: { name: string; email: string; propertyAddress?: string; company?: string }): string {
  const firstName = (r.name ?? '').split(' ')[0] || r.name || 'there';
  return text
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{full_name\}\}/gi,  r.name ?? '')
    .replace(/\{\{property\}\}/gi,   r.propertyAddress ?? r.company ?? '')
    .replace(/\{\{company\}\}/gi,    r.company ?? r.propertyAddress ?? '')
    .replace(/\{\{email\}\}/gi,      r.email ?? '');
}

function buildEmailHtmlServer(bodyText: string, fromName: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = bodyText.split(/\n{2,}/).filter(Boolean);
  const bodyHtml = paragraphs
    .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1a1a1a">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border-radius:8px;padding:36px 32px;border:1px solid #e2e8f0">
${bodyHtml}
<hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 20px">
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5">${esc(fromName)}</p>
</div></div></body></html>`;
}

async function runCampaignSend(res: VercelResponse) {
  const sb = getSupabase();
  const resend = getResend();
  const now = new Date().toISOString();

  const baseFrom = process.env.NEWSLETTER_FROM_EMAIL ?? 'E&J Retreats <hello@ejretreats.com>';
  const fromEmailBase = baseFrom.match(/<([^>]+)>/)?.[1] ?? baseFrom;

  // Fetch all active campaigns
  const { data: campaigns, error: campErr } = await sb
    .from('lead_campaigns').select('*').eq('status', 'active');
  if (campErr) return res.status(500).json({ error: campErr.message });
  if (!campaigns?.length) return res.status(200).json({ message: 'No active campaigns.', campaignsSent: 0 });

  // Bulk-fetch all possible recipients across all campaigns
  const allLeadIds    = [...new Set((campaigns as any[]).flatMap((c: any) => c.lead_ids    ?? []))];
  const allContactIds = [...new Set((campaigns as any[]).flatMap((c: any) => c.contact_ids ?? []))];
  const allScrapedIds = [...new Set((campaigns as any[]).flatMap((c: any) => c.scraped_lead_ids ?? []))];

  const [{ data: leadsRows }, { data: contactRows }, { data: scrapedRows }] = await Promise.all([
    allLeadIds.length    ? sb.from('leads').select('id,name,email,property_address').in('id', allLeadIds)           : { data: [] },
    allContactIds.length ? sb.from('contacts').select('id,name,email').in('id', allContactIds)                       : { data: [] },
    allScrapedIds.length ? sb.from('cleaning_leads').select('id,name,email,company').in('id', allScrapedIds)         : { data: [] },
  ]);

  const leadMap    = new Map((leadsRows    ?? []).map((r: any) => [r.id, r]));
  const contactMap = new Map((contactRows  ?? []).map((r: any) => [r.id, r]));
  const scrapedMap = new Map((scrapedRows  ?? []).map((r: any) => [r.id, r]));

  const results: any[] = [];

  for (const camp of (campaigns as any[])) {
    const sentLeadSet    = new Set(camp.sent_lead_ids    ?? []);
    const sentContactSet = new Set(camp.sent_contact_ids ?? []);
    const sentScrapedSet = new Set(camp.sent_scraped_lead_ids ?? []);
    const dailyLimit     = camp.daily_limit ?? 20;

    // Build pending list in order: leads, contacts, scraped
    const pending: Array<{ type: 'lead' | 'contact' | 'scraped'; id: string; name: string; email: string; extra: string }> = [];
    for (const id of (camp.lead_ids ?? [])) {
      if (sentLeadSet.has(id)) continue;
      const l = leadMap.get(id);
      if (l?.email) pending.push({ type: 'lead', id, name: l.name ?? '', email: l.email, extra: l.property_address ?? '' });
    }
    for (const id of (camp.contact_ids ?? [])) {
      if (sentContactSet.has(id)) continue;
      const c = contactMap.get(id);
      if (c?.email) pending.push({ type: 'contact', id, name: c.name ?? '', email: c.email, extra: '' });
    }
    for (const id of (camp.scraped_lead_ids ?? [])) {
      if (sentScrapedSet.has(id)) continue;
      const l = scrapedMap.get(id);
      if (l?.email) pending.push({ type: 'scraped', id, name: l.name ?? '', email: l.email, extra: l.company ?? '' });
    }

    const batch = pending.slice(0, dailyLimit);
    if (!batch.length) {
      results.push({ campaign: camp.name, sent: 0, note: 'all_sent' });
      // Mark completed if truly nothing left
      const totalSent = sentLeadSet.size + sentContactSet.size + sentScrapedSet.size;
      const totalAll  = (camp.lead_ids?.length ?? 0) + (camp.contact_ids?.length ?? 0) + (camp.scraped_lead_ids?.length ?? 0);
      if (totalSent >= totalAll && totalAll > 0) {
        await sb.from('lead_campaigns').update({ status: 'completed', updated_at: now }).eq('id', camp.id);
      }
      continue;
    }

    const from = `${camp.from_name || 'E&J Retreats'} <${fromEmailBase}>`;
    const emailBatch = batch.map(r => {
      const ctx = r.type === 'scraped'
        ? { name: r.name, email: r.email, company: r.extra }
        : { name: r.name, email: r.email, propertyAddress: r.extra };
      return {
        from,
        to:      r.email,
        subject: replaceTokensServer(camp.subject ?? '', ctx),
        html:    buildEmailHtmlServer(replaceTokensServer(camp.body ?? '', ctx), camp.from_name ?? 'E&J Retreats'),
        ...(camp.reply_to && { reply_to: camp.reply_to }),
      };
    });

    let sent = 0;
    try {
      const { data: bd } = await resend.batch.send(emailBatch) as { data: Array<{ id: string }> | null };
      sent = emailBatch.length;
      if (bd?.length) {
        const logRows = bd.map((e, i) => ({
          id:              e.id,
          email_type:      'outreach',
          recipient_email: batch[i]?.email ?? '',
          recipient_name:  batch[i]?.name  ?? null,
          subject:         emailBatch[i]?.subject ?? '',
          sent_at:         now,
          status:          'sent',
        })).filter(r => r.id);
        if (logRows.length) await sb.from('email_logs').insert(logRows).catch(() => {});
      }
    } catch (e) {
      results.push({ campaign: camp.name, sent: 0, error: String(e) });
      continue;
    }

    // Update sent IDs + status
    const newSentLeadIds    = [...(camp.sent_lead_ids    ?? []), ...batch.filter(r => r.type === 'lead').map(r => r.id)];
    const newSentContactIds = [...(camp.sent_contact_ids ?? []), ...batch.filter(r => r.type === 'contact').map(r => r.id)];
    const newSentScrapedIds = [...(camp.sent_scraped_lead_ids ?? []), ...batch.filter(r => r.type === 'scraped').map(r => r.id)];
    const totalSent = newSentLeadIds.length + newSentContactIds.length + newSentScrapedIds.length;
    const totalAll  = (camp.lead_ids?.length ?? 0) + (camp.contact_ids?.length ?? 0) + (camp.scraped_lead_ids?.length ?? 0);
    const allDone   = totalSent >= totalAll;

    await sb.from('lead_campaigns').update({
      sent_lead_ids:        newSentLeadIds,
      sent_contact_ids:     newSentContactIds,
      sent_scraped_lead_ids: newSentScrapedIds,
      status:      allDone ? 'completed' : 'active',
      updated_at:  now,
    }).eq('id', camp.id);

    // Auto-enroll in follow-up sequence
    if ((camp.follow_up_steps ?? []).length > 0 && camp.linked_sequence_id) {
      const { data: seq } = await sb.from('lead_campaign_sequences').select('*').eq('id', camp.linked_sequence_id).maybeSingle();
      if (seq?.steps?.length) {
        const steps = (seq.steps as Array<{ step_number: number; delay_days: number }>).sort((a, b) => a.delay_days - b.delay_days);
        const firstStep = steps[0];
        const { data: existing } = await sb.from('lead_campaign_sequence_enrollments').select('email').eq('sequence_id', seq.id);
        const existingSet = new Set((existing ?? []).map((e: any) => e.email.toLowerCase()));
        const toEnroll = batch
          .filter(r => !existingSet.has(r.email.toLowerCase()))
          .map(r => {
            const nextSendAt = new Date(new Date(now).getTime() + firstStep.delay_days * 86400000);
            return {
              id:                 `lenr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              sequence_id:        seq.id,
              source_campaign_id: camp.id,
              email:              r.email,
              lead_name:          r.name ?? null,
              from_name:          camp.from_name ?? null,
              reply_to:           camp.reply_to  ?? null,
              enrolled_at:        now,
              next_step:          firstStep.step_number,
              next_send_at:       nextSendAt.toISOString(),
              status:             'active',
            };
          });
        if (toEnroll.length) {
          for (let i = 0; i < toEnroll.length; i += 500) {
            await sb.from('lead_campaign_sequence_enrollments').insert(toEnroll.slice(i, i + 500)).catch(() => {});
          }
        }
      }
    }

    results.push({ campaign: camp.name, sent, allDone });
  }

  // Process any due sequence follow-up emails
  let seqSent = 0;
  const { data: due } = await sb
    .from('lead_campaign_sequence_enrollments')
    .select('*').eq('status', 'active').lte('next_send_at', now).limit(200);
  if (due?.length) {
    const seqIds = [...new Set((due as any[]).map((e: any) => e.sequence_id))];
    const { data: seqs } = await sb.from('lead_campaign_sequences').select('*').in('id', seqIds);
    const allTplIds = [...new Set((seqs ?? []).flatMap((s: any) => (s.steps ?? []).map((st: any) => st.template_id).filter(Boolean)))];
    const { data: tmpls } = allTplIds.length ? await sb.from('lead_campaign_templates').select('*').in('id', allTplIds) : { data: [] };
    const tplMap = new Map((tmpls ?? []).map((t: any) => [t.id, t]));

    for (const enr of (due as any[])) {
      const seq = (seqs ?? []).find((s: any) => s.id === enr.sequence_id);
      if (!seq) continue;
      const steps: Array<{ step_number: number; template_id: string; delay_days: number }> = seq.steps ?? [];
      const step = steps.find((s: any) => s.step_number === enr.next_step);
      if (!step) {
        await sb.from('lead_campaign_sequence_enrollments').update({ status: 'completed', next_send_at: null }).eq('id', enr.id);
        continue;
      }
      const tmpl = tplMap.get(step.template_id);
      if (!tmpl) continue;

      const ctx = { name: enr.lead_name ?? '', email: enr.email ?? '' };
      const subject = replaceTokensServer(tmpl.subject, ctx);
      const body    = replaceTokensServer(tmpl.body, ctx);
      const html    = buildEmailHtmlServer(body, enr.from_name ?? 'E&J Retreats');
      const from    = `${enr.from_name ?? 'E&J Retreats'} <${fromEmailBase}>`;

      try {
        const { data: rd } = await resend.emails.send({
          from, to: enr.email, subject, html,
          ...(enr.reply_to && { reply_to: enr.reply_to }),
        });
        if (rd?.id) {
          await sb.from('email_logs').insert({
            id: rd.id, email_type: 'lead-sequence',
            recipient_email: enr.email, recipient_name: enr.lead_name ?? null,
            subject, sent_at: now, status: 'sent',
          }).catch(() => {});
        }
        seqSent++;

        const sorted   = [...steps].sort((a, b) => a.delay_days - b.delay_days);
        const nextStep = sorted.find(s => s.step_number > enr.next_step);
        if (nextStep) {
          const nextAt = new Date(new Date(enr.enrolled_at).getTime() + nextStep.delay_days * 86400000);
          await sb.from('lead_campaign_sequence_enrollments').update({ next_step: nextStep.step_number, next_send_at: nextAt.toISOString() }).eq('id', enr.id);
        } else {
          await sb.from('lead_campaign_sequence_enrollments').update({ status: 'completed', next_send_at: null }).eq('id', enr.id);
        }
      } catch { /* continue */ }
    }
  }

  // Notify admin if anything sent
  const totalSentAll = results.reduce((s, r) => s + (r.sent ?? 0), 0) + seqSent;
  if (totalSentAll > 0) {
    await getResend().emails.send({
      from: 'E&J Retreats CRM <cleaning@ejretreats.com>',
      to: 'ejretreats1@gmail.com',
      subject: `📧 Daily campaign send complete — ${results.filter(r => r.sent > 0).length} campaigns, ${totalSentAll} emails`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 16px;color:#1e293b">Daily Campaign Summary</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${results.map(r => `<tr><td style="padding:6px 0;color:#334155">${r.campaign}</td><td style="padding:6px 0;color:${r.sent > 0 ? '#16a34a' : '#94a3b8'};font-weight:600">${r.sent} sent</td><td style="padding:6px 0;color:#94a3b8">${r.allDone ? 'Completed' : r.note ?? ''}</td></tr>`).join('')}
        </table>
        ${seqSent > 0 ? `<p style="margin:16px 0 0;color:#334155">+ ${seqSent} follow-up sequence emails sent.</p>` : ''}
      </div>`,
    }).catch(() => {});
  }

  return res.status(200).json({ campaigns: results, sequenceEmailsSent: seqSent });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel sends Authorization: Bearer {CRON_SECRET} for cron jobs
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ?job=warmup → email warmup sequences; ?job=ical-sync → iCal calendar sync; default → charge/payout
  if (req.query.job === 'warmup')         return runWarmup(res);
  if (req.query.job === 'ical-sync')      return runIcalSync(res);
  if (req.query.job === 'campaign-send')  return runCampaignSend(res);

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const twoBizDaysAgo = addBusinessDays(today, -2);

  // Any job charged on or before the end of 2 business days ago qualifies.
  // Using end-of-day prevents the cutoff from landing before the charge
  // timestamp (the charge cron also runs at 17:00 UTC so a time-based
  // cutoff of "now - 2h" was always earlier than charged_at).
  const payoutCutoffTs = twoBizDaysAgo + 'T23:59:59.999Z';

  const results = {
    chargesAttempted: 0,
    chargesSucceeded: 0,
    chargeFailed: [] as { jobId: string; property: string; error: string }[],
    payoutsAttempted: 0,
    payoutsSucceeded: 0,
    payoutFailed: [] as { jobId: string; property: string; error: string }[],
  };

  // ── Step 0: backfill — mark already-charged accepted/in_progress jobs as completed ─
  // Handles jobs that were charged before this auto-complete logic was added
  await supabase
    .from('cleaning_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('status', ['accepted', 'in_progress'])
    .not('charged_at', 'is', null)
    .lt('checkout_date', today);

  // ── Step 1a: charge clients whose checkout is today ───────────────────────
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

  // ── Step 1b: charge past-due jobs (checkout date already passed, charge missed) ─
  const { data: pastDue } = await supabase
    .from('cleaning_jobs')
    .select('*')
    .in('status', ['accepted', 'in_progress'])
    .lt('checkout_date', today)
    .is('charged_at', null);

  for (const job of pastDue ?? []) {
    results.chargesAttempted++;
    const r = await autoCharge(job);
    if (r.ok) {
      results.chargesSucceeded++;
    } else {
      results.chargeFailed.push({ jobId: job.id, property: job.property_name, error: r.error ?? 'unknown' });
    }
  }

  // ── Step 2: pay cleaners for jobs completed 2+ business days ago ─────────
  const { data: toPay } = await supabase
    .from('cleaning_jobs')
    .select('*')
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .lte('completed_at', payoutCutoffTs)
    .is('payout_sent_at', null)
    .not('assigned_cleaner_id', 'is', null)
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

    await getResend().emails.send({
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

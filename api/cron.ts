import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { APP_URL, ADMIN_EMAIL, escapeHtml } from './_auth';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { syncPropertyIcal } from './_ical';
import { syncUplistingJobs, dispatchTick } from './_jobs';
import { sendMorningReminders, sendSms } from './_sms';
import { chargeJob, payoutJob, findChargeableJobs, findPayableJobs } from './_billing';

export const config = { maxDuration: 60 };

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
  return createClient(process.env.VITE_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

// ── HANDLER ───────────────────────────────────────────────────────────────────

// ── BOOKING SYNC (daily) ──────────────────────────────────────────────────────
// iCal feeds + Uplisting → cleaning_jobs (create / move / cancel), then one
// dispatch tick so new jobs inside the window go out immediately.

async function runBookingSync(res: VercelResponse) {
  const supabase = getSupabase();
  const resend = getResend();
  const summary: Record<string, unknown> = {};
  const errors: string[] = [];

  // 1. iCal properties
  const ical = { properties: 0, created: 0, updated: 0, cancelled: 0 };
  try {
    const { data: configs, error } = await supabase.from('cleaning_property_configs').select('*').not('ical_urls', 'is', null);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const config of (configs ?? []).filter((c: any) => Array.isArray(c.ical_urls) && c.ical_urls.length > 0)) {
      ical.properties++;
      try {
        const r = await syncPropertyIcal(supabase, config, resend);
        ical.created += r.created; ical.updated += r.updated; ical.cancelled += r.cancelled;
        errors.push(...r.errors.map(e => `${config.property_name}: ${e}`));
      } catch (e) {
        errors.push(`${config.property_name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`iCal: ${e instanceof Error ? e.message : String(e)}`);
  }
  summary.ical = ical;

  // 2. Uplisting properties (API key lives in settings → id 'default')
  try {
    const { data: settings } = await supabase.from('settings').select('uplisting_api_key').eq('id', 'default').maybeSingle();
    const apiKey = settings?.uplisting_api_key as string | undefined;
    if (apiKey) {
      const r = await syncUplistingJobs(supabase, resend, apiKey);
      summary.uplisting = { properties: r.properties, created: r.created, updated: r.updated, cancelled: r.cancelled };
      errors.push(...r.errors);
    } else {
      summary.uplisting = 'no API key';
    }
  } catch (e) {
    errors.push(`Uplisting: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Offer anything new that is inside the dispatch window
  try {
    const tick = await dispatchTick(supabase, resend);
    summary.dispatch = tick;
    errors.push(...tick.errors);
  } catch (e) {
    errors.push(`dispatch: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 4. Morning-of text to cleaners with a clean today (this cron runs ≈7am Eastern)
  try {
    const sms = await sendMorningReminders(supabase, sendSms);
    summary.morningSms = sms;
    errors.push(...sms.errors.map(e => `SMS ${e}`));
  } catch (e) {
    errors.push(`SMS: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (errors.length) {
    await resend.emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>', to: ADMIN_EMAIL,
      subject: `⚠️ Booking sync: ${errors.length} issue${errors.length === 1 ? '' : 's'}`,
      html: `<div style="font-family:sans-serif;padding:24px"><p>The daily booking sync finished with issues:</p><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul><pre style="font-size:12px;color:#64748b">${escapeHtml(JSON.stringify(summary, null, 2))}</pre></div>`,
    }).catch(() => {});
  }
  return res.status(200).json({ ok: true, ...summary, errors });
}

// ── DISPATCH TICK (hourly) ────────────────────────────────────────────────────

async function runDispatchTick(res: VercelResponse) {
  try {
    const result = await dispatchTick(getSupabase(), getResend());
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
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
      to: ADMIN_EMAIL,
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
  // Vercel sends Authorization: Bearer {CRON_SECRET} for cron jobs. Fail closed
  // if the secret isn't configured, otherwise "Bearer undefined" would pass.
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not configured' });
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ?job=warmup → email warmup sequences; ?job=ical-sync → iCal calendar sync; default → charge/payout
  if (req.query.job === 'warmup')         return runWarmup(res);
  if (req.query.job === 'ical-sync')      return runBookingSync(res);
  if (req.query.job === 'dispatch-tick')  return runDispatchTick(res);
  if (req.query.job === 'campaign-send')  return runCampaignSend(res);

  try {
    return await runBilling(res);
  } catch (e) {
    // Never fail silently: the admin hears about a crashed billing run.
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    await getResend().emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>', to: ADMIN_EMAIL,
      subject: '🚨 Cleaning billing cron crashed',
      html: `<div style="font-family:sans-serif;padding:24px"><p>The daily charge/payout run threw before finishing. Charges and payouts will be retried on the next run.</p><pre style="font-size:12px;color:#64748b;white-space:pre-wrap">${escapeHtml(msg)}</pre></div>`,
    }).catch(() => {});
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}

async function runBilling(res: VercelResponse) {
  const supabase = getSupabase();
  const stripe = getStripe();
  const today = new Date().toISOString().slice(0, 10);
  const startedAt = Date.now();
  const BUDGET_MS = 45_000; // leave headroom under the 60s function limit

  const results = {
    chargesAttempted: 0,
    chargesSucceeded: 0,
    chargeFailed: [] as { jobId: string; property: string; error: string; retry: string | null }[],
    payoutsAttempted: 0,
    payoutsSucceeded: 0,
    payoutFailed: [] as { jobId: string; property: string; error: string }[],
    manualPayoutsDue: [] as { jobId: string; property: string; cleaner: string; amount: number; date: string }[],
    awaitingReport: [] as { jobId: string; property: string; cleaner: string; date: string }[],
    gaveUp: [] as { jobId: string; property: string; error: string }[],
    errors: [] as string[],
  };

  // ── Step 1: charge completed jobs that have a submitted report ────────────
  // (first attempts, plus failed ones whose retry time has come)
  for (const job of await findChargeableJobs(supabase)) {
    if (Date.now() - startedAt > BUDGET_MS) { results.errors.push('Ran out of time before charging every job; the rest run tomorrow.'); break; }
    results.chargesAttempted++;
    try {
      const r = await chargeJob(supabase, stripe, job.id, { trigger: 'cron' });
      if (r.ok && !r.skipped) results.chargesSucceeded++;
      else if (!r.ok && !r.skipped) results.chargeFailed.push({ jobId: job.id, property: job.property_name, error: r.error ?? 'unknown', retry: r.willRetryAt ?? null });
    } catch (e) {
      results.chargeFailed.push({ jobId: job.id, property: job.property_name, error: `crashed: ${e instanceof Error ? e.message : String(e)}`, retry: null });
    }
  }

  // ── Step 2: pay cleaners for charged jobs ─────────────────────────────────
  // Payouts normally go out with the charge; this catches cleaners who
  // connected Stripe later and transfers that failed.
  for (const job of await findPayableJobs(supabase)) {
    if (Date.now() - startedAt > BUDGET_MS) { results.errors.push('Ran out of time before paying every cleaner; the rest run tomorrow.'); break; }
    try {
      const r = await payoutJob(supabase, stripe, job.id);
      if (r.status === 'sent') { results.payoutsAttempted++; results.payoutsSucceeded++; }
      else if (r.status === 'failed') { results.payoutsAttempted++; results.payoutFailed.push({ jobId: job.id, property: job.property_name, error: r.error ?? 'unknown' }); }
      else if (r.status === 'manual_due') results.manualPayoutsDue.push({ jobId: job.id, property: job.property_name, cleaner: job.assigned_cleaner_name ?? job.assigned_cleaner_id, amount: Number(job.cleaner_payout), date: job.checkout_date });
    } catch (e) {
      results.payoutsAttempted++;
      results.payoutFailed.push({ jobId: job.id, property: job.property_name, error: `crashed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // ── Step 3: things a human needs to look at ───────────────────────────────
  const { data: noReport } = await supabase
    .from('cleaning_jobs')
    .select('id, property_name, assigned_cleaner_name, checkout_date')
    .in('status', ['accepted', 'in_progress'])
    .lt('checkout_date', today)
    .is('charged_at', null)
    .order('checkout_date', { ascending: true })
    .limit(50);
  results.awaitingReport = (noReport ?? []).map((j: any) => ({ jobId: j.id, property: j.property_name, cleaner: j.assigned_cleaner_name ?? '—', date: j.checkout_date }));

  const { data: exhausted } = await supabase
    .from('cleaning_jobs')
    .select('id, property_name, last_charge_error')
    .eq('charge_status', 'failed')
    .is('next_charge_attempt_at', null)
    .is('charged_at', null)
    .limit(50);
  results.gaveUp = (exhausted ?? []).map((j: any) => ({ jobId: j.id, property: j.property_name, error: j.last_charge_error ?? 'unknown' }));

  // ── Daily summary ─────────────────────────────────────────────────────────
  const attention = results.chargeFailed.length + results.payoutFailed.length + results.manualPayoutsDue.length + results.awaitingReport.length + results.gaveUp.length;
  const total = results.chargesAttempted + results.payoutsAttempted + attention + results.errors.length;
  if (total > 0) {
    const hasErrors = results.chargeFailed.length > 0 || results.payoutFailed.length > 0 || results.gaveUp.length > 0 || results.errors.length > 0;
    const subject = hasErrors
      ? `⚠️ Cleaning billing ran with errors — ${today}`
      : attention > 0
        ? `🧹 Cleaning billing — ${attention} item${attention === 1 ? '' : 's'} need attention — ${today}`
        : `✅ Cleaning billing complete — ${today}`;
    const row = (cells: string[]) => `<tr>${cells.map(c => `<td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">${c}</td>`).join('')}</tr>`;
    const section = (title: string, color: string, rows: string[]) => rows.length
      ? `<h3 style="margin:16px 0 6px;color:${color};font-size:14px">${title}</h3><table style="width:100%;border-collapse:collapse;font-size:13px">${rows.join('')}</table>`
      : '';
    await getResend().emails.send({
      from: 'E&J Retreats Cleaning <cleaning@ejretreats.com>',
      to: ADMIN_EMAIL,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
          <div style="background:white;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
            <h2 style="margin:0 0 16px;color:#1e293b">🧹 Daily Cleaning Billing — ${today}</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
              <tr style="background:#f1f5f9">
                <td style="padding:8px;font-weight:600;color:#334155">Charges</td>
                <td style="padding:8px;color:#16a34a">${results.chargesSucceeded} succeeded</td>
                <td style="padding:8px;color:${results.chargeFailed.length > 0 ? '#dc2626' : '#94a3b8'}">${results.chargeFailed.length} failed</td>
              </tr>
              <tr>
                <td style="padding:8px;font-weight:600;color:#334155">Payouts</td>
                <td style="padding:8px;color:#16a34a">${results.payoutsSucceeded} sent</td>
                <td style="padding:8px;color:${results.payoutFailed.length > 0 ? '#dc2626' : '#94a3b8'}">${results.payoutFailed.length} failed</td>
              </tr>
            </table>
            ${section('Run problems', '#dc2626', results.errors.map(e => row([escapeHtml(e)])))}
            ${section('Charges failed (will retry automatically)', '#dc2626', results.chargeFailed.map(e => row([escapeHtml(e.property), escapeHtml(e.error), e.retry ? `retry ${e.retry.slice(0, 10)}` : 'no more retries'])))}
            ${section('Charges given up — fix the card or charge manually', '#dc2626', results.gaveUp.map(e => row([escapeHtml(e.property), escapeHtml(e.error)])))}
            ${section('Payouts failed', '#dc2626', results.payoutFailed.map(e => row([escapeHtml(e.property), escapeHtml(e.error)])))}
            ${section('Manual payouts due — pay the cleaner, then click “Mark paid” in the CRM', '#b45309', results.manualPayoutsDue.map(m => row([m.cleaner, `$${m.amount}`, m.property, m.date])))}
            ${section('Past checkout, no cleaning report yet (not charged)', '#b45309', results.awaitingReport.map(a => row([a.property, a.cleaner, a.date])))}
            <p style="color:#94a3b8;font-size:12px;margin-top:16px">Clients are charged only after the cleaner submits their report. Payouts go out with the charge via Stripe Connect.</p>
          </div>
        </div>
      `,
    }).catch(() => {});
  }

  return res.status(200).json(results);
}

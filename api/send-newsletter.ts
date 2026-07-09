import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { generateText, Output } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';

const resend = new Resend(process.env.RESEND_API_KEY);

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

async function logEmails(
  ids: string[],
  emailType: string,
  recipients: { email: string; name: string }[],
  subject: string,
) {
  if (!ids.length) return;
  try {
    const rows = ids.map((id, i) => ({
      id,
      email_type: emailType,
      recipient_email: recipients[i]?.email ?? '',
      recipient_name:  recipients[i]?.name  ?? null,
      subject,
      sent_at: new Date().toISOString(),
      status: 'sent',
    }));
    await getSupabase().from('email_logs').insert(rows);
  } catch {}
}

// ── LEAD TEMPLATE HELPERS ────────────────────────────────────────────────────

async function getLeadTemplates(res: VercelResponse) {
  const { data } = await getSupabase().from('lead_campaign_templates').select('*').order('created_at', { ascending: false });
  return res.status(200).json({ templates: data ?? [] });
}

async function upsertLeadTemplate(body: any, res: VercelResponse) {
  const { id, name, subject, body: bodyText } = body;
  const sb = getSupabase();
  const tplId = id || `ltpl_${Date.now()}`;
  const now = new Date().toISOString();
  await sb.from('lead_campaign_templates').upsert(
    { id: tplId, name: name.trim(), subject: subject.trim(), body: bodyText.trim(), updated_at: now, ...(id ? {} : { created_at: now }) },
    { onConflict: 'id' },
  );
  return res.status(200).json({ ok: true, id: tplId });
}

async function deleteLeadTemplate(body: any, res: VercelResponse) {
  await getSupabase().from('lead_campaign_templates').delete().eq('id', body.id);
  return res.status(200).json({ ok: true });
}

// ── LEAD SEQUENCE HELPERS ────────────────────────────────────────────────────

async function getLeadSequences(res: VercelResponse) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const [{ data: seqs }, { data: enrollments }] = await Promise.all([
    sb.from('lead_campaign_sequences').select('*').order('created_at', { ascending: false }),
    sb.from('lead_campaign_sequence_enrollments').select('sequence_id, status, next_send_at'),
  ]);
  const result = (seqs ?? []).map((seq: any) => {
    const enrs = (enrollments ?? []).filter((e: any) => e.sequence_id === seq.id);
    return {
      ...seq,
      active_count:    enrs.filter((e: any) => e.status === 'active').length,
      due_count:       enrs.filter((e: any) => e.status === 'active' && e.next_send_at <= now).length,
      completed_count: enrs.filter((e: any) => e.status === 'completed').length,
    };
  });
  return res.status(200).json({ sequences: result });
}

async function upsertLeadSequence(body: any, res: VercelResponse) {
  const { id, name, steps } = body;
  const sb = getSupabase();
  const seqId = id || `lseq_${Date.now()}`;
  await sb.from('lead_campaign_sequences').upsert(
    { id: seqId, name: name.trim(), steps: steps ?? [], updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  return res.status(200).json({ ok: true, id: seqId });
}

async function deleteLeadSequence(body: any, res: VercelResponse) {
  const sb = getSupabase();
  await sb.from('lead_campaign_sequence_enrollments').delete().eq('sequence_id', body.id);
  await sb.from('lead_campaign_sequences').delete().eq('id', body.id);
  return res.status(200).json({ ok: true });
}

async function enrollLeadSequence(body: any, res: VercelResponse) {
  const { sequenceId, campaignId, fromName, replyTo: replyToAddr, recipients } = body;
  if (!sequenceId || !recipients?.length) return res.status(400).json({ error: 'sequenceId and recipients required.' });
  const sb = getSupabase();

  const { data: seq } = await sb.from('lead_campaign_sequences').select('*').eq('id', sequenceId).single();
  if (!seq) return res.status(404).json({ error: 'Sequence not found.' });
  const steps: Array<{ step_number: number; subject: string; body: string; delay_days: number }> = seq.steps ?? [];
  if (!steps.length) return res.status(400).json({ error: 'Sequence has no steps.' });
  const firstStep = steps.sort((a, b) => a.delay_days - b.delay_days)[0];

  const { data: existing } = await sb.from('lead_campaign_sequence_enrollments').select('email').eq('sequence_id', sequenceId);
  const existingSet = new Set((existing ?? []).map((e: any) => e.email.toLowerCase()));

  const now = new Date();
  const toInsert: any[] = [];
  for (const r of recipients as Array<{ email: string; name: string }>) {
    if (!r.email || existingSet.has(r.email.toLowerCase())) continue;
    const nextSendAt = new Date(now.getTime() + firstStep.delay_days * 86400000);
    toInsert.push({
      id: `lenr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sequence_id: sequenceId,
      source_campaign_id: campaignId ?? null,
      email: r.email,
      lead_name: r.name ?? null,
      from_name: fromName ?? null,
      reply_to: replyToAddr ?? null,
      enrolled_at: now.toISOString(),
      next_step: firstStep.step_number,
      next_send_at: nextSendAt.toISOString(),
      status: 'active',
    });
  }
  if (!toInsert.length) return res.status(200).json({ ok: true, enrolled: 0, skipped: recipients.length });
  for (let i = 0; i < toInsert.length; i += 500) {
    await sb.from('lead_campaign_sequence_enrollments').insert(toInsert.slice(i, i + 500));
  }
  return res.status(200).json({ ok: true, enrolled: toInsert.length, skipped: recipients.length - toInsert.length });
}

async function sendDueLeadSequences(body: any, res: VercelResponse) {
  const { sequenceId, batchSize = 50 } = body;
  const sb = getSupabase();
  const now = new Date().toISOString();

  let q = sb.from('lead_campaign_sequence_enrollments')
    .select('*').eq('status', 'active').lte('next_send_at', now).limit(batchSize);
  if (sequenceId) q = (q as any).eq('sequence_id', sequenceId);
  const { data: due } = await q;
  if (!due?.length) return res.status(200).json({ sent: 0, total: 0 });

  const seqIds = [...new Set((due as any[]).map((e: any) => e.sequence_id))];
  const { data: seqs } = await sb.from('lead_campaign_sequences').select('*').in('id', seqIds);

  const allTplIds = [...new Set((seqs ?? []).flatMap((s: any) => (s.steps ?? []).map((st: any) => st.template_id).filter(Boolean)))];
  const { data: tmpls } = allTplIds.length
    ? await sb.from('lead_campaign_templates').select('*').in('id', allTplIds)
    : { data: [] };
  const tplMap = new Map((tmpls ?? []).map((t: any) => [t.id, t]));

  const baseFrom = process.env.NEWSLETTER_FROM_EMAIL ?? 'E&J Retreats <hello@ejretreats.com>';
  const fromEmailBase = baseFrom.match(/<([^>]+)>/)?.[1] ?? baseFrom;

  let sent = 0;
  for (const enr of due as any[]) {
    const seq = (seqs ?? []).find((s: any) => s.id === enr.sequence_id);
    if (!seq) continue;
    const steps: Array<{ step_number: number; template_id: string; delay_days: number }> = (seq as any).steps ?? [];
    const step = steps.find((s: any) => s.step_number === enr.next_step);
    if (!step) {
      await sb.from('lead_campaign_sequence_enrollments').update({ status: 'completed', next_send_at: null }).eq('id', enr.id);
      continue;
    }

    const tmpl = tplMap.get(step.template_id);
    if (!tmpl) continue;

    const firstName = (enr.lead_name || '').split(' ')[0] || 'there';
    const personalSubject = (tmpl.subject as string)
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{full_name\}\}/gi, enr.lead_name ?? '')
      .replace(/\{\{email\}\}/gi, enr.email);
    const personalBody = (tmpl.body as string)
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{full_name\}\}/gi, enr.lead_name ?? '')
      .replace(/\{\{email\}\}/gi, enr.email);

    const fromName = enr.from_name ?? 'E&J Retreats';
    const from = `${fromName} <${fromEmailBase}>`;
    const paragraphs = personalBody.split(/\n{2,}/).filter(Boolean);
    const bodyHtml = paragraphs.map((p: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1a1a1a">${p.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>`).join('');
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 16px"><div style="background:#fff;border-radius:8px;padding:36px 32px;border:1px solid #e2e8f0">${bodyHtml}<hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 20px"><p style="margin:0;font-size:12px;color:#94a3b8">${fromName}</p></div></div></body></html>`;

    try {
      const { data: rd } = await resend.emails.send({
        from,
        to: enr.email,
        subject: personalSubject,
        html,
        ...(enr.reply_to && { reply_to: enr.reply_to }),
      });
      if (rd?.id) await logEmails([rd.id], 'lead-sequence', [{ email: enr.email, name: enr.lead_name ?? '' }], personalSubject);
      sent++;

      const sorted = [...steps].sort((a, b) => a.delay_days - b.delay_days);
      const nextStep = sorted.find((s: any) => s.step_number > enr.next_step);
      if (nextStep) {
        const nextSendAt = new Date(new Date(enr.enrolled_at).getTime() + nextStep.delay_days * 86400000);
        await sb.from('lead_campaign_sequence_enrollments').update({ next_step: nextStep.step_number, next_send_at: nextSendAt.toISOString() }).eq('id', enr.id);
      } else {
        await sb.from('lead_campaign_sequence_enrollments').update({ status: 'completed', next_send_at: null }).eq('id', enr.id);
      }
    } catch { /* continue */ }
  }
  return res.status(200).json({ sent, total: due.length });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    if (req.query.action === 'lead-sequences') return await getLeadSequences(res);
    if (req.query.action === 'lead-templates') return await getLeadTemplates(res);
    return res.status(404).end();
  }
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body as {
    action?: 'newsletter' | 'report' | 'quarterly' | 'calendar-intel' | 'pricelabs-optimize' | 'lead-outreach'
      | 'upsert-lead-sequence' | 'delete-lead-sequence' | 'enroll-lead-sequence' | 'send-due-lead-sequences';
    // newsletter fields
    subject?: string;
    html?: string;
    recipients?: { email: string; name: string }[];
    // report email fields
    to?: string;
    toName?: string;
    reportSubject?: string;
    reportHtml?: string;
    // lead-outreach fields
    fromName?: string;
    replyTo?: string;
    campaignId?: string;
    emails?: Array<{ to: string; subject: string; html: string; recipientName: string; leadId: string }>;
  };

  const newsletterFrom = process.env.NEWSLETTER_FROM_EMAIL ?? 'E&J Retreats <hello@ejretreats.com>';
  const reportFrom = process.env.REPORT_FROM_EMAIL ?? newsletterFrom;
  const replyTo = process.env.REPLY_TO_EMAIL;

  // ── SINGLE REPORT EMAIL ──────────────────────────────────────────────────
  if (body.action === 'report') {
    const { to, toName, reportSubject, reportHtml } = body;
    if (!to || !reportSubject || !reportHtml) {
      return res.status(400).json({ error: 'to, reportSubject, and reportHtml are required' });
    }
    try {
      const { data: rd } = await resend.emails.send({
        from: reportFrom,
        to,
        subject: reportSubject,
        html: reportHtml,
        replyTo: 'ejretreats1@gmail.com',
      });
      if (rd?.id) await logEmails([rd.id], 'report', [{ email: to, name: toName ?? '' }], reportSubject);
      return res.status(200).json({ sent: 1 });
    } catch (err) {
      console.error('Resend report email error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send email' });
    }
  }

  // ── QUARTERLY REPORT ─────────────────────────────────────────────────────
  if (body.action === 'quarterly') {
    const {
      ownerName, ownerEmail, quarter, year, properties, metrics, context, ownerNotes, send,
    } = body as {
      ownerName: string;
      ownerEmail: string;
      quarter: number;
      year: number;
      properties: Array<{ address: string; city: string; state: string }>;
      metrics: {
        totalRevenue: number;
        totalBookings: number;
        cancelledWithPayout: number;
        occupancyRate: number;
        avgNightlyRate: number;
        avgLos: number;
      };
      context?: string;
      ownerNotes?: string;
      send?: boolean;
    };

    if (!ownerName || !ownerEmail || !quarter || !year) {
      return res.status(400).json({ error: 'ownerName, ownerEmail, quarter, and year are required' });
    }

    const qRanges = ['', 'January – March', 'April – June', 'July – September', 'October – December'];
    const qLabel = `Q${quarter} ${year} (${qRanges[quarter]})`;
    const propList = properties?.length
      ? properties.map(p => `- ${p.address}, ${p.city}, ${p.state}`).join('\n')
      : '- (no properties listed)';

    let reportText = '';
    try {
      const { text } = await generateText({
        model: gateway('anthropic/claude-sonnet-4-6'),
        maxTokens: 800,
        prompt: `Write a quarterly performance report email from E&J Retreats to one of their property management clients.

Client: ${ownerName}
Quarter: ${qLabel}
Properties managed:
${propList}

Performance metrics for the quarter:
- Total revenue: $${metrics.totalRevenue.toLocaleString()} (includes cancellation payouts)
- Total bookings: ${metrics.totalBookings}${metrics.cancelledWithPayout > 0 ? ` (${metrics.cancelledWithPayout} cancelled but paid out due to cancellation policy)` : ''}
- Occupancy rate: ${metrics.occupancyRate}% (based on nights actually stayed, excludes cancelled)
- Average nightly rate: $${metrics.avgNightlyRate}
- Average length of stay: ${metrics.avgLos} nights
${context ? `\nAdditional context about this quarter (apply to all clients):\n${context}` : ''}${ownerNotes ? `\nNotes specific to this client:\n${ownerNotes}` : ''}
Write 3 short sections:

What Went Well This Quarter
(2–4 sentences highlighting genuine wins based on the metrics. Be specific and warm but not over the top.)

Honest Assessment
(2–3 sentences about one or two things that could improve or challenges this quarter. Be transparent and constructive, never defensive.)

Our Focus for Next Quarter
(2–3 sentences with 2–3 concrete things E&J will focus on to improve results. Forward-looking and confident.)

Rules:
- Output ONLY the section content, starting with the first section header
- Do NOT include a greeting, subject line, or sign-off — those are added separately
- Use the exact section headers above, each on its own line followed by a blank line
- No markdown, no asterisks, no bullet points inside sections
- Write in first person plural (we, our team)`,
      });
      reportText = text.trim();
    } catch (err) {
      console.error('Quarterly generateText error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'AI generation failed' });
    }

    function buildQuarterlyHtml(text: string): string {
      const SECTION_HEADERS = ['What Went Well This Quarter', 'Honest Assessment', 'Our Focus for Next Quarter'];
      const lines = text.split('\n');
      let bodyHtml = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (SECTION_HEADERS.includes(trimmed)) {
          bodyHtml += `<h3 style="margin:24px 0 8px;font-size:15px;font-weight:600;color:#0f172a">${trimmed}</h3>`;
        } else {
          bodyHtml += `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${trimmed}</p>`;
        }
      }
      return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:580px;margin:0 auto;padding:40px 24px">
  <p style="margin:0 0 8px;font-size:13px;color:#64748b;letter-spacing:0.05em;text-transform:uppercase">E&amp;J Retreats</p>
  <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0f172a">Your ${qLabel} Property Report</h2>
  <p style="margin:0 0 28px;font-size:14px;color:#64748b">Hi ${ownerName},</p>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 20px">
  <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">— The E&amp;J Retreats Team<br>hello@ejretreats.com</p>
</div></body></html>`;
    }

    const html = buildQuarterlyHtml(reportText);
    const subject = `Your ${qLabel} Property Report — E&J Retreats`;

    if (!send) {
      return res.status(200).json({ html, subject });
    }

    try {
      const { data: qd } = await resend.emails.send({
        from: reportFrom,
        to: ownerEmail,
        subject,
        html,
        replyTo: 'ejretreats1@gmail.com',
      });
      if (qd?.id) await logEmails([qd.id], 'quarterly', [{ email: ownerEmail, name: ownerName }], subject);
      return res.status(200).json({ html, subject, sent: 1 });
    } catch (err) {
      console.error('Quarterly Resend error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send email' });
    }
  }

  // ── CALENDAR INTELLIGENCE ─────────────────────────────────────────────────
  if (body.action === 'calendar-intel') {
    const { insights, plListings } = body as { insights: unknown[]; plListings?: unknown[] };
    if (!Array.isArray(insights) || insights.length === 0) {
      return res.status(400).json({ error: 'insights array required' });
    }
    const RecommendationSchema = z.object({
      action: z.string(),
      reason: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    });
    const PropertyAnalysisSchema = z.object({
      propertyId: z.string(),
      urgency: z.enum(['critical', 'warning', 'info', 'ok']),
      headline: z.string(),
      recommendations: z.array(RecommendationSchema),
    });
    const OutputSchema = z.object({
      analyses: z.array(PropertyAnalysisSchema),
      portfolioSummary: z.string(),
    });
    const today = new Date().toISOString().slice(0, 10);
    const plSection = plListings && Array.isArray(plListings) && plListings.length > 0
      ? `\n\nPRICELABS PORTFOLIO DATA:\n${JSON.stringify(plListings, null, 2)}\n\nWhen PriceLabs data is available, also recommend specific PriceLabs settings to adjust — e.g. minimum night requirements, orphan gap filling (enable 1–2 night gap fill for orphan days between bookings), last-minute discounts, far-out pricing, day-of-week adjustments, or base price changes. Reference specific listings by nickname.`
      : '';
    const prompt = `You are a short-term rental revenue optimization expert for E&J Retreats, a property management company.

Today is ${today}.

Below is live data for ${insights.length} managed properties. For each property analyze the calendar gaps, occupancy trajectory, booking velocity, ADR, and channel mix. Then provide specific, immediately actionable recommendations to fill gaps and maximize revenue.

PROPERTY DATA:
${JSON.stringify(insights, null, 2)}${plSection}

FOR EACH PROPERTY:
1. Assign urgency: critical (urgent gap within 7 days or <30% occupancy next 30d), warning (<50% next 30d or large upcoming gap), info (generally healthy but room to optimize), ok (performing well).
2. Write a 1-sentence headline summarizing the key issue or opportunity.
3. List 3–5 specific recommendations ordered by priority. Be very specific — mention exact gap dates, specific discount %, channel names, promotion types, PriceLabs settings (if data available), and seasonal context.
4. Write a 2–3 sentence portfolio summary highlighting the biggest opportunities across all properties.

IMPORTANT:
- Base all advice on the actual numbers in the data
- Do not give generic advice — every recommendation must reference a specific data point
- If uplistingId is null, note calendar data is unavailable and recommend connecting Uplisting
- ADR of 0 means no recent booking data available`;
    try {
      const { output } = await generateText({
        model: gateway('anthropic/claude-sonnet-4-6'),
        output: Output.object({ schema: OutputSchema }),
        messages: [{ role: 'user', content: prompt }],
      });
      return res.status(200).json(output);
    } catch (err) {
      console.error('calendar-intel error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' });
    }
  }

  // ── PRICELABS OPTIMIZER ──────────────────────────────────────────────────
  if (body.action === 'pricelabs-optimize') {
    const { property, reservationStats, plListing } = body as {
      property: {
        address: string; city: string; state: string; type: string;
        bedrooms: number; bathrooms: number; maxGuests: number;
        monthlyRevenue: number; occupancyRate: number; platforms: string[];
      };
      reservationStats: {
        totalReservations: number; avgNights: number; avgNightlyRate: number;
        weekendPct: number; peakMonth: string; slowMonth: string;
        last12MonthRevenue: number; avgBookingWindow: number;
      };
      plListing?: Record<string, unknown>;
    };
    if (!property) return res.status(400).json({ error: 'property required' });

    const SettingSchema = z.object({
      setting:     z.string(),
      value:       z.string(),
      priority:    z.enum(['high', 'medium', 'low']),
      why:         z.string(),
    });
    const CategorySchema = z.object({
      category: z.string(),
      settings: z.array(SettingSchema),
    });
    const OutputSchema = z.object({
      summary:         z.string(),
      estimatedImpact: z.string(),
      categories:      z.array(CategorySchema),
    });

    const plSection = plListing
      ? `\nCURRENT PRICELABS LISTING DATA:\n${JSON.stringify(plListing, null, 2)}\n`
      : '\n(No current PriceLabs data available — recommend settings from scratch)\n';

    const prompt = `You are a PriceLabs expert and short-term rental revenue consultant. Analyze this property and provide exact, specific PriceLabs settings that will maximize annual revenue.

PROPERTY:
- Address: ${property.address}, ${property.city}, ${property.state}
- Type: ${property.type} | ${property.bedrooms}BR / ${property.bathrooms}BA | Max ${property.maxGuests} guests
- Platforms: ${property.platforms.join(', ') || 'unknown'}
- Current monthly revenue: $${property.monthlyRevenue.toLocaleString()}
- Current occupancy: ${property.occupancyRate}%

RESERVATION HISTORY:
- Total reservations analyzed: ${reservationStats?.totalReservations ?? 'N/A'}
- Average stay length: ${reservationStats?.avgNights?.toFixed(1) ?? 'N/A'} nights
- Average nightly rate: $${reservationStats?.avgNightlyRate?.toFixed(0) ?? 'N/A'}
- Average booking window: ${reservationStats?.avgBookingWindow?.toFixed(0) ?? 'N/A'} days in advance
- Weekend bookings: ${reservationStats?.weekendPct?.toFixed(0) ?? 'N/A'}% of total
- Peak month: ${reservationStats?.peakMonth ?? 'N/A'}
- Slowest month: ${reservationStats?.slowMonth ?? 'N/A'}
- Trailing 12-month revenue: $${reservationStats?.last12MonthRevenue?.toLocaleString() ?? 'N/A'}
${plSection}

Provide specific PriceLabs settings across these exact categories. Use real dollar amounts, real percentages, real day counts — not ranges, not "consider". Be prescriptive.

CATEGORIES TO COVER:
1. "Base Pricing" — base price, min price, max price (actual $ values based on their avg nightly rate and market)
2. "Minimum Stay Rules" — global min nights, weekend min nights, peak season min nights, orphan day exception
3. "Last Minute Pricing" — 0–2 days: discount %, 3–7 days: discount %, 8–14 days: discount %
4. "Far Future Pricing" — 90+ days: premium %, 60–90 days: premium %
5. "Day of Week Adjustments" — Mon/Tue adjustment %, Wed/Thu adjustment %, Fri/Sat adjustment %, Sun adjustment %
6. "Seasonal Multipliers" — list the 3 highest-demand months with premium % and 3 slowest with discount %
7. "Orphan Day Gap Fill" — enable/disable, gap fill discount %, min gap size to fill
8. "Health Score Optimizations" — 2–3 other specific PriceLabs settings to improve their score

For each setting include: the exact PriceLabs UI label as "setting", the specific value as "value", priority (high/medium/low), and a one-sentence "why" referencing their actual data.

Write a 2-sentence "summary" of the overall pricing strategy and a specific "estimatedImpact" sentence (e.g. "Optimizing these settings could increase annual revenue by 18–25% based on your current $X avg nightly rate and Y% occupancy gap").`;

    try {
      const { output } = await generateText({
        model: gateway('anthropic/claude-sonnet-4-6'),
        output: Output.object({ schema: OutputSchema }),
        messages: [{ role: 'user', content: prompt }],
      });
      return res.status(200).json(output);
    } catch (err) {
      console.error('pricelabs-optimize error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' });
    }
  }

  // ── LEAD OUTREACH ────────────────────────────────────────────────────────
  if (body.action === 'lead-outreach') {
    const { fromName, replyTo: outreachReplyTo, emails } = body;
    if (!emails?.length) {
      return res.status(400).json({ error: 'emails array required' });
    }
    const baseFrom = process.env.NEWSLETTER_FROM_EMAIL ?? 'E&J Retreats <hello@ejretreats.com>';
    const fromEmail = baseFrom.match(/<([^>]+)>/)?.[1] ?? baseFrom;
    const from = `${fromName || 'E&J Retreats'} <${fromEmail}>`;

    let sent = 0;
    let failed = 0;
    const chunkSize = 100;
    for (let i = 0; i < emails.length; i += chunkSize) {
      const chunk = emails.slice(i, i + chunkSize);
      const batch = chunk.map(e => ({
        from,
        to: e.to,
        subject: e.subject,
        html: e.html,
        ...(outreachReplyTo && { reply_to: outreachReplyTo }),
      }));
      try {
        const { data: bd } = await resend.batch.send(batch) as { data: Array<{ id: string }> | null; error: unknown };
        sent += chunk.length;
        if (bd?.length) {
          const ids = bd.map(e => e.id).filter(Boolean);
          await logEmails(ids, 'outreach', chunk.map(e => ({ email: e.to, name: e.recipientName })), chunk[0]?.subject ?? '');
        }
      } catch (err) {
        console.error('Lead outreach batch error:', err);
        failed += chunk.length;
      }
    }
    return res.status(200).json({ sent, failed });
  }

  // ── LEAD TEMPLATES + SEQUENCES ───────────────────────────────────────────────
  if (body.action === 'upsert-lead-template')    return await upsertLeadTemplate(body, res);
  if (body.action === 'delete-lead-template')    return await deleteLeadTemplate(body, res);
  if (body.action === 'upsert-lead-sequence')    return await upsertLeadSequence(body, res);
  if (body.action === 'delete-lead-sequence')    return await deleteLeadSequence(body, res);
  if (body.action === 'enroll-lead-sequence')    return await enrollLeadSequence(body, res);
  if (body.action === 'send-due-lead-sequences') return await sendDueLeadSequences(body, res);

  // ── NEWSLETTER BATCH ─────────────────────────────────────────────────────
  const { subject, html, recipients } = body;
  if (!subject || !html || !recipients?.length) {
    return res.status(400).json({ error: 'subject, html, and recipients are required' });
  }

  const chunkSize = 100;
  const chunks: typeof recipients[] = [];
  for (let i = 0; i < recipients.length; i += chunkSize) {
    chunks.push(recipients.slice(i, i + chunkSize));
  }

  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    const batch = chunk.map(r => ({
      from: newsletterFrom,
      to: r.email,
      subject,
      html,
      ...(replyTo && { reply_to: replyTo }),
    }));
    try {
      const { data: batchData } = await resend.batch.send(batch) as { data: Array<{ id: string }> | null; error: unknown };
      sent += chunk.length;
      if (batchData?.length) {
        const ids = batchData.map(e => e.id).filter(Boolean);
        await logEmails(ids, 'newsletter', chunk, subject!);
      }
    } catch (err) {
      console.error('Resend batch error:', err);
      failed += chunk.length;
    }
  }

  return res.status(200).json({ sent, failed });
}

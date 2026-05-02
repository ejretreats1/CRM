import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { generateText } from 'ai';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body as {
    action?: 'newsletter' | 'report';
    // newsletter fields
    subject?: string;
    html?: string;
    recipients?: { email: string; name: string }[];
    // report email fields
    to?: string;
    toName?: string;
    reportSubject?: string;
    reportHtml?: string;
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
      await resend.emails.send({
        from: reportFrom,
        to,
        subject: reportSubject,
        html: reportHtml,
        replyTo: 'ejretreats1@gmail.com',
      });
      return res.status(200).json({ sent: 1 });
    } catch (err) {
      console.error('Resend report email error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send email' });
    }
  }

  // ── QUARTERLY REPORT ─────────────────────────────────────────────────────
  if (body.action === 'quarterly') {
    const {
      ownerName, ownerEmail, quarter, year, properties, metrics, send,
    } = body as {
      ownerName: string;
      ownerEmail: string;
      quarter: number;
      year: number;
      properties: Array<{ address: string; city: string; state: string }>;
      metrics: {
        totalRevenue: number;
        totalBookings: number;
        occupancyRate: number;
        avgNightlyRate: number;
        avgLos: number;
      };
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
        model: 'anthropic/claude-sonnet-4.6',
        maxTokens: 800,
        prompt: `Write a quarterly performance report email from E&J Retreats to one of their property management clients.

Client: ${ownerName}
Quarter: ${qLabel}
Properties managed:
${propList}

Performance metrics for the quarter:
- Total revenue: $${metrics.totalRevenue.toLocaleString()}
- Total bookings: ${metrics.totalBookings}
- Occupancy rate: ${metrics.occupancyRate}%
- Average nightly rate: $${metrics.avgNightlyRate}
- Average length of stay: ${metrics.avgLos} nights

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
      await resend.emails.send({
        from: reportFrom,
        to: ownerEmail,
        subject,
        html,
        replyTo: 'ejretreats1@gmail.com',
      });
      return res.status(200).json({ html, subject, sent: 1 });
    } catch (err) {
      console.error('Quarterly Resend error:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send email' });
    }
  }

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
      await resend.batch.send(batch);
      sent += chunk.length;
    } catch (err) {
      console.error('Resend batch error:', err);
      failed += chunk.length;
    }
  }

  return res.status(200).json({ sent, failed });
}

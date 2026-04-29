import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

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

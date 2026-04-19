import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { subject, html, recipients } = req.body as {
    subject: string;
    html: string;
    recipients: { email: string; name: string }[];
  };

  if (!subject || !html || !recipients?.length) {
    return res.status(400).json({ error: 'subject, html, and recipients are required' });
  }

  const fromAddress = process.env.NEWSLETTER_FROM_EMAIL ?? 'E&J Retreats <newsletter@ejretreats.com>';

  // Resend batch limit is 100 per call — chunk if needed
  const chunkSize = 100;
  const chunks: typeof recipients[] = [];
  for (let i = 0; i < recipients.length; i += chunkSize) {
    chunks.push(recipients.slice(i, i + chunkSize));
  }

  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    const batch = chunk.map(r => ({
      from: fromAddress,
      to: r.email,
      subject,
      html,
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

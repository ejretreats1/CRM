import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

function supabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

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

// Varied templates so emails look natural, not automated
const TEMPLATES = [
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

function pickTemplate(dayNumber: number, index: number) {
  return TEMPLATES[(dayNumber + index) % TEMPLATES.length];
}

function buildHtml(body: string, fromName: string): string {
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
  id: string;
  email: string;
  name: string;
  start_date: string;
  status: string;
  seed_emails: string[] | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a legitimate Vercel cron call or manual test
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = supabase();
  const { data: entries, error } = await sb
    .from('warmup_addresses')
    .select('*')
    .neq('status', 'paused');

  if (error) return res.status(500).json({ error: error.message });

  const results: { email: string; sent: number; skipped: string }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const entry of (entries as WarmupRow[])) {
    const seeds = (entry.seed_emails ?? []).filter(Boolean);
    if (!seeds.length) {
      results.push({ email: entry.email, sent: 0, skipped: 'no seed addresses' });
      continue;
    }

    const days  = daysSince(entry.start_date);
    const target = dailyTarget(days);
    const perSeed = Math.min(5, Math.ceil(target / seeds.length));

    const displayName = entry.name || 'E&J Retreats';
    const fromEmail   = entry.email;
    const from        = `${displayName} <${fromEmail}>`;

    const batch: { from: string; to: string[]; subject: string; html: string }[] = [];
    let idx = 0;
    for (const seed of seeds) {
      for (let i = 0; i < perSeed; i++) {
        const tpl = pickTemplate(days, idx++);
        batch.push({
          from,
          to: [seed],
          subject: tpl.subject,
          html: buildHtml(tpl.body, displayName),
        });
      }
    }

    try {
      const { data: sent } = await resend.batch.send(batch);
      const sentIds = (sent ?? []).map((s: { id: string }) => s.id).filter(Boolean);

      // Log to email_logs
      if (sentIds.length) {
        await sb.from('email_logs').insert(
          sentIds.map((id, i) => ({
            id,
            email_type:      'warmup',
            recipient_email: batch[i]?.to[0] ?? '',
            subject:         batch[i]?.subject ?? '',
            sent_at:         new Date().toISOString(),
            status:          'sent',
          }))
        );
      }

      results.push({ email: entry.email, sent: sentIds.length, skipped: '' });
    } catch (e) {
      results.push({ email: entry.email, sent: 0, skipped: String(e) });
    }

    // Mark as ready if 6+ weeks complete
    if (days >= 42 && entry.status !== 'ready') {
      await sb.from('warmup_addresses').update({ status: 'ready' }).eq('id', entry.id);
    }
  }

  return res.status(200).json({ date: today, results });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';

function parseSlackText(text: string): string {
  // Convert <url|label> → label, <url> → url, unescape &amp; etc.
  return text
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/<@[A-Z0-9]+>/g, '@someone')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\*([^*]+)\*/g, '$1')   // strip bold markers
    .replace(/_([^_]+)_/g, '$1');    // strip italic markers
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers['x-slack-token'];
  const { channelId } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'Missing Slack token' });
  }
  if (!channelId || typeof channelId !== 'string') {
    return res.status(400).json({ error: 'Missing channelId' });
  }

  try {
    const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=25`;
    const slackRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await slackRes.json();

    if (!data.ok) {
      return res.status(400).json({ error: data.error ?? 'Slack API error' });
    }

    // Normalise messages — drop bot_messages with no text
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = (data.messages ?? []).map((m: any) => ({
      ts: m.ts,
      text: parseSlackText(m.text ?? ''),
      username: m.username ?? m.bot_profile?.name ?? 'Slack',
      // Flatten first attachment fallback text if main text is empty
      attachmentText: m.attachments?.[0]?.fallback
        ? parseSlackText(m.attachments[0].fallback)
        : m.attachments?.[0]?.text
          ? parseSlackText(m.attachments[0].text)
          : '',
    })).filter((m: { text: string; attachmentText: string }) => m.text || m.attachmentText);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ messages });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

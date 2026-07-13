// Vercel Edge Middleware — injects OG meta tags for cleaner portal link previews.
// Chat apps (WhatsApp, iMessage, Telegram, Slack, etc.) send a bot User-Agent
// when unfurling links; we return a lightweight HTML page with OG tags so the
// preview says "Name – Cleaner Portal · E&J" instead of the generic CRM title.
// Real users pass through untouched and the Vite SPA handles everything normally.

const BOT_RE = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|twitterbot|linkedinbot|iMessage|Applebot/i;

export const config = { matcher: '/' };

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  const combined = url.searchParams.get('cleaner-dashboard');
  if (!combined) return undefined; // not a cleaner link — pass through

  const ua = request.headers.get('user-agent') ?? '';
  if (!BOT_RE.test(ua)) return undefined; // real user — pass through to SPA

  // URL format: "First-Last:cleanerId:token"  (name slug is the first segment)
  // Older formats: "cleanerId:token" or "cleanerId" — show generic name
  const parts = combined.split(':');
  const nameSlug = parts.length >= 3 ? parts[0] : '';
  const displayName = nameSlug
    ? nameSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Cleaner';

  const title = `${displayName} - Cleaner Portal E&J`;
  const desc  = `${displayName}'s cleaning schedule and job assignments from E&J Retreats.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="E&amp;J Retreats">
</head>
<body><p>Loading…</p></body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

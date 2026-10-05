// Vercel Edge Middleware: rich link previews for every CRM link.
//
// The CRM is a single-page app, so every URL normally serves the same generic
// <title>/Open Graph tags. When a link-preview crawler (iMessage, WhatsApp,
// Slack, Facebook, LinkedIn, Twitter/X, Discord, Telegram…) fetches a link we
// instead return a tiny HTML page whose title/description say what the link is
// for ("Your Cleaner Portal", "Sign your agreement", …). Real visitors are never
// affected: for them the request falls through to the app.
//
// Tokens in the URL are never echoed into the preview.

const SITE = 'E&J Retreats';
const IMAGE = '/og-image.png';

const CRAWLER_RE = /facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|linkedinbot|whatsapp|telegrambot|discordbot|applebot|skypeuripreview|pinterest|redditbot|embedly|iframely|vkshare|snapchat|google-pagerenderer|googlebot|bingbot|duckduckbot|yahoo|outbrain|quora link preview|nuzzel|xing-contenttabreceiver|flipboard|tumblr|bitlybot|opengraph|metainspector|preview/i;

interface Preview { title: string; description: string; theme: string }

/** What a link is for, from its path + query (exported for tests). */
export function previewFor(urlStr: string): Preview {
  const url = new URL(urlStr);
  const p = url.pathname;
  const q = url.searchParams;
  const has = (k: string) => q.has(k);

  if (/^\/sign\//.test(p))                 return { title: `Sign your agreement · ${SITE}`, description: 'Review and e-sign your property management agreement with E&J Retreats. Takes about two minutes on any device.', theme: '#1e3a5a' };
  if (/^\/fill\//.test(p))                 return { title: `Complete your agreement · ${SITE}`, description: 'Fill in your details and sign your E&J Retreats agreement online.', theme: '#1e3a5a' };
  if (/^\/sign-template\//.test(p))        return { title: `Sign your agreement · ${SITE}`, description: 'Review and e-sign your agreement with E&J Retreats online.', theme: '#1e3a5a' };
  if (has('onboarding'))                   return { title: `Property onboarding form · ${SITE}`, description: 'Tell us about your property — access, amenities, house rules and calendar links — so we can get it guest-ready.', theme: '#1e3a5a' };
  if (has('cleaner-dashboard'))            return { title: `Your Cleaner Portal · ${SITE} Cleaning`, description: 'See your upcoming cleans, accept new jobs, submit reports and track your payouts. Save this link to your home screen.', theme: '#0a1628' };
  if (has('cleaner'))                      return { title: `Cleaning job · ${SITE} Cleaning`, description: 'View the job details, accept or pass, and submit your cleaning report with photos when you’re done.', theme: '#0a1628' };
  if (has('cleaning-onboard'))             return { title: `Set up your cleaning service · ${SITE} Cleaning`, description: 'Add a card on file to activate turnover cleaning for your property. You’re only charged after each completed clean.', theme: '#1e40af' };
  if (has('cleaning-enroll'))              return { title: `Enroll your property for cleaning · ${SITE} Cleaning`, description: 'Share your property details — address, door code, check-in/out times and calendar links — so our cleaners have everything they need.', theme: '#1e40af' };
  if (has('cleaner-onboard'))              return { title: `Contractor Agreement · ${SITE} Cleaning`, description: 'Review and sign your E&J Retreats contractor agreement online, then set up payouts.', theme: '#1e40af' };
  if (has('cleaner-setup'))                return { title: `Set up payouts · ${SITE} Cleaning`, description: 'Connect your bank through Stripe so you’re paid automatically after each clean.', theme: '#0a1628' };
  if (has('cleaner-connected'))            return { title: `Payouts connected · ${SITE} Cleaning`, description: 'Your Stripe payouts are connected. Open your Cleaner Portal to see your jobs.', theme: '#0a1628' };
  if (has('share'))                        return { title: `Revenue report · ${SITE}`, description: 'Your short-term rental revenue projection from E&J Retreats.', theme: '#1e3a5a' };
  if (has('portal') || has('owner-portal')) return { title: `Owner portal · ${SITE}`, description: 'Your property, documents and onboarding details with E&J Retreats.', theme: '#1e3a5a' };
  return { title: `${SITE} CRM`, description: 'Property management and cleaning operations portal for E&J Retreats.', theme: '#1a1a1a' };
}

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

export function previewHtml(urlStr: string): string {
  const url = new URL(urlStr);
  const { title, description, theme } = previewFor(urlStr);
  const image = `${url.origin}${IMAGE}`;
  // Canonical URL without the token so previews never leak it
  const canonical = `${url.origin}${url.pathname}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${theme}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="/favicon.ico">
</head><body style="font-family:sans-serif;background:${theme};color:#fff;padding:40px"><h1>${esc(title)}</h1><p>${esc(description)}</p></body></html>`;
}

export const config = {
  // Everything except the API, built assets and files with an extension.
  matcher: ['/((?!api/|assets/|.*\\.[a-zA-Z0-9]+$).*)'],
};

export default function middleware(req: Request): Response | undefined {
  const ua = req.headers.get('user-agent') ?? '';
  if (!CRAWLER_RE.test(ua)) return undefined; // real visitor → serve the app
  return new Response(previewHtml(req.url), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' },
  });
}

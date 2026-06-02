/**
 * E&J Retreats — Morning Deal Scan Agent
 *
 * Searches for new STR investment deals and saves qualifying ones to the
 * CRM's Supabase deals table so they appear in Deal Scanner.
 *
 * Data source — provide ONE of these keys (not both required):
 *
 *   RAPIDAPI_KEY         — Use Zillow via RapidAPI (free tier: 100 req/month).
 *                          Sign up at rapidapi.com → subscribe to "zillow-com1".
 *                          If you already use the Deal Scanner in the CRM, you
 *                          already have this key — just add it to GitHub Secrets.
 *
 *   RENTCAST_API_KEY     — Use Rentcast (free tier: 50 req/month).
 *                          Sign up at rentcast.io — email only, no credit card.
 *                          Upgrade to $9/mo for 500 req/month if needed.
 *
 * Required GitHub Secrets (Settings → Secrets → Actions):
 *   ANTHROPIC_API_KEY    — Anthropic API key
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key (bypasses RLS for writes)
 *   RAPIDAPI_KEY         — RapidAPI key   (provide this OR RENTCAST_API_KEY)
 *   RENTCAST_API_KEY     — Rentcast key   (provide this OR RAPIDAPI_KEY)
 *
 * Required GitHub Variables (Settings → Variables → Actions):
 *   SCAN_MARKETS         — e.g. "Gatlinburg TN, Blue Ridge GA, Asheville NC"
 *
 * Optional GitHub Variables:
 *   SCAN_MIN_BEDS        — default: 2
 *   SCAN_MAX_PRICE       — default: 600000
 *   SCAN_MIN_SCORE       — minimum AI score to save a deal, default: 6
 *   SCAN_MODEL           — Claude model, default: claude-haiku-4-5-20251001
 *   NOTIFY_EMAIL         — email address for daily summary
 *   RESEND_API_KEY       — required if NOTIFY_EMAIL is set
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────

const MARKETS      = (process.env.SCAN_MARKETS ?? '').split(',').map(m => m.trim()).filter(Boolean);
const MIN_BEDS     = parseInt(process.env.SCAN_MIN_BEDS   ?? '2');
const MAX_PRICE    = parseInt(process.env.SCAN_MAX_PRICE  ?? '600000');
const MIN_SCORE    = parseInt(process.env.SCAN_MIN_SCORE  ?? '6');
const MODEL        = process.env.SCAN_MODEL ?? 'claude-haiku-4-5-20251001';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? '';
const RENTCAST_KEY = process.env.RENTCAST_API_KEY ?? '';
const BATCH_SIZE   = 8;

if (!RAPIDAPI_KEY && !RENTCAST_KEY) {
  console.error('No data source configured. Provide either RAPIDAPI_KEY (Zillow) or RENTCAST_API_KEY (Rentcast).');
  console.error('See the comments at the top of this file for setup instructions.');
  process.exit(1);
}

const SOURCE: 'zillow' | 'rentcast' = RAPIDAPI_KEY ? 'zillow' : 'rentcast';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase  = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Listing {
  id:           string;
  address:      string;
  city:         string;
  state:        string;
  price:        number;
  bedrooms:     number | null;
  bathrooms:    number | null;
  homeType:     string;
  listingUrl:   string;
  rentEstimate: number | null;
  daysOnMarket: number | null;
}

interface DealScore {
  index:                  number;
  opportunityScore:       number;
  estimatedAnnualRevenue: number | null;
  reasoning:              string;
  keyStrengths:           string[];
  keyConcerns:            string[];
  recommendation:         'strong-buy' | 'buy' | 'neutral' | 'pass' | 'strong-pass';
}

// ── Zillow via RapidAPI ───────────────────────────────────────────────────────

async function searchZillow(market: string): Promise<Listing[]> {
  const params = new URLSearchParams({
    location:  market,
    beds_min:  String(MIN_BEDS),
    price_max: String(MAX_PRICE),
    home_type: 'Houses,Townhomes,Condos',
    sort:      'Days_on_Zillow',
  });

  const res = await fetch(
    `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?${params}`,
    { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'zillow-com1.p.rapidapi.com' } },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`  [Zillow] HTTP ${res.status}: ${body.slice(0, 120)}`);
    if (res.status === 403 || res.status === 401) {
      console.warn('  → Check that your RAPIDAPI_KEY is correct and you are subscribed to zillow-com1 on RapidAPI.');
    }
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.props ?? []).map((p: any): Listing => {
    const parts = (p.address ?? '').split(',');
    return {
      id:           String(p.zpid ?? Math.random()),
      address:      p.address ?? '',
      city:         parts[1]?.trim() ?? '',
      state:        parts[2]?.trim().split(' ')[0] ?? '',
      price:        Number(p.price) || 0,
      bedrooms:     p.bedrooms  != null ? Number(p.bedrooms)  : null,
      bathrooms:    p.bathrooms != null ? Number(p.bathrooms) : null,
      homeType:     p.homeType ?? '',
      listingUrl:   p.zpid ? `https://www.zillow.com/homedetails/${p.zpid}_zpid/` : '',
      rentEstimate: p.rentZestimate ? Number(p.rentZestimate) : null,
      daysOnMarket: p.daysOnZillow ?? null,
    };
  });
}

// ── Rentcast ──────────────────────────────────────────────────────────────────
// Sign up free at rentcast.io — no credit card. Free tier: 50 calls/month.

async function searchRentcast(market: string): Promise<Listing[]> {
  // Parse "Gatlinburg TN" → city=Gatlinburg, state=TN
  const parts  = market.split(' ');
  const state  = parts.pop()?.trim() ?? '';
  const city   = parts.join(' ').trim();

  const params = new URLSearchParams({
    city,
    state,
    status:   'Active',
    bedrooms: String(MIN_BEDS),
    limit:    '50',
  });

  const res = await fetch(
    `https://api.rentcast.io/v1/listings/sale?${params}`,
    { headers: { 'X-Api-Key': RENTCAST_KEY, Accept: 'application/json' } },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`  [Rentcast] HTTP ${res.status}: ${body.slice(0, 120)}`);
    if (res.status === 403 || res.status === 401) {
      console.warn('  → Check your RENTCAST_API_KEY. Sign up free at rentcast.io.');
    }
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const items = Array.isArray(data) ? data : (data.listings ?? data.results ?? []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return items.filter((p: any) => (p.price ?? 0) <= MAX_PRICE).map((p: any): Listing => ({
    id:           p.id ?? String(Math.random()),
    address:      p.formattedAddress ?? `${p.addressLine1 ?? ''}, ${p.city ?? ''}, ${p.state ?? ''}`,
    city:         p.city ?? city,
    state:        p.state ?? state,
    price:        Number(p.price) || 0,
    bedrooms:     p.bedrooms  != null ? Number(p.bedrooms)  : null,
    bathrooms:    p.bathrooms != null ? Number(p.bathrooms) : null,
    homeType:     p.propertyType ?? '',
    listingUrl:   p.listingUrl ?? '',
    rentEstimate: null,
    daysOnMarket: p.daysOnMarket ?? null,
  }));
}

async function searchListings(market: string): Promise<Listing[]> {
  return SOURCE === 'zillow' ? searchZillow(market) : searchRentcast(market);
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function getExistingAddresses(): Promise<Set<string>> {
  const { data } = await supabase.from('deals').select('address, zillow_url');
  const keys = new Set<string>();
  for (const r of data ?? []) {
    if (r.address) keys.add(r.address.toLowerCase().trim());
    // Extract zpid from URL for Zillow dedup
    const m = (r.zillow_url ?? '').match(/\/(\d+)_zpid/);
    if (m) keys.add(`zpid:${m[1]}`);
  }
  return keys;
}

async function saveDeal(listing: Listing, score: DealScore, market: string) {
  const grossYield = score.estimatedAnnualRevenue && listing.price
    ? parseFloat((score.estimatedAnnualRevenue / listing.price * 100).toFixed(1))
    : null;
  const now = new Date().toISOString();

  const { error } = await supabase.from('deals').insert({
    address:                  listing.address,
    city:                     listing.city,
    state:                    listing.state,
    market,
    listing_price:            listing.price,
    bedrooms:                 listing.bedrooms,
    bathrooms:                listing.bathrooms,
    property_type:            listing.homeType,
    zillow_url:               listing.listingUrl || null,
    projected_annual_revenue: score.estimatedAnnualRevenue,
    gross_yield:              grossYield,
    opportunity_score:        score.opportunityScore,
    ai_score_reasoning:       score.reasoning,
    ai_key_strengths:         score.keyStrengths,
    ai_key_concerns:          score.keyConcerns,
    ai_recommendation:        score.recommendation,
    str_status:               'unknown',
    stage:                    'new',
    notes: `Auto-discovered via ${SOURCE} morning scan on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    created_at:               now,
    updated_at:               now,
  });

  if (error) console.error(`  [DB] Failed to save ${listing.address}: ${error.message}`);
}

// ── Claude batch scoring ──────────────────────────────────────────────────────

async function scoreBatch(listings: Listing[], market: string): Promise<DealScore[]> {
  const listingsSummary = listings.map((l, i) => {
    const yieldEst = l.rentEstimate && l.price
      ? `${(l.rentEstimate * 12 / l.price * 100).toFixed(1)}%` : 'N/A';
    return `[${i}] ${l.address}
  Price: $${l.price.toLocaleString()} | Beds: ${l.bedrooms ?? '?'} | Baths: ${l.bathrooms ?? '?'} | Type: ${l.homeType || 'unknown'}
  Rent Estimate: ${l.rentEstimate ? '$' + l.rentEstimate.toLocaleString() + '/mo' : 'N/A'} | Est Gross Yield: ${yieldEst} | Days on Market: ${l.daysOnMarket ?? '?'}`;
  }).join('\n\n');

  const prompt = `You are a short-term rental (STR) investment analyst for E&J Retreats.

Score each of these ${listings.length} properties as STR investment opportunities in the ${market} market.

${listingsSummary}

Consider: STR market strength for ${market}; price-to-revenue ratio; bedrooms (more = higher STR revenue); property type suitability; days on market.

Return ONLY a JSON array with exactly ${listings.length} objects in the same order:
[
  {
    "index": 0,
    "opportunityScore": <1-10 integer>,
    "estimatedAnnualRevenue": <gross annual STR revenue estimate, or null>,
    "reasoning": "<2 concise sentences>",
    "keyStrengths": ["<strength>", "<strength>"],
    "keyConcerns": ["<concern>"],
    "recommendation": "<strong-buy|buy|neutral|pass|strong-pass>"
  }
]
Score guide: 9-10=exceptional, 7-8=good, 5-6=borderline, 1-4=pass.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text  = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) { console.warn('  [Claude] Could not parse JSON'); return []; }

  try {
    return JSON.parse(match[0]) as DealScore[];
  } catch {
    console.warn('  [Claude] JSON parse error');
    return [];
  }
}

// ── Optional email notification ───────────────────────────────────────────────

async function sendEmailSummary(body: string, hotDeals: string[]) {
  const email  = process.env.NOTIFY_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!email || !apiKey) return;

  const hotHtml = hotDeals.length > 0
    ? `<h2 style="color:#0f766e">🔥 Hot Deals (Score 8+)</h2><ul>${hotDeals.map(d => `<li>${d}</li>`).join('')}</ul>`
    : '';

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:    'EJ Retreats CRM <noreply@ejretreats.com>',
      to:      email,
      subject: `Morning Deal Scan — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      html:    `<pre style="font-family:monospace;font-size:13px">${body}</pre>${hotHtml}`,
    }),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (MARKETS.length === 0) {
    console.error('No markets configured. Set SCAN_MARKETS in GitHub Variables.');
    console.error('Example: "Gatlinburg TN, Blue Ridge GA, Asheville NC"');
    process.exit(1);
  }

  const date = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  E&J Retreats — Morning Deal Scan`);
  console.log(`  ${date}`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`Source:   ${SOURCE === 'zillow' ? 'Zillow (RapidAPI)' : 'Rentcast'}`);
  console.log(`Markets:  ${MARKETS.join(' · ')}`);
  console.log(`Criteria: ${MIN_BEDS}+ beds  ·  max $${MAX_PRICE.toLocaleString()}  ·  min score ${MIN_SCORE}/10`);
  console.log(`Model:    ${MODEL}`);

  const existingKeys = await getExistingAddresses();
  console.log(`Existing deals in CRM: ${existingKeys.size / 2 | 0}`); // rough count

  const allHotDeals:    string[] = [];
  const marketSummaries: string[] = [];
  let totalSaved = 0;

  for (const market of MARKETS) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`📍  ${market}`);
    console.log(`${'─'.repeat(55)}`);

    const listings = await searchListings(market);
    console.log(`  Fetched: ${listings.length} listings`);

    const newListings = listings.filter(l =>
      l.price > 0 &&
      l.address &&
      !existingKeys.has(l.address.toLowerCase().trim()) &&
      !existingKeys.has(`zpid:${l.id}`),
    ).slice(0, 25);

    console.log(`  New (not in CRM): ${newListings.length}`);

    if (newListings.length === 0) {
      marketSummaries.push(`${market}: 0 new listings`);
      continue;
    }

    let marketSaved    = 0;
    const marketHot: string[] = [];

    for (let i = 0; i < newListings.length; i += BATCH_SIZE) {
      const batch  = newListings.slice(i, i + BATCH_SIZE);
      const batchN = Math.floor(i / BATCH_SIZE) + 1;
      const total  = Math.ceil(newListings.length / BATCH_SIZE);
      console.log(`  Scoring batch ${batchN}/${total} (${batch.length} listings)...`);

      const scores = await scoreBatch(batch, market);

      for (const score of scores) {
        const listing = batch[score.index];
        if (!listing) continue;

        const icon = score.opportunityScore >= MIN_SCORE
          ? score.opportunityScore >= 8 ? '🔥' : '✅'
          : '⬜';
        console.log(`  ${icon} [${score.opportunityScore}/10] ${listing.address}  —  ${score.recommendation}`);

        if (score.opportunityScore >= MIN_SCORE) {
          await saveDeal(listing, score, market);
          existingKeys.add(listing.address.toLowerCase().trim());
          existingKeys.add(`zpid:${listing.id}`);
          marketSaved++;
          totalSaved++;

          if (score.opportunityScore >= 8) {
            const entry = `${listing.address} — ${score.opportunityScore}/10 (${score.recommendation}) $${listing.price.toLocaleString()}`;
            marketHot.push(entry);
            allHotDeals.push(`[${market}] ${entry}`);
          }
        }
      }
    }

    marketSummaries.push(
      `${market}: ${listings.length} fetched · ${newListings.length} new · ${marketSaved} saved` +
      (marketHot.length ? ` · ${marketHot.length} 🔥` : ''),
    );
  }

  const summaryText = [
    '',
    '═'.repeat(55),
    '  SCAN COMPLETE',
    '═'.repeat(55),
    ...marketSummaries.map(s => `  ${s}`),
    '',
    `  Total new deals added to CRM: ${totalSaved}`,
    ...(allHotDeals.length > 0 ? ['', '  🔥 Hot deals (score 8+):', ...allHotDeals.map(d => `    • ${d}`)] : []),
    '═'.repeat(55),
  ].join('\n');

  console.log(summaryText);
  await sendEmailSummary(summaryText, allHotDeals);
}

main().catch(err => { console.error('\n[FATAL]', err); process.exit(1); });

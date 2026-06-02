/**
 * E&J Retreats — Morning Deal Scan Agent
 *
 * Runs every morning via GitHub Actions cron (8 AM EST).
 * Searches Zillow (+ optionally Redfin) for new STR investment deals,
 * scores each one with Claude, and saves qualifying deals straight into
 * the CRM's Supabase deals table so they appear in the Deal Scanner.
 *
 * Required GitHub Secrets:
 *   ANTHROPIC_API_KEY        — Anthropic API key
 *   RAPIDAPI_KEY             — RapidAPI key (already used by the CRM)
 *   SUPABASE_URL             — Supabase project URL
 *   SUPABASE_SERVICE_KEY     — Supabase service role key (bypasses RLS)
 *
 * Required GitHub Variables (Settings → Variables → Actions):
 *   SCAN_MARKETS   — Comma-separated list, e.g. "Gatlinburg TN,Blue Ridge GA,Asheville NC"
 *
 * Optional GitHub Variables:
 *   SCAN_MIN_BEDS   — Minimum bedrooms (default: 2)
 *   SCAN_MAX_PRICE  — Maximum listing price (default: 600000)
 *   SCAN_MIN_SCORE  — Minimum AI score to save a deal (default: 6)
 *   SCAN_MODEL      — Claude model to use (default: claude-haiku-4-5-20251001)
 *   REDFIN_ENABLED  — Set to "true" to also scan Redfin (same RapidAPI key,
 *                     requires subscribing to the redfin-com API on RapidAPI)
 *   NOTIFY_EMAIL    — Email address to receive daily summary (uses Resend)
 *   RESEND_API_KEY  — Resend API key (required if NOTIFY_EMAIL is set)
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Config ───────────────────────────────────────────────────────────────────

const MARKETS = (process.env.SCAN_MARKETS ?? '')
  .split(',').map(m => m.trim()).filter(Boolean);
const MIN_BEDS   = parseInt(process.env.SCAN_MIN_BEDS  ?? '2');
const MAX_PRICE  = parseInt(process.env.SCAN_MAX_PRICE ?? '600000');
const MIN_SCORE  = parseInt(process.env.SCAN_MIN_SCORE ?? '6');
const MODEL      = process.env.SCAN_MODEL ?? 'claude-haiku-4-5-20251001';
const REDFIN_ON  = process.env.REDFIN_ENABLED === 'true';
const BATCH_SIZE = 8; // listings scored per Claude call

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase  = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// ── Types ────────────────────────────────────────────────────────────────────

interface Listing {
  zpid: string;
  address: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  homeType: string;
  zillowUrl: string;
  rentZestimate: number | null;
  daysOnMarket: number | null;
  source: 'zillow' | 'redfin';
}

interface DealScore {
  index: number;
  opportunityScore: number;        // 1-10
  estimatedAnnualRevenue: number | null;
  reasoning: string;
  keyStrengths: string[];
  keyConcerns: string[];
  recommendation: 'strong-buy' | 'buy' | 'neutral' | 'pass' | 'strong-pass';
}

// ── Zillow ───────────────────────────────────────────────────────────────────

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
    { headers: { 'x-rapidapi-key': process.env.RAPIDAPI_KEY!, 'x-rapidapi-host': 'zillow-com1.p.rapidapi.com' } },
  );

  if (!res.ok) {
    console.warn(`  [Zillow] ${market}: HTTP ${res.status}`);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.props ?? []).map((p: any): Listing => {
    const parts = (p.address ?? '').split(',');
    return {
      zpid:          String(p.zpid ?? ''),
      address:       p.address ?? '',
      city:          parts[1]?.trim() ?? '',
      state:         parts[2]?.trim().split(' ')[0] ?? '',
      price:         Number(p.price) || 0,
      bedrooms:      p.bedrooms  != null ? Number(p.bedrooms)  : null,
      bathrooms:     p.bathrooms != null ? Number(p.bathrooms) : null,
      homeType:      p.homeType ?? '',
      zillowUrl:     p.zpid ? `https://www.zillow.com/homedetails/${p.zpid}_zpid/` : '',
      rentZestimate: p.rentZestimate ? Number(p.rentZestimate) : null,
      daysOnMarket:  p.daysOnZillow ?? null,
      source:        'zillow',
    };
  });
}

// ── Redfin (optional — requires redfin-com subscription on RapidAPI) ─────────

async function searchRedfin(market: string): Promise<Listing[]> {
  const params = new URLSearchParams({ location: market, beds_min: String(MIN_BEDS), price_max: String(MAX_PRICE) });

  const res = await fetch(
    `https://redfin-com.p.rapidapi.com/properties/search?${params}`,
    { headers: { 'x-rapidapi-key': process.env.RAPIDAPI_KEY!, 'x-rapidapi-host': 'redfin-com.p.rapidapi.com' } },
  );

  if (!res.ok) {
    console.warn(`  [Redfin] ${market}: HTTP ${res.status} (are you subscribed to redfin-com on RapidAPI?)`);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  // Redfin API shape varies by RapidAPI provider — map best-effort
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.homes ?? data.properties ?? data.results ?? []).map((p: any): Listing => {
    const parts = (p.streetAddress ?? p.address ?? '').split(',');
    return {
      zpid:          `rf-${p.propertyId ?? p.id ?? Math.random()}`,
      address:       p.streetAddress ?? p.address ?? '',
      city:          p.city ?? parts[1]?.trim() ?? '',
      state:         p.state ?? parts[2]?.trim().split(' ')[0] ?? '',
      price:         Number(p.price) || 0,
      bedrooms:      p.beds  != null ? Number(p.beds)  : null,
      bathrooms:     p.baths != null ? Number(p.baths) : null,
      homeType:      p.propertyType ?? p.homeType ?? '',
      zillowUrl:     p.url ?? '',
      rentZestimate: null,
      daysOnMarket:  p.daysOnMarket ?? null,
      source:        'redfin',
    };
  });
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function getExistingUrls(): Promise<Set<string>> {
  const { data } = await supabase.from('deals').select('zillow_url');
  return new Set((data ?? []).map((r: { zillow_url: string | null }) => r.zillow_url ?? '').filter(Boolean));
}

async function saveDeal(listing: Listing, score: DealScore, market: string) {
  const grossYield = score.estimatedAnnualRevenue && listing.price
    ? parseFloat((score.estimatedAnnualRevenue / listing.price * 100).toFixed(1))
    : null;
  const now = new Date().toISOString();

  const { error } = await supabase.from('deals').insert({
    address:                 listing.address,
    city:                    listing.city,
    state:                   listing.state,
    market,
    listing_price:           listing.price,
    bedrooms:                listing.bedrooms,
    bathrooms:               listing.bathrooms,
    property_type:           listing.homeType,
    zillow_url:              listing.zillowUrl,
    projected_annual_revenue: score.estimatedAnnualRevenue,
    gross_yield:             grossYield,
    opportunity_score:       score.opportunityScore,
    ai_score_reasoning:      score.reasoning,
    ai_key_strengths:        score.keyStrengths,
    ai_key_concerns:         score.keyConcerns,
    ai_recommendation:       score.recommendation,
    str_status:              'unknown',
    stage:                   'new',
    notes:                   `Auto-discovered by morning scan on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} via ${listing.source}`,
    created_at:              now,
    updated_at:              now,
  });

  if (error) console.error(`  [DB] Failed to save ${listing.address}:`, error.message);
}

// ── Claude batch scoring ─────────────────────────────────────────────────────

async function scoreBatch(listings: Listing[], market: string): Promise<DealScore[]> {
  const listingsSummary = listings.map((l, i) => {
    const grossYield = l.rentZestimate && l.price
      ? (l.rentZestimate * 12 / l.price * 100).toFixed(1) + '%'
      : 'N/A';
    return `[${i}] ${l.address}
  Price: $${l.price.toLocaleString()} | Beds: ${l.bedrooms ?? '?'} | Baths: ${l.bathrooms ?? '?'} | Type: ${l.homeType}
  Rent Zestimate: ${l.rentZestimate ? '$' + l.rentZestimate.toLocaleString() + '/mo' : 'N/A'} | Gross Yield Est: ${grossYield} | Days on Market: ${l.daysOnMarket ?? '?'}
  Source: ${l.source}`;
  }).join('\n\n');

  const prompt = `You are a short-term rental (STR) investment analyst for E&J Retreats, a company that finds and manages vacation rental properties.

Score each of these ${listings.length} properties as STR investment opportunities in the ${market} market.

${listingsSummary}

Consider for each property:
- STR market strength for ${market} (tourism, demand, seasonality)
- Price-to-revenue potential (gross yield)
- Property type suitability for STR
- Bedrooms (more beds = higher STR revenue potential)
- Whether the price is compelling given the market
- Days on market (more days may indicate pricing issues or problems)

Return ONLY a valid JSON array with exactly ${listings.length} objects, one per property in the same order:
[
  {
    "index": 0,
    "opportunityScore": <integer 1-10>,
    "estimatedAnnualRevenue": <number or null>,
    "reasoning": "<2 concise sentences>",
    "keyStrengths": ["<strength>", "<strength>"],
    "keyConcerns": ["<concern>"],
    "recommendation": "<strong-buy|buy|neutral|pass|strong-pass>"
  }
]

Score guide: 9-10 = exceptional deal, 7-8 = good opportunity, 5-6 = borderline, 1-4 = pass.
estimatedAnnualRevenue should be your best STR revenue estimate (gross, before expenses), or null if you cannot estimate.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    console.warn('  [Claude] Could not parse JSON from response');
    return [];
  }

  try {
    return JSON.parse(match[0]) as DealScore[];
  } catch {
    console.warn('  [Claude] JSON parse error');
    return [];
  }
}

// ── Notifications (optional) ─────────────────────────────────────────────────

async function sendEmailSummary(summaryText: string, hotDeals: string[]) {
  const email = process.env.NOTIFY_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!email || !apiKey) return;

  const hotHtml = hotDeals.length > 0
    ? `<h2 style="color:#0f766e">🔥 Hot Deals (Score 8+)</h2><ul>${hotDeals.map(d => `<li>${d}</li>`).join('')}</ul>`
    : '';

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'EJ Retreats CRM <noreply@ejretreats.com>',
      to:      email,
      subject: `Morning Deal Scan — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      html:    `<pre style="font-family:monospace;font-size:13px">${summaryText}</pre>${hotHtml}`,
    }),
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (MARKETS.length === 0) {
    console.error('No markets configured. Set SCAN_MARKETS in GitHub Variables.');
    console.error('Example: SCAN_MARKETS = "Gatlinburg TN, Blue Ridge GA, Asheville NC"');
    process.exit(1);
  }

  const date = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  E&J Retreats — Morning Deal Scan`);
  console.log(`  ${date}`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`Markets:  ${MARKETS.join(' · ')}`);
  console.log(`Criteria: ${MIN_BEDS}+ beds  ·  max $${MAX_PRICE.toLocaleString()}  ·  min score ${MIN_SCORE}/10`);
  console.log(`Model:    ${MODEL}`);
  console.log(`Sources:  Zillow${REDFIN_ON ? ' · Redfin' : ''}`);

  const existingUrls = await getExistingUrls();
  console.log(`\nExisting deals in CRM: ${existingUrls.size}`);

  const allHotDeals: string[] = [];
  const marketSummaries: string[] = [];
  let totalSaved = 0;

  for (const market of MARKETS) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`📍  ${market}`);
    console.log(`${'─'.repeat(55)}`);

    // Fetch from sources
    const [zillowListings, redfinListings] = await Promise.all([
      searchZillow(market),
      REDFIN_ON ? searchRedfin(market) : Promise.resolve([]),
    ]);
    const allListings = [...zillowListings, ...redfinListings];
    console.log(`  Zillow: ${zillowListings.length} listings${REDFIN_ON ? ` · Redfin: ${redfinListings.length} listings` : ''}`);

    // Filter out already-known listings
    const newListings = allListings
      .filter(l => l.price > 0 && l.address && !existingUrls.has(l.zillowUrl))
      .slice(0, 25); // cap at 25 per market to control costs
    console.log(`  New (not in CRM): ${newListings.length}`);

    if (newListings.length === 0) {
      console.log('  No new listings to score.');
      marketSummaries.push(`${market}: 0 new listings`);
      continue;
    }

    // Score in batches
    let marketSaved = 0;
    const marketHot: string[] = [];

    for (let i = 0; i < newListings.length; i += BATCH_SIZE) {
      const batch = newListings.slice(i, i + BATCH_SIZE);
      console.log(`  Scoring batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(newListings.length / BATCH_SIZE)} (${batch.length} listings)...`);

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
          existingUrls.add(listing.zillowUrl);
          marketSaved++;
          totalSaved++;

          if (score.opportunityScore >= 8) {
            const entry = `${listing.address} — Score: ${score.opportunityScore}/10 (${score.recommendation}) $${listing.price.toLocaleString()}`;
            marketHot.push(entry);
            allHotDeals.push(`[${market}] ${entry}`);
          }
        }
      }
    }

    const summary = `${market}: ${newListings.length} new · ${marketSaved} saved (score ≥ ${MIN_SCORE})${marketHot.length > 0 ? ` · ${marketHot.length} 🔥 hot` : ''}`;
    marketSummaries.push(summary);
  }

  // Final summary
  const summaryText = [
    '',
    '═'.repeat(55),
    '  SCAN COMPLETE',
    '═'.repeat(55),
    ...marketSummaries.map(s => `  ${s}`),
    '',
    `  Total new deals saved to CRM: ${totalSaved}`,
    ...(allHotDeals.length > 0 ? ['', '  🔥 Hot deals (score 8+):', ...allHotDeals.map(d => `    • ${d}`)] : []),
    '═'.repeat(55),
  ].join('\n');

  console.log(summaryText);

  await sendEmailSummary(summaryText, allHotDeals);
}

main().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});

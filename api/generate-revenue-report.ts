import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const MonthSchema = z.object({
  month: z.string(),
  revenue: z.number().nullable(),
  occupancy: z.number().nullable(),
});

const CompSchema = z.object({
  bedrooms: z.number().nullable(),
  annualRevenue: z.number().nullable(),
  occupancyRate: z.number().nullable(),
  adr: z.number().nullable(),
});

const StrReportSchema = z.object({
  extracted: z.object({
    projectedAnnualRevenue: z.number().nullable(),
    occupancyRate: z.number().nullable(),
    adr: z.number().nullable(),
    revpar: z.number().nullable(),
  }),
  monthlySeasonality: z.array(MonthSchema).optional(),
  comparables: z.array(CompSchema).optional(),
  reportTitle: z.string(),
  executiveSummary: z.string(),
  marketOpportunity: z.string(),
  performanceGap: z.string().nullable(),
  recommendations: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })),
  revenueProjections: z.object({
    conservative: z.number(),
    realistic: z.number(),
    optimistic: z.number(),
  }),
  keyFindings: z.array(z.string()),
  opportunityScore: z.number().int().min(1).max(10),
});

const MtrReportSchema = z.object({
  reportTitle: z.string(),
  executiveSummary: z.string(),
  marketOpportunity: z.string(),
  performanceGap: z.string().nullable(),
  strExtracted: z.object({
    projectedAnnualRevenue: z.number().nullable(),
    occupancyRate: z.number().nullable(),
    adr: z.number().nullable(),
  }),
  monthlySeasonality: z.array(MonthSchema).optional(),
  comparables: z.array(CompSchema).optional(),
  mtrProjected: z.object({
    monthlyRent: z.number(),
    annualRevenue: z.number(),
    occupancyRate: z.number(),
    recommendedLeaseLength: z.string(),
    targetTenantProfile: z.string(),
  }),
  strVsMtr: z.object({
    recommendation: z.enum(['str', 'mtr', 'hybrid']),
    strAnnualEstimate: z.number().nullable(),
    mtrAnnualEstimate: z.number(),
    reasoning: z.string(),
  }),
  recommendedPlatforms: z.array(z.string()),
  keyFindings: z.array(z.string()),
  recommendations: z.array(z.object({
    title: z.string(),
    description: z.string(),
  })),
  opportunityScore: z.number().int().min(1).max(10),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { address, pdfBase64, ownerActualRevenue, ownerNotes, additionalContext, reportType = 'str' } = req.body as {
    address: string;
    pdfBase64: string;
    ownerActualRevenue?: number;
    ownerNotes?: string;
    additionalContext?: string;
    reportType?: 'str' | 'mtr';
  };

  if (!address || !pdfBase64) {
    return res.status(400).json({ error: 'address and pdfBase64 are required' });
  }

  const ownerSection = ownerActualRevenue != null
    ? `Owner-reported actual revenue (last 12 months): $${ownerActualRevenue.toLocaleString()}${ownerNotes ? `\nOwner context: ${ownerNotes}` : ''}`
    : 'Owner actual revenue: not provided.';

  const contextSection = additionalContext?.trim()
    ? `\nIMPORTANT ADDITIONAL CONTEXT — read carefully and factor into the entire analysis:\n${additionalContext.trim()}\n`
    : '';

  const globalRules = `
RULES (apply to all sections of the report):
- If this property already has an amenity mentioned in the additional context, do NOT recommend adding it — acknowledge it as a strength instead.
- When referencing property management software or a PMS, refer to Uplisting only. Do not mention any other PMS platforms.
- Do NOT include operating expenses, net operating income (NOI), or cap rate in any part of the analysis. AirDNA uses placeholder figures for these that are not reliable. Focus purely on gross revenue metrics.`;

  const seasonalityInstructions = `
SEASONALITY & COMPARABLES (extract carefully from the PDF visuals):
- monthlySeasonality: Read the monthly seasonality chart in the PDF. Extract all 12 months (Jan–Dec) with projected revenue and occupancy rate for each month. Use the bar heights and axis labels to estimate values as accurately as possible.
- comparables: Read the comparable properties section/map in the PDF. Extract each comp with bedrooms, annual revenue, occupancy rate, and ADR. Include as many comps as are shown (typically 5–10).`;

  const strPrompt = `You are a short-term rental revenue consultant for E&J Retreats, a property management company.

Property address: ${address}
${ownerSection}
${contextSection}
The attached PDF is an AirDNA Rentalizer report for this property. Please:
1. Extract the key financial metrics from the PDF (gross revenue, occupancy, ADR, RevPAR only).
2. Extract the monthly seasonality chart data (all 12 months of projected revenue and occupancy).
3. Extract the comparable properties data from the comps section of the PDF.
4. Generate a professional revenue analysis.
5. If owner actual revenue IS provided, include a performance gap analysis comparing actual vs projected.
6. Write 3–5 specific recommendations to maximize revenue (pricing, listing optimization, amenities, seasonality). Do not recommend amenities the owner already has.
7. Assign an opportunity score 1–10 (10 = massive untapped potential).
${seasonalityInstructions}
${globalRules}

Write in a confident, professional tone suitable for presenting to a property owner.`;

  const mtrPrompt = `You are a mid-term rental (MTR) revenue consultant for E&J Retreats, a property management company.

Property address: ${address}
${ownerSection}
${contextSection}
The attached PDF is an AirDNA Rentalizer report containing short-term rental (STR) market data for this property.

Your task is to:
1. Extract the STR metrics from the AirDNA PDF (projected annual revenue, occupancy rate, ADR — gross revenue only).
2. Extract the monthly seasonality chart data (all 12 months).
3. Extract the comparable properties data from the comps section.
4. Using those STR figures and your expert knowledge of mid-term rental market dynamics, project realistic MTR revenue for this property.

MTR estimation guidelines:
- Mid-term rentals are furnished stays of 30+ days targeting traveling nurses, remote workers, corporate relocations, insurance housing, and seasonal workers.
- MTR monthly rent is typically 65–80% of what the property would earn per month at full STR occupancy (i.e. ADR × 30).
- MTR occupancy is typically 85–95% annually due to longer stays and less seasonality.
- MTR has significantly lower operating costs: fewer turnovers, less cleaning, less management overhead.
- Net MTR income is often comparable or superior to STR after accounting for costs.

5. Compare STR vs MTR total annual revenue and recommend the better strategy (or a hybrid approach).
6. Identify the ideal tenant profile, recommended lease lengths, and best booking platforms.
7. Write 3–5 specific recommendations for maximizing MTR performance. Do not recommend amenities the owner already has.
8. ${ownerActualRevenue != null ? 'Include a gap analysis comparing the owner\'s actual revenue to both STR projected and MTR projected.' : 'Focus on the MTR opportunity.'}
9. Assign an opportunity score 1–10 for the MTR opportunity specifically (10 = massive MTR potential).
${seasonalityInstructions}
${globalRules}

Write in a confident, professional tone suitable for presenting to a property owner considering switching to or adding mid-term rentals.`;

  try {
    if (reportType === 'mtr') {
      const { output } = await generateText({
        model: 'anthropic/claude-sonnet-4.6',
        output: Output.object({ schema: MtrReportSchema }),
        messages: [{
          role: 'user',
          content: [
            { type: 'file', data: pdfBase64, mediaType: 'application/pdf' },
            { type: 'text', text: mtrPrompt },
          ],
        }],
      });
      return res.status(200).json({ ...output, reportType: 'mtr' });
    } else {
      const { output } = await generateText({
        model: 'anthropic/claude-sonnet-4.6',
        output: Output.object({ schema: StrReportSchema }),
        messages: [{
          role: 'user',
          content: [
            { type: 'file', data: pdfBase64, mediaType: 'application/pdf' },
            { type: 'text', text: strPrompt },
          ],
        }],
      });
      return res.status(200).json({ ...output, reportType: 'str' });
    }
  } catch (err) {
    console.error('generate-revenue-report error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate report' });
  }
}

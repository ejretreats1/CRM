import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, Output } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';

export const config = { maxDuration: 120 };

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
  recommendations: z.array(z.object({ title: z.string(), description: z.string() })),
  revenueProjections: z.object({ conservative: z.number(), realistic: z.number(), optimistic: z.number() }),
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
  recommendations: z.array(z.object({ title: z.string(), description: z.string() })),
  opportunityScore: z.number().int().min(1).max(10),
});

const UnitSchema = z.object({
  unitLabel: z.string(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  projectedAnnualRevenue: z.number().nullable(),
  occupancyRate: z.number().nullable(),
  adr: z.number().nullable(),
  monthlySeasonality: z.array(MonthSchema).optional(),
  comparables: z.array(CompSchema).optional(),
});

const DealReportSchema = z.object({
  reportType: z.literal('deal'),
  listingPrice: z.number(),
  units: z.array(UnitSchema),
  combinedAnnualRevenue: z.number(),
  combinedOccupancyRate: z.number().nullable(),
  grossYield: z.number(),
  revenueProjections: z.object({ conservative: z.number(), realistic: z.number(), optimistic: z.number() }),
  recommendation: z.enum(['strong-buy', 'buy', 'neutral', 'pass', 'strong-pass']),
  recommendationReason: z.string(),
  reportTitle: z.string(),
  propertyHighlights: z.array(z.string()),
  concerns: z.array(z.string()),
  executiveSummary: z.string(),
  marketOpportunity: z.string(),
  recommendations: z.array(z.object({ title: z.string(), description: z.string() })),
  keyFindings: z.array(z.string()),
  opportunityScore: z.number().int().min(1).max(10),
});

const DealScoreSchema = z.object({
  projectedAnnualRevenue: z.number().nullable(),
  projectedGrossYield: z.number().nullable(),
  opportunityScore: z.number().int().min(1).max(10),
  reasoning: z.string(),
  strRegulatoryNote: z.string().nullable(),
  recommendation: z.enum(['strong-buy', 'buy', 'neutral', 'pass', 'strong-pass']),
  keyStrengths: z.array(z.string()),
  keyConcerns: z.array(z.string()),
});

const globalRules = `
RULES (apply to all sections):
- If the property already has an amenity mentioned in the context, do NOT recommend adding it — acknowledge it as a strength.
- When referencing property management software, refer to Uplisting only.
- Do NOT include operating expenses, net operating income (NOI), or cap rate. Focus on gross revenue metrics only.
- Do NOT use em dashes (—) anywhere in the output. Use commas, colons, or rewrite the sentence instead.`;

const seasonalityInstructions = `
SEASONALITY & COMPARABLES (extract carefully from the PDF visuals):
- monthlySeasonality: Read the monthly seasonality chart. Extract all 12 months (Jan–Dec) with projected revenue and occupancy rate for each month.
- comparables: Read the comparable properties section. Extract each comp with bedrooms, annual revenue, occupancy rate, and ADR.`;

async function runGenerate(reportType: 'str' | 'mtr', prompt: string, pdfBase64: string) {
  const schema = reportType === 'mtr' ? MtrReportSchema : StrReportSchema;
  const { output } = await generateText({
    model: gateway('anthropic/claude-sonnet-4-6'),
    output: Output.object({ schema }),
    messages: [{
      role: 'user',
      content: [
        { type: 'file', data: pdfBase64, mediaType: 'application/pdf' },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return { ...output, reportType };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body as {
    address: string;
    reportType?: 'str' | 'mtr' | 'deal' | 'score';
    // STR/MTR generate
    pdfBase64?: string;
    ownerActualRevenue?: number;
    ownerNotes?: string;
    additionalContext?: string;
    // Deal generate
    pdfFiles?: Array<{ base64: string; unitLabel: string; bedrooms?: number; bathrooms?: number }>;
    listingPrice?: number;
    zillowDescription?: string;
    // Refine
    existingReport?: Record<string, unknown>;
    refinementMessage?: string;
  };

  const { address, reportType = 'str' } = body;
  if (!address) return res.status(400).json({ error: 'address is required' });

  try {
    // ── REFINE MODE ──────────────────────────────────────────────────────────
    if (body.existingReport && body.refinementMessage?.trim()) {
      const { existingReport, refinementMessage, additionalContext } = body;
      const originalCtx = additionalContext?.trim()
        ? `\nORIGINAL CONTEXT (established facts about the property):\n${additionalContext.trim()}\n`
        : '';

      let schema: typeof StrReportSchema | typeof MtrReportSchema | typeof DealReportSchema;
      let typeLabel: string;
      if (reportType === 'deal') {
        schema = DealReportSchema;
        typeLabel = 'investment deal analyst';
      } else if (reportType === 'mtr') {
        schema = MtrReportSchema;
        typeLabel = 'mid-term rental consultant';
      } else {
        schema = StrReportSchema;
        typeLabel = 'short-term rental revenue consultant';
      }

      const prompt = `You are a ${typeLabel} for E&J Retreats.

Property: ${address}
${originalCtx}
Existing report (JSON):
${JSON.stringify(existingReport, null, 2)}

New correction/context from user:
"${refinementMessage!.trim()}"

Revise the report to incorporate this. Update affected sections; keep unaffected ones. Return the complete updated report.
${globalRules}`;

      const { output } = await generateText({
        model: gateway('anthropic/claude-sonnet-4-6'),
        output: Output.object({ schema }),
        messages: [{ role: 'user', content: prompt }],
      });
      return res.status(200).json({ ...output, reportType });
    }

    // ── DEAL MODE ────────────────────────────────────────────────────────────
    if (reportType === 'deal') {
      const { pdfFiles, listingPrice, zillowDescription, additionalContext } = body;
      if (!pdfFiles || pdfFiles.length === 0) {
        return res.status(400).json({ error: 'pdfFiles is required for deal analysis' });
      }
      if (!listingPrice) {
        return res.status(400).json({ error: 'listingPrice is required for deal analysis' });
      }

      const unitDescriptions = pdfFiles
        .map((pf, i) => `  Unit ${i + 1} — ${pf.unitLabel}${pf.bedrooms != null ? `: ${pf.bedrooms} bed` : ''}${pf.bathrooms != null ? `/${pf.bathrooms} bath` : ''}`)
        .join('\n');

      const zillowSection = zillowDescription?.trim()
        ? `\nZILLOW LISTING DESCRIPTION:\n${zillowDescription.trim()}\n`
        : '';

      const contextSection = additionalContext?.trim()
        ? `\nADDITIONAL CONTEXT:\n${additionalContext.trim()}\n`
        : '';

      const dealPrompt = `You are a short-term rental investment analyst for E&J Retreats. Analyze this property acquisition opportunity.

Property Address: ${address}
Asking Price: $${Number(listingPrice).toLocaleString()}
Number of Units: ${pdfFiles.length}
${unitDescriptions}
${zillowSection}${contextSection}
${pdfFiles.length > 1 ? `There are ${pdfFiles.length} AirDNA Rentalizer PDF reports attached, one per unit (in order listed above).` : 'The AirDNA Rentalizer PDF for this property is attached.'}

ANALYZE (complete steps 1–3 first before writing any text fields):
1. Extract per-unit metrics from each PDF: projected annual revenue, occupancy rate, ADR, monthly seasonality, comparable properties.
2. Sum ALL unit revenues for combinedAnnualRevenue. Double-check: combinedAnnualRevenue MUST equal the exact sum of every unit's projectedAnnualRevenue.
3. Calculate grossYield = combinedAnnualRevenue / listingPrice × 100 (round to 1 decimal).
4. Make a clear investment recommendation: strong-buy / buy / neutral / pass / strong-pass based on yield, market demand, and property strengths.
5. Write a concise recommendationReason (2–3 sentences). IMPORTANT: cite the exact combinedAnnualRevenue figure computed in step 2. Never use a different revenue number here.
6. List 3–5 property highlights/strengths from the Zillow description and AirDNA data.
7. List 2–4 concerns or risks.
8. Project conservative, realistic, and optimistic combined annual revenue (all units).
9. Write 3–5 STR optimization recommendations to maximize revenue.
10. Write an executive summary and market opportunity paragraph.
11. List 3–5 key findings.
12. Assign an opportunityScore 1–10.
${seasonalityInstructions}
${globalRules}

Focus on gross revenue and ROI only. Write as if presenting to investors evaluating an STR acquisition.`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any[] = [
        ...pdfFiles.map(pf => ({ type: 'file' as const, data: pf.base64, mediaType: 'application/pdf' as const })),
        { type: 'text' as const, text: dealPrompt },
      ];

      const { output } = await generateText({
        model: gateway('anthropic/claude-sonnet-4-6'),
        output: Output.object({ schema: DealReportSchema }),
        messages: [{ role: 'user', content }],
      });
      return res.status(200).json(output);
    }

    // ── SCORE MODE (quick AI deal score, no PDF) ─────────────────────────────
    if (reportType === 'score') {
      const { listingPrice, bedrooms, bathrooms, propertyType, additionalContext, zillowDescription } = body as {
        listingPrice?: number;
        bedrooms?: number;
        bathrooms?: number;
        propertyType?: string;
        additionalContext?: string;
        zillowDescription?: string;
      } & typeof body;

      if (!listingPrice) return res.status(400).json({ error: 'listingPrice is required for score' });

      const marketLine = address ? `Market/Location: ${address}` : '';
      const bedsLine = bedrooms != null ? `Bedrooms: ${bedrooms}` : '';
      const bathsLine = bathrooms != null ? `Bathrooms: ${bathrooms}` : '';
      const typeLine = propertyType ? `Property Type: ${propertyType}` : '';
      const zillowSection = zillowDescription?.trim()
        ? `\nZillow Listing Description:\n${zillowDescription.trim()}\n`
        : '';
      const contextSection = additionalContext?.trim()
        ? `\nAdditional Context:\n${additionalContext.trim()}\n`
        : '';

      const scorePrompt = `You are a short-term rental investment analyst for E&J Retreats.

Property: ${address}
Asking Price: $${Number(listingPrice).toLocaleString()}
${[bedsLine, bathsLine, typeLine, marketLine].filter(Boolean).join('\n')}
${zillowSection}${contextSection}
Analyze this property as an STR investment opportunity based on typical STR performance for this market and property type:

1. Estimate projected annual STR gross revenue.
2. Calculate gross STR yield = projected revenue / listing price x 100 (round to 1 decimal).
3. Assign an opportunity score 1-10 (scoring guide: gross yield >=12% = 9-10, 9-12% = 7-8, 7-9% = 5-6, <7% = 1-4).
4. Write 2-3 sentence reasoning covering why this market and property type performs the way it does.
5. Note any STR regulatory considerations for this area (1-2 sentences, or null if unknown).
6. Give a recommendation: strong-buy / buy / neutral / pass / strong-pass.
7. List 2-3 key investment strengths.
8. List 1-2 key concerns or risks.

Focus on gross revenue only. No operating expenses, NOI, or cap rate.
Do not use em dashes.`;

      const { output } = await generateText({
        model: gateway('anthropic/claude-sonnet-4-6'),
        output: Output.object({ schema: DealScoreSchema }),
        messages: [{ role: 'user', content: scorePrompt }],
      });
      return res.status(200).json({ ...output, reportType: 'score' });
    }

    // ── GENERATE MODE (STR / MTR) ────────────────────────────────────────────
    if (!body.pdfBase64) return res.status(400).json({ error: 'pdfBase64 is required for report generation' });

    const { pdfBase64, ownerActualRevenue, ownerNotes, additionalContext } = body;
    const ownerSection = ownerActualRevenue != null
      ? `Owner-reported actual revenue (last 12 months): $${ownerActualRevenue.toLocaleString()}${ownerNotes ? `\nOwner context: ${ownerNotes}` : ''}`
      : 'Owner actual revenue: not provided.';
    const contextSection = additionalContext?.trim()
      ? `\nIMPORTANT ADDITIONAL CONTEXT:\n${additionalContext.trim()}\n`
      : '';

    const strPrompt = `You are a short-term rental revenue consultant for E&J Retreats.

Property address: ${address}
${ownerSection}
${contextSection}
The attached PDF is an AirDNA Rentalizer report. Please:
1. Extract key financial metrics (gross revenue, occupancy, ADR, RevPAR only).
2. Extract the monthly seasonality chart data (all 12 months).
3. Extract comparable properties data from the comps section.
4. Generate a professional revenue analysis.
5. If owner revenue is provided, include a performance gap analysis.
6. Write 3–5 specific recommendations. Do not recommend amenities the owner already has.
7. Assign an opportunity score 1–10.
${seasonalityInstructions}
${globalRules}

Write in a confident, professional tone suitable for presenting to a property owner.`;

    const mtrPrompt = `You are a mid-term rental (MTR) revenue consultant for E&J Retreats.

Property address: ${address}
${ownerSection}
${contextSection}
The attached PDF is an AirDNA Rentalizer report with STR market data.

1. Extract STR metrics (projected annual revenue, occupancy rate, ADR — gross revenue only).
2. Extract the monthly seasonality chart data (all 12 months).
3. Extract comparable properties data.
4. Project realistic MTR revenue (MTR rent = 65–80% of ADR×30; occupancy 85–95%).
5. Compare STR vs MTR and recommend the better strategy.
6. Identify ideal tenant profile, lease lengths, and booking platforms.
7. Write 3–5 specific MTR recommendations. Do not recommend amenities the owner already has.
8. ${ownerActualRevenue != null ? "Include gap analysis vs both STR and MTR projected." : "Focus on the MTR opportunity."}
9. Assign an opportunity score 1–10 for MTR specifically.
${seasonalityInstructions}
${globalRules}

Write in a confident, professional tone for a property owner considering mid-term rentals.`;

    const output = await runGenerate(reportType as 'str' | 'mtr', reportType === 'mtr' ? mtrPrompt : strPrompt, pdfBase64);
    return res.status(200).json(output);

  } catch (err) {
    console.error('generate-revenue-report error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process report' });
  }
}

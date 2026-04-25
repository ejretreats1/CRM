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

const globalRules = `
RULES (apply to all sections):
- If the property already has an amenity mentioned in the context, do NOT recommend adding it — acknowledge it as a strength.
- When referencing property management software, refer to Uplisting only.
- Do NOT include operating expenses, net operating income (NOI), or cap rate. Focus on gross revenue metrics only.`;

const seasonalityInstructions = `
SEASONALITY & COMPARABLES (extract carefully from the PDF visuals):
- monthlySeasonality: Read the monthly seasonality chart. Extract all 12 months (Jan–Dec) with projected revenue and occupancy rate for each month.
- comparables: Read the comparable properties section. Extract each comp with bedrooms, annual revenue, occupancy rate, and ADR.`;

async function runGenerate(reportType: 'str' | 'mtr', prompt: string, pdfBase64: string) {
  const schema = reportType === 'mtr' ? MtrReportSchema : StrReportSchema;
  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.6',
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

async function runRefine(reportType: 'str' | 'mtr', prompt: string) {
  const schema = reportType === 'mtr' ? MtrReportSchema : StrReportSchema;
  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.6',
    output: Output.object({ schema }),
    messages: [{ role: 'user', content: prompt }],
  });
  return { ...output, reportType };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body as {
    address: string;
    reportType?: 'str' | 'mtr';
    // generate mode
    pdfBase64?: string;
    ownerActualRevenue?: number;
    ownerNotes?: string;
    additionalContext?: string;
    // refine mode
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
      const prompt = `You are a ${reportType === 'mtr' ? 'mid-term' : 'short-term'} rental revenue consultant for E&J Retreats.

Property: ${address}
${originalCtx}
Existing report (JSON):
${JSON.stringify(existingReport, null, 2)}

New correction/context from user:
"${refinementMessage.trim()}"

Revise the report to incorporate this. Update affected sections; keep unaffected ones. Return the complete updated report.
${globalRules}`;

      const output = await runRefine(reportType, prompt);
      return res.status(200).json(output);
    }

    // ── GENERATE MODE ────────────────────────────────────────────────────────
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

    const output = await runGenerate(reportType, reportType === 'mtr' ? mtrPrompt : strPrompt, pdfBase64);
    return res.status(200).json(output);

  } catch (err) {
    console.error('generate-revenue-report error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process report' });
  }
}

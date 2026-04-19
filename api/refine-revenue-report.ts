import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const StrReportSchema = z.object({
  extracted: z.object({
    projectedAnnualRevenue: z.number().nullable(),
    occupancyRate: z.number().nullable(),
    adr: z.number().nullable(),
    revpar: z.number().nullable(),
  }),
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { address, reportType = 'str', existingReport, refinementMessage, additionalContext } = req.body as {
    address: string;
    reportType?: 'str' | 'mtr';
    existingReport: Record<string, unknown>;
    refinementMessage: string;
    additionalContext?: string;
  };

  if (!address || !existingReport || !refinementMessage?.trim()) {
    return res.status(400).json({ error: 'address, existingReport, and refinementMessage are required' });
  }

  const globalRules = `
RULES:
- If the property already has an amenity mentioned anywhere in the context, do NOT recommend adding it — acknowledge it as a strength.
- When referencing property management software, refer to Uplisting only.
- Do NOT include operating expenses, net operating income (NOI), or cap rate. Focus on gross revenue metrics only.`;

  const originalContextSection = additionalContext?.trim()
    ? `\nORIGINAL CONTEXT (provided when the report was first generated — treat this as established facts about the property):\n${additionalContext.trim()}\n`
    : '';

  const prompt = `You are a ${reportType === 'mtr' ? 'mid-term' : 'short-term'} rental revenue consultant for E&J Retreats.

Property: ${address}
${originalContextSection}
Here is the existing revenue analysis report (JSON):
${JSON.stringify(existingReport, null, 2)}

The user has provided the following new correction or additional context:
"${refinementMessage.trim()}"

Please revise the report to fully incorporate both the original context above and this new information. Update any affected sections — title, executive summary, recommendations, key findings, opportunity score, projections, etc. Keep sections that are unaffected. Return the complete updated report.
${globalRules}`;

  try {
    if (reportType === 'mtr') {
      const { output } = await generateText({
        model: 'anthropic/claude-sonnet-4.6',
        output: Output.object({ schema: MtrReportSchema }),
        messages: [{ role: 'user', content: prompt }],
      });
      return res.status(200).json({ ...output, reportType: 'mtr' });
    } else {
      const { output } = await generateText({
        model: 'anthropic/claude-sonnet-4.6',
        output: Output.object({ schema: StrReportSchema }),
        messages: [{ role: 'user', content: prompt }],
      });
      return res.status(200).json({ ...output, reportType: 'str' });
    }
  } catch (err) {
    console.error('refine-revenue-report error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to refine report' });
  }
}

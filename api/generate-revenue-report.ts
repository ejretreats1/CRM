import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const ReportSchema = z.object({
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { address, pdfBase64, ownerActualRevenue, ownerNotes } = req.body as {
    address: string;
    pdfBase64: string;
    ownerActualRevenue?: number;
    ownerNotes?: string;
  };

  if (!address || !pdfBase64) {
    return res.status(400).json({ error: 'address and pdfBase64 are required' });
  }

  const ownerSection = ownerActualRevenue != null
    ? `Owner-reported actual revenue (last 12 months): $${ownerActualRevenue.toLocaleString()}${ownerNotes ? `\nOwner context: ${ownerNotes}` : ''}`
    : 'Owner actual revenue: not provided — focus on market potential.';

  const prompt = `You are a short-term rental revenue consultant for E&J Retreats, a property management company.

Property address: ${address}
${ownerSection}

The attached PDF is an AirDNA Rentalizer report for this property. Please:
1. Extract the key financial metrics from the PDF.
2. Generate a professional revenue analysis.
3. If owner actual revenue IS provided, include a performance gap analysis comparing actual vs projected.
4. Write 3–5 specific recommendations to maximize revenue (pricing, listing optimization, amenities, seasonality).
5. Assign an opportunity score 1–10 (10 = massive untapped potential).

Write in a confident, professional tone suitable for presenting to a property owner.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY — add it to Vercel environment variables.' });

  try {
    const anthropic = createAnthropic({ apiKey });
    const { output } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      output: Output.object({ schema: ReportSchema }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: pdfBase64,
              mediaType: 'application/pdf',
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    return res.status(200).json(output);
  } catch (err) {
    console.error('generate-revenue-report error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate report' });
  }
}

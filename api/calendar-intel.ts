import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, Output } from 'ai';
import { z } from 'zod';

export const config = { maxDuration: 120 };

const RecommendationSchema = z.object({
  action: z.string(),
  reason: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
});

const PropertyAnalysisSchema = z.object({
  propertyId: z.string(),
  urgency: z.enum(['critical', 'warning', 'info', 'ok']),
  headline: z.string(),
  recommendations: z.array(RecommendationSchema),
});

const OutputSchema = z.object({
  analyses: z.array(PropertyAnalysisSchema),
  portfolioSummary: z.string(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { insights } = req.body as { insights: unknown[] };
  if (!Array.isArray(insights) || insights.length === 0) {
    return res.status(400).json({ error: 'insights array required' });
  }

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are a short-term rental revenue optimization expert for E&J Retreats, a property management company.

Today is ${today}.

Below is live data for ${insights.length} managed properties. For each property analyze the calendar gaps, occupancy trajectory, booking velocity, ADR, and channel mix. Then provide specific, immediately actionable recommendations to fill gaps and maximize revenue.

PROPERTY DATA:
${JSON.stringify(insights, null, 2)}

FOR EACH PROPERTY:
1. Assign urgency: critical (urgent gap within 7 days or <30% occupancy next 30d), warning (<50% next 30d or large upcoming gap), info (generally healthy but room to optimize), ok (performing well).
2. Write a 1-sentence headline summarizing the key issue or opportunity.
3. List 3–5 specific recommendations ordered by priority. Be very specific:
   - Mention exact gap dates where relevant
   - Suggest specific discount % or price adjustment amounts based on ADR
   - Name specific channels to activate or push harder
   - Mention specific promotion types (last-minute deal, weekend special, extended stay discount, etc.)
   - Reference seasonal context (upcoming holidays, slow season, etc.)

4. Write a 2–3 sentence portfolio summary highlighting the biggest opportunities across all properties.

IMPORTANT:
- Base all advice on the actual numbers in the data
- Do not give generic advice — every recommendation must reference a specific data point
- If a property has no Uplisting data (uplistingId is null), note that calendar data is unavailable and recommend connecting Uplisting
- ADR of 0 means no recent booking data available`;

  try {
    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-4.6',
      output: Output.object({ schema: OutputSchema }),
      messages: [{ role: 'user', content: prompt }],
    });

    return res.status(200).json(output);
  } catch (err) {
    console.error('calendar-intel error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Analysis failed' });
  }
}

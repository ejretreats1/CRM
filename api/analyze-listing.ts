import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const AnalysisSchema = z.object({
  overallScore: z.number().int().min(1).max(10),
  overallSummary: z.string(),
  priorityFixes: z.array(z.object({
    title: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
    description: z.string(),
  })),
  categories: z.array(z.object({
    name: z.string(),
    grade: z.enum(['A', 'B', 'C', 'D', 'F']),
    score: z.number().int().min(1).max(10),
    findings: z.array(z.string()),
    recommendations: z.array(z.string()),
  })),
  rewrittenTitle: z.string(),
  rewrittenDescriptionOpening: z.string(),
  suggestedKeywords: z.array(z.string()),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, description, amenities, price, photoCount, photoNotes, propertyType, location, reviewCount, starRating } = req.body as {
    title: string;
    description: string;
    amenities?: string;
    price?: string;
    photoCount?: number;
    photoNotes?: string;
    propertyType?: string;
    location?: string;
    reviewCount?: number;
    starRating?: number;
  };

  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  const prompt = `You are an expert Airbnb listing optimization consultant for E&J Retreats, a short-term rental property management company.

Analyze the following Airbnb listing and provide a comprehensive optimization report.

--- LISTING DATA ---
Title: ${title}
Property Type: ${propertyType || 'Not specified'}
Location: ${location || 'Not specified'}
Nightly Price: ${price ? `$${price}` : 'Not specified'}
Reviews: ${reviewCount != null ? reviewCount : 'Not specified'}
Star Rating: ${starRating != null ? `${starRating}/5` : 'Not specified'}
Photo Count: ${photoCount != null ? photoCount : 'Not specified'}
Photo Coverage Notes: ${photoNotes || 'Not specified'}

Description:
${description}

Amenities:
${amenities || 'Not specified'}
--- END LISTING DATA ---

Evaluate these 6 categories:
1. Title - keyword strength, emotional appeal, length, uniqueness
2. Description - opening hook, flow, amenity highlights, local area, call to action
3. Amenities - completeness, high-value items present/missing, competitive positioning
4. Photos - based on count and coverage notes provided (what's missing, ideal order)
5. Pricing - value signals communicated in the listing (not actual pricing advice)
6. Guest Experience - house rules tone, check-in clarity, welcome language, trust signals

For each category assign a letter grade (A-F) and score (1-10).
Identify the top 3 highest-impact priority fixes.
Rewrite the title to be more compelling.
Rewrite only the opening 2-3 sentences of the description to be stronger.
List 8-10 SEO keywords the listing should include.

Be direct, specific, and actionable. Reference exact phrases from the listing when critiquing.`;

  try {
    const { output } = await generateText({
      model: 'anthropic/claude-sonnet-4.6',
      output: Output.object({ schema: AnalysisSchema }),
      messages: [{ role: 'user', content: prompt }],
    });

    return res.status(200).json(output);
  } catch (err) {
    console.error('analyze-listing error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to analyze listing' });
  }
}

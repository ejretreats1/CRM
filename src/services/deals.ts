import { supabase } from './supabase';
import type { Deal } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDeal(r: any): Deal {
  return {
    id: r.id,
    address: r.address,
    city: r.city ?? '',
    state: r.state ?? '',
    market: r.market ?? '',
    listingPrice: Number(r.listing_price) || 0,
    bedrooms: r.bedrooms != null ? Number(r.bedrooms) : null,
    bathrooms: r.bathrooms != null ? Number(r.bathrooms) : null,
    propertyType: r.property_type ?? '',
    zillowUrl: r.zillow_url ?? undefined,
    zillowDescription: r.zillow_description ?? undefined,
    projectedAnnualRevenue: r.projected_annual_revenue != null ? Number(r.projected_annual_revenue) : null,
    grossYield: r.gross_yield != null ? Number(r.gross_yield) : null,
    opportunityScore: r.opportunity_score != null ? Number(r.opportunity_score) : null,
    aiScoreReasoning: r.ai_score_reasoning ?? undefined,
    aiKeyStrengths: r.ai_key_strengths ?? undefined,
    aiKeyConcerns: r.ai_key_concerns ?? undefined,
    aiRecommendation: r.ai_recommendation ?? undefined,
    strStatus: r.str_status ?? 'unknown',
    strNote: r.str_note ?? undefined,
    stage: r.stage ?? 'new',
    notes: r.notes ?? undefined,
    linkedReportId: r.linked_report_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchDeals(): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDeal);
}

export async function upsertDeal(
  deal: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<Deal> {
  const now = new Date().toISOString();
  const row = {
    ...(deal.id ? { id: deal.id } : {}),
    address: deal.address,
    city: deal.city,
    state: deal.state,
    market: deal.market,
    listing_price: deal.listingPrice,
    bedrooms: deal.bedrooms,
    bathrooms: deal.bathrooms,
    property_type: deal.propertyType,
    zillow_url: deal.zillowUrl ?? null,
    zillow_description: deal.zillowDescription ?? null,
    projected_annual_revenue: deal.projectedAnnualRevenue ?? null,
    gross_yield: deal.grossYield ?? null,
    opportunity_score: deal.opportunityScore ?? null,
    ai_score_reasoning: deal.aiScoreReasoning ?? null,
    ai_key_strengths: deal.aiKeyStrengths ?? null,
    ai_key_concerns: deal.aiKeyConcerns ?? null,
    ai_recommendation: deal.aiRecommendation ?? null,
    str_status: deal.strStatus,
    str_note: deal.strNote ?? null,
    stage: deal.stage,
    notes: deal.notes ?? null,
    linked_report_id: deal.linkedReportId ?? null,
    updated_at: now,
    ...(!deal.id ? { created_at: now } : {}),
  };

  const { data, error } = await supabase
    .from('deals')
    .upsert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToDeal(data);
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

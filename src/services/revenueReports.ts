import { supabase } from './supabase';
import type { RevenueReport } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToReport(r: any): RevenueReport {
  return {
    id: r.id,
    createdAt: r.created_at,
    propertyAddress: r.property_address,
    leadId: r.lead_id ?? undefined,
    airdnaProjectedRevenue: r.airdna_projected_revenue ?? undefined,
    airdnaOccupancyRate: r.airdna_occupancy_rate ?? undefined,
    airdnaAdr: r.airdna_adr ?? undefined,
    airdnaRevpar: r.airdna_revpar ?? undefined,
    ownerActualRevenue: r.owner_actual_revenue ?? undefined,
    ownerNotes: r.owner_notes ?? undefined,
    claudeNarrative: r.claude_narrative ?? undefined,
    keyFindings: r.key_findings ?? undefined,
    opportunityScore: r.opportunity_score ?? undefined,
    reportTitle: r.report_title ?? undefined,
  };
}

export async function fetchRevenueReports(): Promise<RevenueReport[]> {
  const { data, error } = await supabase
    .from('revenue_reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToReport);
}

export async function saveRevenueReport(report: Omit<RevenueReport, 'id' | 'createdAt'>): Promise<RevenueReport> {
  const { data, error } = await supabase
    .from('revenue_reports')
    .insert({
      property_address: report.propertyAddress,
      lead_id: report.leadId ?? null,
      airdna_projected_revenue: report.airdnaProjectedRevenue ?? null,
      airdna_occupancy_rate: report.airdnaOccupancyRate ?? null,
      airdna_adr: report.airdnaAdr ?? null,
      airdna_revpar: report.airdnaRevpar ?? null,
      owner_actual_revenue: report.ownerActualRevenue ?? null,
      owner_notes: report.ownerNotes ?? null,
      claude_narrative: report.claudeNarrative ?? null,
      key_findings: report.keyFindings ?? null,
      opportunity_score: report.opportunityScore ?? null,
      report_title: report.reportTitle ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToReport(data);
}

export async function deleteRevenueReport(id: string): Promise<void> {
  const { error } = await supabase.from('revenue_reports').delete().eq('id', id);
  if (error) throw error;
}

import { X, TrendingUp, Star, BarChart2, ChevronRight } from 'lucide-react';
import type { RevenueReport } from '../../types';

interface Props {
  report: RevenueReport;
  onClose: () => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? 'bg-[#0a2518] text-[#4ab57a]' : score >= 4 ? 'bg-[#2a1a0a] text-[#d0954a]' : 'bg-[#1e2d45] text-[#8aaac8]';
  return <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${color}`}>{score}/10</span>;
}

function MetricBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-[#162035]' : 'bg-[#1e2d45]'}`}>
      <p className={`text-xs mb-0.5 ${accent ? 'text-[#4a90d9]' : 'text-[#8aaac8]'}`}>{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-[#4a90d9]' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function fmt(n: number | null | undefined) {
  return n == null ? '—' : `$${Math.round(n).toLocaleString()}`;
}
function fmtPct(n: number | null | undefined) {
  return n == null ? '—' : `${Math.round(n)}%`;
}

export default function ReportViewerModal({ report, onClose }: Props) {
  const d = report.reportData as any;
  const isMtr = report.reportType === 'mtr';

  const extracted = d?.extracted ?? d?.strExtracted;
  const mtrProjected = d?.mtrProjected;
  const strVsMtr = d?.strVsMtr;
  const revenueProjections = d?.revenueProjections;
  const seasonality: any[] = d?.monthlySeasonality ?? [];
  const comparables: any[] = d?.comparables ?? [];
  const recommendations: { title: string; description: string }[] = d?.recommendations ?? [];
  const keyFindings: string[] = report.keyFindings ?? d?.keyFindings ?? [];
  const executiveSummary: string = d?.executiveSummary ?? report.claudeNarrative ?? '';
  const marketOpportunity: string = d?.marketOpportunity ?? '';
  const performanceGap: string | null = d?.performanceGap ?? null;
  const opportunityScore = report.opportunityScore ?? d?.opportunityScore;
  const recommendedPlatforms: string[] = d?.recommendedPlatforms ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#1e2d45] flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isMtr ? 'bg-[#1a1a35] text-[#d07af5]' : 'bg-[#162035] text-[#4a90d9]'}`}>
                {isMtr ? 'MTR' : 'STR'} Report
              </span>
              {opportunityScore != null && <ScoreBadge score={opportunityScore} />}
            </div>
            <h2 className="font-bold text-white text-base leading-snug">{report.reportTitle ?? report.propertyAddress}</h2>
            <p className="text-xs text-[#3a5070] mt-0.5">
              {report.propertyAddress} · {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="text-[#3a5070] hover:text-[#8aaac8] flex-shrink-0 mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Key metrics */}
          {!isMtr && extracted && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricBox label="Projected Annual" value={fmt(extracted.projectedAnnualRevenue)} accent />
              <MetricBox label="Occupancy Rate" value={fmtPct(extracted.occupancyRate)} />
              <MetricBox label="Avg Daily Rate" value={fmt(extracted.adr)} />
              <MetricBox label="RevPAR" value={fmt(extracted.revpar)} />
            </div>
          )}

          {isMtr && mtrProjected && (
            <div className="grid grid-cols-3 gap-2">
              <MetricBox label="Est. Monthly Rent" value={fmt(mtrProjected.monthlyRent)} accent />
              <MetricBox label="Est. Annual Revenue" value={fmt(mtrProjected.annualRevenue)} accent />
              <MetricBox label="Expected Occupancy" value={fmtPct(mtrProjected.occupancyRate)} />
            </div>
          )}

          {/* Owner vs market */}
          {report.ownerActualRevenue != null && (extracted?.projectedAnnualRevenue ?? mtrProjected?.annualRevenue) != null && (() => {
            const projected = extracted?.projectedAnnualRevenue ?? mtrProjected?.annualRevenue ?? 0;
            const gap = projected - report.ownerActualRevenue!;
            return (
              <div className={`rounded-xl p-4 ${gap > 0 ? 'bg-[#2a0e0e] border border-rose-100' : 'bg-[#0a2518] border border-emerald-100'}`}>
                <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2">Owner vs. Market</p>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-xs text-[#3a5070]">Owner Reported</p>
                    <p className="text-xl font-bold text-white">{fmt(report.ownerActualRevenue)}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#3a5070]" />
                  <div className="text-center">
                    <p className="text-xs text-[#3a5070]">{isMtr ? 'MTR' : 'AirDNA'} Projected</p>
                    <p className="text-xl font-bold text-[#4a90d9]">{fmt(projected)}</p>
                  </div>
                  <div className={`ml-auto text-sm font-bold ${gap > 0 ? 'text-rose-700' : 'text-[#4ab57a]'}`}>
                    {gap > 0 ? `-${fmt(gap)} gap` : `+${fmt(Math.abs(gap))} above`}
                  </div>
                </div>
                {report.ownerNotes && <p className="text-xs text-[#8aaac8] mt-2 italic">{report.ownerNotes}</p>}
              </div>
            );
          })()}

          {/* Revenue projections */}
          {revenueProjections && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2 flex items-center gap-1.5"><TrendingUp size={12} /> Revenue Projections</p>
              <div className="grid grid-cols-3 gap-2">
                <MetricBox label="Conservative" value={fmt(revenueProjections.conservative)} />
                <MetricBox label="Realistic" value={fmt(revenueProjections.realistic)} accent />
                <MetricBox label="Optimistic" value={fmt(revenueProjections.optimistic)} />
              </div>
            </div>
          )}

          {/* Executive summary */}
          {executiveSummary && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2">Executive Summary</p>
              <p className="text-sm text-[#8aaac8] leading-relaxed">{executiveSummary}</p>
            </div>
          )}

          {/* Market opportunity */}
          {marketOpportunity && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2">Market Opportunity</p>
              <p className="text-sm text-[#8aaac8] leading-relaxed">{marketOpportunity}</p>
            </div>
          )}

          {/* Performance gap */}
          {performanceGap && (
            <div className="bg-[#2a1a0a] border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-[#d0954a] uppercase tracking-wide mb-2">Performance Gap</p>
              <p className="text-sm text-amber-900 leading-relaxed">{performanceGap}</p>
            </div>
          )}

          {/* Key findings */}
          {keyFindings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2 flex items-center gap-1.5"><Star size={12} /> Key Findings</p>
              <ul className="space-y-2">
                {keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#8aaac8]">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2">Recommendations</p>
              <div className="space-y-2.5">
                {recommendations.map((rec, i) => (
                  <div key={i} className="bg-[#1e2d45] rounded-xl p-3">
                    <p className="text-sm font-semibold text-white mb-0.5">{i + 1}. {rec.title}</p>
                    <p className="text-xs text-[#8aaac8] leading-relaxed">{rec.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STR vs MTR comparison */}
          {isMtr && strVsMtr && (
            <div className="bg-[#1a1a35] border border-indigo-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-[#d07af5] uppercase tracking-wide mb-2">STR vs MTR</p>
              <div className="flex gap-4 mb-2">
                <div className="text-center">
                  <p className="text-xs text-[#3a5070]">STR Estimate</p>
                  <p className="text-lg font-bold text-[#8aaac8]">{fmt(strVsMtr.strAnnualEstimate)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-[#3a5070]">MTR Estimate</p>
                  <p className="text-lg font-bold text-[#d07af5]">{fmt(strVsMtr.mtrAnnualEstimate)}</p>
                </div>
                <div className="ml-auto">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${strVsMtr.recommendation === 'mtr' ? 'bg-[#1a1a35] text-[#d07af5]' : strVsMtr.recommendation === 'str' ? 'bg-[#162035] text-[#4a90d9]' : 'bg-[#2a1a0a] text-[#d0954a]'}`}>
                    Recommend: {strVsMtr.recommendation.toUpperCase()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[#8aaac8] leading-relaxed">{strVsMtr.reasoning}</p>
            </div>
          )}

          {/* MTR specifics */}
          {isMtr && mtrProjected && (
            <div className="grid grid-cols-2 gap-3">
              {mtrProjected.recommendedLeaseLength && (
                <div className="bg-[#1e2d45] rounded-xl p-3">
                  <p className="text-xs text-[#3a5070] mb-0.5">Lease Length</p>
                  <p className="text-sm font-semibold text-white">{mtrProjected.recommendedLeaseLength}</p>
                </div>
              )}
              {mtrProjected.targetTenantProfile && (
                <div className="bg-[#1e2d45] rounded-xl p-3">
                  <p className="text-xs text-[#3a5070] mb-0.5">Target Tenant</p>
                  <p className="text-sm font-semibold text-white">{mtrProjected.targetTenantProfile}</p>
                </div>
              )}
            </div>
          )}

          {/* Recommended platforms */}
          {recommendedPlatforms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2">Recommended Platforms</p>
              <div className="flex flex-wrap gap-2">
                {recommendedPlatforms.map((p, i) => (
                  <span key={i} className="text-xs bg-[#1e2d45] text-[#8aaac8] px-2.5 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Monthly seasonality */}
          {seasonality.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2 flex items-center gap-1.5"><BarChart2 size={12} /> Monthly Seasonality</p>
              <div className="grid grid-cols-6 gap-1.5">
                {seasonality.map((m, i) => {
                  const maxRev = Math.max(...seasonality.map(s => s.revenue ?? 0), 1);
                  const pct = m.revenue != null ? Math.round((m.revenue / maxRev) * 100) : 0;
                  return (
                    <div key={i} className="text-center">
                      <div className="h-12 flex items-end justify-center mb-1">
                        <div className="w-6 bg-teal-400 rounded-t" style={{ height: `${Math.max(pct, 4)}%` }} />
                      </div>
                      <p className="text-xs text-[#3a5070]">{m.month?.slice(0, 3)}</p>
                      {m.revenue != null && <p className="text-xs font-medium text-[#8aaac8]">${Math.round(m.revenue / 1000)}k</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comparables */}
          {comparables.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide mb-2">Comparable Properties</p>
              <div className="space-y-1.5">
                {comparables.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 bg-[#1e2d45] rounded-lg px-3 py-2 text-xs text-[#8aaac8]">
                    {c.bedrooms != null && <span className="font-medium">{c.bedrooms}bd</span>}
                    {c.annualRevenue != null && <span className="text-[#4a90d9] font-semibold">{fmt(c.annualRevenue)}/yr</span>}
                    {c.occupancyRate != null && <span>{fmtPct(c.occupancyRate)} occ</span>}
                    {c.adr != null && <span>{fmt(c.adr)} ADR</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Printer, Save, ArrowLeft, TrendingUp, TrendingDown, Minus, Sparkles, Loader, ChevronDown, ChevronUp } from 'lucide-react';

interface StrExtracted {
  projectedAnnualRevenue: number | null;
  occupancyRate: number | null;
  adr: number | null;
  revpar: number | null;
}

interface MtrProjected {
  monthlyRent: number;
  annualRevenue: number;
  occupancyRate: number;
  recommendedLeaseLength: string;
  targetTenantProfile: string;
}

interface StrVsMtr {
  recommendation: 'str' | 'mtr' | 'hybrid';
  strAnnualEstimate: number | null;
  mtrAnnualEstimate: number;
  reasoning: string;
}

interface MonthData {
  month: string;
  revenue: number | null;
  occupancy: number | null;
}

interface CompData {
  bedrooms: number | null;
  annualRevenue: number | null;
  occupancyRate: number | null;
  adr: number | null;
}

interface ReportData {
  reportType?: 'str' | 'mtr';
  // STR
  extracted?: StrExtracted;
  revenueProjections?: { conservative: number; realistic: number; optimistic: number };
  // MTR
  strExtracted?: { projectedAnnualRevenue: number | null; occupancyRate: number | null; adr: number | null };
  mtrProjected?: MtrProjected;
  strVsMtr?: StrVsMtr;
  recommendedPlatforms?: string[];
  // Shared
  monthlySeasonality?: MonthData[];
  comparables?: CompData[];
  reportTitle: string;
  executiveSummary: string;
  marketOpportunity: string;
  performanceGap: string | null;
  recommendations: { title: string; description: string }[];
  keyFindings: string[];
  opportunityScore: number;
}

interface ReportOutputProps {
  address: string;
  data: ReportData;
  ownerActualRevenue?: number;
  ownerNotes?: string;
  saving?: boolean;
  saved?: boolean;
  onSave: () => void;
  onBack: () => void;
  onRefine?: (message: string) => Promise<void>;
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—';
  return `${Math.round(n)}%`;
}

function ScoreArc({ score }: { score: number }) {
  const pct = score / 10;
  const color = score >= 7 ? 'text-emerald-600' : score >= 4 ? 'text-amber-500' : 'text-red-500';
  const bgColor = score >= 7 ? 'bg-emerald-50' : score >= 4 ? 'bg-amber-50' : 'bg-red-50';
  return (
    <div className={`${bgColor} rounded-xl p-4 text-center`}>
      <div className={`text-4xl font-black ${color}`}>{score}<span className="text-lg font-semibold text-slate-400">/10</span></div>
      <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wide">Opportunity Score</div>
      <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${score >= 7 ? 'bg-emerald-500' : score >= 4 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function GapBadge({ projected, actual }: { projected: number | null; actual: number }) {
  if (!projected) return null;
  const gap = projected - actual;
  const pct = Math.round((gap / projected) * 100);
  if (gap > 0) return (
    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <TrendingDown size={14} className="text-red-500" />
      <span className="text-sm font-semibold text-red-700">${Math.round(gap).toLocaleString()} below market ({pct}% gap)</span>
    </div>
  );
  if (gap < 0) return (
    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
      <TrendingUp size={14} className="text-emerald-600" />
      <span className="text-sm font-semibold text-emerald-700">${Math.round(Math.abs(gap)).toLocaleString()} above market — outperforming!</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      <Minus size={14} className="text-slate-500" />
      <span className="text-sm font-semibold text-slate-600">At market rate</span>
    </div>
  );
}

function SeasonalityChart({ months, isMtr }: { months: MonthData[]; isMtr: boolean }) {
  const maxRevenue = Math.max(...months.map(m => m.revenue ?? 0), 1);
  const barColor = isMtr ? '#4f46e5' : '#0f766e';
  const barColorLight = isMtr ? '#e0e7ff' : '#ccfbf1';
  const W = 560, H = 160, PAD_LEFT = 48, PAD_BOTTOM = 28, PAD_TOP = 16, PAD_RIGHT = 8;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_BOTTOM - PAD_TOP;
  const barW = Math.floor(chartW / months.length) - 4;

  return (
    <div className="print-section">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Monthly Seasonality</h3>
      <div className="bg-slate-50 rounded-xl p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
          {/* Y-axis gridlines + labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = PAD_TOP + chartH * (1 - pct);
            const val = Math.round(maxRevenue * pct);
            return (
              <g key={pct}>
                <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={PAD_LEFT - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                  {val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${val}`}
                </text>
              </g>
            );
          })}
          {/* Bars */}
          {months.map((m, i) => {
            const x = PAD_LEFT + i * (chartW / months.length) + 2;
            const rev = m.revenue ?? 0;
            const barH = Math.max(2, (rev / maxRevenue) * chartH);
            const y = PAD_TOP + chartH - barH;
            const occ = m.occupancy != null ? `${Math.round(m.occupancy)}%` : '';
            return (
              <g key={m.month}>
                <rect x={x} y={PAD_TOP} width={barW} height={chartH} fill={barColorLight} rx="3" />
                <rect x={x} y={y} width={barW} height={barH} fill={barColor} rx="3" />
                {occ && (
                  <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="8" fill={barColor} fontWeight="600">
                    {occ}
                  </text>
                )}
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">
                  {m.month.slice(0, 3)}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="text-xs text-slate-400 mt-1 text-right">Occupancy % shown above bars · Revenue per month</p>
      </div>
    </div>
  );
}

function ComparablesTable({ comps }: { comps: CompData[] }) {
  return (
    <div className="print-section">
      <h3 className="text-sm font-bold text-slate-800 mb-3">Comparable Properties</h3>
      <div className="bg-slate-50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Beds</th>
              <th className="px-4 py-2.5 text-right">Annual Revenue</th>
              <th className="px-4 py-2.5 text-right">Occupancy</th>
              <th className="px-4 py-2.5 text-right">ADR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comps.map((c, i) => (
              <tr key={i} className="bg-white">
                <td className="px-4 py-2.5 text-slate-700 font-medium">{c.bedrooms != null ? `${c.bedrooms} BR` : '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-teal-700">{c.annualRevenue != null ? `$${Math.round(c.annualRevenue).toLocaleString()}` : '—'}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{c.occupancyRate != null ? `${Math.round(c.occupancyRate)}%` : '—'}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{c.adr != null ? `$${Math.round(c.adr)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-400 px-4 py-2 text-right">Source: AirDNA comparable listings</p>
      </div>
    </div>
  );
}

const RECOMMENDATION_LABELS: Record<string, { label: string; color: string }> = {
  str:    { label: '🏠 Stick with Short-Term Rental', color: 'bg-blue-50 text-blue-800 border-blue-200' },
  mtr:    { label: '📅 Switch to Mid-Term Rental',    color: 'bg-teal-50 text-teal-800 border-teal-200' },
  hybrid: { label: '⚖️ Hybrid STR + MTR Strategy',    color: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export default function ReportOutput({ address, data, ownerActualRevenue, onSave, onBack, saving, saved, onRefine }: ReportOutputProps) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const isMtr = data.reportType === 'mtr';
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineMsg, setRefineMsg] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState('');
  const [refineSuccess, setRefineSuccess] = useState(false);

  async function handleRefine() {
    if (!refineMsg.trim() || !onRefine) return;
    setRefining(true);
    setRefineError('');
    setRefineSuccess(false);
    try {
      await onRefine(refineMsg.trim());
      setRefineMsg('');
      setRefineSuccess(true);
      setRefineOpen(false);
    } catch {
      setRefineError('Refinement failed. Please try again.');
    } finally {
      setRefining(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <style>{`
        @media print {
          @page { margin: 0.6in 0.5in; size: letter; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-4 print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
          >
            <Printer size={14} /> Print / PDF
          </button>
          <button
            onClick={onSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Save size={14} /> {saved ? 'Saved' : saving ? 'Saving...' : 'Save Report'}
          </button>
        </div>
      </div>

      <div className="bg-white mx-6 mb-6 rounded-2xl border border-slate-200 overflow-hidden print:overflow-visible print:border-none print:rounded-none print:mx-0 print:mb-0">

        {/* Header */}
        <div className={`text-white px-8 py-6 ${isMtr ? 'bg-indigo-700' : 'bg-teal-700'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isMtr ? 'text-indigo-200' : 'text-teal-200'}`}>
                E&J Retreats · {isMtr ? 'Mid-Term Rental Analysis' : 'Revenue Analysis'}
              </div>
              <h1 className="text-2xl font-bold leading-tight">{data.reportTitle}</h1>
              <p className={`text-sm mt-1 ${isMtr ? 'text-indigo-200' : 'text-teal-200'}`}>{address}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-xs ${isMtr ? 'text-indigo-200' : 'text-teal-200'}`}>{date}</div>
              {isMtr && <div className="text-xs font-bold mt-1 bg-white/20 px-2 py-0.5 rounded-full">MTR Report</div>}
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">

          {/* ── STR stat cards ── */}
          {!isMtr && data.extracted && (
            <div className="print-section grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Projected Annual', value: fmt(data.extracted.projectedAnnualRevenue), sub: 'per AirDNA' },
                { label: 'Occupancy Rate',   value: fmtPct(data.extracted.occupancyRate),        sub: 'per AirDNA' },
                { label: 'Avg Daily Rate',   value: fmt(data.extracted.adr),                     sub: 'per AirDNA' },
                { label: 'RevPAR',           value: fmt(data.extracted.revpar),                  sub: 'per AirDNA' },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xl font-black text-teal-700">{s.value}</div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">{s.label}</div>
                  <div className="text-xs text-slate-400">{s.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── MTR stat cards ── */}
          {isMtr && data.mtrProjected && (
            <div className="print-section grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Est. Monthly Rent',    value: fmt(data.mtrProjected.monthlyRent),   sub: 'MTR projection', accent: true },
                { label: 'Est. Annual Revenue',  value: fmt(data.mtrProjected.annualRevenue),  sub: 'MTR projection', accent: true },
                { label: 'Expected Occupancy',   value: fmtPct(data.mtrProjected.occupancyRate), sub: 'MTR typical',  accent: false },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 ${s.accent ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                  <div className={`text-xl font-black ${s.accent ? 'text-indigo-700' : 'text-slate-700'}`}>{s.value}</div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">{s.label}</div>
                  <div className="text-xs text-slate-400">{s.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── MTR details ── */}
          {isMtr && data.mtrProjected && (
            <div className="print-section grid sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Lease & Tenant</p>
                <p className="text-sm font-semibold text-slate-800">{data.mtrProjected.recommendedLeaseLength} stays</p>
                <p className="text-xs text-slate-500 mt-1">{data.mtrProjected.targetTenantProfile}</p>
              </div>
              {data.recommendedPlatforms && data.recommendedPlatforms.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recommended Platforms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.recommendedPlatforms.map(p => (
                      <span key={p} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STR vs MTR comparison ── */}
          {isMtr && data.strVsMtr && (
            <div className="print-section bg-slate-50 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-800">STR vs. MTR Comparison</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-3 text-center border border-slate-200">
                  <p className="text-xs text-slate-500 mb-1">STR Annual (AirDNA)</p>
                  <p className="text-2xl font-black text-blue-700">{fmt(data.strVsMtr.strAnnualEstimate)}</p>
                  <p className="text-xs text-slate-400">short-term rental</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-indigo-200">
                  <p className="text-xs text-slate-500 mb-1">MTR Annual (projected)</p>
                  <p className="text-2xl font-black text-indigo-700">{fmt(data.strVsMtr.mtrAnnualEstimate)}</p>
                  <p className="text-xs text-slate-400">mid-term rental</p>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${RECOMMENDATION_LABELS[data.strVsMtr.recommendation].color}`}>
                {RECOMMENDATION_LABELS[data.strVsMtr.recommendation].label}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{data.strVsMtr.reasoning}</p>
            </div>
          )}

          {/* ── Owner comparison (STR) ── */}
          {!isMtr && ownerActualRevenue != null && data.extracted && (
            <div className="print-section bg-slate-50 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Owner vs. Market</h3>
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-slate-500">Owner Reported</div>
                  <div className="text-2xl font-black text-slate-800">{fmt(ownerActualRevenue)}</div>
                  <div className="text-xs text-slate-400">last 12 months</div>
                </div>
                <div className="text-slate-300 text-2xl font-light">vs</div>
                <div>
                  <div className="text-xs text-slate-500">AirDNA Projected</div>
                  <div className="text-2xl font-black text-teal-700">{fmt(data.extracted.projectedAnnualRevenue)}</div>
                  <div className="text-xs text-slate-400">market potential</div>
                </div>
              </div>
              <GapBadge projected={data.extracted.projectedAnnualRevenue} actual={ownerActualRevenue} />
            </div>
          )}

          {/* ── Owner comparison (MTR) ── */}
          {isMtr && ownerActualRevenue != null && data.mtrProjected && (
            <div className="print-section bg-slate-50 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Owner vs. MTR Projection</h3>
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-slate-500">Owner Reported (STR)</div>
                  <div className="text-2xl font-black text-slate-800">{fmt(ownerActualRevenue)}</div>
                  <div className="text-xs text-slate-400">last 12 months</div>
                </div>
                <div className="text-slate-300 text-2xl font-light">vs</div>
                <div>
                  <div className="text-xs text-slate-500">MTR Projected</div>
                  <div className="text-2xl font-black text-indigo-700">{fmt(data.mtrProjected.annualRevenue)}</div>
                  <div className="text-xs text-slate-400">annual MTR potential</div>
                </div>
              </div>
              <GapBadge projected={data.mtrProjected.annualRevenue} actual={ownerActualRevenue} />
            </div>
          )}

          {/* Score + Summary */}
          <div className="print-section grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <ScoreArc score={data.opportunityScore} />
            </div>
            <div className="sm:col-span-2 bg-slate-50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-2">Executive Summary</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{data.executiveSummary}</p>
            </div>
          </div>

          {/* Key findings */}
          {data.keyFindings.length > 0 && (
            <div className="print-section">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Key Findings</h3>
              <ul className="space-y-2">
                {data.keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Seasonality chart */}
          {data.monthlySeasonality && data.monthlySeasonality.length > 0 && (
            <SeasonalityChart months={data.monthlySeasonality} isMtr={isMtr} />
          )}

          {/* Comparable properties */}
          {data.comparables && data.comparables.length > 0 && (
            <ComparablesTable comps={data.comparables} />
          )}

          {/* Market opportunity */}
          {data.marketOpportunity && (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Market Opportunity</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{data.marketOpportunity}</p>
            </div>
          )}

          {/* Performance gap */}
          {data.performanceGap && (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Performance Gap Analysis</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{data.performanceGap}</p>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="print-section">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Recommendations</h3>
              <ol className="space-y-3">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${isMtr ? 'bg-indigo-600' : 'bg-teal-600'}`}>{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{r.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* STR revenue projections */}
          {!isMtr && data.revenueProjections && (
            <div className="print-section">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Revenue Projections with E&J Retreats</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Conservative', value: data.revenueProjections.conservative, color: 'bg-slate-100 text-slate-700' },
                  { label: 'Realistic',    value: data.revenueProjections.realistic,    color: 'bg-teal-50 text-teal-800 ring-2 ring-teal-200' },
                  { label: 'Optimistic',   value: data.revenueProjections.optimistic,   color: 'bg-emerald-50 text-emerald-800' },
                ].map(p => (
                  <div key={p.label} className={`rounded-xl p-4 text-center ${p.color}`}>
                    <div className="text-lg font-black">{fmt(p.value)}</div>
                    <div className="text-xs font-semibold mt-0.5 opacity-70">{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refine with AI */}
          {onRefine && (
            <div className="print:hidden border border-purple-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => { setRefineOpen(o => !o); setRefineError(''); setRefineSuccess(false); }}
                className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-600" />
                  <span className="text-sm font-semibold text-purple-800">Refine with AI</span>
                  <span className="text-xs text-purple-500">Tell the AI what to change or add</span>
                </div>
                {refineOpen ? <ChevronUp size={14} className="text-purple-400" /> : <ChevronDown size={14} className="text-purple-400" />}
              </button>
              {refineOpen && (
                <div className="p-4 space-y-3 bg-white">
                  <textarea
                    value={refineMsg}
                    onChange={e => setRefineMsg(e.target.value)}
                    rows={3}
                    placeholder="e.g. The property has a heated pool and game room — update the analysis to reflect this. Also make the recommendations more aggressive."
                    className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                  />
                  {refineError && <p className="text-xs text-red-500">{refineError}</p>}
                  {refineSuccess && <p className="text-xs text-emerald-600 font-medium">Report updated successfully.</p>}
                  <button
                    type="button"
                    onClick={handleRefine}
                    disabled={!refineMsg.trim() || refining}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {refining ? <><Loader size={13} className="animate-spin" /> Refining...</> : <><Sparkles size={13} /> Update Report</>}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 text-xs text-slate-400 text-center print:hidden">
            Generated by E&J Retreats · Powered by AirDNA market data · Projections are estimates and not guaranteed.
          </div>
        </div>
      </div>
    </div>
  );
}

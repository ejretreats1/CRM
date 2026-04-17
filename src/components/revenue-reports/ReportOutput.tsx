import { Printer, Save, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ReportData {
  extracted: {
    projectedAnnualRevenue: number | null;
    occupancyRate: number | null;
    adr: number | null;
    revpar: number | null;
  };
  reportTitle: string;
  executiveSummary: string;
  marketOpportunity: string;
  performanceGap: string | null;
  recommendations: { title: string; description: string }[];
  revenueProjections: { conservative: number; realistic: number; optimistic: number };
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

export default function ReportOutput({ address, data, ownerActualRevenue, onSave, onBack, saving, saved }: ReportOutputProps) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="max-w-3xl mx-auto">
      {/* Action bar — hidden on print */}
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

      {/* Report body */}
      <div className="bg-white mx-6 mb-6 rounded-2xl border border-slate-200 overflow-hidden print:border-none print:rounded-none print:mx-0 print:mb-0">

        {/* Header */}
        <div className="bg-teal-700 text-white px-8 py-6 print:px-8 print:py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-teal-200 text-xs font-semibold uppercase tracking-widest mb-1">E&J Retreats · Revenue Analysis</div>
              <h1 className="text-2xl font-bold leading-tight">{data.reportTitle}</h1>
              <p className="text-teal-200 text-sm mt-1">{address}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-teal-200 text-xs">{date}</div>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Projected Annual', value: fmt(data.extracted.projectedAnnualRevenue), sub: 'per AirDNA' },
              { label: 'Occupancy Rate', value: fmtPct(data.extracted.occupancyRate), sub: 'per AirDNA' },
              { label: 'Avg Daily Rate', value: fmt(data.extracted.adr), sub: 'per AirDNA' },
              { label: 'RevPAR', value: fmt(data.extracted.revpar), sub: 'per AirDNA' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-4">
                <div className="text-xl font-black text-teal-700">{s.value}</div>
                <div className="text-xs font-semibold text-slate-700 mt-0.5">{s.label}</div>
                <div className="text-xs text-slate-400">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Owner comparison */}
          {ownerActualRevenue != null && (
            <div className="bg-slate-50 rounded-xl p-5 space-y-3">
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

          {/* Score + Summary side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div>
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

          {/* Market opportunity */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Market Opportunity</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{data.marketOpportunity}</p>
          </div>

          {/* Performance gap */}
          {data.performanceGap && (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Performance Gap Analysis</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{data.performanceGap}</p>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3">Recommendations</h3>
              <ol className="space-y-3">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                      <p className="text-sm text-slate-500 mt-0.5">{r.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Revenue projections */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Revenue Projections with E&J Retreats</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Conservative', value: data.revenueProjections.conservative, color: 'bg-slate-100 text-slate-700' },
                { label: 'Realistic', value: data.revenueProjections.realistic, color: 'bg-teal-50 text-teal-800 ring-2 ring-teal-200' },
                { label: 'Optimistic', value: data.revenueProjections.optimistic, color: 'bg-emerald-50 text-emerald-800' },
              ].map(p => (
                <div key={p.label} className={`rounded-xl p-4 text-center ${p.color}`}>
                  <div className="text-lg font-black">{fmt(p.value)}</div>
                  <div className="text-xs font-semibold mt-0.5 opacity-70">{p.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 pt-4 text-xs text-slate-400 text-center">
            Generated by E&J Retreats · Powered by AirDNA market data · Projections are estimates and not guaranteed.
          </div>
        </div>
      </div>
    </div>
  );
}

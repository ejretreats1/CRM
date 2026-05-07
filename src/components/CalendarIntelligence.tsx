import { useState, useMemo } from 'react';
import { Brain, AlertTriangle, Info, CheckCircle, ChevronDown, ChevronUp, RefreshCw, Zap } from 'lucide-react';
import type { Owner } from '../types';
import type { UplistingReservation } from '../services/uplisting';
import { analyzeProperty, urgencyLevel, type PropertyInsight } from '../services/calendarAnalysis';

interface Props {
  owners: Owner[];
  reservations: UplistingReservation[];
}

interface AIRecommendation {
  action: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

interface AIAnalysis {
  propertyId: string;
  urgency: 'critical' | 'warning' | 'info' | 'ok';
  headline: string;
  recommendations: AIRecommendation[];
}

interface AIResult {
  analyses: AIAnalysis[];
  portfolioSummary: string;
}

const URGENCY_CONFIG = {
  critical: { label: 'Critical', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-500', icon: AlertTriangle },
  warning:  { label: 'Attention', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400', icon: AlertTriangle },
  info:     { label: 'Optimize', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-400', icon: Info },
  ok:       { label: 'Healthy', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: CheckCircle },
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

function OccupancyBar({ value, label }: { value: number; label: string }) {
  const color = value >= 60 ? 'bg-emerald-400' : value >= 35 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-semibold text-slate-700">{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function PropertyCard({
  insight,
  aiAnalysis,
  isExpanded,
  onToggle,
}: {
  insight: PropertyInsight;
  aiAnalysis?: AIAnalysis;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const urgency = aiAnalysis?.urgency ?? urgencyLevel(insight);
  const cfg = URGENCY_CONFIG[urgency];
  const Icon = cfg.icon;

  return (
    <div className={`bg-white rounded-xl border ${cfg.border} overflow-hidden`}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-slate-50 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900 text-sm">{insight.propertyAddress}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{insight.ownerName}</p>
          {aiAnalysis?.headline && (
            <p className="text-sm text-slate-600 mt-1.5 leading-snug">{aiAnalysis.headline}</p>
          )}
          {!aiAnalysis && insight.urgentGap && (
            <p className="text-sm text-rose-600 mt-1.5">
              Gap: {insight.urgentGap.nights} nights starting {insight.urgentGap.start}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <Icon size={14} className={cfg.color} />
          {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {/* Occupancy bars always visible */}
      <div className="px-5 pb-3 flex gap-4">
        <OccupancyBar value={insight.occupancy30d} label="30d" />
        <OccupancyBar value={insight.occupancy60d} label="60d" />
        <OccupancyBar value={insight.occupancy90d} label="90d" />
        {insight.adr > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-slate-400">ADR</p>
            <p className="text-sm font-bold text-teal-700">${insight.adr}</p>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Gaps */}
          {insight.gaps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Calendar Gaps (next 90 days)</p>
              <div className="space-y-1.5">
                {insight.gaps.slice(0, 5).map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{g.start} → {g.end}</span>
                    <span className={`font-medium ${g.nights >= 7 ? 'text-rose-600' : 'text-amber-600'}`}>{g.nights} nights open</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400">Bookings last 14d</p>
              <p className="text-lg font-bold text-slate-800">{insight.bookingsLast14d}</p>
              {insight.bookingsLast14dPriorYear > 0 && (
                <p className="text-xs text-slate-400">vs {insight.bookingsLast14dPriorYear} last yr</p>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400">Rev next 30d</p>
              <p className="text-lg font-bold text-teal-700">${insight.totalRevenue30d.toLocaleString()}</p>
            </div>
            {insight.adr > 0 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Avg nightly rate</p>
                <p className="text-lg font-bold text-slate-800">${insight.adr}</p>
              </div>
            )}
            {Object.keys(insight.channelMix).length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Channel mix</p>
                {Object.entries(insight.channelMix).slice(0, 3).map(([ch, n]) => (
                  <div key={ch} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 truncate">{ch}</span>
                    <span className="text-xs font-medium text-slate-800">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Recommendations */}
          {aiAnalysis?.recommendations && aiAnalysis.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Brain size={11} /> AI Recommendations
              </p>
              <div className="space-y-2.5">
                {aiAnalysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${PRIORITY_BADGE[rec.priority]}`}>
                      {rec.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{rec.action}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{rec.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!aiAnalysis && (
            <p className="text-xs text-slate-400 italic">Run analysis to get AI recommendations for this property.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CalendarIntelligence({ owners, reservations }: Props) {
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterUrgency, setFilterUrgency] = useState<string>('all');

  const insights = useMemo(() => {
    const result: PropertyInsight[] = [];
    for (const owner of owners) {
      for (const property of owner.properties) {
        result.push(analyzeProperty(owner, property, reservations));
      }
    }
    return result.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2, ok: 3 };
      return order[urgencyLevel(a)] - order[urgencyLevel(b)];
    });
  }, [owners, reservations]);

  const criticalCount = insights.filter(i => urgencyLevel(i) === 'critical').length;
  const warningCount = insights.filter(i => urgencyLevel(i) === 'warning').length;

  const filtered = filterUrgency === 'all'
    ? insights
    : insights.filter(i => {
        const ai = aiResult?.analyses.find(a => a.propertyId === i.propertyId);
        return (ai?.urgency ?? urgencyLevel(i)) === filterUrgency;
      });

  async function runAnalysis() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calendar-intel', insights }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: AIResult = await res.json();
      setAiResult(data);
      // Auto-expand first critical/warning property
      const first = insights.find(i => {
        const ai = data.analyses.find(a => a.propertyId === i.propertyId);
        const u = ai?.urgency ?? urgencyLevel(i);
        return u === 'critical' || u === 'warning';
      });
      if (first) setExpandedId(first.propertyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain size={20} className="text-teal-600" />
            <h1 className="text-xl font-bold text-slate-900">Revenue Intelligence</h1>
          </div>
          <p className="text-sm text-slate-500">
            {insights.length} properties · {reservations.length} total reservations in data
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || insights.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
          {loading ? 'Analyzing…' : 'Run Analysis'}
        </button>
      </div>

      {/* Alert banner */}
      {(criticalCount > 0 || warningCount > 0) && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-rose-500 flex-shrink-0" />
          <p className="text-sm text-rose-700">
            {criticalCount > 0 && <span className="font-semibold">{criticalCount} critical</span>}
            {criticalCount > 0 && warningCount > 0 && ' · '}
            {warningCount > 0 && <span className="font-semibold">{warningCount} needing attention</span>}
            {' '}— run analysis for specific actions
          </p>
        </div>
      )}

      {/* AI portfolio summary */}
      {aiResult?.portfolioSummary && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Brain size={11} /> Portfolio Summary
          </p>
          <p className="text-sm text-teal-900 leading-relaxed">{aiResult.portfolioSummary}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Filter tabs */}
      {insights.length > 0 && (
        <div className="flex gap-1 overflow-x-auto">
          {['all', 'critical', 'warning', 'info', 'ok'].map(f => (
            <button
              key={f}
              onClick={() => setFilterUrgency(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                filterUrgency === f
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
              }`}
            >
              {f === 'all' ? `All (${insights.length})` : f}
            </button>
          ))}
        </div>
      )}

      {/* Property cards */}
      {insights.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Brain size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No properties with Uplisting data found.</p>
          <p className="text-xs mt-1">Add properties and connect your Uplisting API key in Settings.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(insight => (
            <PropertyCard
              key={insight.propertyId}
              insight={insight}
              aiAnalysis={aiResult?.analyses.find(a => a.propertyId === insight.propertyId)}
              isExpanded={expandedId === insight.propertyId}
              onToggle={() => setExpandedId(id => id === insight.propertyId ? null : insight.propertyId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

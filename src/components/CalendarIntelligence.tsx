import { useState, useMemo, useEffect } from 'react';
import { Brain, AlertTriangle, Info, CheckCircle, ChevronDown, ChevronUp, RefreshCw, Zap, Clock, SlidersHorizontal, Settings2, TrendingUp, ChevronRight } from 'lucide-react';
import type { Owner } from '../types';
import type { UplistingReservation } from '../services/uplisting';
import { CANCELLED_STATUSES } from '../services/uplisting';
import { analyzeProperty, urgencyLevel, type PropertyInsight } from '../services/calendarAnalysis';
import { fetchPLListings, type PLListing } from '../services/pricelabs';
import { fetchSettings, saveSettings } from '../services/settings';

interface Props {
  owners: Owner[];
  reservations: UplistingReservation[];
  priceLabsApiKey?: string;
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

// ── PriceLabs Optimizer types ─────────────────────────────────────────────────
interface PLSetting {
  setting: string;
  value: string;
  priority: 'high' | 'medium' | 'low';
  why: string;
}
interface PLCategory {
  category: string;
  settings: PLSetting[];
}
interface PLOptResult {
  summary: string;
  estimatedImpact: string;
  categories: PLCategory[];
}

const PL_PRIORITY: Record<string, string> = {
  high:   'bg-rose-900/40 text-rose-300 border border-rose-700/40',
  medium: 'bg-[#2a1a0a] text-[#d0954a] border border-[#5a3010]/40',
  low:    'bg-[#1e2d45] text-[#b8d4f0] border border-[#243550]/40',
};

function computeReservationStats(reservations: UplistingReservation[], listingId: string) {
  const res = reservations.filter(r =>
    r.listing_id === listingId &&
    !CANCELLED_STATUSES.has(r.status)
  );
  if (!res.length) return null;

  const nights = res.map(r => {
    if (r.nights) return r.nights;
    const d = (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86400000;
    return Math.max(1, Math.round(d));
  });
  const avgNights = nights.reduce((a, b) => a + b, 0) / nights.length;
  const avgNightlyRate = res.reduce((s, r, i) => s + (r.total_price / (nights[i] || 1)), 0) / res.length;

  const weekendDays = new Set([4, 5, 6]); // Thu=4 Fri=5 Sat=6
  const weekendCount = res.filter(r => weekendDays.has(new Date(r.check_in).getDay())).length;

  const monthRevenue: Record<string, number> = {};
  res.forEach(r => {
    const m = r.check_in.slice(0, 7);
    monthRevenue[m] = (monthRevenue[m] ?? 0) + r.total_price;
  });
  const sorted = Object.entries(monthRevenue).sort((a, b) => b[1] - a[1]);
  const peakMonth = sorted[0]?.[0] ? new Date(sorted[0][0] + '-01').toLocaleString('en-US', { month: 'long' }) : 'N/A';
  const slowMonth = sorted[sorted.length - 1]?.[0] ? new Date(sorted[sorted.length - 1][0] + '-01').toLocaleString('en-US', { month: 'long' }) : 'N/A';

  const last12Rev = Object.entries(monthRevenue)
    .filter(([m]) => m >= new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 7))
    .reduce((s, [, v]) => s + v, 0);

  return {
    totalReservations: res.length,
    avgNights,
    avgNightlyRate,
    weekendPct: res.length ? (weekendCount / res.length) * 100 : 0,
    peakMonth,
    slowMonth,
    last12MonthRevenue: last12Rev,
    avgBookingWindow: 21, // default estimate; Uplisting doesn't expose booking date
  };
}

const URGENCY_CONFIG = {
  critical: { label: 'Critical', color: 'text-[#e05c5c]', bg: 'bg-[#2a0e0e]', border: 'border-rose-200', dot: 'bg-rose-500', icon: AlertTriangle },
  warning:  { label: 'Attention', color: 'text-[#d0954a]', bg: 'bg-[#2a1a0a]', border: 'border-[#5a3010]', dot: 'bg-amber-400', icon: AlertTriangle },
  info:     { label: 'Optimize', color: 'text-[#6ab0f5]', bg: 'bg-[#162035]', border: 'border-[#1e3a5a]', dot: 'bg-blue-400', icon: Info },
  ok:       { label: 'Healthy', color: 'text-[#5ce0a0]', bg: 'bg-[#0a2518]', border: 'border-[#0a4a2a]', dot: 'bg-emerald-400', icon: CheckCircle },
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-[#2a1a0a] text-[#d0954a]',
  low: 'bg-[#1e2d45] text-[#b8d4f0]',
};

function OccupancyBar({ value, label }: { value: number; label: string }) {
  const color = value >= 60 ? 'bg-emerald-400' : value >= 35 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#3a5070]">{label}</span>
        <span className="text-xs font-semibold text-[#b8d4f0]">{value}%</span>
      </div>
      <div className="h-1.5 bg-[#1e2d45] rounded-full overflow-hidden">
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
    <div className={`bg-[#1a2335] rounded-xl border ${cfg.border} overflow-hidden`}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-[#1e2d45] transition-colors"
      >
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white text-sm">{insight.propertyAddress}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-[#3a5070] mt-0.5">{insight.ownerName}</p>
          {aiAnalysis?.headline && (
            <p className="text-sm text-[#b8d4f0] mt-1.5 leading-snug">{aiAnalysis.headline}</p>
          )}
          {!aiAnalysis && insight.urgentGap && (
            <p className="text-sm text-[#e05c5c] mt-1.5">
              Gap: {insight.urgentGap.nights} nights starting {insight.urgentGap.start}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <Icon size={14} className={cfg.color} />
          {isExpanded ? <ChevronUp size={14} className="text-[#3a5070]" /> : <ChevronDown size={14} className="text-[#3a5070]" />}
        </div>
      </button>

      {/* Occupancy bars always visible */}
      <div className="px-5 pb-3 flex gap-4">
        <OccupancyBar value={insight.occupancy30d} label={insight.unitCount > 1 ? `30d avg (${insight.unitCount}u)` : '30d'} />
        <OccupancyBar value={insight.occupancy60d} label="60d" />
        <OccupancyBar value={insight.occupancy90d} label="90d" />
        {insight.adr > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-[#3a5070]">ADR</p>
            <p className="text-sm font-bold text-[#4a90d9]">${insight.adr}</p>
          </div>
        )}
        {insight.revPar30d > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-[#3a5070]">RevPAR</p>
            <p className="text-sm font-bold text-[#d07af5]">${insight.revPar30d}</p>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-[#1e2d45] px-5 py-4 space-y-4">
          {/* Gaps */}
          {insight.gaps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2">Calendar Gaps (next 90 days)</p>
              <div className="space-y-1.5">
                {insight.gaps.slice(0, 5).map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-[#b8d4f0]">{g.start} → {g.end}</span>
                    <span className={`font-medium ${g.nights >= 7 ? 'text-[#e05c5c]' : 'text-[#d0954a]'}`}>{g.nights} nights open</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#1e2d45] rounded-lg p-3">
              <p className="text-xs text-[#3a5070]">Bookings last 14d</p>
              <p className="text-lg font-bold text-white">{insight.bookingsLast14d}</p>
              {insight.bookingsLast14dPriorYear > 0 && (
                <p className="text-xs text-[#3a5070]">vs {insight.bookingsLast14dPriorYear} last yr</p>
              )}
            </div>
            <div className="bg-[#1e2d45] rounded-lg p-3">
              <p className="text-xs text-[#3a5070]">Rev next 30d</p>
              <p className="text-lg font-bold text-[#4a90d9]">${insight.totalRevenue30d.toLocaleString()}</p>
            </div>
            {insight.revPar30d > 0 && (
              <div className="bg-[#1a1535] rounded-lg p-3 border border-[#3a2070]">
                <p className="text-xs text-[#c4b5fd]">RevPAR (30d)</p>
                <p className="text-lg font-bold text-[#d07af5]">${insight.revPar30d}</p>
                <p className="text-xs text-[#3a5070]">rev / avail night</p>
              </div>
            )}
            {insight.adr > 0 && (
              <div className="bg-[#1e2d45] rounded-lg p-3">
                <p className="text-xs text-[#3a5070]">Avg nightly rate</p>
                <p className="text-lg font-bold text-white">${insight.adr}</p>
              </div>
            )}
            {Object.keys(insight.channelMix).length > 0 && (
              <div className="bg-[#1e2d45] rounded-lg p-3">
                <p className="text-xs text-[#3a5070] mb-1">Channel mix</p>
                {Object.entries(insight.channelMix).slice(0, 3).map(([ch, n]) => (
                  <div key={ch} className="flex items-center justify-between">
                    <span className="text-xs text-[#b8d4f0] truncate">{ch}</span>
                    <span className="text-xs font-medium text-white">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Recommendations */}
          {aiAnalysis?.recommendations && aiAnalysis.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Brain size={11} /> AI Recommendations
              </p>
              <div className="space-y-2.5">
                {aiAnalysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-[#1e2d45] rounded-lg">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${PRIORITY_BADGE[rec.priority]}`}>
                      {rec.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{rec.action}</p>
                      <p className="text-xs text-[#b8d4f0] mt-0.5 leading-relaxed">{rec.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!aiAnalysis && (
            <p className="text-xs text-[#3a5070] italic">Run analysis to get AI recommendations for this property.</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CalendarIntelligence({ owners, reservations, priceLabsApiKey }: Props) {
  const [mainTab, setMainTab] = useState<'intel' | 'optimizer'>('intel');

  // ── Portfolio Intel state ────────────────────────────────────────────────
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterUrgency, setFilterUrgency] = useState<string>('all');
  const [plListings, setPlListings] = useState<PLListing[]>([]);
  const [, forceRefresh] = useState(0);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

  // ── PriceLabs Optimizer state ────────────────────────────────────────────
  const [plxPropertyId, setPlxPropertyId] = useState<string>('');
  const [plxLoading, setPlxLoading] = useState(false);
  const [plxError, setPlxError] = useState('');
  const [plxResult, setPlxResult] = useState<PLOptResult | null>(null);
  const [plxExpandedCat, setPlxExpandedCat] = useState<string | null>(null);

  // Load saved analysis from Supabase on mount
  useEffect(() => {
    fetchSettings().then(s => {
      if (s.lastIntelResult && s.lastIntelAt) {
        setAiResult(s.lastIntelResult as AIResult);
        setSavedAt(s.lastIntelAt);
      }
    }).catch(() => {});
  }, []);

  // Tick every minute so "X ago" label stays current
  useEffect(() => {
    const id = setInterval(() => forceRefresh(n => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

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

  // Insights scoped to the user's selection (null = all)
  const activeInsights = selectedIds
    ? insights.filter(i => selectedIds.has(i.propertyId))
    : insights;

  const criticalCount = activeInsights.filter(i => urgencyLevel(i) === 'critical').length;
  const warningCount = activeInsights.filter(i => urgencyLevel(i) === 'warning').length;

  const filtered = filterUrgency === 'all'
    ? activeInsights
    : activeInsights.filter(i => {
        const ai = aiResult?.analyses.find(a => a.propertyId === i.propertyId);
        return (ai?.urgency ?? urgencyLevel(i)) === filterUrgency;
      });

  function toggleProperty(id: string) {
    setSelectedIds(prev => {
      const base = prev ?? new Set(insights.map(i => i.propertyId));
      const next = new Set(base);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next.size === insights.length ? null : next;
    });
  }

  function selectAll() { setSelectedIds(null); }
  function selectNone() { setSelectedIds(new Set()); }

  async function runAnalysis() {
    setLoading(true);
    setError('');
    let pl = plListings;
    if (priceLabsApiKey && pl.length === 0) {
      try { pl = await fetchPLListings(priceLabsApiKey); setPlListings(pl); } catch { /* non-fatal */ }
    }
    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calendar-intel', insights: activeInsights, plListings: pl.length ? pl : undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: AIResult = await res.json();
      const ts = new Date().toISOString();
      setAiResult(data);
      setSavedAt(ts);
      saveSettings({ lastIntelResult: data, lastIntelAt: ts }).catch(() => {});
      // Auto-expand first critical/warning property
      const first = activeInsights.find(i => {
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

  // Flat list of all properties across owners for the optimizer dropdown
  const allProperties = useMemo(() =>
    owners.flatMap(o => o.properties.map(p => ({ ...p, ownerName: o.name }))),
    [owners]
  );

  async function runOptimizer() {
    if (!plxPropertyId) return;
    const propEntry = allProperties.find(p => p.id === plxPropertyId);
    if (!propEntry) return;

    setPlxLoading(true);
    setPlxError('');
    setPlxResult(null);

    // Find linked Uplisting listing ID for reservation stats
    const uplistingId = propEntry.linkedListingIds?.[0] ?? null;
    const stats = uplistingId ? computeReservationStats(reservations, uplistingId) : null;

    // Get PriceLabs listing if available
    let pl = plListings;
    if (priceLabsApiKey && pl.length === 0) {
      try { pl = await fetchPLListings(priceLabsApiKey); setPlListings(pl); } catch { /* non-fatal */ }
    }
    const plListing = pl.find(l =>
      l.listing_nickname?.toLowerCase().includes(propEntry.address.toLowerCase().slice(0, 10))
    ) ?? null;

    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pricelabs-optimize',
          property: {
            address:        propEntry.address,
            city:           propEntry.city,
            state:          propEntry.state,
            type:           propEntry.type,
            bedrooms:       propEntry.bedrooms,
            bathrooms:      propEntry.bathrooms,
            maxGuests:      propEntry.maxGuests,
            monthlyRevenue: propEntry.monthlyRevenue,
            occupancyRate:  propEntry.occupancyRate,
            platforms:      propEntry.platforms,
          },
          reservationStats: stats,
          plListing,
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: PLOptResult = await res.json();
      setPlxResult(data);
      setPlxExpandedCat(data.categories[0]?.category ?? null);
    } catch (e) {
      setPlxError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setPlxLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain size={20} className="text-[#4a90d9]" />
            <h1 className="text-xl font-bold text-white">Revenue Intelligence</h1>
          </div>
          <p className="text-sm text-[#b8d4f0]">
            {insights.length} properties · {reservations.length} total reservations in data
          </p>
          {savedAt && (
            <p className="text-xs text-[#3a5070] flex items-center gap-1 mt-0.5">
              <Clock size={11} /> Last analysis: {formatAgo(savedAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectorOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${selectorOpen || selectedIds ? 'bg-[#1e2d45] border-[#1e2d45] text-[#b8d4f0]' : 'bg-[#1a2335] border-[#1e2d45] text-[#b8d4f0] hover:border-slate-400'}`}
          >
            <SlidersHorizontal size={14} />
            {selectedIds ? `${selectedIds.size} of ${insights.length}` : 'All'}
          </button>
          <button
            onClick={runAnalysis}
            disabled={loading || activeInsights.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#4a90d9] text-white rounded-xl text-sm font-medium hover:bg-[#3a80c9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
            {loading ? 'Analyzing…' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-[#1e2d45] p-1 rounded-xl w-fit">
        <button
          onClick={() => setMainTab('intel')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${mainTab === 'intel' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#b8d4f0] hover:text-white'}`}
        >
          <Brain size={14} /> Portfolio Intel
        </button>
        <button
          onClick={() => setMainTab('optimizer')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${mainTab === 'optimizer' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#b8d4f0] hover:text-white'}`}
        >
          <Settings2 size={14} /> PriceLabs Optimizer
        </button>
      </div>

      {/* ── PRICELABS OPTIMIZER ─────────────────────────────────────────────── */}
      {mainTab === 'optimizer' && (
        <div className="space-y-5">
          {/* Property picker */}
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Choose a property to optimize</h2>
            <p className="text-xs text-[#3a5070] mb-4">Claude will analyze your property data and output exact PriceLabs settings — specific dollar values, percentages, and day counts — to maximize annual revenue.</p>
            <div className="flex gap-3 flex-wrap">
              <select
                value={plxPropertyId}
                onChange={e => { setPlxPropertyId(e.target.value); setPlxResult(null); setPlxError(''); }}
                className="flex-1 min-w-0 bg-[#0f1623] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              >
                <option value="">Select a property…</option>
                {allProperties.map(p => (
                  <option key={p.id} value={p.id}>{p.address}, {p.city} ({p.bedrooms}BR)</option>
                ))}
              </select>
              <button
                onClick={runOptimizer}
                disabled={!plxPropertyId || plxLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-[#4a90d9]/20"
              >
                {plxLoading ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                {plxLoading ? 'Analyzing…' : 'Get Recommendations'}
              </button>
            </div>
            {!priceLabsApiKey && (
              <p className="text-xs text-[#d0954a] mt-3 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Add your PriceLabs API key in Settings for even more precise recommendations.
              </p>
            )}
          </div>

          {plxError && (
            <div className="bg-[#2a0e0e] border border-[#5a1a1a] rounded-xl p-4 text-sm text-[#e05c5c]">{plxError}</div>
          )}

          {plxResult && (
            <div className="space-y-4">
              {/* Summary banner */}
              <div className="bg-[#0d1c35] border border-[#1e3a5a] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Brain size={16} className="text-[#4a90d9]" />
                  <span className="text-sm font-semibold text-[#4a90d9] uppercase tracking-wide">Strategy Summary</span>
                </div>
                <p className="text-sm text-[#b8d4f0] leading-relaxed mb-3">{plxResult.summary}</p>
                <div className="flex items-center gap-2 bg-[#0a2518] border border-[#0a4a2a] rounded-lg px-3 py-2">
                  <TrendingUp size={14} className="text-[#4ab57a] flex-shrink-0" />
                  <p className="text-sm text-[#4ab57a] font-medium">{plxResult.estimatedImpact}</p>
                </div>
              </div>

              {/* Category cards */}
              {plxResult.categories.map(cat => (
                <div key={cat.category} className="bg-[#1a2335] border border-[#1e2d45] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setPlxExpandedCat(c => c === cat.category ? null : cat.category)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#1e2d45] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">{cat.category}</span>
                      <span className="text-xs bg-[#1e2d45] text-[#b8d4f0] px-2 py-0.5 rounded-full">{cat.settings.length} settings</span>
                      {cat.settings.some(s => s.priority === 'high') && (
                        <span className="text-xs bg-rose-900/40 text-rose-300 px-2 py-0.5 rounded-full border border-rose-700/40">High priority</span>
                      )}
                    </div>
                    <ChevronRight size={16} className={`text-[#3a5070] transition-transform ${plxExpandedCat === cat.category ? 'rotate-90' : ''}`} />
                  </button>
                  {plxExpandedCat === cat.category && (
                    <div className="border-t border-[#1e2d45] divide-y divide-[#1e2d45]">
                      {cat.settings.map((s, i) => (
                        <div key={i} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{s.setting}</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PL_PRIORITY[s.priority]}`}>
                                {s.priority}
                              </span>
                            </div>
                            <span className="text-sm font-bold text-[#4ab57a] whitespace-nowrap flex-shrink-0">{s.value}</span>
                          </div>
                          <p className="text-xs text-[#3a5070] leading-relaxed">{s.why}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!plxResult && !plxLoading && !plxError && plxPropertyId && (
            <div className="text-center py-10 text-[#3a5070]">
              <Settings2 size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Click "Get Recommendations" to generate your PriceLabs optimization plan.</p>
            </div>
          )}
        </div>
      )}

      {/* ── PORTFOLIO INTEL (existing content wrapped) ───────────────────── */}
      {mainTab === 'intel' && <>

      {/* Property selector */}
      {selectorOpen && insights.length > 0 && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Select properties to analyze</p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-[#4a90d9] hover:underline">All</button>
              <button onClick={selectNone} className="text-xs text-[#3a5070] hover:underline">None</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {insights.map(i => {
              const checked = !selectedIds || selectedIds.has(i.propertyId);
              return (
                <label key={i.propertyId} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProperty(i.propertyId)}
                    className="w-4 h-4 rounded border-[#1e2d45] text-[#4a90d9] focus:ring-[#4a90d9]"
                  />
                  <span className="text-sm text-[#b8d4f0] truncate group-hover:text-white">
                    {i.propertyAddress}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert banner */}
      {(criticalCount > 0 || warningCount > 0) && (
        <div className="bg-[#2a0e0e] border border-rose-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-[#e05c5c] flex-shrink-0" />
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
        <div className="bg-[#162035] border border-[#1e3a5a] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#4a90d9] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Brain size={11} /> Portfolio Summary
          </p>
          <p className="text-sm text-teal-900 leading-relaxed">{aiResult.portfolioSummary}</p>
        </div>
      )}

      {error && (
        <div className="bg-[#2a0e0e] border border-[#5a1a1a] rounded-xl p-4 text-sm text-[#e05c5c]">{error}</div>
      )}

      {/* Filter tabs */}
      {activeInsights.length > 0 && (
        <div className="flex gap-1 overflow-x-auto">
          {['all', 'critical', 'warning', 'info', 'ok'].map(f => (
            <button
              key={f}
              onClick={() => setFilterUrgency(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                filterUrgency === f
                  ? 'bg-[#0c1220] text-white'
                  : 'bg-[#1a2335] border border-[#1e2d45] text-[#b8d4f0] hover:border-slate-400'
              }`}
            >
              {f === 'all' ? `All (${activeInsights.length})` : f}
            </button>
          ))}
        </div>
      )}

      {/* Property cards */}
      {activeInsights.length === 0 ? (
        <div className="text-center py-16 text-[#3a5070]">
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

      </> /* end mainTab === 'intel' */}
    </div>
  );
}

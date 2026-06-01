import { useEffect, useState, useMemo } from 'react';
import { FileBarChart2, ExternalLink, Loader, AlertCircle, Search, X, TrendingUp, Clock } from 'lucide-react';
import { fetchRevenueReportsByLead, fetchRevenueReportsByOwner } from '../services/revenueReports';
import type { RevenueReport } from '../types';

interface PortalViewProps {
  personId: string;
}

type SortMode = 'recent' | 'best';

export default function PortalView({ personId }: PortalViewProps) {
  const [reports, setReports] = useState<RevenueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  // Global CSS sets overflow-x:hidden + overscroll-behavior-y:none on html/body
  // for the CRM dashboard. On standalone pages without Layout these block trackpad
  // scrolling — override for the lifetime of this view.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflowX = 'visible';
    html.style.maxWidth = '';
    body.style.overflowX = 'visible';
    body.style.maxWidth = '';
    body.style.overscrollBehaviorY = 'auto';
    return () => {
      html.style.overflowX = '';
      html.style.maxWidth = '';
      body.style.overflowX = '';
      body.style.maxWidth = '';
      body.style.overscrollBehaviorY = '';
    };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [byLead, byOwner] = await Promise.all([
          fetchRevenueReportsByLead(personId).catch(() => [] as RevenueReport[]),
          fetchRevenueReportsByOwner(personId).catch(() => [] as RevenueReport[]),
        ]);
        const seen = new Set<string>();
        const combined = [...byLead, ...byOwner].filter(r => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        setReports(combined);
      } catch {
        setError('Unable to load reports. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [personId]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const fmtRevenue = (n?: number) =>
    n != null ? `$${Math.round(n).toLocaleString()}` : null;

  const typeLabel: Record<string, string> = {
    str: 'Short-Term Rental',
    mtr: 'Mid-Term Rental',
    deal: 'Deal Analysis',
  };

  const sorted = useMemo(() => {
    const copy = [...reports];
    if (sortMode === 'best') {
      copy.sort((a, b) => {
        const sa = a.opportunityScore ?? -1;
        const sb = b.opportunityScore ?? -1;
        if (sb !== sa) return sb - sa;
        return b.createdAt.localeCompare(a.createdAt);
      });
    } else {
      copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return copy;
  }, [reports, sortMode]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(r =>
        r.propertyAddress.toLowerCase().includes(q) ||
        (r.reportTitle ?? '').toLowerCase().includes(q)
      )
    : sorted;

  const showControls = !loading && !error && reports.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-teal-700 text-white px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-xs font-semibold uppercase tracking-widest text-teal-200 mb-1">E&J Retreats</div>
          <h1 className="text-2xl font-bold">Your Revenue Reports</h1>
          <p className="text-teal-200 text-sm mt-1">All reports prepared for you by E&J Retreats</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {showControls && (
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by address…"
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Sort toggle */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1 flex-shrink-0">
              <button
                onClick={() => setSortMode('best')}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  sortMode === 'best'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <TrendingUp size={13} /> Best Deals
              </button>
              <button
                onClick={() => setSortMode('recent')}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  sortMode === 'recent'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Clock size={13} /> Most Recent
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={24} className="text-slate-300 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 text-rose-600 py-10 justify-center">
            <AlertCircle size={20} />
            <span className="text-sm">{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <FileBarChart2 size={36} className="mx-auto text-slate-300 mb-4" />
            {search ? (
              <>
                <p className="font-medium">No reports match "{search}"</p>
                <button onClick={() => setSearch('')} className="mt-3 text-sm text-teal-600 hover:underline">Clear search</button>
              </>
            ) : (
              <>
                <p className="font-medium">No reports yet</p>
                <p className="text-sm text-slate-400 mt-1">Reports will appear here once they're ready.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sortMode === 'best' && !search && (
              <p className="text-xs text-slate-400 mb-1">Ranked by opportunity score — highest first</p>
            )}
            {filtered.map((r, idx) => {
              const addressSlug = r.propertyAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              const shareHref = `/?share=${r.id}&address=${addressSlug}`;
              const revenue = fmtRevenue(r.airdnaProjectedRevenue);
              const score = r.opportunityScore;
              const scoreColor = score != null
                ? score >= 7 ? 'text-emerald-600 bg-emerald-50' : score >= 4 ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50'
                : '';
              const rankBadge = sortMode === 'best' && !search && score != null;

              return (
                <a
                  key={r.id}
                  href={shareHref}
                  className="block bg-white rounded-xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all p-5 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {rankBadge ? (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-sm ${scoreColor}`}>
                          #{idx + 1}
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <FileBarChart2 size={18} className="text-teal-600" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{r.reportTitle ?? r.propertyAddress}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{r.propertyAddress}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {typeLabel[r.reportType ?? 'str'] ?? 'Report'}
                          </span>
                          {revenue && <span className="text-xs font-semibold text-teal-700">{revenue}/yr</span>}
                          {score != null && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${scoreColor}`}>Score: {score}/10</span>
                          )}
                          <span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <ExternalLink size={15} className="text-slate-300 group-hover:text-teal-500 transition-colors flex-shrink-0 mt-1" />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center">
          <p className="text-xs text-slate-400">Powered by E&J Retreats · <a href="https://ejretreats.com" className="hover:underline">ejretreats.com</a></p>
        </div>
      </div>
    </div>
  );
}

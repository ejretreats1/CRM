import { useEffect, useState } from 'react';
import { FileBarChart2, ExternalLink, Loader, AlertCircle } from 'lucide-react';
import { fetchRevenueReportsByLead, fetchRevenueReportsByOwner } from '../services/revenueReports';
import type { RevenueReport } from '../types';

interface PortalViewProps {
  personId: string;
}

export default function PortalView({ personId }: PortalViewProps) {
  const [reports, setReports] = useState<RevenueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={24} className="text-slate-300 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 text-rose-600 py-10 justify-center">
            <AlertCircle size={20} />
            <span className="text-sm">{error}</span>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <FileBarChart2 size={36} className="mx-auto text-slate-300 mb-4" />
            <p className="font-medium">No reports yet</p>
            <p className="text-sm text-slate-400 mt-1">Reports will appear here once they're ready.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map(r => {
              const addressSlug = r.propertyAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              const shareHref = `/?share=${r.id}&address=${addressSlug}`;
              const revenue = fmtRevenue(r.airdnaProjectedRevenue);
              const score = r.opportunityScore;
              const scoreColor = score != null
                ? score >= 7 ? 'text-emerald-600' : score >= 4 ? 'text-amber-600' : 'text-rose-600'
                : '';

              return (
                <a
                  key={r.id}
                  href={shareHref}
                  className="block bg-white rounded-xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all p-5 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileBarChart2 size={18} className="text-teal-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{r.reportTitle ?? r.propertyAddress}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{r.propertyAddress}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {typeLabel[r.reportType ?? 'str'] ?? 'Report'}
                          </span>
                          {revenue && <span className="text-xs font-semibold text-teal-700">{revenue}/yr</span>}
                          {score != null && (
                            <span className={`text-xs font-bold ${scoreColor}`}>Score: {score}/10</span>
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

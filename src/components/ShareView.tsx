import { useState, useEffect } from 'react';
import { Printer, Building2, Loader } from 'lucide-react';
import { fetchRevenueReportById } from '../services/revenueReports';
import { buildReportEmail } from './revenue-reports/ReportOutput';
import type { RevenueReport } from '../types';

export default function ShareView({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRevenueReportById(reportId)
      .then(r => { setReport(r); })
      .catch(() => setError('Report not found or no longer available.'))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader size={22} className="text-slate-300 animate-spin" />
      </div>
    );
  }

  if (error || !report || !report.reportData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center mx-auto mb-4">
            <Building2 size={24} className="text-slate-400" />
          </div>
          <p className="text-slate-700 font-semibold text-lg">Report not found</p>
          <p className="text-slate-400 text-sm mt-1">{error || 'This report may have been deleted or the link is invalid.'}</p>
        </div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html = buildReportEmail(report.propertyAddress, report.reportData as any, report.ownerActualRevenue, '');

  const bodyContent = html
    .replace(/^[\s\S]*<body[^>]*>/i, '')
    .replace(/<\/body>[\s\S]*$/i, '');

  // Prepend mobile-responsive overrides. These are only applied when the
  // report renders in-page (share view); email clients ignore media queries.
  const mobileStyle = `<style>
    * { box-sizing: border-box; }
    table { max-width: 100% !important; }
    @media (max-width: 520px) {
      td[width="25%"] { width: 50% !important; display: inline-block !important; }
      td[width="28%"], td[width="72%"] { display: block !important; width: 100% !important; padding-right: 0 !important; }
      td[style*="padding:8px 12px"] { padding: 6px 8px !important; font-size: 11px !important; }
    }
  </style>`;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between flex-shrink-0 print:hidden">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="E&J Retreats"
            className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
            onError={e => {
              const img = e.currentTarget;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <div className="w-8 h-8 rounded-lg bg-teal-600 items-center justify-center flex-shrink-0 hidden">
            <Building2 size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">E&J Retreats</div>
            <div className="text-xs text-slate-400">Revenue Report</div>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Printer size={13} /> Download PDF
        </button>
      </div>

      {/* Report — rendered directly to respect mobile viewport.
          overflow-x: auto lets wide tables scroll within this div
          rather than being clipped by the global html/body overflow:hidden. */}
      <div
        className="flex-1"
        style={{ margin: 0, padding: '12px', background: '#f1f5f9', fontFamily: 'Arial, Helvetica, sans-serif', overflowX: 'auto' }}
        dangerouslySetInnerHTML={{ __html: mobileStyle + bodyContent }}
      />
    </div>
  );
}

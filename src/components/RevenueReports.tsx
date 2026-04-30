import { useState, useEffect } from 'react';
import { Plus, FileBarChart2, Trash2, Calendar, TrendingUp, Loader } from 'lucide-react';
import ReportBuilder from './revenue-reports/ReportBuilder';
import ReportOutput from './revenue-reports/ReportOutput';
import { fetchRevenueReports, saveRevenueReport, deleteRevenueReport, updateRevenueReport } from '../services/revenueReports';
import type { Lead, Owner, RevenueReport } from '../types';

interface RevenueReportsProps {
  leads: Lead[];
  owners: Owner[];
}

type PageView = 'list' | 'builder' | 'output';

interface PendingReport {
  address: string;
  leadId?: string;
  ownerId?: string;
  ownerActualRevenue?: number;
  ownerNotes?: string;
  additionalContext?: string;
  data: {
    reportType?: 'str' | 'mtr';
    extracted?: { projectedAnnualRevenue: number | null; occupancyRate: number | null; adr: number | null; revpar: number | null };
    strExtracted?: { projectedAnnualRevenue: number | null; occupancyRate: number | null; adr: number | null };
    mtrProjected?: { monthlyRent: number; annualRevenue: number; occupancyRate: number; recommendedLeaseLength: string; targetTenantProfile: string };
    strVsMtr?: { recommendation: 'str' | 'mtr' | 'hybrid'; strAnnualEstimate: number | null; mtrAnnualEstimate: number; reasoning: string };
    recommendedPlatforms?: string[];
    monthlySeasonality?: { month: string; revenue: number | null; occupancy: number | null }[];
    comparables?: { bedrooms: number | null; annualRevenue: number | null; occupancyRate: number | null; adr: number | null }[];
    reportTitle: string;
    executiveSummary: string;
    marketOpportunity: string;
    performanceGap: string | null;
    recommendations: { title: string; description: string }[];
    revenueProjections?: { conservative: number; realistic: number; optimistic: number };
    keyFindings: string[];
    opportunityScore: number;
  };
}

function fmt(n: number | undefined) {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

export default function RevenueReports({ leads, owners }: RevenueReportsProps) {
  const [pageView, setPageView] = useState<PageView>('list');
  const [reports, setReports] = useState<RevenueReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [pending, setPending] = useState<PendingReport | null>(null);
  const [viewingReport, setViewingReport] = useState<RevenueReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchRevenueReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, []);

  function handleReportGenerated(
    address: string,
    data: PendingReport['data'],
    ownerActualRevenue?: number,
    ownerNotes?: string,
    leadId?: string,
    ownerId?: string,
    additionalContext?: string,
  ) {
    setPending({ address, data, ownerActualRevenue, ownerNotes, leadId, ownerId, additionalContext });
    setSaved(false);
    setPageView('output');
  }

  async function handleSave() {
    if (!pending) return;
    setSaving(true);
    try {
      const saved = await saveRevenueReport({
        propertyAddress: pending.address,
        leadId: pending.leadId,
        ownerId: pending.ownerId,
        reportType: pending.data.reportType ?? 'str',
        reportData: { ...pending.data, _additionalContext: pending.additionalContext } as Record<string, unknown>,
        airdnaProjectedRevenue: pending.data.extracted?.projectedAnnualRevenue ?? pending.data.strExtracted?.projectedAnnualRevenue ?? undefined,
        airdnaOccupancyRate: pending.data.extracted?.occupancyRate ?? pending.data.strExtracted?.occupancyRate ?? undefined,
        airdnaAdr: pending.data.extracted?.adr ?? pending.data.strExtracted?.adr ?? undefined,
        airdnaRevpar: pending.data.extracted?.revpar ?? undefined,
        ownerActualRevenue: pending.ownerActualRevenue,
        ownerNotes: pending.ownerNotes,
        claudeNarrative: pending.data.executiveSummary,
        keyFindings: pending.data.keyFindings,
        opportunityScore: pending.data.opportunityScore,
        reportTitle: pending.data.reportTitle,
      });
      setReports(prev => [saved, ...prev]);
      setSaved(true);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    try {
      await deleteRevenueReport(id);
      setReports(prev => prev.filter(r => r.id !== id));
      if (viewingReport?.id === id) setPageView('list');
    } catch {
      // silent
    }
  }

  function openSavedReport(report: RevenueReport) {
    setViewingReport(report);
    setPageView('output');
  }

  if (pageView === 'builder') {
    return (
      <ReportBuilder
        leads={leads}
        owners={owners}
        onReportGenerated={handleReportGenerated}
        onCancel={() => setPageView('list')}
      />
    );
  }

  if (pageView === 'output' && pending) {
    async function handleRefinePending(message: string) {
      if (!pending) return;
      const res = await fetch('/api/generate-revenue-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: pending.address, reportType: pending.data.reportType ?? 'str', existingReport: pending.data, refinementMessage: message, additionalContext: pending.additionalContext }),
      });
      const refined = await res.json();
      if (refined.error) throw new Error(refined.error);
      setPending(prev => prev ? { ...prev, data: refined } : prev);
      setSaved(false);
    }

    const pendingLead = pending.leadId ? leads.find(l => l.id === pending.leadId) : undefined;
    const pendingOwner = pending.ownerId ? owners.find(o => o.id === pending.ownerId) : undefined;
    const recipientEmail = pendingLead?.email || pendingOwner?.email;
    const recipientName = pendingLead?.name || pendingOwner?.name;

    return (
      <ReportOutput
        address={pending.address}
        data={pending.data}
        ownerActualRevenue={pending.ownerActualRevenue}
        ownerNotes={pending.ownerNotes}
        saving={saving}
        saved={saved}
        onSave={handleSave}
        onBack={() => { setPageView('list'); setPending(null); }}
        onRefine={handleRefinePending}
        recipientEmail={recipientEmail}
        recipientName={recipientName}
      />
    );
  }

  if (pageView === 'output' && viewingReport) {
    const report = viewingReport;
    const reportData: PendingReport['data'] = report.reportData
      ? report.reportData as PendingReport['data']
      : {
          reportType: report.reportType ?? 'str',
          extracted: {
            projectedAnnualRevenue: report.airdnaProjectedRevenue ?? null,
            occupancyRate: report.airdnaOccupancyRate ?? null,
            adr: report.airdnaAdr ?? null,
            revpar: report.airdnaRevpar ?? null,
          },
          reportTitle: report.reportTitle ?? report.propertyAddress,
          executiveSummary: report.claudeNarrative ?? '',
          marketOpportunity: '',
          performanceGap: null,
          recommendations: [],
          revenueProjections: { conservative: 0, realistic: 0, optimistic: 0 },
          keyFindings: report.keyFindings ?? [],
          opportunityScore: report.opportunityScore ?? 5,
        };
    async function handleRefineSaved(message: string) {
      const res = await fetch('/api/generate-revenue-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: report.propertyAddress, reportType: report.reportType ?? 'str', existingReport: reportData, refinementMessage: message, additionalContext: (report.reportData as Record<string, unknown>)?._additionalContext as string | undefined }),
      });
      const refined = await res.json();
      if (refined.error) throw new Error(refined.error);
      const updated = await updateRevenueReport(report.id, {
        reportData: refined,
        claudeNarrative: refined.executiveSummary,
        keyFindings: refined.keyFindings,
        opportunityScore: refined.opportunityScore,
        reportTitle: refined.reportTitle,
        airdnaProjectedRevenue: refined.extracted?.projectedAnnualRevenue ?? refined.strExtracted?.projectedAnnualRevenue ?? undefined,
        airdnaOccupancyRate: refined.extracted?.occupancyRate ?? refined.strExtracted?.occupancyRate ?? undefined,
        airdnaAdr: refined.extracted?.adr ?? refined.strExtracted?.adr ?? undefined,
        airdnaRevpar: refined.extracted?.revpar ?? undefined,
      });
      setViewingReport(updated);
      setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
    }

    const savedLead = report.leadId ? leads.find(l => l.id === report.leadId) : undefined;
    const savedOwner = report.ownerId ? owners.find(o => o.id === report.ownerId) : undefined;

    return (
      <ReportOutput
        address={report.propertyAddress}
        data={reportData}
        ownerActualRevenue={report.ownerActualRevenue}
        saving={false}
        saved={true}
        onSave={() => {}}
        onBack={() => { setPageView('list'); setViewingReport(null); }}
        onRefine={handleRefineSaved}
        recipientEmail={savedLead?.email || savedOwner?.email}
        recipientName={savedLead?.name || savedOwner?.name}
      />
    );
  }

  // List view
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileBarChart2 size={22} className="text-teal-600" /> Revenue Reports
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Upload an AirDNA PDF to generate AI-powered revenue analysis</p>
          </div>
          <button
            onClick={() => setPageView('builder')}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} /> New Report
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loadingReports ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={24} className="text-slate-300 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <FileBarChart2 size={28} className="text-teal-400" />
            </div>
            <p className="text-slate-600 font-medium">No reports yet</p>
            <p className="text-slate-400 text-sm mt-1 max-w-xs">Click "New Report", upload an AirDNA PDF, and Claude will generate a full revenue analysis.</p>
            <button
              onClick={() => setPageView('builder')}
              className="mt-5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Create First Report
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map(r => (
              <div
                key={r.id}
                className="bg-white rounded-xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => openSavedReport(r)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <FileBarChart2 size={18} className="text-teal-600" />
                    </div>
                    {r.opportunityScore != null && (
                      <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        r.opportunityScore >= 7 ? 'bg-emerald-100 text-emerald-700' :
                        r.opportunityScore >= 4 ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {r.opportunityScore}/10
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">
                    {r.reportTitle ?? r.propertyAddress}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 truncate">{r.propertyAddress}</p>

                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    {r.airdnaProjectedRevenue != null && (
                      <span className="flex items-center gap-1">
                        <TrendingUp size={11} className="text-teal-500" />
                        {fmt(r.airdnaProjectedRevenue)}/yr
                      </span>
                    )}
                    <span className="flex items-center gap-1 ml-auto">
                      <Calendar size={11} />
                      {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-200 px-5 py-2.5 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

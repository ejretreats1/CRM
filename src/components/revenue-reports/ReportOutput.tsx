import { useState } from 'react';
import { Printer, Save, ArrowLeft, TrendingUp, TrendingDown, Minus, Sparkles, Loader, ChevronDown, ChevronUp, Mail, X, Send } from 'lucide-react';

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
  recipientEmail?: string;
  recipientName?: string;
}

function buildReportEmail(address: string, data: ReportData, ownerActualRevenue?: number, personalNote?: string): string {
  const isMtr = data.reportType === 'mtr';
  const headerBg = isMtr ? '#3730a3' : '#0f766e';
  const accentColor = isMtr ? '#4f46e5' : '#0f766e';
  const barColor = isMtr ? '#4f46e5' : '#0f766e';
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const fmtN = (n: number | null | undefined) => n == null ? '—' : `$${Math.round(n).toLocaleString()}`;
  const fmtP = (n: number | null | undefined) => n == null ? '—' : `${Math.round(n)}%`;
  const scoreColor = data.opportunityScore >= 7 ? '#059669' : data.opportunityScore >= 4 ? '#d97706' : '#dc2626';

  const sectionTitle = (t: string) => `<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px;">${t}</div>`;

  // ── Metrics ──────────────────────────────────────────────────────────────
  let metricsHtml = '';
  if (!isMtr && data.extracted) {
    metricsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
        ${[['Projected Annual', fmtN(data.extracted.projectedAnnualRevenue)],['Occupancy Rate', fmtP(data.extracted.occupancyRate)],['Avg Daily Rate', fmtN(data.extracted.adr)],['RevPAR', fmtN(data.extracted.revpar)]].map(([l,v])=>`
          <td width="25%" style="padding:4px;"><div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:18px;font-weight:900;color:${accentColor};">${v}</div>
            <div style="font-size:10px;font-weight:600;color:#334155;margin-top:2px;">${l}</div>
            <div style="font-size:9px;color:#94a3b8;">per AirDNA</div>
          </div></td>`).join('')}
      </tr></table>`;
  } else if (isMtr && data.mtrProjected) {
    metricsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
        ${[['Est. Monthly Rent', fmtN(data.mtrProjected.monthlyRent), true],['Est. Annual Revenue', fmtN(data.mtrProjected.annualRevenue), true],['Expected Occupancy', fmtP(data.mtrProjected.occupancyRate), false]].map(([l,v,a])=>`
          <td width="33%" style="padding:4px;"><div style="background:${a?'#eef2ff':'#f8fafc'};border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:18px;font-weight:900;color:${a?'#4338ca':'#334155'};">${v}</div>
            <div style="font-size:10px;font-weight:600;color:#334155;margin-top:2px;">${l}</div>
          </div></td>`).join('')}
      </tr></table>`;
  }

  // ── Owner vs Market ───────────────────────────────────────────────────────
  const ownerHtml = ownerActualRevenue != null ? (() => {
    const projected = !isMtr ? data.extracted?.projectedAnnualRevenue : data.mtrProjected?.annualRevenue;
    if (!projected) return '';
    const gap = projected - ownerActualRevenue;
    const pct = Math.abs(Math.round((gap / projected) * 100));
    const isBelow = gap > 0;
    return `<div style="margin-bottom:24px;background:#f8fafc;border-radius:8px;padding:16px;">
      ${sectionTitle('Owner vs. Market')}
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="text-align:center;"><div style="font-size:10px;color:#64748b;">Owner Reported</div><div style="font-size:20px;font-weight:900;color:#1e293b;">${fmtN(ownerActualRevenue)}</div></td>
        <td style="text-align:center;color:#cbd5e1;font-size:18px;">vs</td>
        <td style="text-align:center;"><div style="font-size:10px;color:#64748b;">${isMtr?'MTR':'AirDNA'} Projected</div><div style="font-size:20px;font-weight:900;color:${accentColor};">${fmtN(projected)}</div></td>
      </tr></table>
      <div style="margin-top:10px;padding:8px 12px;background:${isBelow?'#fef2f2':'#f0fdf4'};border-radius:6px;font-size:12px;font-weight:700;color:${isBelow?'#b91c1c':'#166534'};">
        ${isBelow?`$${Math.round(gap).toLocaleString()} below market (${pct}% gap)`:`$${Math.round(Math.abs(gap)).toLocaleString()} above market — outperforming!`}
      </div></div>`;
  })() : '';

  // ── Score + Summary ───────────────────────────────────────────────────────
  const scoreHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
      <td width="28%" valign="top" style="padding-right:12px;">
        <div style="background:#f8fafc;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:34px;font-weight:900;color:${scoreColor};">${data.opportunityScore}<span style="font-size:14px;color:#94a3b8;">/10</span></div>
          <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Opportunity Score</div>
        </div>
      </td>
      <td width="72%" valign="top">
        <div style="background:#f8fafc;border-radius:8px;padding:16px;">
          <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:6px;">Executive Summary</div>
          <div style="font-size:12px;color:#475569;line-height:1.6;">${data.executiveSummary}</div>
        </div>
      </td>
    </tr></table>`;

  // ── Key Findings ──────────────────────────────────────────────────────────
  const findingsHtml = data.keyFindings.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Key Findings')}
      ${data.keyFindings.map((f,i)=>`
        <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;width:100%;"><tr>
          <td width="24" valign="top"><div style="width:20px;height:20px;background:${accentColor}22;border-radius:50%;text-align:center;font-size:10px;font-weight:700;color:${accentColor};line-height:20px;">${i+1}</div></td>
          <td style="font-size:12px;color:#475569;line-height:1.5;padding-left:8px;">${f}</td>
        </tr></table>`).join('')}
    </div>` : '';

  // ── Seasonality Chart (HTML table bars — email-safe, no SVG) ─────────────
  const seasonalityHtml = data.monthlySeasonality && data.monthlySeasonality.length > 0 ? (() => {
    const months = data.monthlySeasonality!;
    const maxRev = Math.max(...months.map(m => m.revenue ?? 0), 1);
    const CHART_H = 80;
    return `<div style="margin-bottom:24px;">
      ${sectionTitle('Monthly Seasonality')}
      <div style="background:#f8fafc;border-radius:8px;padding:12px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>${months.map(m => {
            const barH = Math.max(4, Math.round(((m.revenue ?? 0) / maxRev) * CHART_H));
            const emptyH = CHART_H - barH;
            const occ = m.occupancy != null ? `${Math.round(m.occupancy)}%` : '';
            return `<td style="text-align:center;vertical-align:bottom;padding:0 1px;">
              <div style="font-size:8px;color:${barColor};font-weight:700;margin-bottom:2px;">${occ}</div>
              <div style="height:${emptyH}px;"></div>
              <div style="height:${barH}px;background:${barColor};border-radius:2px 2px 0 0;"></div>
              <div style="font-size:9px;color:#64748b;margin-top:3px;">${m.month.slice(0,3)}</div>
            </td>`;
          }).join('')}</tr>
        </table>
        <div style="font-size:9px;color:#94a3b8;text-align:right;margin-top:4px;">Occupancy % shown above bars · Revenue per month</div>
      </div></div>`;
  })() : '';

  // ── Comparable Properties ─────────────────────────────────────────────────
  const comparablesHtml = data.comparables && data.comparables.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Comparable Properties')}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
        <tr style="background:#f1f5f9;">
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;">Beds</td>
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:right;">Annual Rev</td>
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:right;">Occupancy</td>
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:right;">ADR</td>
        </tr>
        ${data.comparables.map((c,i)=>`
          <tr style="background:${i%2===0?'#ffffff':'#f8fafc'};">
            <td style="padding:8px 12px;font-size:12px;color:#334155;font-weight:600;">${c.bedrooms!=null?`${c.bedrooms} BR`:'—'}</td>
            <td style="padding:8px 12px;font-size:12px;color:${accentColor};font-weight:700;text-align:right;">${c.annualRevenue!=null?`$${Math.round(c.annualRevenue).toLocaleString()}`:'—'}</td>
            <td style="padding:8px 12px;font-size:12px;color:#475569;text-align:right;">${c.occupancyRate!=null?`${Math.round(c.occupancyRate)}%`:'—'}</td>
            <td style="padding:8px 12px;font-size:12px;color:#475569;text-align:right;">${c.adr!=null?`$${Math.round(c.adr)}`:'—'}</td>
          </tr>`).join('')}
      </table>
      <div style="font-size:9px;color:#94a3b8;text-align:right;margin-top:4px;">Source: AirDNA comparable listings</div>
    </div>` : '';

  // ── Market Opportunity ────────────────────────────────────────────────────
  const marketHtml = data.marketOpportunity ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Market Opportunity')}
      <div style="font-size:12px;color:#475569;line-height:1.6;">${data.marketOpportunity}</div>
    </div>` : '';

  // ── Performance Gap ───────────────────────────────────────────────────────
  const gapHtml = data.performanceGap ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Performance Gap Analysis')}
      <div style="font-size:12px;color:#475569;line-height:1.6;">${data.performanceGap}</div>
    </div>` : '';

  // ── MTR Details ───────────────────────────────────────────────────────────
  const mtrDetailsHtml = isMtr && data.mtrProjected ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
      <td width="50%" style="padding-right:6px;">
        <div style="background:#f8fafc;border-radius:8px;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Lease &amp; Tenant</div>
          <div style="font-size:12px;font-weight:700;color:#1e293b;">${data.mtrProjected.recommendedLeaseLength} stays</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">${data.mtrProjected.targetTenantProfile}</div>
        </div>
      </td>
      ${data.recommendedPlatforms?.length ? `<td width="50%" style="padding-left:6px;">
        <div style="background:#f8fafc;border-radius:8px;padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Recommended Platforms</div>
          ${data.recommendedPlatforms.map(p=>`<span style="display:inline-block;background:#eef2ff;color:#4338ca;font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;margin:2px;">${p}</span>`).join('')}
        </div>
      </td>` : ''}
    </tr></table>` : '';

  // ── STR vs MTR ────────────────────────────────────────────────────────────
  const strVsMtrHtml = isMtr && data.strVsMtr ? `
    <div style="margin-bottom:24px;background:#f8fafc;border-radius:8px;padding:16px;">
      ${sectionTitle('STR vs. MTR Comparison')}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px;"><tr>
        <td width="50%" style="padding-right:6px;">
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:10px;color:#64748b;margin-bottom:4px;">STR Annual (AirDNA)</div>
            <div style="font-size:22px;font-weight:900;color:#1d4ed8;">${fmtN(data.strVsMtr.strAnnualEstimate)}</div>
          </div>
        </td>
        <td width="50%" style="padding-left:6px;">
          <div style="background:#fff;border:1px solid #c7d2fe;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:10px;color:#64748b;margin-bottom:4px;">MTR Annual (projected)</div>
            <div style="font-size:22px;font-weight:900;color:#4338ca;">${fmtN(data.strVsMtr.mtrAnnualEstimate)}</div>
          </div>
        </td>
      </tr></table>
      <div style="font-size:12px;color:#475569;line-height:1.5;">${data.strVsMtr.reasoning}</div>
    </div>` : '';

  // ── Recommendations ───────────────────────────────────────────────────────
  const recsHtml = data.recommendations.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Recommendations')}
      ${data.recommendations.map((r,i)=>`
        <div style="margin-bottom:10px;padding:12px;background:#f8fafc;border-radius:8px;">
          <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:3px;">${i+1}. ${r.title}</div>
          <div style="font-size:12px;color:#64748b;line-height:1.5;">${r.description}</div>
        </div>`).join('')}
    </div>` : '';

  // ── Revenue Projections ───────────────────────────────────────────────────
  const projectionsHtml = !isMtr && data.revenueProjections ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Revenue Projections with E&amp;J Retreats')}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
        ${[['Conservative', data.revenueProjections.conservative,'#f8fafc','#334155'],['Realistic', data.revenueProjections.realistic,'#f0fdfa','#0f766e'],['Optimistic', data.revenueProjections.optimistic,'#f0fdf4','#166534']].map(([l,v,bg,c])=>`
          <td width="33%" style="padding:4px;">
            <div style="background:${bg};border-radius:8px;padding:12px;text-align:center;">
              <div style="font-size:16px;font-weight:900;color:${c};">${fmtN(v as number)}</div>
              <div style="font-size:10px;color:#64748b;margin-top:2px;">${l}</div>
            </div>
          </td>`).join('')}
      </tr></table>
    </div>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;"><tr><td>
    <div style="background:${headerBg};border-radius:12px 12px 0 0;padding:32px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.6);margin-bottom:8px;">E&amp;J Retreats · ${isMtr?'Mid-Term Rental Analysis':'Revenue Analysis'}</div>
      <div style="font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;">${data.reportTitle}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);">${address}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:8px;">${date}</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px;">
      ${personalNote?.trim() ? `<div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e2e8f0;"><div style="font-size:14px;color:#475569;line-height:1.8;white-space:pre-wrap;">${personalNote.trim()}</div></div>` : ''}
      ${metricsHtml}
      ${ownerHtml}
      ${scoreHtml}
      ${findingsHtml}
      ${seasonalityHtml}
      ${comparablesHtml}
      ${marketHtml}
      ${gapHtml}
      ${mtrDetailsHtml}
      ${strVsMtrHtml}
      ${recsHtml}
      ${projectionsHtml}
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;text-align:center;font-size:11px;color:#94a3b8;">
        Generated by E&amp;J Retreats · Powered by AirDNA market data<br>Projections are estimates and not guaranteed.
      </div>
    </div>
  </td></tr></table>
</body></html>`;
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

function defaultEmailNote(firstName: string, address: string): string {
  return `Hi ${firstName || '{{First Name}}'},

Your revenue analysis for ${address} is attached. It covers your property's market potential, an opportunity score, and a few specific recommendations.

Every property is a little different though, so I'd love to hear more about yours if you have a sec:

- Are you currently renting it out or still exploring the idea?
- If so, are you managing it yourself or working with someone?
- What's been the biggest challenge so far?

The reason I ask is that most of the owners we work with are already doing a good job on their own. The stuff that usually gets left on the table is pricing strategy, promotions, repeat guest capture, and calendar optimization. Those pieces change constantly and just take a lot of time to stay on top of.

We work with 15+ listings right now and it looks different for every owner. Some just want help on the backend and revenue side while they keep running everything else. Others prefer to hand it all off. It really just depends on what makes sense for you.

No pressure at all. I'm just happy to walk through the report and answer any questions. Reply here or text me at 8136990509, whatever's easier.

Talk soon,
Ethan & Jess
E&J Retreats`;
}

const RECOMMENDATION_LABELS: Record<string, { label: string; color: string }> = {
  str:    { label: '🏠 Stick with Short-Term Rental', color: 'bg-blue-50 text-blue-800 border-blue-200' },
  mtr:    { label: '📅 Switch to Mid-Term Rental',    color: 'bg-teal-50 text-teal-800 border-teal-200' },
  hybrid: { label: '⚖️ Hybrid STR + MTR Strategy',    color: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export default function ReportOutput({ address, data, ownerActualRevenue, onSave, onBack, saving, saved, onRefine, recipientEmail, recipientName }: ReportOutputProps) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const isMtr = data.reportType === 'mtr';
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineMsg, setRefineMsg] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState('');
  const [refineSuccess, setRefineSuccess] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(recipientEmail ?? '');
  const [emailName, setEmailName] = useState(recipientName ?? '');
  const [emailSubject, setEmailSubject] = useState(`Your Revenue Analysis: ${data.reportTitle}`);
  const [personalNote, setPersonalNote] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  const previewHtml = buildReportEmail(address, data, ownerActualRevenue, personalNote);

  function openEmailModal() {
    const name = recipientName ?? '';
    const first = name.trim().split(' ')[0] || '';
    setEmailTo(recipientEmail ?? '');
    setEmailName(name);
    setEmailSubject(`Your Revenue Analysis: ${data.reportTitle}`);
    setPersonalNote(defaultEmailNote(first, address));
    setEmailSent(false);
    setEmailError('');
    setEmailOpen(true);
  }

  async function handleEmailReport() {
    if (!emailTo.trim()) return;
    setEmailSending(true);
    setEmailError('');
    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report',
          to: emailTo.trim(),
          toName: emailName.trim() || undefined,
          reportSubject: emailSubject.trim() || `Your Revenue Analysis: ${data.reportTitle}`,
          reportHtml: previewHtml,
        }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setEmailSent(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to send email. Please try again.');
    } finally {
      setEmailSending(false);
    }
  }

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

      {/* Email modal — two-panel: compose left, live preview right */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/50 print:hidden">
          {/* Left: compose */}
          <div className="w-80 flex-shrink-0 bg-white flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">Email Report</h3>
              </div>
              <button onClick={() => setEmailOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {emailSent ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                  <Send size={22} className="text-emerald-600" />
                </div>
                <p className="text-sm font-bold text-slate-800">Sent!</p>
                <p className="text-xs text-slate-500 mt-1">Delivered to {emailTo}</p>
                <button onClick={() => setEmailOpen(false)} className="mt-5 text-sm bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors">Close</button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Recipient Name</label>
                  <input
                    value={emailName}
                    onChange={e => setEmailName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Email Address *</label>
                  <input
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="jane@example.com"
                    type="email"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Subject</label>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Personal Note <span className="text-slate-400 font-normal">(appears at top of email)</span></label>
                  <textarea
                    value={personalNote}
                    onChange={e => setPersonalNote(e.target.value)}
                    rows={14}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                  />
                  <p className="text-xs text-slate-400 mt-1">The full report follows automatically below your note.</p>
                </div>
                {emailError && <p className="text-xs text-red-500">{emailError}</p>}
              </div>
            )}

            {!emailSent && (
              <div className="p-5 border-t border-slate-100">
                <button
                  onClick={handleEmailReport}
                  disabled={!emailTo.trim() || emailSending}
                  className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {emailSending ? <><Loader size={13} className="animate-spin" /> Sending...</> : <><Send size={13} /> Send Report</>}
                </button>
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="flex-1 flex flex-col bg-slate-100">
            <div className="px-4 py-3 bg-slate-200 border-b border-slate-300 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live Preview</span>
              <span className="text-xs text-slate-400">— updates as you type</span>
            </div>
            <iframe
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              className="flex-1 w-full border-none"
              title="Email preview"
            />
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-4 print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={openEmailModal}
            className="flex items-center gap-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
          >
            <Mail size={14} /> Email Report
          </button>
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

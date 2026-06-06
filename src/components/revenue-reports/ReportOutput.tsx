import { useState } from 'react';
import { Printer, Save, ArrowLeft, TrendingUp, TrendingDown, Minus, Sparkles, Loader, ChevronDown, ChevronUp, Mail, X, Send, Copy, Check as CheckIcon, Phone } from 'lucide-react';

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

interface UnitData {
  unitLabel: string;
  quantity?: number;
  bedrooms: number | null;
  bathrooms: number | null;
  projectedAnnualRevenue: number | null;
  occupancyRate: number | null;
  adr: number | null;
}

interface ReportData {
  reportType?: 'str' | 'mtr' | 'deal';
  // STR
  extracted?: StrExtracted;
  revenueProjections?: { conservative: number; realistic: number; optimistic: number };
  // MTR
  strExtracted?: { projectedAnnualRevenue: number | null; occupancyRate: number | null; adr: number | null };
  mtrProjected?: MtrProjected;
  strVsMtr?: StrVsMtr;
  recommendedPlatforms?: string[];
  // Deal
  recommendation?: 'strong-buy' | 'buy' | 'neutral' | 'pass' | 'strong-pass';
  recommendationReason?: string;
  listingPrice?: number;
  units?: UnitData[];
  combinedAnnualRevenue?: number;
  combinedOccupancyRate?: number | null;
  grossYield?: number;
  propertyHighlights?: string[];
  concerns?: string[];
  // Shared
  monthlySeasonality?: MonthData[];
  comparables?: CompData[];
  reportTitle: string;
  executiveSummary: string;
  marketOpportunity: string;
  performanceGap?: string | null;
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
  savedReportId?: string;
  onSave: () => void;
  onBack: () => void;
  onRefine?: (message: string) => Promise<void>;
  recipientEmail?: string;
  recipientName?: string;
  recipientPhone?: string;
  onMarkContacted?: () => void;
  leadId?: string;
  ownerId?: string;
}

export function buildReportEmail(address: string, data: ReportData, ownerActualRevenue?: number, personalNote?: string, showCalendlyCta?: boolean): string {
  const isMtr = data.reportType === 'mtr';
  const isDeal = data.reportType === 'deal';
  const headerBg = isDeal ? '#b45309' : isMtr ? '#3730a3' : '#0f766e';
  const accentColor = isDeal ? '#b45309' : isMtr ? '#4f46e5' : '#0f766e';
  const barColor = isDeal ? '#b45309' : isMtr ? '#4f46e5' : '#0f766e';
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const fmtN = (n: number | null | undefined) => n == null ? '' : `$${Math.round(n).toLocaleString()}`;
  const fmtP = (n: number | null | undefined) => n == null ? '' : `${Math.round(n)}%`;
  const scoreColor = data.opportunityScore >= 7 ? '#059669' : data.opportunityScore >= 4 ? '#d97706' : '#dc2626';

  const sectionTitle = (t: string) => `<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:10px;">${t}</div>`;

  // ── Deal: recommendation banner + metrics ─────────────────────────────────
  const DEAL_REC_COLORS: Record<string, string> = {
    'strong-buy': '#059669', 'buy': '#0f766e', 'neutral': '#d97706', 'pass': '#ea580c', 'strong-pass': '#b91c1c',
  };
  const DEAL_REC_LABELS: Record<string, string> = {
    'strong-buy': '🟢 Strong Buy', 'buy': '✅ Buy', 'neutral': '🔶 Neutral', 'pass': '🔴 Pass', 'strong-pass': '❌ Strong Pass',
  };

  const dealRecHtml = isDeal && data.recommendation ? `
    <div style="background:${DEAL_REC_COLORS[data.recommendation] ?? '#334155'};border-radius:8px;padding:20px 24px;margin-bottom:20px;color:#fff;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;opacity:0.75;margin-bottom:4px;">Investment Recommendation</div>
      <div style="font-size:20px;font-weight:900;">${DEAL_REC_LABELS[data.recommendation] ?? data.recommendation}</div>
      ${data.recommendationReason ? `<div style="font-size:12px;opacity:0.9;margin-top:6px;line-height:1.5;">${data.recommendationReason}</div>` : ''}
    </div>` : '';

  const dealMetricsHtml = isDeal ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
      ${[
        ['Listing Price', fmtN(data.listingPrice)],
        ['Combined Annual Revenue', fmtN(data.combinedAnnualRevenue)],
        ['Gross Yield', data.grossYield != null ? `${data.grossYield.toFixed(1)}%` : ''],
      ].map(([l, v]) => `
        <td width="33%" style="padding:4px;"><div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:18px;font-weight:900;color:#b45309;">${v}</div>
          <div style="font-size:10px;font-weight:600;color:#334155;margin-top:2px;">${l}</div>
        </div></td>`).join('')}
    </tr></table>` : '';

  const dealUnitsHtml = isDeal && data.units && data.units.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle(data.units.length > 1 ? 'Per-Unit Breakdown' : 'Unit Revenue Breakdown')}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
        <tr style="background:#fef3c7;">
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;">Unit</td>
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;text-align:center;">Beds/Baths</td>
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;text-align:right;">Proj. Annual Rev</td>
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;text-align:right;">Occupancy</td>
          <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;text-align:right;">ADR</td>
        </tr>
        ${data.units.map((u, i) => {
          const qty = u.quantity ?? 1;
          const labelSuffix = qty > 1 ? ` <span style="color:#b45309;">×${qty}</span>` : '';
          const revDisplay = qty > 1 && u.projectedAnnualRevenue != null
            ? `${fmtN(u.projectedAnnualRevenue)} <span style="font-size:10px;color:#92400e;">× ${qty} = ${fmtN(u.projectedAnnualRevenue * qty)}</span>`
            : fmtN(u.projectedAnnualRevenue);
          return `
          <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
            <td style="padding:8px 12px;font-size:12px;color:#1e293b;font-weight:600;">${u.unitLabel}${labelSuffix}</td>
            <td style="padding:8px 12px;font-size:12px;color:#475569;text-align:center;">${[u.bedrooms != null ? `${u.bedrooms}bd` : null, u.bathrooms != null ? `${u.bathrooms}ba` : null].filter(Boolean).join('/') || '—'}</td>
            <td style="padding:8px 12px;font-size:12px;color:#b45309;font-weight:700;text-align:right;">${revDisplay}</td>
            <td style="padding:8px 12px;font-size:12px;color:#475569;text-align:right;">${fmtP(u.occupancyRate)}</td>
            <td style="padding:8px 12px;font-size:12px;color:#475569;text-align:right;">${u.adr != null ? `$${Math.round(u.adr)}` : ''}</td>
          </tr>`;
        }).join('')}
        ${data.units.length > 1 ? `
          <tr style="background:#fef3c7;border-top:2px solid #fde68a;">
            <td style="padding:8px 12px;font-size:12px;color:#92400e;font-weight:700;" colspan="2">Combined Total</td>
            <td style="padding:8px 12px;font-size:12px;color:#92400e;font-weight:700;text-align:right;">${fmtN(data.combinedAnnualRevenue)}</td>
            <td style="padding:8px 12px;font-size:12px;color:#92400e;text-align:right;">${fmtP(data.combinedOccupancyRate)}</td>
            <td style="padding:8px 12px;"></td>
          </tr>` : ''}
      </table>
    </div>` : '';

  const dealHLCHtml = isDeal && ((data.propertyHighlights?.length ?? 0) > 0 || (data.concerns?.length ?? 0) > 0) ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr valign="top">
      ${data.propertyHighlights?.length ? `
        <td width="50%" style="padding-right:6px;">
          <div style="background:#f0fdf4;border-radius:8px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:8px;">Property Highlights</div>
            ${data.propertyHighlights.map(h => `<div style="font-size:11px;color:#374151;margin-bottom:5px;"><span style="color:#059669;font-weight:700;">✓</span> ${h}</div>`).join('')}
          </div>
        </td>` : ''}
      ${data.concerns?.length ? `
        <td width="50%" style="padding-left:6px;">
          <div style="background:#fff7ed;border-radius:8px;padding:14px;">
            <div style="font-size:11px;font-weight:700;color:#9a3412;margin-bottom:8px;">Concerns / Risks</div>
            ${data.concerns.map(c => `<div style="font-size:11px;color:#374151;margin-bottom:5px;"><span style="color:#ea580c;font-weight:700;">!</span> ${c}</div>`).join('')}
          </div>
        </td>` : ''}
    </tr></table>` : '';

  // ── Metrics (STR / MTR) ────────────────────────────────────────────────────────────────────────
  let metricsHtml = '';
  if (!isMtr && !isDeal && data.extracted) {
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

  // ── Owner vs Market ────────────────────────────────────────────────────────────────────────────
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
        ${isBelow?`$${Math.round(gap).toLocaleString()} below market (${pct}% gap)`:`$${Math.round(Math.abs(gap)).toLocaleString()} above market - outperforming!`}
      </div></div>`;
  })() : '';

  // ── Score + Summary ────────────────────────────────────────────────────────────────────────────
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

  // ── Key Findings ──────────────────────────────────────────────────────────────────────────
  const findingsHtml = data.keyFindings.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Key Findings')}
      ${data.keyFindings.map((f,i)=>`
        <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;width:100%;"><tr>
          <td width="24" valign="top"><div style="width:20px;height:20px;background:${accentColor}22;border-radius:50%;text-align:center;font-size:10px;font-weight:700;color:${accentColor};line-height:20px;">${i+1}</div></td>
          <td style="font-size:12px;color:#475569;line-height:1.5;padding-left:8px;">${f}</td>
        </tr></table>`).join('')}
    </div>` : '';

  // ── Seasonality Chart (HTML table bars — email-safe, no SVG) ───────────────────────
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

  // ── Comparable Properties ─────────────────────────────────────────────────────────────────────────
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
            <td style="padding:8px 12px;font-size:12px;color:#334155;font-weight:600;">${c.bedrooms!=null?`${c.bedrooms} BR`:''}</td>
            <td style="padding:8px 12px;font-size:12px;color:${accentColor};font-weight:700;text-align:right;">${c.annualRevenue!=null?`$${Math.round(c.annualRevenue).toLocaleString()}`:''}</td>
            <td style="padding:8px 12px;font-size:12px;color:#475569;text-align:right;">${c.occupancyRate!=null?`${Math.round(c.occupancyRate)}%`:''}</td>
            <td style="padding:8px 12px;font-size:12px;color:#475569;text-align:right;">${c.adr!=null?`$${Math.round(c.adr)}`:''}</td>
          </tr>`).join('')}
      </table>
      <div style="font-size:9px;color:#94a3b8;text-align:right;margin-top:4px;">Source: AirDNA comparable listings</div>
    </div>` : '';

  // ── Market Opportunity ──────────────────────────────────────────────────────────────────────────
  const marketHtml = data.marketOpportunity ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Market Opportunity')}
      <div style="font-size:12px;color:#475569;line-height:1.6;">${data.marketOpportunity}</div>
    </div>` : '';

  // ── Performance Gap ────────────────────────────────────────────────────────────────────────────
  const gapHtml = data.performanceGap ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Performance Gap Analysis')}
      <div style="font-size:12px;color:#475569;line-height:1.6;">${data.performanceGap}</div>
    </div>` : '';

  // ── MTR Details ─────────────────────────────────────────────────────────────────────────────
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

  // ── STR vs MTR ───────────────────────────────────────────────────────────────────────────────
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

  // ── Recommendations ────────────────────────────────────────────────────────────────────────────
  const recsHtml = data.recommendations.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Recommendations')}
      ${data.recommendations.map((r,i)=>`
        <div style="margin-bottom:10px;padding:12px;background:#f8fafc;border-radius:8px;">
          <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:3px;">${i+1}. ${r.title}</div>
          <div style="font-size:12px;color:#64748b;line-height:1.5;">${r.description}</div>
        </div>`).join('')}
    </div>` : '';

  // ── Revenue Projections ──────────────────────────────────────────────────────────────────────────
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

  // ── Calendly CTA (only when explicitly requested) ─────────────────────────
  const ctaBg = isDeal ? '#fffbeb' : isMtr ? '#eef2ff' : '#f0fdfa';
  const ctaBtnBg = isDeal ? '#b45309' : isMtr ? '#4338ca' : '#0f766e';
  const ctaHtml = showCalendlyCta ? `
    <div style="margin-bottom:24px;background:${ctaBg};border-radius:12px;padding:24px;text-align:center;">
      <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:6px;">Want us to implement this for you?</div>
      <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:16px;">If you want, we can implement this for you and manage everything end-to-end. Pick a time for a 15-minute call and we'll walk through it together.</div>
      <a href="https://calendly.com/ejretreats1/30min" style="display:inline-block;background:${ctaBtnBg};color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">📅 Pick a Time for a 15-Minute Call →</a>
    </div>` : '';

  const headerLabel = isDeal ? 'Deal Analyzer' : isMtr ? 'Mid-Term Rental Analysis' : 'Revenue Analysis';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;"><tr><td>
    <div style="background:${headerBg};border-radius:12px 12px 0 0;padding:32px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.6);margin-bottom:8px;">E&amp;J Retreats · ${headerLabel}</div>
      <div style="font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;">${data.reportTitle}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);">${address}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:8px;">${date}</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px;">
      ${personalNote?.trim() ? `<div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e2e8f0;"><div style="font-size:14px;color:#475569;line-height:1.8;white-space:pre-wrap;">${personalNote.trim()}</div></div>` : ''}
      ${dealRecHtml}
      ${dealMetricsHtml}
      ${dealUnitsHtml}
      ${dealHLCHtml}
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
      ${ctaHtml}
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;text-align:center;font-size:11px;color:#94a3b8;">
        Generated by E&amp;J Retreats · Powered by AirDNA market data<br>Projections are estimates and not guaranteed.
      </div>
    </div>
  </td></tr></table>
</body></html>`;
}


function fmt(n: number | null | undefined) {
  if (n == null) return '';
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '';
  return `${Math.round(n)}%`;
}

function ScoreArc({ score }: { score: number }) {
  const pct = score / 10;
  const color = score >= 7 ? 'text-[#5ce0a0]' : score >= 4 ? 'text-[#d0954a]' : 'text-[#e05c5c]';
  const bgColor = score >= 7 ? 'bg-[#0a2518]' : score >= 4 ? 'bg-[#2a1a0a]' : 'bg-[#2a0e0e]';
  return (
    <div className={`${bgColor} rounded-xl p-4 text-center`}>
      <div className={`text-4xl font-black ${color}`}>{score}<span className="text-lg font-semibold text-[#3a5070]">/10</span></div>
      <div className="text-xs font-semibold text-[#b8d4f0] mt-1 uppercase tracking-wide">Opportunity Score</div>
      <div className="mt-2 h-2 bg-[#1e2d45] rounded-full overflow-hidden">
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
    <div className="flex items-center gap-1.5 bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg px-3 py-2">
      <TrendingDown size={14} className="text-[#e05c5c]" />
      <span className="text-sm font-semibold text-[#e05c5c]">${Math.round(gap).toLocaleString()} below market ({pct}% gap)</span>
    </div>
  );
  if (gap < 0) return (
    <div className="flex items-center gap-1.5 bg-[#0a2518] border border-[#0a4a2a] rounded-lg px-3 py-2">
      <TrendingUp size={14} className="text-[#5ce0a0]" />
      <span className="text-sm font-semibold text-[#4ab57a]">${Math.round(Math.abs(gap)).toLocaleString()} above market - outperforming!</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 bg-[#1e2d45] border border-[#1e2d45] rounded-lg px-3 py-2">
      <Minus size={14} className="text-[#b8d4f0]" />
      <span className="text-sm font-semibold text-[#b8d4f0]">At market rate</span>
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
      <h3 className="text-sm font-bold text-white mb-3">Monthly Seasonality</h3>
      <div className="bg-[#1e2d45] rounded-xl p-4 overflow-x-auto">
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
        <p className="text-xs text-[#3a5070] mt-1 text-right">Occupancy % shown above bars · Revenue per month</p>
      </div>
    </div>
  );
}

function ComparablesTable({ comps }: { comps: CompData[] }) {
  return (
    <div className="print-section">
      <h3 className="text-sm font-bold text-white mb-3">Comparable Properties</h3>
      <div className="bg-[#1e2d45] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1e2d45] text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Beds</th>
              <th className="px-4 py-2.5 text-right">Annual Revenue</th>
              <th className="px-4 py-2.5 text-right">Occupancy</th>
              <th className="px-4 py-2.5 text-right">ADR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2d45]">
            {comps.map((c, i) => (
              <tr key={i} className="bg-[#1a2335]">
                <td className="px-4 py-2.5 text-[#b8d4f0] font-medium">{c.bedrooms != null ? `${c.bedrooms} BR` : ''}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-[#4a90d9]">{c.annualRevenue != null ? `$${Math.round(c.annualRevenue).toLocaleString()}` : ''}</td>
                <td className="px-4 py-2.5 text-right text-[#b8d4f0]">{c.occupancyRate != null ? `${Math.round(c.occupancyRate)}%` : ''}</td>
                <td className="px-4 py-2.5 text-right text-[#b8d4f0]">{c.adr != null ? `$${Math.round(c.adr)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-[#3a5070] px-4 py-2 text-right">Source: AirDNA comparable listings</p>
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

function defaultSalesNote(firstName: string, address: string, data: ReportData): string {
  const rev = data.reportType === 'deal'
    ? data.combinedAnnualRevenue
    : data.reportType === 'mtr'
    ? data.mtrProjected?.annualRevenue
    : data.extracted?.projectedAnnualRevenue;
  const revLine = rev != null
    ? ` — the market data shows it has potential to generate $${Math.round(rev).toLocaleString()} annually`
    : '';
  return `Hi ${firstName || '{{First Name}}'},

I just sent over your revenue analysis for ${address}${revLine}.

Most of the owners we work with were already doing a solid job on their own. The difference usually comes down to the stuff that's hard to stay on top of — dynamic pricing, platform optimization, review strategy, and calendar management. That's what we handle every day across our portfolio.

If you're curious whether it'd make sense for your situation, I'd love to jump on a quick call. No pitch, no pressure — just 15 minutes to walk through the numbers together and see if there's a fit.

👉 Book a time here: https://calendly.com/ejretreats1/30min

Talk soon,
Ethan & Jess
E&J Retreats`;
}

const RECOMMENDATION_LABELS: Record<string, { label: string; color: string }> = {
  str:    { label: '🏠 Stick with Short-Term Rental', color: 'bg-[#162035] text-blue-800 border-[#1e3a5a]' },
  mtr:    { label: '📅 Switch to Mid-Term Rental',    color: 'bg-[#162035] text-[#6ab0f5] border-[#1e3a5a]' },
  hybrid: { label: '⚖️ Hybrid STR + MTR Strategy',    color: 'bg-[#2a1a0a] text-[#f5c55c] border-[#5a3010]' },
};

const DEAL_REC: Record<string, { label: string; bg: string }> = {
  'strong-buy':  { label: '🟢 Strong Buy',   bg: 'bg-emerald-600' },
  'buy':         { label: '✅ Buy',           bg: 'bg-[#4a90d9]' },
  'neutral':     { label: '🔶 Neutral',       bg: 'bg-amber-500' },
  'pass':        { label: '🔴 Pass',          bg: 'bg-orange-600' },
  'strong-pass': { label: '❌ Strong Pass',   bg: 'bg-red-700' },
};

export default function ReportOutput({ address, data, ownerActualRevenue, onSave, onBack, saving, saved, savedReportId, onRefine, recipientEmail, recipientName, recipientPhone, onMarkContacted, leadId, ownerId }: ReportOutputProps) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const isMtr = data.reportType === 'mtr';
  const isDeal = data.reportType === 'deal';
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
  const [noteTemplate, setNoteTemplate] = useState<'standard' | 'sales'>('standard');
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shorteningLink, setShorteningLink] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);

  const addressSlug = address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const shareUrl = savedReportId
    ? `${window.location.origin}/?share=${savedReportId}&address=${addressSlug}`
    : null;
  const portalPersonId = leadId || ownerId || null;
  const portalUrl = portalPersonId ? `${window.location.origin}/?portal=${portalPersonId}` : null;

  const previewHtml = buildReportEmail(address, data, ownerActualRevenue, personalNote, noteTemplate === 'sales');

  const firstName = (emailName || recipientName || '').trim().split(' ')[0] || 'there';
  const followUpText = `Hey ${firstName}! This is Ethan, I just ran your revenue analysis for your property at ${address} and emailed it to you at ${emailTo || recipientEmail || ''}. Please check your promotions/spam folder as they sometimes end up there.${shareUrl ? `\n\nYou can also view it online here: ${shareUrl}` : ''}\n\nIf you want, we can implement this for you and manage everything end-to-end. Book a 15-minute call here: https://calendly.com/ejretreats1/30min`;

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function shortenAndCopy() {
    if (!shareUrl) return;
    setShorteningLink(true);
    let finalUrl = shareUrl;
    try {
      const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(shareUrl)}`);
      const json = await res.json();
      if (json.shorturl) finalUrl = json.shorturl;
    } catch { /* fall back to original */ }
    try {
      await navigator.clipboard.writeText(`${address}: ${finalUrl}`);
    } catch { /* ignore clipboard errors */ }
    setShorteningLink(false);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function openEmailModal() {
    const name = recipientName ?? '';
    const first = name.trim().split(' ')[0] || '';
    setEmailTo(recipientEmail ?? '');
    setEmailName(name);
    setEmailSubject(isDeal ? `Deal Analysis: ${data.reportTitle}` : `Your Revenue Analysis: ${data.reportTitle}`);
    setPersonalNote(isDeal ? '' : defaultEmailNote(first, address));
    setNoteTemplate('standard');
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
      onMarkContacted?.();
      if (!saved) onSave();
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
          <div className="w-80 flex-shrink-0 bg-[#1a2335] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-[#4a90d9]" />
                <h3 className="text-sm font-bold text-white">Email Report</h3>
              </div>
              <button onClick={() => setEmailOpen(false)} className="text-[#3a5070] hover:text-[#b8d4f0]">
                <X size={16} />
              </button>
            </div>

            {emailSent ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex flex-col items-center text-center pt-2 pb-1">
                  <div className="w-12 h-12 rounded-full bg-[#0a2518] flex items-center justify-center mb-2">
                    <Send size={20} className="text-[#5ce0a0]" />
                  </div>
                  <p className="text-sm font-bold text-white">Report Sent!</p>
                  <p className="text-xs text-[#b8d4f0] mt-0.5">Delivered to {emailTo}</p>
                </div>

                {/* Phone number */}
                {recipientPhone && (
                  <div>
                    <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Phone Number</p>
                    <div className="flex items-center gap-2 bg-[#1e2d45] rounded-lg px-3 py-2">
                      <Phone size={13} className="text-[#3a5070] flex-shrink-0" />
                      <span className="text-sm text-white flex-1 font-medium">{recipientPhone}</span>
                      <button
                        onClick={() => copyText(recipientPhone, setCopiedPhone)}
                        className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium transition-colors flex-shrink-0"
                      >
                        {copiedPhone ? <><CheckIcon size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Follow-up text message */}
                <div>
                  <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Follow-up Text</p>
                  <div className="bg-[#1e2d45] rounded-lg p-3 text-xs text-[#b8d4f0] leading-relaxed whitespace-pre-wrap">{followUpText}</div>
                  <button
                    onClick={() => copyText(followUpText, setCopiedMsg)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs border border-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e2d45] py-2 rounded-lg transition-colors font-medium"
                  >
                    {copiedMsg ? <><CheckIcon size={12} /> Copied!</> : <><Copy size={12} /> Copy Text Message</>}
                  </button>
                </div>

                <button onClick={() => setEmailOpen(false)} className="w-full text-sm bg-[#4a90d9] text-white py-2.5 rounded-lg hover:bg-[#3a80c9] transition-colors font-medium">Close</button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#b8d4f0] mb-1.5">Recipient Name</label>
                  <input
                    value={emailName}
                    onChange={e => setEmailName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#b8d4f0] mb-1.5">Email Address *</label>
                  <input
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="jane@example.com"
                    type="email"
                    className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#b8d4f0] mb-1.5">Subject</label>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-[#b8d4f0]">Personal Note <span className="text-[#3a5070] font-normal">(appears at top)</span></label>
                    <div className="flex gap-0.5 p-0.5 bg-[#1e2d45] rounded-lg">
                      <button
                        type="button"
                        onClick={() => { setNoteTemplate('standard'); setPersonalNote(isDeal ? '' : defaultEmailNote(firstName, address)); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${noteTemplate === 'standard' ? 'bg-[#1a2335] text-[#b8d4f0] shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNoteTemplate('sales'); setPersonalNote(defaultSalesNote(firstName, address, data)); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${noteTemplate === 'sales' ? 'bg-[#1a2335] text-[#4a90d9] shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
                      >
                        🔥 Get on a Call
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={personalNote}
                    onChange={e => { setPersonalNote(e.target.value); setNoteTemplate('standard'); }}
                    rows={14}
                    className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] resize-y"
                  />
                  <p className="text-xs text-[#3a5070] mt-1">The full report follows automatically below your note.</p>
                </div>
                {emailError && <p className="text-xs text-[#e05c5c]">{emailError}</p>}
              </div>
            )}

            {!emailSent && (
              <div className="p-5 border-t border-[#1e2d45]">
                <button
                  onClick={handleEmailReport}
                  disabled={!emailTo.trim() || emailSending}
                  className="w-full flex items-center justify-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {emailSending ? <><Loader size={13} className="animate-spin" /> Sending...</> : <><Send size={13} /> Send Report</>}
                </button>
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="flex-1 flex flex-col bg-[#1e2d45]">
            <div className="px-4 py-3 bg-[#1e2d45] border-b border-[#1e2d45] flex items-center gap-2">
              <span className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider">Live Preview</span>
              <span className="text-xs text-[#3a5070]">— updates as you type</span>
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
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#b8d4f0] hover:text-[#4a90d9] transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2">
          {portalUrl && (
            <button
              onClick={() => copyText(portalUrl, setCopiedPortal)}
              className="flex items-center gap-1.5 text-sm border border-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e2d45] px-3 py-2 rounded-lg transition-colors"
            >
              {copiedPortal ? <><CheckIcon size={14} className="text-emerald-500" /> Copied!</> : <><Copy size={14} /> Copy Portal Link</>}
            </button>
          )}
          {shareUrl && (
            <button
              onClick={shortenAndCopy}
              disabled={shorteningLink}
              className="flex items-center gap-1.5 text-sm border border-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e2d45] disabled:opacity-60 px-3 py-2 rounded-lg transition-colors"
            >
              {copiedLink ? <><CheckIcon size={14} className="text-emerald-500" /> Copied!</> : shorteningLink ? <><Loader size={14} className="animate-spin" /> Shortening...</> : <><Copy size={14} /> Copy Link</>}
            </button>
          )}
          <button
            onClick={openEmailModal}
            className="flex items-center gap-1.5 text-sm border border-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e2d45] px-3 py-2 rounded-lg transition-colors"
          >
            <Mail size={14} /> {isDeal ? 'Email Analysis' : 'Email Report'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-sm border border-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e2d45] px-3 py-2 rounded-lg transition-colors"
          >
            <Printer size={14} /> Download PDF
          </button>
          <button
            onClick={onSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 text-sm bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-60 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Save size={14} /> {saved ? 'Saved' : saving ? 'Saving...' : 'Save Report'}
          </button>
        </div>
      </div>

      <div className="bg-[#1a2335] mx-6 mb-6 rounded-2xl border border-[#1e2d45] overflow-hidden print:overflow-visible print:border-none print:rounded-none print:mx-0 print:mb-0">

        {/* Header */}
        <div className={`text-white px-8 py-6 ${isDeal ? 'bg-amber-700' : isMtr ? 'bg-indigo-700' : 'bg-[#3a80c9]'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isDeal ? 'text-amber-200' : isMtr ? 'text-indigo-200' : 'text-teal-200'}`}>
                E&J Retreats · {isDeal ? 'Deal Analyzer' : isMtr ? 'Mid-Term Rental Analysis' : 'Revenue Analysis'}
              </div>
              <h1 className="text-2xl font-bold leading-tight">{data.reportTitle}</h1>
              <p className={`text-sm mt-1 ${isDeal ? 'text-amber-200' : isMtr ? 'text-indigo-200' : 'text-teal-200'}`}>{address}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-xs ${isDeal ? 'text-amber-200' : isMtr ? 'text-indigo-200' : 'text-teal-200'}`}>{date}</div>
              {isMtr && <div className="text-xs font-bold mt-1 bg-[#1a2335]/20 px-2 py-0.5 rounded-full">MTR Report</div>}
              {isDeal && <div className="text-xs font-bold mt-1 bg-[#1a2335]/20 px-2 py-0.5 rounded-full">Deal Analyzer</div>}
            </div>
          </div>
        </div>

        {/* Deal: recommendation banner */}
        {isDeal && data.recommendation && (() => {
          const rec = DEAL_REC[data.recommendation] ?? { label: data.recommendation, bg: 'bg-slate-600' };
          return (
            <div className={`${rec.bg} text-white px-8 py-4 flex items-center justify-between`}>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-0.5 opacity-75">Investment Recommendation</div>
                <div className="text-xl font-black">{rec.label}</div>
                {data.recommendationReason && (
                  <p className="text-sm mt-1 opacity-90 max-w-xl">{data.recommendationReason}</p>
                )}
              </div>
              {data.listingPrice != null && (
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="text-xs opacity-75">Asking Price</div>
                  <div className="text-2xl font-black">{fmt(data.listingPrice)}</div>
                  {data.grossYield != null && (
                    <div className="text-sm font-semibold opacity-90">{data.grossYield.toFixed(1)}% gross yield</div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

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
                <div key={s.label} className="bg-[#1e2d45] rounded-xl p-4">
                  <div className="text-xl font-black text-[#4a90d9]">{s.value}</div>
                  <div className="text-xs font-semibold text-[#b8d4f0] mt-0.5">{s.label}</div>
                  <div className="text-xs text-[#3a5070]">{s.sub}</div>
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
                <div key={s.label} className={`rounded-xl p-4 ${s.accent ? 'bg-[#1a1a35]' : 'bg-[#1e2d45]'}`}>
                  <div className={`text-xl font-black ${s.accent ? 'text-[#d07af5]' : 'text-[#b8d4f0]'}`}>{s.value}</div>
                  <div className="text-xs font-semibold text-[#b8d4f0] mt-0.5">{s.label}</div>
                  <div className="text-xs text-[#3a5070]">{s.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Deal ROI metrics ── */}
          {isDeal && (
            <div className="print-section grid grid-cols-3 gap-3">
              <div className="bg-[#2a1a0a] rounded-xl p-4">
                <div className="text-xl font-black text-[#d0954a]">{fmt(data.listingPrice)}</div>
                <div className="text-xs font-semibold text-[#b8d4f0] mt-0.5">Listing Price</div>
              </div>
              <div className="bg-[#2a1a0a] rounded-xl p-4">
                <div className="text-xl font-black text-[#d0954a]">{fmt(data.combinedAnnualRevenue)}</div>
                <div className="text-xs font-semibold text-[#b8d4f0] mt-0.5">Combined Annual Revenue</div>
                <div className="text-xs text-[#3a5070]">all units projected</div>
              </div>
              <div className="bg-[#2a1a0a] rounded-xl p-4">
                <div className="text-xl font-black text-[#d0954a]">{data.grossYield != null ? `${data.grossYield.toFixed(1)}%` : '—'}</div>
                <div className="text-xs font-semibold text-[#b8d4f0] mt-0.5">Gross Yield</div>
                <div className="text-xs text-[#3a5070]">annual rev ÷ price</div>
              </div>
            </div>
          )}

          {/* ── Deal per-unit breakdown ── */}
          {isDeal && data.units && data.units.length > 0 && (
            <div className="print-section">
              <h3 className="text-sm font-bold text-white mb-3">Per-Unit Breakdown</h3>
              <div className="bg-[#1e2d45] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1e2d45] text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left">Unit</th>
                      <th className="px-4 py-2.5 text-center">Beds / Baths</th>
                      <th className="px-4 py-2.5 text-right">Proj. Annual Rev</th>
                      <th className="px-4 py-2.5 text-right">Occupancy</th>
                      <th className="px-4 py-2.5 text-right">ADR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2d45]">
                    {data.units.map((u, i) => {
                      const qty = u.quantity ?? 1;
                      return (
                        <tr key={i} className="bg-[#1a2335]">
                          <td className="px-4 py-2.5 font-semibold text-white">
                            {u.unitLabel}{qty > 1 && <span className="ml-1.5 text-xs font-bold text-[#d0954a]">×{qty}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-[#b8d4f0]">
                            {[u.bedrooms != null ? `${u.bedrooms}bd` : null, u.bathrooms != null ? `${u.bathrooms}ba` : null].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#d0954a]">
                            {fmt(u.projectedAnnualRevenue)}
                            {qty > 1 && u.projectedAnnualRevenue != null && (
                              <div className="text-xs text-[#d0954a] font-normal">×{qty} = {fmt(u.projectedAnnualRevenue * qty)}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[#b8d4f0]">{fmtPct(u.occupancyRate)}</td>
                          <td className="px-4 py-2.5 text-right text-[#b8d4f0]">{u.adr != null ? `$${Math.round(u.adr)}` : ''}</td>
                        </tr>
                      );
                    })}
                    {data.units.length > 1 && (
                      <tr className="bg-[#2a1a0a] border-t-2 border-[#5a3010]">
                        <td className="px-4 py-2.5 font-bold text-[#f5c55c]">Combined Total</td>
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 text-right font-bold text-[#f5c55c]">{fmt(data.combinedAnnualRevenue)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#d0954a]">{fmtPct(data.combinedOccupancyRate)}</td>
                        <td className="px-4 py-2.5" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Deal highlights & concerns ── */}
          {isDeal && ((data.propertyHighlights?.length ?? 0) > 0 || (data.concerns?.length ?? 0) > 0) && (
            <div className="print-section grid sm:grid-cols-2 gap-4">
              {data.propertyHighlights && data.propertyHighlights.length > 0 && (
                <div className="bg-[#0a2518] border border-[#0a4a2a] rounded-xl p-4">
                  <h3 className="text-sm font-bold text-emerald-800 mb-3">Property Highlights</h3>
                  <ul className="space-y-2">
                    {data.propertyHighlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#b8d4f0]">
                        <span className="text-emerald-500 flex-shrink-0 font-bold mt-0.5">✓</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.concerns && data.concerns.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-orange-800 mb-3">Concerns / Risks</h3>
                  <ul className="space-y-2">
                    {data.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#b8d4f0]">
                        <span className="text-orange-400 flex-shrink-0 font-bold mt-0.5">!</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── MTR details ── */}
          {isMtr && data.mtrProjected && (
            <div className="print-section grid sm:grid-cols-2 gap-4">
              <div className="bg-[#1e2d45] rounded-xl p-4">
                <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider mb-2">Lease & Tenant</p>
                <p className="text-sm font-semibold text-white">{data.mtrProjected.recommendedLeaseLength} stays</p>
                <p className="text-xs text-[#b8d4f0] mt-1">{data.mtrProjected.targetTenantProfile}</p>
              </div>
              {data.recommendedPlatforms && data.recommendedPlatforms.length > 0 && (
                <div className="bg-[#1e2d45] rounded-xl p-4">
                  <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wider mb-2">Recommended Platforms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.recommendedPlatforms.map(p => (
                      <span key={p} className="text-xs bg-[#1a1a35] text-[#d07af5] px-2 py-0.5 rounded-full font-medium">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STR vs MTR comparison ── */}
          {isMtr && data.strVsMtr && (
            <div className="print-section bg-[#1e2d45] rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">STR vs. MTR Comparison</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1a2335] rounded-lg p-3 text-center border border-[#1e2d45]">
                  <p className="text-xs text-[#b8d4f0] mb-1">STR Annual (AirDNA)</p>
                  <p className="text-2xl font-black text-[#6ab0f5]">{fmt(data.strVsMtr.strAnnualEstimate)}</p>
                  <p className="text-xs text-[#3a5070]">short-term rental</p>
                </div>
                <div className="bg-[#1a2335] rounded-lg p-3 text-center border border-[#2a1a5a]">
                  <p className="text-xs text-[#b8d4f0] mb-1">MTR Annual (projected)</p>
                  <p className="text-2xl font-black text-[#d07af5]">{fmt(data.strVsMtr.mtrAnnualEstimate)}</p>
                  <p className="text-xs text-[#3a5070]">mid-term rental</p>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${RECOMMENDATION_LABELS[data.strVsMtr.recommendation].color}`}>
                {RECOMMENDATION_LABELS[data.strVsMtr.recommendation].label}
              </div>
              <p className="text-sm text-[#b8d4f0] leading-relaxed">{data.strVsMtr.reasoning}</p>
            </div>
          )}

          {/* ── Owner comparison (STR) ── */}
          {!isMtr && ownerActualRevenue != null && data.extracted && (
            <div className="print-section bg-[#1e2d45] rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Owner vs. Market</h3>
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-[#b8d4f0]">Owner Reported</div>
                  <div className="text-2xl font-black text-white">{fmt(ownerActualRevenue)}</div>
                  <div className="text-xs text-[#3a5070]">last 12 months</div>
                </div>
                <div className="text-[#3a5070] text-2xl font-light">vs</div>
                <div>
                  <div className="text-xs text-[#b8d4f0]">AirDNA Projected</div>
                  <div className="text-2xl font-black text-[#4a90d9]">{fmt(data.extracted.projectedAnnualRevenue)}</div>
                  <div className="text-xs text-[#3a5070]">market potential</div>
                </div>
              </div>
              <GapBadge projected={data.extracted.projectedAnnualRevenue} actual={ownerActualRevenue} />
            </div>
          )}

          {/* ── Owner comparison (MTR) ── */}
          {isMtr && ownerActualRevenue != null && data.mtrProjected && (
            <div className="print-section bg-[#1e2d45] rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Owner vs. MTR Projection</h3>
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-[#b8d4f0]">Owner Reported (STR)</div>
                  <div className="text-2xl font-black text-white">{fmt(ownerActualRevenue)}</div>
                  <div className="text-xs text-[#3a5070]">last 12 months</div>
                </div>
                <div className="text-[#3a5070] text-2xl font-light">vs</div>
                <div>
                  <div className="text-xs text-[#b8d4f0]">MTR Projected</div>
                  <div className="text-2xl font-black text-[#d07af5]">{fmt(data.mtrProjected.annualRevenue)}</div>
                  <div className="text-xs text-[#3a5070]">annual MTR potential</div>
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
            <div className="sm:col-span-2 bg-[#1e2d45] rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-2">Executive Summary</h3>
              <p className="text-sm text-[#b8d4f0] leading-relaxed">{data.executiveSummary}</p>
            </div>
          </div>

          {/* Key findings */}
          {data.keyFindings.length > 0 && (
            <div className="print-section">
              <h3 className="text-sm font-bold text-white mb-3">Key Findings</h3>
              <ul className="space-y-2">
                {data.keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-[#b8d4f0]">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-[#162035] text-[#4a90d9] text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
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
              <h3 className="text-sm font-bold text-white mb-2">Market Opportunity</h3>
              <p className="text-sm text-[#b8d4f0] leading-relaxed">{data.marketOpportunity}</p>
            </div>
          )}

          {/* Performance gap */}
          {data.performanceGap && (
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Performance Gap Analysis</h3>
              <p className="text-sm text-[#b8d4f0] leading-relaxed">{data.performanceGap}</p>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="print-section">
              <h3 className="text-sm font-bold text-white mb-3">Recommendations</h3>
              <ol className="space-y-3">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${isMtr ? 'bg-indigo-600' : 'bg-[#4a90d9]'}`}>{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{r.title}</p>
                      <p className="text-sm text-[#b8d4f0] mt-0.5">{r.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Revenue projections (STR + Deal) */}
          {!isMtr && data.revenueProjections && (
            <div className="print-section">
              <h3 className="text-sm font-bold text-white mb-3">{isDeal ? 'Revenue Projections (All Units Combined)' : 'Revenue Projections with E&J Retreats'}</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Conservative', value: data.revenueProjections.conservative, color: 'bg-[#1e2d45] text-[#b8d4f0]' },
                  { label: 'Realistic',    value: data.revenueProjections.realistic,    color: 'bg-[#162035] text-[#6ab0f5] ring-2 ring-teal-200' },
                  { label: 'Optimistic',   value: data.revenueProjections.optimistic,   color: 'bg-[#0a2518] text-emerald-800' },
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
                className="w-full flex items-center justify-between px-4 py-3 bg-[#2a1a35] hover:bg-[#2a1a35] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#d07af5]" />
                  <span className="text-sm font-semibold text-purple-800">Refine with AI</span>
                  <span className="text-xs text-[#d07af5]">Tell the AI what to change or add</span>
                </div>
                {refineOpen ? <ChevronUp size={14} className="text-purple-400" /> : <ChevronDown size={14} className="text-purple-400" />}
              </button>
              {refineOpen && (
                <div className="p-4 space-y-3 bg-[#1a2335]">
                  <textarea
                    value={refineMsg}
                    onChange={e => setRefineMsg(e.target.value)}
                    rows={3}
                    placeholder="e.g. The property has a heated pool and game room — update the analysis to reflect this. Also make the recommendations more aggressive."
                    className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                  />
                  {refineError && <p className="text-xs text-[#e05c5c]">{refineError}</p>}
                  {refineSuccess && <p className="text-xs text-[#5ce0a0] font-medium">Report updated successfully.</p>}
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

          <div className="border-t border-[#1e2d45] pt-4 text-xs text-[#3a5070] text-center print:hidden">
            Generated by E&J Retreats · Powered by AirDNA market data · Projections are estimates and not guaranteed.
          </div>
        </div>
      </div>
    </div>
  );
}

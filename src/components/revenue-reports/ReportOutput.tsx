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

// ── Email HTML builder ────────────────────────────────────────────────────────

export function buildReportEmail(address: string, data: ReportData, ownerActualRevenue?: number, personalNote?: string, showCalendlyCta?: boolean): string {
  const isMtr  = data.reportType === 'mtr';
  const isDeal = data.reportType === 'deal';

  // Brand palette
  const ORANGE      = '#FF6600';
  const ORANGE_DIM  = '#8B4500';
  const GREEN       = '#22C55E';
  const BG_PAGE     = '#0f0f0f';
  const BG_CARD     = '#1a1f2e';
  const BG_INNER    = '#151a27';
  const BORDER      = '#2a2f3e';
  const TEXT_GRAY   = '#9CA3AF';
  const TEXT_LABEL  = '#6B7280';
  const TEXT_MUTED  = '#4B5563';

  const accentColor = isDeal ? '#f97316' : isMtr ? '#a78bfa' : ORANGE;

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtN = (n: number | null | undefined) => n == null ? '' : `$${Math.round(n).toLocaleString()}`;
  const fmtP = (n: number | null | undefined) => n == null ? '' : `${Math.round(n)}%`;
  const scoreColor = data.opportunityScore >= 7 ? GREEN : data.opportunityScore >= 4 ? ORANGE : '#ef4444';

  const sectionTitle = (t: string) =>
    `<div style="font-size:10px;font-weight:700;color:${TEXT_LABEL};letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">${t}</div>`;

  // ── Deal rec banner ─────────────────────────────────────────────────────────
  const DEAL_REC_COLORS: Record<string, string> = {
    'strong-buy': '#059669', 'buy': '#0f766e', 'neutral': '#d97706', 'pass': '#ea580c', 'strong-pass': '#b91c1c',
  };
  const DEAL_REC_LABELS: Record<string, string> = {
    'strong-buy': '🟢 Strong Buy', 'buy': '✅ Buy', 'neutral': '🔶 Neutral', 'pass': '🔴 Pass', 'strong-pass': '❌ Strong Pass',
  };

  const dealRecHtml = isDeal && data.recommendation ? `
    <div style="background:${DEAL_REC_COLORS[data.recommendation] ?? '#334155'};border-radius:8px;padding:20px 24px;margin-bottom:20px;color:#fff;">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;opacity:0.75;margin-bottom:4px;">Investment Recommendation</div>
      <div style="font-size:20px;font-weight:900;">${DEAL_REC_LABELS[data.recommendation] ?? data.recommendation}</div>
      ${data.recommendationReason ? `<div style="font-size:12px;opacity:0.9;margin-top:6px;line-height:1.5;">${data.recommendationReason}</div>` : ''}
    </div>` : '';

  // ── Deal metrics ────────────────────────────────────────────────────────────
  const dealMetricsHtml = isDeal ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
      ${[['Listing Price', fmtN(data.listingPrice)], ['Combined Annual Revenue', fmtN(data.combinedAnnualRevenue)], ['Gross Yield', data.grossYield != null ? `${data.grossYield.toFixed(1)}%` : '']].map(([l, v]) => `
        <td width="33%" style="padding:4px;"><div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:18px;font-weight:900;color:${ORANGE};">${v}</div>
          <div style="font-size:10px;font-weight:600;color:${TEXT_GRAY};margin-top:2px;text-transform:uppercase;letter-spacing:1px;">${l}</div>
        </div></td>`).join('')}
    </tr></table>` : '';

  // ── Deal units table ────────────────────────────────────────────────────────
  const dealUnitsHtml = isDeal && data.units && data.units.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle(data.units.length > 1 ? 'Per-Unit Breakdown' : 'Unit Revenue Breakdown')}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
        <tr style="background:${BG_INNER};">
          ${['Unit','Beds/Baths','Proj. Annual Rev','Occupancy','ADR'].map(h =>
            `<td style="padding:8px 12px;font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;">${h}</td>`).join('')}
        </tr>
        ${data.units.map((u, i) => {
          const qty = u.quantity ?? 1;
          const labelSuffix = qty > 1 ? ` <span style="color:${ORANGE};">×${qty}</span>` : '';
          const revDisplay  = qty > 1 && u.projectedAnnualRevenue != null
            ? `${fmtN(u.projectedAnnualRevenue)} <span style="font-size:10px;color:${ORANGE};">× ${qty} = ${fmtN(u.projectedAnnualRevenue * qty)}</span>`
            : fmtN(u.projectedAnnualRevenue);
          return `
          <tr style="background:${i % 2 === 0 ? BG_CARD : BG_INNER};">
            <td style="padding:8px 12px;font-size:12px;color:#fff;font-weight:600;">${u.unitLabel}${labelSuffix}</td>
            <td style="padding:8px 12px;font-size:12px;color:${TEXT_GRAY};text-align:center;">${[u.bedrooms != null ? `${u.bedrooms}bd` : null, u.bathrooms != null ? `${u.bathrooms}ba` : null].filter(Boolean).join('/') || '—'}</td>
            <td style="padding:8px 12px;font-size:12px;color:${ORANGE};font-weight:700;text-align:right;">${revDisplay}</td>
            <td style="padding:8px 12px;font-size:12px;color:${TEXT_GRAY};text-align:right;">${fmtP(u.occupancyRate)}</td>
            <td style="padding:8px 12px;font-size:12px;color:${TEXT_GRAY};text-align:right;">${u.adr != null ? `$${Math.round(u.adr)}` : ''}</td>
          </tr>`;
        }).join('')}
        ${data.units.length > 1 ? `
          <tr style="background:${BG_INNER};border-top:2px solid ${BORDER};">
            <td style="padding:8px 12px;font-size:12px;color:${ORANGE};font-weight:700;" colspan="2">Combined Total</td>
            <td style="padding:8px 12px;font-size:12px;color:${ORANGE};font-weight:700;text-align:right;">${fmtN(data.combinedAnnualRevenue)}</td>
            <td style="padding:8px 12px;font-size:12px;color:${TEXT_GRAY};text-align:right;">${fmtP(data.combinedOccupancyRate)}</td>
            <td style="padding:8px 12px;"></td>
          </tr>` : ''}
      </table>
    </div>` : '';

  // ── Deal highlights & concerns ──────────────────────────────────────────────
  const dealHLCHtml = isDeal && ((data.propertyHighlights?.length ?? 0) > 0 || (data.concerns?.length ?? 0) > 0) ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr valign="top">
      ${data.propertyHighlights?.length ? `
        <td width="50%" style="padding-right:6px;">
          <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px;">
            <div style="font-size:9px;font-weight:700;color:${GREEN};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Property Highlights</div>
            ${data.propertyHighlights.map(h => `<div style="font-size:11px;color:${TEXT_GRAY};margin-bottom:5px;"><span style="color:${GREEN};font-weight:700;">✓</span> ${h}</div>`).join('')}
          </div>
        </td>` : ''}
      ${data.concerns?.length ? `
        <td width="50%" style="padding-left:6px;">
          <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px;">
            <div style="font-size:9px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Concerns / Risks</div>
            ${data.concerns.map(c => `<div style="font-size:11px;color:${TEXT_GRAY};margin-bottom:5px;"><span style="color:#f97316;font-weight:700;">!</span> ${c}</div>`).join('')}
          </div>
        </td>` : ''}
    </tr></table>` : '';

  // ── STR / MTR metric cards ──────────────────────────────────────────────────
  let metricsHtml = '';
  if (!isMtr && !isDeal && data.extracted) {
    metricsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <tr>
          ${[
            ['Projected Annual', fmtN(data.extracted.projectedAnnualRevenue), ORANGE,    'per AirDNA'],
            ['Occupancy Rate',   fmtP(data.extracted.occupancyRate),          '#ffffff',  'market average'],
            ['Avg Daily Rate',   fmtN(data.extracted.adr),                    '#ffffff',  'comp-based target'],
            ['RevPAR',           fmtN(data.extracted.revpar),                 GREEN,      'submarket data'],
          ].map(([l, v, c, sub]) => `
            <td width="25%" style="padding:4px;">
              <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px;">
                <div style="font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${l}</div>
                <div style="font-size:20px;font-weight:900;color:${c};">${v}</div>
                <div style="font-size:10px;color:${TEXT_MUTED};margin-top:3px;">${sub}</div>
              </div>
            </td>`).join('')}
        </tr>
      </table>`;
  } else if (isMtr && data.mtrProjected) {
    metricsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
        <tr>
          ${[
            ['Est. Monthly Rent',   fmtN(data.mtrProjected.monthlyRent),    accentColor, 'MTR projection'],
            ['Est. Annual Revenue', fmtN(data.mtrProjected.annualRevenue),   accentColor, 'MTR projection'],
            ['Expected Occupancy',  fmtP(data.mtrProjected.occupancyRate),  '#ffffff',   'MTR typical'],
          ].map(([l, v, c, sub]) => `
            <td width="33%" style="padding:4px;">
              <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px;">
                <div style="font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${l}</div>
                <div style="font-size:20px;font-weight:900;color:${c};">${v}</div>
                <div style="font-size:10px;color:${TEXT_MUTED};margin-top:3px;">${sub}</div>
              </div>
            </td>`).join('')}
        </tr>
      </table>`;
  }

  // ── Owner vs Market ─────────────────────────────────────────────────────────
  const ownerHtml = ownerActualRevenue != null ? (() => {
    const projected = !isMtr ? data.extracted?.projectedAnnualRevenue : data.mtrProjected?.annualRevenue;
    if (!projected) return '';
    const gap = projected - ownerActualRevenue;
    const pct = Math.abs(Math.round((gap / projected) * 100));
    const isBelow = gap > 0;
    return `<div style="margin-bottom:24px;background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:16px;">
      ${sectionTitle('Owner vs. Market')}
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="text-align:center;"><div style="font-size:10px;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Owner Reported</div><div style="font-size:22px;font-weight:900;color:#fff;">${fmtN(ownerActualRevenue)}</div></td>
        <td style="text-align:center;color:${TEXT_MUTED};font-size:18px;">vs</td>
        <td style="text-align:center;"><div style="font-size:10px;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${isMtr?'MTR':'AirDNA'} Projected</div><div style="font-size:22px;font-weight:900;color:${ORANGE};">${fmtN(projected)}</div></td>
      </tr></table>
      <div style="margin-top:10px;padding:8px 12px;background:${isBelow?'#2a0a0a':'#0a2a15'};border:1px solid ${isBelow?'#7f1d1d':'#14532d'};border-radius:6px;font-size:12px;font-weight:700;color:${isBelow?'#ef4444':GREEN};">
        ${isBelow?`$${Math.round(gap).toLocaleString()} below market (${pct}% gap)`:`$${Math.round(Math.abs(gap)).toLocaleString()} above market — outperforming!`}
      </div></div>`;
  })() : '';

  // ── Score + Summary ─────────────────────────────────────────────────────────
  const scoreHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
      <td width="28%" valign="top" style="padding-right:12px;">
        <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:36px;font-weight:900;color:${scoreColor};">${data.opportunityScore}<span style="font-size:14px;color:${TEXT_MUTED};">/10</span></div>
          <div style="font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Opportunity Score</div>
        </div>
      </td>
      <td width="72%" valign="top">
        <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:16px;">
          <div style="font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Executive Summary</div>
          <div style="font-size:12px;color:${TEXT_GRAY};line-height:1.7;">${data.executiveSummary}</div>
        </div>
      </td>
    </tr></table>`;

  // ── Key Findings ────────────────────────────────────────────────────────────
  const findingsHtml = data.keyFindings.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle(`${data.keyFindings.length} Key Findings`)}
      ${data.keyFindings.map((f, i) => `
        <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;margin-bottom:8px;display:flex;gap:12px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;"><tr>
            <td width="28" valign="top" style="padding-right:10px;">
              <div style="font-size:13px;font-weight:900;color:${ORANGE};">${String(i + 1).padStart(2, '0')}</div>
            </td>
            <td style="font-size:12px;color:${TEXT_GRAY};line-height:1.6;">${f}</td>
          </tr></table>
        </div>`).join('')}
    </div>` : '';

  // ── Seasonality chart ───────────────────────────────────────────────────────
  const seasonalityHtml = data.monthlySeasonality && data.monthlySeasonality.length > 0 ? (() => {
    const months  = data.monthlySeasonality!;
    const maxRev  = Math.max(...months.map(m => m.revenue ?? 0), 1);
    const CHART_H = 80;
    return `<div style="margin-bottom:24px;">
      ${sectionTitle('Seasonal Revenue Breakdown')}
      <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>${months.map(m => {
            const barH  = Math.max(4, Math.round(((m.revenue ?? 0) / maxRev) * CHART_H));
            const emptyH = CHART_H - barH;
            const occ = m.occupancy != null ? `${Math.round(m.occupancy)}%` : '';
            const isHigh = (m.revenue ?? 0) / maxRev >= 0.6;
            return `<td style="text-align:center;vertical-align:bottom;padding:0 2px;">
              <div style="font-size:8px;color:${ORANGE};font-weight:700;margin-bottom:2px;">${occ}</div>
              <div style="height:${emptyH}px;"></div>
              <div style="height:${barH}px;background:${isHigh ? ORANGE : ORANGE_DIM};border-radius:3px 3px 0 0;"></div>
              <div style="font-size:9px;color:${TEXT_MUTED};margin-top:4px;">${m.month.slice(0, 3)}</div>
            </td>`;
          }).join('')}</tr>
        </table>
      </div></div>`;
  })() : '';

  // ── Comparable Properties ───────────────────────────────────────────────────
  const comparablesHtml = data.comparables && data.comparables.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Comparable Properties')}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
        <tr style="background:${BG_INNER};">
          ${['Beds','Annual Rev','Occupancy','ADR'].map(h =>
            `<td style="padding:8px 12px;font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;">${h}</td>`).join('')}
        </tr>
        ${data.comparables.map((c, i) => `
          <tr style="background:${i % 2 === 0 ? BG_CARD : BG_INNER};">
            <td style="padding:8px 12px;font-size:12px;color:#fff;font-weight:600;">${c.bedrooms != null ? `${c.bedrooms} BR` : ''}</td>
            <td style="padding:8px 12px;font-size:12px;color:${ORANGE};font-weight:700;">${c.annualRevenue != null ? `$${Math.round(c.annualRevenue).toLocaleString()}` : ''}</td>
            <td style="padding:8px 12px;font-size:12px;color:${TEXT_GRAY};">${c.occupancyRate != null ? `${Math.round(c.occupancyRate)}%` : ''}</td>
            <td style="padding:8px 12px;font-size:12px;color:${TEXT_GRAY};">${c.adr != null ? `$${Math.round(c.adr)}` : ''}</td>
          </tr>`).join('')}
      </table>
      <div style="font-size:9px;color:${TEXT_MUTED};text-align:right;margin-top:4px;">Source: AirDNA comparable listings</div>
    </div>` : '';

  // ── Market Opportunity ──────────────────────────────────────────────────────
  const marketHtml = data.marketOpportunity ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Market Opportunity')}
      <div style="font-size:12px;color:${TEXT_GRAY};line-height:1.7;">${data.marketOpportunity}</div>
    </div>` : '';

  const gapHtml = data.performanceGap ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Performance Gap Analysis')}
      <div style="font-size:12px;color:${TEXT_GRAY};line-height:1.7;">${data.performanceGap}</div>
    </div>` : '';

  // ── MTR Details ─────────────────────────────────────────────────────────────
  const mtrDetailsHtml = isMtr && data.mtrProjected ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;"><tr>
      <td width="50%" style="padding-right:6px;">
        <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px;">
          <div style="font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Lease & Tenant</div>
          <div style="font-size:13px;font-weight:700;color:#fff;">${data.mtrProjected.recommendedLeaseLength} stays</div>
          <div style="font-size:11px;color:${TEXT_GRAY};margin-top:4px;">${data.mtrProjected.targetTenantProfile}</div>
        </div>
      </td>
      ${data.recommendedPlatforms?.length ? `<td width="50%" style="padding-left:6px;">
        <div style="background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px;">
          <div style="font-size:9px;font-weight:700;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Recommended Platforms</div>
          ${data.recommendedPlatforms.map(p => `<span style="display:inline-block;background:${BG_CARD};color:${accentColor};font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;margin:2px;border:1px solid ${BORDER};">${p}</span>`).join('')}
        </div>
      </td>` : ''}
    </tr></table>` : '';

  // ── STR vs MTR ──────────────────────────────────────────────────────────────
  const strVsMtrHtml = isMtr && data.strVsMtr ? `
    <div style="margin-bottom:24px;background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:16px;">
      ${sectionTitle('STR vs. MTR Comparison')}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px;"><tr>
        <td width="50%" style="padding-right:6px;">
          <div style="background:${BG_CARD};border:1px solid ${BORDER};border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:10px;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">STR Annual (AirDNA)</div>
            <div style="font-size:22px;font-weight:900;color:#60a5fa;">${fmtN(data.strVsMtr.strAnnualEstimate)}</div>
          </div>
        </td>
        <td width="50%" style="padding-left:6px;">
          <div style="background:${BG_CARD};border:1px solid ${BORDER};border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:10px;color:${TEXT_LABEL};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">MTR Annual (projected)</div>
            <div style="font-size:22px;font-weight:900;color:${accentColor};">${fmtN(data.strVsMtr.mtrAnnualEstimate)}</div>
          </div>
        </td>
      </tr></table>
      <div style="font-size:12px;color:${TEXT_GRAY};line-height:1.6;">${data.strVsMtr.reasoning}</div>
    </div>` : '';

  // ── Recommendations ─────────────────────────────────────────────────────────
  const recsHtml = data.recommendations.length > 0 ? `
    <div style="margin-bottom:24px;">
      ${sectionTitle('Recommendations')}
      ${data.recommendations.map((r, i) => `
        <div style="margin-bottom:10px;background:${BG_INNER};border:1px solid ${BORDER};border-radius:8px;padding:14px 16px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;"><tr>
            <td width="24" valign="top" style="padding-right:10px;">
              <div style="font-size:13px;font-weight:900;color:${ORANGE};">${String(i + 1).padStart(2, '0')}</div>
            </td>
            <td>
              <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:3px;">${r.title}</div>
              <div style="font-size:12px;color:${TEXT_GRAY};line-height:1.5;">${r.description}</div>
            </td>
          </tr></table>
        </div>`).join('')}
    </div>` : '';

  // ── Revenue Projections ─────────────────────────────────────────────────────
  const projectionsHtml = !isMtr && data.revenueProjections ? (() => {
    const { conservative, realistic, optimistic } = data.revenueProjections;
    const maxVal = Math.max(conservative, realistic, optimistic);
    return `<div style="margin-bottom:24px;">
      ${sectionTitle('Revenue Scenarios — with E&J Retreats Management')}
      ${[
        { label: 'Conservative', value: conservative, color: ORANGE_DIM,  textColor: TEXT_GRAY  },
        { label: 'Realistic',    value: realistic,    color: ORANGE,      textColor: ORANGE      },
        { label: 'Optimistic',   value: optimistic,   color: ORANGE,      textColor: TEXT_GRAY  },
      ].map(p => {
        const pct = Math.round((p.value / maxVal) * 100);
        return `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
          <tr>
            <td width="90" style="font-size:12px;color:${TEXT_GRAY};padding-right:10px;">${p.label}</td>
            <td>
              <div style="background:${BORDER};border-radius:99px;height:6px;overflow:hidden;">
                <div style="width:${pct}%;height:6px;background:${p.color};border-radius:99px;"></div>
              </div>
            </td>
            <td width="80" style="font-size:13px;font-weight:700;color:${p.textColor};text-align:right;padding-left:10px;">${fmtN(p.value)}</td>
          </tr>
        </table>`;
      }).join('')}
    </div>`;
  })() : '';

  // ── Calendly CTA ────────────────────────────────────────────────────────────
  const ctaHtml = showCalendlyCta ? `
    <div style="margin-bottom:24px;background:${BG_INNER};border:1px solid ${ORANGE};border-radius:12px;padding:24px;text-align:center;">
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:6px;">Want us to implement this for you?</div>
      <div style="font-size:12px;color:${TEXT_GRAY};line-height:1.6;margin-bottom:16px;">We can manage everything end-to-end. Pick a time for a 15-minute call and we'll walk through it together.</div>
      <a href="https://calendly.com/ejretreats1/30min" style="display:inline-block;background:${ORANGE};color:#fff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:99px;text-decoration:none;">📅 Book a 15-Minute Call →</a>
    </div>` : '';

  const headerLabel = isDeal ? 'Deal Analyzer' : isMtr ? 'Mid-Term Rental Analysis' : 'Revenue Analysis';
  const scoreC      = data.opportunityScore >= 7 ? GREEN : data.opportunityScore >= 4 ? ORANGE : '#ef4444';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:${BG_PAGE};font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;"><tr><td>

    <!-- Header card -->
    <div style="background:${BG_CARD};border:1px solid ${BORDER};border-radius:12px 12px 0 0;padding:24px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:${TEXT_LABEL};margin-bottom:4px;">E&amp;J Retreats · ${headerLabel}</div>
          <div style="font-size:20px;font-weight:900;color:#fff;">${data.reportTitle}</div>
          <div style="font-size:12px;color:${TEXT_GRAY};margin-top:4px;">${address} · Powered by AirDNA</div>
          <div style="font-size:10px;color:${TEXT_MUTED};margin-top:4px;">${date}</div>
        </td>
        <td valign="middle" align="right" style="padding-left:16px;">
          <div style="background:#1a0f00;border:1px solid ${ORANGE};border-radius:99px;padding:6px 14px;white-space:nowrap;">
            <span style="font-size:11px;font-weight:700;color:${scoreC};">Opportunity Score: ${data.opportunityScore} / 10</span>
          </div>
        </td>
      </tr></table>
    </div>

    <!-- Body -->
    <div style="background:${BG_CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      ${personalNote?.trim() ? `<div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid ${BORDER};"><div style="font-size:13px;color:${TEXT_GRAY};line-height:1.8;white-space:pre-wrap;">${personalNote.trim()}</div></div>` : ''}
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
      <div style="border-top:1px solid ${BORDER};padding-top:16px;text-align:center;font-size:10px;color:${TEXT_MUTED};">
        Prepared by E&amp;J Retreats · Data powered by AirDNA · ejretreats.com<br>Projections are estimates and not guaranteed.
      </div>
    </div>

  </td></tr></table>
</body></html>`;
}

// ── React helpers ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return '';
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '';
  return `${Math.round(n)}%`;
}

// Section label: uppercase, small, gray — matches website style
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#6B7280] mb-3">{children}</p>;
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 7 ? 'text-[#22C55E] border-[#22C55E]/40 bg-[#0a2a15]'
              : score >= 4 ? 'text-[#FF6600] border-[#FF6600]/40 bg-[#1a0f00]'
              :               'text-red-400 border-red-500/40 bg-[#2a0a0a]';
  return (
    <div className={`border rounded-full px-3 py-1.5 flex-shrink-0 ${color}`}>
      <span className="text-xs font-bold">Opportunity Score: {score} / 10</span>
    </div>
  );
}

function GapBadge({ projected, actual }: { projected: number | null; actual: number }) {
  if (!projected) return null;
  const gap = projected - actual;
  const pct = Math.round((gap / projected) * 100);
  if (gap > 0) return (
    <div className="flex items-center gap-1.5 bg-[#2a0a0a] border border-red-900 rounded-lg px-3 py-2">
      <TrendingDown size={14} className="text-red-400" />
      <span className="text-sm font-semibold text-red-400">${Math.round(gap).toLocaleString()} below market ({pct}% gap)</span>
    </div>
  );
  if (gap < 0) return (
    <div className="flex items-center gap-1.5 bg-[#0a2a15] border border-green-900 rounded-lg px-3 py-2">
      <TrendingUp size={14} className="text-[#22C55E]" />
      <span className="text-sm font-semibold text-[#22C55E]">${Math.round(Math.abs(gap)).toLocaleString()} above market — outperforming!</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 bg-[#1a1f2e] border border-[#2a2f3e] rounded-lg px-3 py-2">
      <Minus size={14} className="text-[#6B7280]" />
      <span className="text-sm font-semibold text-[#9CA3AF]">At market rate</span>
    </div>
  );
}

function SeasonalityChart({ months }: { months: MonthData[] }) {
  const maxRevenue = Math.max(...months.map(m => m.revenue ?? 0), 1);
  const W = 560, H = 160, PAD_LEFT = 48, PAD_BOTTOM = 28, PAD_TOP = 16, PAD_RIGHT = 8;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_BOTTOM - PAD_TOP;
  const barW   = Math.floor(chartW / months.length) - 4;

  return (
    <div className="print-section">
      <SectionLabel>Seasonal Revenue Breakdown</SectionLabel>
      <div className="bg-[#151a27] border border-[#2a2f3e] rounded-xl p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y   = PAD_TOP + chartH * (1 - pct);
            const val = Math.round(maxRevenue * pct);
            return (
              <g key={pct}>
                <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={y} y2={y} stroke="#2a2f3e" strokeWidth="1" />
                <text x={PAD_LEFT - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#4B5563">
                  {val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${val}`}
                </text>
              </g>
            );
          })}
          {months.map((m, i) => {
            const x     = PAD_LEFT + i * (chartW / months.length) + 2;
            const rev   = m.revenue ?? 0;
            const barH  = Math.max(2, (rev / maxRevenue) * chartH);
            const y     = PAD_TOP + chartH - barH;
            const occ   = m.occupancy != null ? `${Math.round(m.occupancy)}%` : '';
            const isHigh = rev / maxRevenue >= 0.6;
            return (
              <g key={m.month}>
                <rect x={x} y={PAD_TOP} width={barW} height={chartH} fill="#1a0f00" rx="3" />
                <rect x={x} y={y} width={barW} height={barH} fill={isHigh ? '#FF6600' : '#8B4500'} rx="3" />
                {occ && (
                  <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="8" fill="#FF6600" fontWeight="700">
                    {occ}
                  </text>
                )}
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#6B7280">
                  {m.month.slice(0, 3)}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="text-[10px] text-[#4B5563] mt-1 text-right tracking-wide">Occupancy % above bars · Revenue per month</p>
      </div>
    </div>
  );
}

function ComparablesTable({ comps }: { comps: CompData[] }) {
  return (
    <div className="print-section">
      <SectionLabel>Comparable Properties</SectionLabel>
      <div className="bg-[#151a27] border border-[#2a2f3e] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2f3e]">
              {['Beds', 'Annual Revenue', 'Occupancy', 'ADR'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-[1.5px] text-[#6B7280]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2f3e]">
            {comps.map((c, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-[#151a27]' : 'bg-[#1a1f2e]'}>
                <td className="px-4 py-2.5 text-white font-semibold">{c.bedrooms != null ? `${c.bedrooms} BR` : ''}</td>
                <td className="px-4 py-2.5 font-bold text-[#FF6600]">{c.annualRevenue != null ? `$${Math.round(c.annualRevenue).toLocaleString()}` : ''}</td>
                <td className="px-4 py-2.5 text-[#9CA3AF]">{c.occupancyRate != null ? `${Math.round(c.occupancyRate)}%` : ''}</td>
                <td className="px-4 py-2.5 text-[#9CA3AF]">{c.adr != null ? `$${Math.round(c.adr)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[9px] text-[#4B5563] px-4 py-2 text-right tracking-wide">Source: AirDNA comparable listings</p>
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
  str:    { label: '🏠 Stick with Short-Term Rental', color: 'bg-[#151a27] text-[#60a5fa] border-[#2a2f3e]' },
  mtr:    { label: '📅 Switch to Mid-Term Rental',    color: 'bg-[#151a27] text-[#a78bfa] border-[#2a2f3e]' },
  hybrid: { label: '⚖️ Hybrid STR + MTR Strategy',    color: 'bg-[#151a27] text-[#FF6600] border-[#FF6600]/30' },
};

const DEAL_REC: Record<string, { label: string; bg: string }> = {
  'strong-buy':  { label: '🟢 Strong Buy',   bg: 'bg-emerald-700' },
  'buy':         { label: '✅ Buy',           bg: 'bg-teal-700' },
  'neutral':     { label: '🔶 Neutral',       bg: 'bg-amber-700' },
  'pass':        { label: '🔴 Pass',          bg: 'bg-orange-700' },
  'strong-pass': { label: '❌ Strong Pass',   bg: 'bg-red-800' },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportOutput({ address, data, ownerActualRevenue, onSave, onBack, saving, saved, savedReportId, onRefine, recipientEmail, recipientName, recipientPhone, onMarkContacted, leadId, ownerId }: ReportOutputProps) {
  const date   = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const isMtr  = data.reportType === 'mtr';
  const isDeal = data.reportType === 'deal';
  const [refineOpen, setRefineOpen]         = useState(false);
  const [refineMsg, setRefineMsg]           = useState('');
  const [refining, setRefining]             = useState(false);
  const [refineError, setRefineError]       = useState('');
  const [refineSuccess, setRefineSuccess]   = useState(false);
  const [emailOpen, setEmailOpen]           = useState(false);
  const [emailTo, setEmailTo]               = useState(recipientEmail ?? '');
  const [emailName, setEmailName]           = useState(recipientName ?? '');
  const [emailSubject, setEmailSubject]     = useState(`Your Revenue Analysis: ${data.reportTitle}`);
  const [personalNote, setPersonalNote]     = useState('');
  const [emailSending, setEmailSending]     = useState(false);
  const [emailSent, setEmailSent]           = useState(false);
  const [emailError, setEmailError]         = useState('');
  const [noteTemplate, setNoteTemplate]     = useState<'standard' | 'sales'>('standard');
  const [copiedMsg, setCopiedMsg]           = useState(false);
  const [copiedPhone, setCopiedPhone]       = useState(false);
  const [copiedLink, setCopiedLink]         = useState(false);
  const [shorteningLink, setShorteningLink] = useState(false);
  const [copiedPortal, setCopiedPortal]     = useState(false);

  const addressSlug   = address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const shareUrl      = savedReportId ? `${window.location.origin}/?share=${savedReportId}&address=${addressSlug}` : null;
  const portalPersonId = leadId || ownerId || null;
  const portalUrl     = portalPersonId ? `${window.location.origin}/?portal=${portalPersonId}` : null;
  const previewHtml   = buildReportEmail(address, data, ownerActualRevenue, personalNote, noteTemplate === 'sales');
  const firstName     = (emailName || recipientName || '').trim().split(' ')[0] || 'there';
  const followUpText  = `Hey ${firstName}! This is Ethan, I just ran your revenue analysis for your property at ${address} and emailed it to you at ${emailTo || recipientEmail || ''}. Please check your promotions/spam folder as they sometimes end up there.${shareUrl ? `\n\nYou can also view it online here: ${shareUrl}` : ''}\n\nIf you want, we can implement this for you and manage everything end-to-end. Book a 15-minute call here: https://calendly.com/ejretreats1/30min`;

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function shortenAndCopy() {
    if (!shareUrl) return;
    setShorteningLink(true);
    let finalUrl = shareUrl;
    try {
      const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(shareUrl)}`);
      const json = await res.json();
      if (json.shorturl) finalUrl = json.shorturl;
    } catch { /* fall back */ }
    try { await navigator.clipboard.writeText(`${address}: ${finalUrl}`); } catch { /* ignore */ }
    setShorteningLink(false);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function openEmailModal() {
    const name  = recipientName ?? '';
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
      setEmailError(err instanceof Error ? err.message : 'Failed to send. Please try again.');
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

  // ── Shared stat card ────────────────────────────────────────────────────────
  function StatCard({ label, value, sub, valueColor = 'text-white' }: { label: string; value: string; sub?: string; valueColor?: string }) {
    return (
      <div className="bg-[#151a27] border border-[#2a2f3e] rounded-xl p-4">
        <p className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#6B7280] mb-2">{label}</p>
        <p className={`text-2xl font-black ${valueColor}`}>{value}</p>
        {sub && <p className="text-[10px] text-[#4B5563] mt-1">{sub}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <style>{`
        @media print {
          @page { margin: 0.6in 0.5in; size: letter; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #111111 !important; }
          .print-section { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Email modal */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/70 print:hidden">
          {/* Left: compose */}
          <div className="w-80 flex-shrink-0 bg-[#1a1f2e] border-r border-[#2a2f3e] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2f3e]">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-[#FF6600]" />
                <h3 className="text-sm font-bold text-white">Email Report</h3>
              </div>
              <button onClick={() => setEmailOpen(false)} className="text-[#6B7280] hover:text-white">
                <X size={16} />
              </button>
            </div>

            {emailSent ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex flex-col items-center text-center pt-2 pb-1">
                  <div className="w-12 h-12 rounded-full bg-[#0a2a15] border border-green-900 flex items-center justify-center mb-2">
                    <Send size={20} className="text-[#22C55E]" />
                  </div>
                  <p className="text-sm font-bold text-white">Report Sent!</p>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">Delivered to {emailTo}</p>
                </div>
                {recipientPhone && (
                  <div>
                    <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-[1.5px] mb-1.5">Phone Number</p>
                    <div className="flex items-center gap-2 bg-[#151a27] border border-[#2a2f3e] rounded-lg px-3 py-2">
                      <Phone size={13} className="text-[#6B7280] flex-shrink-0" />
                      <span className="text-sm text-white flex-1 font-medium">{recipientPhone}</span>
                      <button onClick={() => copyText(recipientPhone, setCopiedPhone)} className="flex items-center gap-1 text-xs text-[#FF6600] font-medium flex-shrink-0">
                        {copiedPhone ? <><CheckIcon size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-[1.5px] mb-1.5">Follow-up Text</p>
                  <div className="bg-[#151a27] border border-[#2a2f3e] rounded-lg p-3 text-xs text-[#9CA3AF] leading-relaxed whitespace-pre-wrap">{followUpText}</div>
                  <button onClick={() => copyText(followUpText, setCopiedMsg)} className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs border border-[#2a2f3e] text-[#9CA3AF] hover:bg-[#151a27] py-2 rounded-lg transition-colors font-medium">
                    {copiedMsg ? <><CheckIcon size={12} /> Copied!</> : <><Copy size={12} /> Copy Text Message</>}
                  </button>
                </div>
                <button onClick={() => setEmailOpen(false)} className="w-full text-sm bg-[#FF6600] hover:bg-[#e55a00] text-white py-2.5 rounded-lg transition-colors font-semibold">Close</button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {[
                  { label: 'Recipient Name', value: emailName, onChange: setEmailName, placeholder: 'Jane Smith', type: 'text' },
                  { label: 'Email Address *', value: emailTo, onChange: setEmailTo, placeholder: 'jane@example.com', type: 'email' },
                  { label: 'Subject', value: emailSubject, onChange: setEmailSubject, placeholder: '', type: 'text' },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[#6B7280] mb-1.5">{f.label}</label>
                    <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder} type={f.type}
                      className="w-full bg-[#151a27] border border-[#2a2f3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF6600]/50" />
                  </div>
                ))}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#6B7280]">Personal Note</label>
                    <div className="flex gap-0.5 p-0.5 bg-[#151a27] border border-[#2a2f3e] rounded-lg">
                      {([['standard', 'Standard'], ['sales', '🔥 Get on a Call']] as const).map(([t, lbl]) => (
                        <button key={t} type="button"
                          onClick={() => { setNoteTemplate(t); setPersonalNote(t === 'sales' ? defaultSalesNote(firstName, address, data) : isDeal ? '' : defaultEmailNote(firstName, address)); }}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${noteTemplate === t ? 'bg-[#1a1f2e] text-white shadow-sm' : 'text-[#6B7280] hover:text-white'}`}
                        >{lbl}</button>
                      ))}
                    </div>
                  </div>
                  <textarea value={personalNote} onChange={e => { setPersonalNote(e.target.value); setNoteTemplate('standard'); }} rows={14}
                    className="w-full bg-[#151a27] border border-[#2a2f3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF6600]/50 resize-y" />
                  <p className="text-[10px] text-[#4B5563] mt-1">The full report follows automatically below your note.</p>
                </div>
                {emailError && <p className="text-xs text-red-400">{emailError}</p>}
              </div>
            )}

            {!emailSent && (
              <div className="p-5 border-t border-[#2a2f3e]">
                <button onClick={handleEmailReport} disabled={!emailTo.trim() || emailSending}
                  className="w-full flex items-center justify-center gap-2 bg-[#FF6600] hover:bg-[#e55a00] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                  {emailSending ? <><Loader size={13} className="animate-spin" /> Sending...</> : <><Send size={13} /> Send Report</>}
                </button>
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="flex-1 flex flex-col bg-[#0f0f0f]">
            <div className="px-4 py-3 bg-[#1a1f2e] border-b border-[#2a2f3e] flex items-center gap-2">
              <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-[1.5px]">Live Preview</span>
              <span className="text-xs text-[#4B5563]">— updates as you type</span>
            </div>
            <iframe srcDoc={previewHtml} sandbox="allow-same-origin" className="flex-1 w-full border-none" title="Email preview" />
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-4 print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[#FF6600] transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-2">
          {portalUrl && (
            <button onClick={() => copyText(portalUrl, setCopiedPortal)}
              className="flex items-center gap-1.5 text-sm border border-[#2a2f3e] text-[#9CA3AF] hover:bg-[#1a1f2e] px-3 py-2 rounded-lg transition-colors">
              {copiedPortal ? <><CheckIcon size={14} className="text-[#22C55E]" /> Copied!</> : <><Copy size={14} /> Copy Portal Link</>}
            </button>
          )}
          {shareUrl && (
            <button onClick={shortenAndCopy} disabled={shorteningLink}
              className="flex items-center gap-1.5 text-sm border border-[#2a2f3e] text-[#9CA3AF] hover:bg-[#1a1f2e] disabled:opacity-60 px-3 py-2 rounded-lg transition-colors">
              {copiedLink ? <><CheckIcon size={14} className="text-[#22C55E]" /> Copied!</> : shorteningLink ? <><Loader size={14} className="animate-spin" /> Shortening...</> : <><Copy size={14} /> Copy Link</>}
            </button>
          )}
          <button onClick={openEmailModal}
            className="flex items-center gap-1.5 text-sm border border-[#2a2f3e] text-[#9CA3AF] hover:bg-[#1a1f2e] px-3 py-2 rounded-lg transition-colors">
            <Mail size={14} /> {isDeal ? 'Email Analysis' : 'Email Report'}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-sm border border-[#2a2f3e] text-[#9CA3AF] hover:bg-[#1a1f2e] px-3 py-2 rounded-lg transition-colors">
            <Printer size={14} /> Download PDF
          </button>
          <button onClick={onSave} disabled={saving || saved}
            className="flex items-center gap-1.5 text-sm bg-[#FF6600] hover:bg-[#e55a00] disabled:opacity-60 text-white px-3 py-2 rounded-lg transition-colors font-semibold">
            <Save size={14} /> {saved ? 'Saved' : saving ? 'Saving...' : 'Save Report'}
          </button>
        </div>
      </div>

      {/* Report card */}
      <div className="bg-[#1a1f2e] mx-6 mb-6 rounded-2xl border border-[#2a2f3e] overflow-hidden print:overflow-visible print:border-none print:rounded-none print:mx-0 print:mb-0">

        {/* ── Header ── */}
        <div className="bg-[#151a27] border-b border-[#2a2f3e] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[2px] text-[#6B7280] mb-1">
                E&J Retreats · {isDeal ? 'Deal Analyzer' : isMtr ? 'Mid-Term Rental Analysis' : 'Revenue Analysis'}
              </p>
              <h1 className="text-xl font-black text-white leading-tight">{data.reportTitle}</h1>
              <p className="text-xs text-[#9CA3AF] mt-1">{address} · Powered by AirDNA</p>
              <p className="text-[10px] text-[#4B5563] mt-0.5">{date}</p>
            </div>
            <ScorePill score={data.opportunityScore} />
          </div>
        </div>

        {/* ── Deal recommendation banner ── */}
        {isDeal && data.recommendation && (() => {
          const rec = DEAL_REC[data.recommendation] ?? { label: data.recommendation, bg: 'bg-slate-700' };
          return (
            <div className={`${rec.bg} px-6 py-4 flex items-center justify-between border-b border-[#2a2f3e]`}>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[2px] text-white/60 mb-0.5">Investment Recommendation</p>
                <p className="text-lg font-black text-white">{rec.label}</p>
                {data.recommendationReason && <p className="text-xs text-white/80 mt-1 max-w-xl leading-relaxed">{data.recommendationReason}</p>}
              </div>
              {data.listingPrice != null && (
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-[9px] text-white/60 uppercase tracking-wider">Asking Price</p>
                  <p className="text-2xl font-black text-white">{fmt(data.listingPrice)}</p>
                  {data.grossYield != null && <p className="text-sm font-semibold text-white/80">{data.grossYield.toFixed(1)}% gross yield</p>}
                </div>
              )}
            </div>
          );
        })()}

        <div className="p-6 space-y-7">

          {/* ── STR stat cards ── */}
          {!isMtr && !isDeal && data.extracted && (
            <div className="print-section grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Projected Annual"  value={fmt(data.extracted.projectedAnnualRevenue) || '—'} sub="per AirDNA"       valueColor="text-[#FF6600]" />
              <StatCard label="Occupancy Rate"     value={fmtPct(data.extracted.occupancyRate) || '—'}      sub="market average"    valueColor="text-white" />
              <StatCard label="Avg Daily Rate"     value={fmt(data.extracted.adr) || '—'}                   sub="comp-based target" valueColor="text-white" />
              <StatCard label="RevPAR"             value={fmt(data.extracted.revpar) || '—'}                sub="submarket data"    valueColor="text-[#22C55E]" />
            </div>
          )}

          {/* ── MTR stat cards ── */}
          {isMtr && data.mtrProjected && (
            <div className="print-section grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Est. Monthly Rent"   value={fmt(data.mtrProjected.monthlyRent) || '—'}    sub="MTR projection" valueColor="text-[#FF6600]" />
              <StatCard label="Est. Annual Revenue" value={fmt(data.mtrProjected.annualRevenue) || '—'}  sub="MTR projection" valueColor="text-[#FF6600]" />
              <StatCard label="Expected Occupancy"  value={fmtPct(data.mtrProjected.occupancyRate) || '—'} sub="MTR typical"  valueColor="text-white" />
            </div>
          )}

          {/* ── Deal ROI cards ── */}
          {isDeal && (
            <div className="print-section grid grid-cols-3 gap-3">
              <StatCard label="Listing Price"            value={fmt(data.listingPrice) || '—'}           valueColor="text-[#FF6600]" />
              <StatCard label="Combined Annual Revenue"  value={fmt(data.combinedAnnualRevenue) || '—'}  sub="all units projected" valueColor="text-[#FF6600]" />
              <StatCard label="Gross Yield"              value={data.grossYield != null ? `${data.grossYield.toFixed(1)}%` : '—'} sub="annual rev ÷ price" valueColor="text-[#FF6600]" />
            </div>
          )}

          {/* ── Deal per-unit breakdown ── */}
          {isDeal && data.units && data.units.length > 0 && (
            <div className="print-section">
              <SectionLabel>Per-Unit Breakdown</SectionLabel>
              <div className="bg-[#151a27] border border-[#2a2f3e] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2f3e]">
                      {['Unit', 'Beds / Baths', 'Proj. Annual Rev', 'Occupancy', 'ADR'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-[1px] text-[#6B7280]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2f3e]">
                    {data.units.map((u, i) => {
                      const qty = u.quantity ?? 1;
                      return (
                        <tr key={i} className={i % 2 === 0 ? 'bg-[#151a27]' : 'bg-[#1a1f2e]'}>
                          <td className="px-4 py-2.5 font-semibold text-white">
                            {u.unitLabel}{qty > 1 && <span className="ml-1.5 text-xs font-bold text-[#FF6600]">×{qty}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-[#9CA3AF]">
                            {[u.bedrooms != null ? `${u.bedrooms}bd` : null, u.bathrooms != null ? `${u.bathrooms}ba` : null].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-[#FF6600]">
                            {fmt(u.projectedAnnualRevenue)}
                            {qty > 1 && u.projectedAnnualRevenue != null && (
                              <div className="text-xs text-[#FF6600]/70">×{qty} = {fmt(u.projectedAnnualRevenue * qty)}</div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[#9CA3AF]">{fmtPct(u.occupancyRate)}</td>
                          <td className="px-4 py-2.5 text-[#9CA3AF]">{u.adr != null ? `$${Math.round(u.adr)}` : ''}</td>
                        </tr>
                      );
                    })}
                    {data.units.length > 1 && (
                      <tr className="bg-[#1a0f00] border-t-2 border-[#FF6600]/30">
                        <td className="px-4 py-2.5 font-bold text-[#FF6600]">Combined Total</td>
                        <td />
                        <td className="px-4 py-2.5 font-bold text-[#FF6600]">{fmt(data.combinedAnnualRevenue)}</td>
                        <td className="px-4 py-2.5 text-[#9CA3AF]">{fmtPct(data.combinedOccupancyRate)}</td>
                        <td />
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
                <div className="bg-[#0a2a15] border border-green-900 rounded-xl p-4">
                  <SectionLabel>Property Highlights</SectionLabel>
                  <ul className="space-y-2">
                    {data.propertyHighlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#9CA3AF]">
                        <span className="text-[#22C55E] flex-shrink-0 font-bold mt-0.5">✓</span>{h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.concerns && data.concerns.length > 0 && (
                <div className="bg-[#2a0f00] border border-orange-900 rounded-xl p-4">
                  <SectionLabel>Concerns / Risks</SectionLabel>
                  <ul className="space-y-2">
                    {data.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#9CA3AF]">
                        <span className="text-[#FF6600] flex-shrink-0 font-bold mt-0.5">!</span>{c}
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
              <div className="bg-[#151a27] border border-[#2a2f3e] rounded-xl p-4">
                <SectionLabel>Lease & Tenant</SectionLabel>
                <p className="text-sm font-semibold text-white">{data.mtrProjected.recommendedLeaseLength} stays</p>
                <p className="text-xs text-[#9CA3AF] mt-1">{data.mtrProjected.targetTenantProfile}</p>
              </div>
              {data.recommendedPlatforms && data.recommendedPlatforms.length > 0 && (
                <div className="bg-[#151a27] border border-[#2a2f3e] rounded-xl p-4">
                  <SectionLabel>Recommended Platforms</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {data.recommendedPlatforms.map(p => (
                      <span key={p} className="text-xs bg-[#1a1f2e] border border-[#2a2f3e] text-[#FF6600] px-2 py-0.5 rounded-full font-medium">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STR vs MTR ── */}
          {isMtr && data.strVsMtr && (
            <div className="print-section bg-[#151a27] border border-[#2a2f3e] rounded-xl p-5 space-y-4">
              <SectionLabel>STR vs. MTR Comparison</SectionLabel>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1a1f2e] border border-[#2a2f3e] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-1">STR Annual (AirDNA)</p>
                  <p className="text-2xl font-black text-[#60a5fa]">{fmt(data.strVsMtr.strAnnualEstimate)}</p>
                </div>
                <div className="bg-[#1a1f2e] border border-[#2a2f3e] rounded-xl p-3 text-center">
                  <p className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-1">MTR Annual (projected)</p>
                  <p className="text-2xl font-black text-[#FF6600]">{fmt(data.strVsMtr.mtrAnnualEstimate)}</p>
                </div>
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${RECOMMENDATION_LABELS[data.strVsMtr.recommendation].color}`}>
                {RECOMMENDATION_LABELS[data.strVsMtr.recommendation].label}
              </div>
              <p className="text-sm text-[#9CA3AF] leading-relaxed">{data.strVsMtr.reasoning}</p>
            </div>
          )}

          {/* ── Owner vs Market (STR) ── */}
          {!isMtr && ownerActualRevenue != null && data.extracted && (
            <div className="print-section bg-[#151a27] border border-[#2a2f3e] rounded-xl p-5 space-y-3">
              <SectionLabel>Owner vs. Market</SectionLabel>
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-1">Owner Reported</p>
                  <p className="text-2xl font-black text-white">{fmt(ownerActualRevenue)}</p>
                  <p className="text-[10px] text-[#4B5563]">last 12 months</p>
                </div>
                <div className="text-[#4B5563] text-2xl font-light">vs</div>
                <div>
                  <p className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-1">AirDNA Projected</p>
                  <p className="text-2xl font-black text-[#FF6600]">{fmt(data.extracted.projectedAnnualRevenue)}</p>
                  <p className="text-[10px] text-[#4B5563]">market potential</p>
                </div>
              </div>
              <GapBadge projected={data.extracted.projectedAnnualRevenue} actual={ownerActualRevenue} />
            </div>
          )}

          {/* ── Owner vs MTR ── */}
          {isMtr && ownerActualRevenue != null && data.mtrProjected && (
            <div className="print-section bg-[#151a27] border border-[#2a2f3e] rounded-xl p-5 space-y-3">
              <SectionLabel>Owner vs. MTR Projection</SectionLabel>
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-1">Owner Reported (STR)</p>
                  <p className="text-2xl font-black text-white">{fmt(ownerActualRevenue)}</p>
                  <p className="text-[10px] text-[#4B5563]">last 12 months</p>
                </div>
                <div className="text-[#4B5563] text-2xl font-light">vs</div>
                <div>
                  <p className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-1">MTR Projected</p>
                  <p className="text-2xl font-black text-[#FF6600]">{fmt(data.mtrProjected.annualRevenue)}</p>
                  <p className="text-[10px] text-[#4B5563]">annual MTR potential</p>
                </div>
              </div>
              <GapBadge projected={data.mtrProjected.annualRevenue} actual={ownerActualRevenue} />
            </div>
          )}

          {/* ── Score + Executive Summary ── */}
          <div className="print-section grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1 bg-[#151a27] border border-[#2a2f3e] rounded-xl p-4 text-center">
              {(() => {
                const c = data.opportunityScore >= 7 ? 'text-[#22C55E]' : data.opportunityScore >= 4 ? 'text-[#FF6600]' : 'text-red-400';
                const bar = data.opportunityScore >= 7 ? 'bg-[#22C55E]' : data.opportunityScore >= 4 ? 'bg-[#FF6600]' : 'bg-red-500';
                return <>
                  <p className="text-[9px] font-bold uppercase tracking-[2px] text-[#6B7280] mb-2">Opportunity Score</p>
                  <p className={`text-5xl font-black ${c}`}>{data.opportunityScore}<span className="text-lg font-semibold text-[#4B5563]">/10</span></p>
                  <div className="mt-3 h-1.5 bg-[#2a2f3e] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${(data.opportunityScore / 10) * 100}%` }} />
                  </div>
                </>;
              })()}
            </div>
            <div className="sm:col-span-2 bg-[#151a27] border border-[#2a2f3e] rounded-xl p-5">
              <SectionLabel>Executive Summary</SectionLabel>
              <p className="text-sm text-[#9CA3AF] leading-relaxed">{data.executiveSummary}</p>
            </div>
          </div>

          {/* ── Key Findings ── */}
          {data.keyFindings.length > 0 && (
            <div className="print-section">
              <SectionLabel>{data.keyFindings.length} Key Findings</SectionLabel>
              <ul className="space-y-2">
                {data.keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 bg-[#151a27] border border-[#2a2f3e] rounded-xl px-4 py-3">
                    <span className="text-[#FF6600] font-black text-sm flex-shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-sm text-[#9CA3AF] leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Seasonality ── */}
          {data.monthlySeasonality && data.monthlySeasonality.length > 0 && (
            <SeasonalityChart months={data.monthlySeasonality} />
          )}

          {/* ── Comparables ── */}
          {data.comparables && data.comparables.length > 0 && (
            <ComparablesTable comps={data.comparables} />
          )}

          {/* ── Market Opportunity ── */}
          {data.marketOpportunity && (
            <div>
              <SectionLabel>Market Opportunity</SectionLabel>
              <p className="text-sm text-[#9CA3AF] leading-relaxed">{data.marketOpportunity}</p>
            </div>
          )}

          {/* ── Performance Gap ── */}
          {data.performanceGap && (
            <div>
              <SectionLabel>Performance Gap Analysis</SectionLabel>
              <p className="text-sm text-[#9CA3AF] leading-relaxed">{data.performanceGap}</p>
            </div>
          )}

          {/* ── Recommendations ── */}
          {data.recommendations.length > 0 && (
            <div className="print-section">
              <SectionLabel>Recommendations</SectionLabel>
              <ol className="space-y-2">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 bg-[#151a27] border border-[#2a2f3e] rounded-xl px-4 py-3">
                    <span className="text-[#FF6600] font-black text-sm flex-shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{r.title}</p>
                      <p className="text-sm text-[#9CA3AF] mt-0.5 leading-relaxed">{r.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ── Revenue Projections (horizontal bars) ── */}
          {!isMtr && data.revenueProjections && (() => {
            const { conservative, realistic, optimistic } = data.revenueProjections;
            const maxVal = Math.max(conservative, realistic, optimistic);
            const rows = [
              { label: 'Conservative', value: conservative, barColor: '#8B4500', textColor: 'text-[#9CA3AF]' },
              { label: 'Realistic',    value: realistic,    barColor: '#FF6600', textColor: 'text-[#FF6600]' },
              { label: 'Optimistic',   value: optimistic,   barColor: '#FF6600', textColor: 'text-[#9CA3AF]' },
            ];
            return (
              <div className="print-section">
                <SectionLabel>Revenue Scenarios — with E&amp;J Retreats Management</SectionLabel>
                <div className="bg-[#151a27] border border-[#2a2f3e] rounded-xl p-5 space-y-4">
                  {rows.map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="text-sm text-[#9CA3AF] w-24 flex-shrink-0">{row.label}</span>
                      <div className="flex-1 bg-[#2a2f3e] rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${Math.round((row.value / maxVal) * 100)}%`, background: row.barColor }} />
                      </div>
                      <span className={`text-sm font-bold w-24 text-right flex-shrink-0 ${row.textColor}`}>{fmt(row.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Refine with AI ── */}
          {onRefine && (
            <div className="print:hidden border border-[#2a2f3e] rounded-xl overflow-hidden">
              <button type="button" onClick={() => { setRefineOpen(o => !o); setRefineError(''); setRefineSuccess(false); }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#151a27] hover:bg-[#1a1f2e] transition-colors">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#a78bfa]" />
                  <span className="text-sm font-semibold text-[#a78bfa]">Refine with AI</span>
                  <span className="text-xs text-[#6B7280]">Tell the AI what to change or add</span>
                </div>
                {refineOpen ? <ChevronUp size={14} className="text-[#6B7280]" /> : <ChevronDown size={14} className="text-[#6B7280]" />}
              </button>
              {refineOpen && (
                <div className="p-4 space-y-3 bg-[#1a1f2e] border-t border-[#2a2f3e]">
                  <textarea value={refineMsg} onChange={e => setRefineMsg(e.target.value)} rows={3}
                    placeholder="e.g. The property has a heated pool and game room — update the analysis to reflect this."
                    className="w-full bg-[#151a27] border border-[#2a2f3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#a78bfa]/50 resize-none" />
                  {refineError   && <p className="text-xs text-red-400">{refineError}</p>}
                  {refineSuccess && <p className="text-xs text-[#22C55E] font-medium">Report updated successfully.</p>}
                  <button type="button" onClick={handleRefine} disabled={!refineMsg.trim() || refining}
                    className="flex items-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                    {refining ? <><Loader size={13} className="animate-spin" /> Refining...</> : <><Sparkles size={13} /> Update Report</>}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-[#2a2f3e] pt-4 text-[10px] text-[#4B5563] text-center tracking-wide">
            Prepared by E&J Retreats · Data powered by AirDNA · ejretreats.com<br />
            <span className="text-[#2a2f3e]">Projections are estimates and not guaranteed.</span>
          </div>

        </div>
      </div>
    </div>
  );
}

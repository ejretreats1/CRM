import { useState, useMemo, useEffect } from 'react';
import { Download, Calendar, Percent, Save, CheckCircle } from 'lucide-react';
import type { Owner } from '../types';
import type { UplistingReservation } from '../services/uplisting';
import { uploadOwnerDocument } from '../services/ownerDocuments';

interface OwnerRevenueReportProps {
  owner: Owner;
  reservations: UplistingReservation[];
  onDocumentSaved?: () => void;
}

type CommissionBasis = 'accommodation' | 'payout';

interface CommissionSettings {
  rate: number;
  basis: CommissionBasis;
  excludeCleaning: boolean;
  includeUpsells: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  airbnb: 'Airbnb', airbnb_official: 'Airbnb',
  booking_dot_com: 'Booking.com',
  homeaway: 'VRBO', vrbo: 'VRBO',
  uplisting: 'Direct', direct: 'Direct',
};

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function defaultRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  return { from, to };
}

function commissionKey(ownerId: string) {
  return `ej_commission_${ownerId}`;
}

function calcCommission(r: UplistingReservation, s: CommissionSettings, upsells: number): number {
  if (s.rate === 0) return 0;
  let base = s.basis === 'accommodation'
    ? (r.accommodation_total ?? r.total_price)
    : r.total_price;
  if (s.excludeCleaning) base = Math.max(0, base - (r.cleaning_fee ?? 0));
  if (s.includeUpsells) base += upsells;
  return base * (s.rate / 100);
}

function commissionBasisLabel(s: CommissionSettings): string {
  const base = s.basis === 'accommodation' ? 'Accommodation' : 'Total Payout';
  const parts = [base];
  if (s.excludeCleaning) parts.push('− Cleaning');
  if (s.includeUpsells) parts.push('+ Upsells');
  return parts.join(' ');
}

export default function OwnerRevenueReport({ owner, reservations, onDocumentSaved }: OwnerRevenueReportProps) {
  const { from: defaultFrom, to: defaultTo } = defaultRange();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const [commission, setCommission] = useState<CommissionSettings>({ rate: 0, basis: 'payout', excludeCleaning: false, includeUpsells: false });
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Load saved commission settings for this owner
  useEffect(() => {
    try {
      const saved = localStorage.getItem(commissionKey(owner.id));
      if (saved) setCommission(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [owner.id]);

  function updateCommission(next: CommissionSettings) {
    setCommission(next);
    localStorage.setItem(commissionKey(owner.id), JSON.stringify(next));
  }

  // Build map: uplistingId -> property address
  const propertyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of owner.properties) {
      const parts = p.id.split('_');
      const uplistingId = parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
      if (uplistingId) map.set(uplistingId, p.address || p.id);
    }
    return map;
  }, [owner.properties]);

  const ownerListingIds = useMemo(() => new Set(propertyMap.keys()), [propertyMap]);

  const { filtered, cancelled } = useMemo(() => {
    if (ownerListingIds.size === 0) return { filtered: [], cancelled: [] };
    const inRange = (r: UplistingReservation) => {
      const checkIn = r.check_in.slice(0, 10);
      return ownerListingIds.has(r.listing_id) && checkIn >= from && checkIn <= to;
    };
    return {
      filtered: reservations.filter(r => r.status !== 'cancelled' && inRange(r)),
      cancelled: reservations.filter(r => r.status === 'cancelled' && inRange(r)),
    };
  }, [reservations, ownerListingIds, from, to]);

  const upsellTotal = (r: UplistingReservation) =>
    r.upsells?.reduce((s, u) => s + u.price, 0) ?? 0;

  const totals = useMemo(() => ({
    payout: filtered.reduce((s, r) => s + r.total_price, 0),
    accommodation: filtered.reduce((s, r) => s + (r.accommodation_total ?? 0), 0),
    cleaning: filtered.reduce((s, r) => s + (r.cleaning_fee ?? 0), 0),
    upsells: filtered.reduce((s, r) => s + upsellTotal(r), 0),
    nights: filtered.reduce((s, r) => s + (r.nights ?? 0), 0),
    commission: filtered.reduce((s, r) => s + calcCommission(r, commission, upsellTotal(r)), 0),
  }), [filtered, commission]);

  const showCommission = commission.rate > 0;
  const basisLabel = commissionBasisLabel(commission);
  const showUpsells = filtered.some(r => (r.upsells?.length ?? 0) > 0);

  function reportFileName() {
    return `${owner.name.replace(/\s+/g, '-')}-Revenue-${from}-to-${to}.csv`;
  }

  function buildCSVBlob(): Blob {
    const headers = ['Status', 'Property', 'Guest', 'Check-In', 'Check-Out', 'Nights', 'Channel', 'Accommodation', 'Cleaning Fee'];
    if (showUpsells) headers.push('Upsells');
    headers.push('Total Payout');
    if (showCommission) headers.push(`Commission (${commission.rate}% of ${basisLabel})`);

    const makeRow = (r: UplistingReservation, status: string) => {
      const row = [
        status,
        propertyMap.get(r.listing_id) ?? r.listing_id,
        r.guest_name,
        r.check_in,
        r.check_out,
        r.nights ?? '',
        CHANNEL_LABEL[r.channel ?? ''] ?? r.channel ?? '',
        r.accommodation_total != null ? r.accommodation_total.toFixed(2) : '',
        r.cleaning_fee != null ? r.cleaning_fee.toFixed(2) : '',
      ];
      if (showUpsells) {
        const u = upsellTotal(r);
        row.push(u > 0 ? u.toFixed(2) : '');
      }
      row.push(r.total_price.toFixed(2));
      if (showCommission) row.push(status === 'Cancelled' ? '' : calcCommission(r, commission, upsellTotal(r)).toFixed(2));
      return row;
    };

    const totalsRow: (string | number)[] = [
      'TOTALS', '', '', '', '',
      totals.nights, '',
      totals.accommodation.toFixed(2),
      totals.cleaning.toFixed(2),
    ];
    if (showUpsells) totalsRow.push(totals.upsells.toFixed(2));
    totalsRow.push(totals.payout.toFixed(2));
    if (showCommission) totalsRow.push(totals.commission.toFixed(2));

    const rows = [
      ...filtered.map(r => makeRow(r, 'Completed')),
      ...(cancelled.length > 0 ? [['--- CANCELLATIONS ---', ...Array(headers.length - 1).fill('')]] : []),
      ...cancelled.map(r => makeRow(r, 'Cancelled')),
      totalsRow,
    ];

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    return new Blob([csv], { type: 'text/csv' });
  }

  function downloadCSV() {
    const blob = buildCSVBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportFileName();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveToDocuments() {
    setSaving(true);
    try {
      const blob = buildCSVBlob();
      const fileName = reportFileName();
      const file = new File([blob], fileName, { type: 'text/csv' });
      await uploadOwnerDocument(owner.id, file);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
      onDocumentSaved?.();
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const hasUplisting = ownerListingIds.size > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900">Revenue Report</h2>
        {(filtered.length > 0 || cancelled.length > 0) && (
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              className="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download size={13} /> Download CSV
            </button>
            <button
              onClick={saveToDocuments}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {savedOk
                ? <><CheckCircle size={13} className="text-green-600" /> Saved!</>
                : saving
                  ? <><Save size={13} className="animate-pulse" /> Saving…</>
                  : <><Save size={13} /> Save to Documents</>}
            </button>
          </div>
        )}
      </div>

      {!hasUplisting ? (
        <p className="text-sm text-slate-400 py-4">Import properties from Uplisting to see reservation data here.</p>
      ) : (
        <>
          {/* Controls row */}
          <div className="flex flex-wrap gap-4 mb-5">
            {/* Date range — filters by check-in date */}
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-400">Check-in</span>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Commission */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Percent size={14} className="text-slate-400 flex-shrink-0" />
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={commission.rate || ''}
                    onChange={e => updateCommission({ ...commission, rate: parseFloat(e.target.value) || 0 })}
                    className="w-20 text-sm border border-slate-200 rounded-lg px-3 py-1.5 pr-6 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                </div>
                <span className="text-slate-500 text-sm">of</span>
                <select
                  value={commission.basis}
                  onChange={e => updateCommission({ ...commission, basis: e.target.value as CommissionBasis })}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="payout">Total Payout</option>
                  <option value="accommodation">Accommodation</option>
                </select>
              </div>
              <div className="flex items-center gap-4 pl-5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={commission.excludeCleaning}
                    onChange={e => updateCommission({ ...commission, excludeCleaning: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Minus cleaning fee
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={commission.includeUpsells}
                    onChange={e => updateCommission({ ...commission, includeUpsells: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Include upsells
                </label>
              </div>
            </div>
          </div>

          {/* Commission summary badge */}
          {showCommission && filtered.length > 0 && (
            <div className="mb-4 inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
              <span className="text-indigo-600 font-medium">Commission ({commission.rate}% of {basisLabel}):</span>
              <span className="text-indigo-800 font-bold">{fmt(totals.commission)}</span>
            </div>
          )}

          {filtered.length === 0 && cancelled.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No reservations found for this date range.</p>
          ) : (
            <div className="space-y-5">
              {/* Completed reservations */}
              {filtered.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Property</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Guest</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Check-In</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Check-Out</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nts</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Channel</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Accom.</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cleaning</th>
                        {showUpsells && (
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-amber-600 uppercase tracking-wide">Upsells</th>
                        )}
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payout</th>
                        {showCommission && (
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-indigo-500 uppercase tracking-wide">Commission</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filtered.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 text-slate-700 max-w-[120px] truncate">{propertyMap.get(r.listing_id) ?? r.listing_id}</td>
                          <td className="px-3 py-2.5 text-slate-600 max-w-[100px] truncate">{r.guest_name}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.check_in)}</td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.check_out)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{r.nights || ''}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{CHANNEL_LABEL[r.channel ?? ''] ?? r.channel ?? ''}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{r.accommodation_total != null ? fmt(r.accommodation_total) : ''}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{r.cleaning_fee != null ? fmt(r.cleaning_fee) : ''}</td>
                          {showUpsells && (() => {
                            const u = upsellTotal(r);
                            const tooltip = r.upsells?.map(x => `${x.name}: $${x.price.toFixed(2)}`).join('\n');
                            return (
                              <td className="px-3 py-2.5 text-right text-amber-700" title={tooltip}>
                                {u > 0 ? fmt(u) : ''}
                              </td>
                            );
                          })()}
                          <td className="px-3 py-2.5 text-right font-semibold text-teal-700">{fmt(r.total_price)}</td>
                          {showCommission && (
                            <td className="px-3 py-2.5 text-right font-semibold text-indigo-600">
                              {fmt(calcCommission(r, commission, upsellTotal(r)))}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-200 font-semibold">
                        <td className="px-3 py-2.5 text-slate-700" colSpan={4}>Totals ({filtered.length} reservations)</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{totals.nights}</td>
                        <td />
                        <td className="px-3 py-2.5 text-right text-slate-700">{totals.accommodation > 0 ? fmt(totals.accommodation) : ''}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{totals.cleaning > 0 ? fmt(totals.cleaning) : ''}</td>
                        {showUpsells && (
                          <td className="px-3 py-2.5 text-right text-amber-700">{totals.upsells > 0 ? fmt(totals.upsells) : ''}</td>
                        )}
                        <td className="px-3 py-2.5 text-right text-teal-700">{fmt(totals.payout)}</td>
                        {showCommission && (
                          <td className="px-3 py-2.5 text-right text-indigo-700">{fmt(totals.commission)}</td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Cancelled reservations */}
              {cancelled.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rose-500 uppercase tracking-wide mb-2">Cancelled Reservations</p>
                  <div className="overflow-x-auto rounded-xl border border-rose-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-rose-50 border-b border-rose-200">
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Property</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Guest</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Check-In</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Check-Out</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Nts</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Channel</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Accom.</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Cleaning</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-rose-400 uppercase tracking-wide">Payout</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {cancelled.map(r => (
                          <tr key={r.id} className="bg-white hover:bg-rose-50">
                            <td className="px-3 py-2.5 text-slate-500 max-w-[120px] truncate">{propertyMap.get(r.listing_id) ?? r.listing_id}</td>
                            <td className="px-3 py-2.5 text-slate-400 max-w-[100px] truncate line-through">{r.guest_name}</td>
                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(r.check_in)}</td>
                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(r.check_out)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-400">{r.nights || ''}</td>
                            <td className="px-3 py-2.5 text-slate-400 text-xs">{CHANNEL_LABEL[r.channel ?? ''] ?? r.channel ?? ''}</td>
                            <td className="px-3 py-2.5 text-right text-slate-400">{r.accommodation_total != null ? fmt(r.accommodation_total) : fmt(0)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-400">{r.cleaning_fee != null ? fmt(r.cleaning_fee) : fmt(0)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-rose-500">{fmt(r.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-rose-50 border-t-2 border-rose-200 font-semibold">
                          <td className="px-3 py-2.5 text-rose-600" colSpan={8}>Total Payout from Cancellations ({cancelled.length})</td>
                          <td className="px-3 py-2.5 text-right text-rose-600">
                            {fmt(cancelled.reduce((s, r) => s + r.total_price, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

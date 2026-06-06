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
  commissionExtras: boolean; // add per-reservation commissionable extras to base
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

function commissionKey(ownerId: string) { return `ej_commission_${ownerId}`; }
function commExtrasKey(ownerId: string) { return `ej_comm_extras_${ownerId}`; }

function calcCommission(r: UplistingReservation, s: CommissionSettings, commExtra: number): number {
  if (s.rate === 0) return 0;
  let base = s.basis === 'accommodation'
    ? (r.accommodation_total ?? r.total_price)
    : r.total_price;
  if (s.excludeCleaning) base = Math.max(0, base - (r.cleaning_fee ?? 0));
  if (s.commissionExtras) base += commExtra;
  return base * (s.rate / 100);
}

function commissionBasisLabel(s: CommissionSettings): string {
  const base = s.basis === 'accommodation' ? 'Accommodation' : 'Total Payout';
  const parts = [base];
  if (s.excludeCleaning) parts.push('− Cleaning');
  if (s.commissionExtras) parts.push('+ Pet/Extras');
  return parts.join(' ');
}

export default function OwnerRevenueReport({ owner, reservations, onDocumentSaved }: OwnerRevenueReportProps) {
  const { from: defaultFrom, to: defaultTo } = defaultRange();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const [commission, setCommission] = useState<CommissionSettings>({ rate: 0, basis: 'payout', excludeCleaning: false, commissionExtras: false });
  const [commExtras, setCommExtras] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Load saved commission settings and per-reservation commissionable extras
  useEffect(() => {
    try {
      const saved = localStorage.getItem(commissionKey(owner.id));
      if (saved) setCommission(JSON.parse(saved));
    } catch { /* ignore */ }
    try {
      const extras = localStorage.getItem(commExtrasKey(owner.id));
      if (extras) setCommExtras(JSON.parse(extras));
    } catch { /* ignore */ }
  }, [owner.id]);

  function updateCommission(next: CommissionSettings) {
    setCommission(next);
    localStorage.setItem(commissionKey(owner.id), JSON.stringify(next));
  }

  function updateCommExtra(reservationId: string, value: number) {
    const next = { ...commExtras, [reservationId]: value };
    setCommExtras(next);
    localStorage.setItem(commExtrasKey(owner.id), JSON.stringify(next));
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

  const getCommExtra = (r: UplistingReservation) => commExtras[r.id] ?? 0;

  const totals = useMemo(() => ({
    payout: filtered.reduce((s, r) => s + r.total_price, 0),
    accommodation: filtered.reduce((s, r) => s + (r.accommodation_total ?? 0), 0),
    cleaning: filtered.reduce((s, r) => s + (r.cleaning_fee ?? 0), 0),
    upsells: filtered.reduce((s, r) => s + upsellTotal(r), 0),
    nights: filtered.reduce((s, r) => s + (r.nights ?? 0), 0),
    commission: filtered.reduce((s, r) => s + calcCommission(r, commission, getCommExtra(r)), 0),
  }), [filtered, commission, commExtras]);

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
        const ce = getCommExtra(r);
        row.push(u > 0 ? `${u.toFixed(2)}${ce > 0 ? ` (comm: ${ce.toFixed(2)})` : ''}` : '');
      }
      row.push(r.total_price.toFixed(2));
      if (showCommission) row.push(status === 'Cancelled' ? '' : calcCommission(r, commission, getCommExtra(r)).toFixed(2));
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
        <h2 className="text-base font-semibold text-white">Revenue Report</h2>
        {(filtered.length > 0 || cancelled.length > 0) && (
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              className="flex items-center gap-1.5 text-xs font-medium text-[#4a90d9] border border-[#1e3a5a] bg-[#162035] hover:bg-[#162035] px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download size={13} /> Download CSV
            </button>
            <button
              onClick={saveToDocuments}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium text-[#d07af5] border border-[#2a1a5a] bg-[#1a1a35] hover:bg-[#1a1a35] disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {savedOk
                ? <><CheckCircle size={13} className="text-[#5ce0a0]" /> Saved!</>
                : saving
                  ? <><Save size={13} className="animate-pulse" /> Saving…</>
                  : <><Save size={13} /> Save to Documents</>}
            </button>
          </div>
        )}
      </div>

      {!hasUplisting ? (
        <p className="text-sm text-[#3a5070] py-4">Import properties from Uplisting to see reservation data here.</p>
      ) : (
        <>
          {/* Controls row */}
          <div className="flex flex-wrap gap-4 mb-5">
            {/* Date range — filters by check-in date */}
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar size={14} className="text-[#3a5070] flex-shrink-0" />
              <span className="text-xs text-[#3a5070]">Check-in</span>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="text-sm border border-[#1e2d45] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
              <span className="text-[#3a5070] text-sm">to</span>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="text-sm border border-[#1e2d45] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>

            {/* Commission */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Percent size={14} className="text-[#3a5070] flex-shrink-0" />
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={commission.rate || ''}
                    onChange={e => updateCommission({ ...commission, rate: parseFloat(e.target.value) || 0 })}
                    className="w-20 text-sm border border-[#1e2d45] rounded-lg px-3 py-1.5 pr-6 focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3a5070] text-xs">%</span>
                </div>
                <span className="text-[#b8d4f0] text-sm">of</span>
                <select
                  value={commission.basis}
                  onChange={e => updateCommission({ ...commission, basis: e.target.value as CommissionBasis })}
                  className="text-sm border border-[#1e2d45] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] bg-[#1a2335]"
                >
                  <option value="payout">Total Payout</option>
                  <option value="accommodation">Accommodation</option>
                </select>
              </div>
              <div className="flex items-center gap-4 pl-5">
                <label className="flex items-center gap-1.5 text-xs text-[#b8d4f0] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={commission.excludeCleaning}
                    onChange={e => updateCommission({ ...commission, excludeCleaning: e.target.checked })}
                    className="rounded border-[#1e2d45] text-[#d07af5] focus:ring-indigo-500"
                  />
                  Minus cleaning fee
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[#b8d4f0] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={commission.commissionExtras}
                    onChange={e => updateCommission({ ...commission, commissionExtras: e.target.checked })}
                    className="rounded border-[#1e2d45] text-[#d07af5] focus:ring-indigo-500"
                  />
                  + Pet/extras per row
                </label>
              </div>
            </div>
          </div>

          {/* Commission summary badge */}
          {showCommission && filtered.length > 0 && (
            <div className="mb-4 inline-flex items-center gap-2 bg-[#1a1a35] border border-[#2a1a5a] rounded-lg px-3 py-2 text-sm">
              <span className="text-[#d07af5] font-medium">Commission ({commission.rate}% of {basisLabel}):</span>
              <span className="text-indigo-800 font-bold">{fmt(totals.commission)}</span>
            </div>
          )}

          {filtered.length === 0 && cancelled.length === 0 ? (
            <p className="text-sm text-[#3a5070] py-4">No reservations found for this date range.</p>
          ) : (
            <div className="space-y-5">
              {/* Completed reservations */}
              {filtered.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[#1e2d45]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1e2d45] border-b border-[#1e2d45]">
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Property</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Guest</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Check-In</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Check-Out</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Nts</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Channel</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Accom.</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Cleaning</th>
                        {showUpsells && (
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#d0954a] uppercase tracking-wide">Upsells</th>
                        )}
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Payout</th>
                        {showCommission && (
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-indigo-500 uppercase tracking-wide">Commission</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2d45]">
                      {filtered.map(r => (
                        <tr key={r.id} className="hover:bg-[#1e2d45]">
                          <td className="px-3 py-2.5 text-[#b8d4f0] max-w-[120px] truncate">{propertyMap.get(r.listing_id) ?? r.listing_id}</td>
                          <td className="px-3 py-2.5 text-[#b8d4f0] max-w-[100px] truncate">{r.guest_name}</td>
                          <td className="px-3 py-2.5 text-[#b8d4f0] whitespace-nowrap">{fmtDate(r.check_in)}</td>
                          <td className="px-3 py-2.5 text-[#b8d4f0] whitespace-nowrap">{fmtDate(r.check_out)}</td>
                          <td className="px-3 py-2.5 text-right text-[#b8d4f0]">{r.nights || ''}</td>
                          <td className="px-3 py-2.5 text-[#b8d4f0] text-xs">{CHANNEL_LABEL[r.channel ?? ''] ?? r.channel ?? ''}</td>
                          <td className="px-3 py-2.5 text-right text-[#b8d4f0]">{r.accommodation_total != null ? fmt(r.accommodation_total) : ''}</td>
                          <td className="px-3 py-2.5 text-right text-[#b8d4f0]">{r.cleaning_fee != null ? fmt(r.cleaning_fee) : ''}</td>
                          {showUpsells && (() => {
                            const u = upsellTotal(r);
                            const ce = getCommExtra(r);
                            return (
                              <td className="px-3 py-2.5 text-right text-[#d0954a]">
                                {u > 0 ? <div className="font-medium">{fmt(u)}</div> : null}
                                {showCommission && commission.commissionExtras && (
                                  <div className="flex items-center justify-end gap-1 mt-1">
                                    <span className="text-indigo-400 text-xs">comm:</span>
                                    <div className="relative">
                                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[#3a5070] text-xs">$</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={ce || ''}
                                        placeholder="0"
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => updateCommExtra(r.id, parseFloat(e.target.value) || 0)}
                                        className="w-16 text-xs text-right pl-4 pr-1 py-0.5 border border-[#2a1a5a] rounded bg-[#1a1a35] focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                      />
                                    </div>
                                  </div>
                                )}
                              </td>
                            );
                          })()}
                          <td className="px-3 py-2.5 text-right font-semibold text-[#4a90d9]">{fmt(r.total_price)}</td>
                          {showCommission && (
                            <td className="px-3 py-2.5 text-right font-semibold text-[#d07af5]">
                              {fmt(calcCommission(r, commission, getCommExtra(r)))}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#1e2d45] border-t-2 border-[#1e2d45] font-semibold">
                        <td className="px-3 py-2.5 text-[#b8d4f0]" colSpan={4}>Totals ({filtered.length} reservations)</td>
                        <td className="px-3 py-2.5 text-right text-[#b8d4f0]">{totals.nights}</td>
                        <td />
                        <td className="px-3 py-2.5 text-right text-[#b8d4f0]">{totals.accommodation > 0 ? fmt(totals.accommodation) : ''}</td>
                        <td className="px-3 py-2.5 text-right text-[#b8d4f0]">{totals.cleaning > 0 ? fmt(totals.cleaning) : ''}</td>
                        {showUpsells && (
                          <td className="px-3 py-2.5 text-right text-[#d0954a]">{totals.upsells > 0 ? fmt(totals.upsells) : ''}</td>
                        )}
                        <td className="px-3 py-2.5 text-right text-[#4a90d9]">{fmt(totals.payout)}</td>
                        {showCommission && (
                          <td className="px-3 py-2.5 text-right text-[#d07af5]">{fmt(totals.commission)}</td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Cancelled reservations */}
              {cancelled.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#e05c5c] uppercase tracking-wide mb-2">Cancelled Reservations</p>
                  <div className="overflow-x-auto rounded-xl border border-rose-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#2a0e0e] border-b border-rose-200">
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Property</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Guest</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Check-In</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Check-Out</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Nts</th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Channel</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Accom.</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Cleaning</th>
                          <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#e05c5c] uppercase tracking-wide">Payout</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {cancelled.map(r => (
                          <tr key={r.id} className="bg-[#1a2335] hover:bg-[#2a0e0e]">
                            <td className="px-3 py-2.5 text-[#b8d4f0] max-w-[120px] truncate">{propertyMap.get(r.listing_id) ?? r.listing_id}</td>
                            <td className="px-3 py-2.5 text-[#3a5070] max-w-[100px] truncate line-through">{r.guest_name}</td>
                            <td className="px-3 py-2.5 text-[#3a5070] whitespace-nowrap">{fmtDate(r.check_in)}</td>
                            <td className="px-3 py-2.5 text-[#3a5070] whitespace-nowrap">{fmtDate(r.check_out)}</td>
                            <td className="px-3 py-2.5 text-right text-[#3a5070]">{r.nights || ''}</td>
                            <td className="px-3 py-2.5 text-[#3a5070] text-xs">{CHANNEL_LABEL[r.channel ?? ''] ?? r.channel ?? ''}</td>
                            <td className="px-3 py-2.5 text-right text-[#3a5070]">{r.accommodation_total != null ? fmt(r.accommodation_total) : fmt(0)}</td>
                            <td className="px-3 py-2.5 text-right text-[#3a5070]">{r.cleaning_fee != null ? fmt(r.cleaning_fee) : fmt(0)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-[#e05c5c]">{fmt(r.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#2a0e0e] border-t-2 border-rose-200 font-semibold">
                          <td className="px-3 py-2.5 text-[#e05c5c]" colSpan={8}>Total Payout from Cancellations ({cancelled.length})</td>
                          <td className="px-3 py-2.5 text-right text-[#e05c5c]">
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

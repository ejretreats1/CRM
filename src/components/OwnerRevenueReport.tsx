import { useState, useMemo, useEffect } from 'react';
import { Download, Calendar, Percent } from 'lucide-react';
import type { Owner } from '../types';
import type { UplistingReservation } from '../services/uplisting';

interface OwnerRevenueReportProps {
  owner: Owner;
  reservations: UplistingReservation[];
}

type CommissionBasis = 'accommodation' | 'payout';

interface CommissionSettings {
  rate: number;
  basis: CommissionBasis;
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

function calcCommission(r: UplistingReservation, rate: number, basis: CommissionBasis): number {
  if (rate === 0) return 0;
  const base = basis === 'accommodation'
    ? (r.accommodation_total ?? r.total_price)
    : r.total_price;
  return base * (rate / 100);
}

export default function OwnerRevenueReport({ owner, reservations }: OwnerRevenueReportProps) {
  const { from: defaultFrom, to: defaultTo } = defaultRange();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const [commission, setCommission] = useState<CommissionSettings>({ rate: 0, basis: 'payout' });

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

  const filtered = useMemo(() => {
    if (ownerListingIds.size === 0) return [];
    return reservations.filter(r => {
      if (!ownerListingIds.has(r.listing_id)) return false;
      if (r.status === 'cancelled') return false;
      const checkIn = r.check_in.slice(0, 10);
      const checkOut = r.check_out.slice(0, 10);
      return checkOut >= from && checkIn <= to;
    });
  }, [reservations, ownerListingIds, from, to]);

  const totals = useMemo(() => ({
    payout: filtered.reduce((s, r) => s + r.total_price, 0),
    accommodation: filtered.reduce((s, r) => s + (r.accommodation_total ?? 0), 0),
    cleaning: filtered.reduce((s, r) => s + (r.cleaning_fee ?? 0), 0),
    nights: filtered.reduce((s, r) => s + (r.nights ?? 0), 0),
    commission: filtered.reduce((s, r) => s + calcCommission(r, commission.rate, commission.basis), 0),
  }), [filtered, commission]);

  const showCommission = commission.rate > 0;
  const basisLabel = commission.basis === 'accommodation' ? 'Accommodation Total' : 'Total Payout';

  function downloadCSV() {
    const headers = ['Property', 'Guest', 'Check-In', 'Check-Out', 'Nights', 'Channel', 'Accommodation', 'Cleaning Fee', 'Total Payout'];
    if (showCommission) headers.push(`Commission (${commission.rate}% of ${basisLabel})`);

    const rows = filtered.map(r => {
      const row = [
        propertyMap.get(r.listing_id) ?? r.listing_id,
        r.guest_name,
        r.check_in,
        r.check_out,
        r.nights ?? '',
        CHANNEL_LABEL[r.channel ?? ''] ?? r.channel ?? '',
        r.accommodation_total != null ? r.accommodation_total.toFixed(2) : '',
        r.cleaning_fee != null ? r.cleaning_fee.toFixed(2) : '',
        r.total_price.toFixed(2),
      ];
      if (showCommission) row.push(calcCommission(r, commission.rate, commission.basis).toFixed(2));
      return row;
    });

    const totalsRow = [
      'TOTALS', '', '', '',
      totals.nights, '',
      totals.accommodation.toFixed(2),
      totals.cleaning.toFixed(2),
      totals.payout.toFixed(2),
    ];
    if (showCommission) totalsRow.push(totals.commission.toFixed(2));

    const csv = [headers, ...rows, totalsRow]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${owner.name.replace(/\s+/g, '-')}-revenue-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasUplisting = ownerListingIds.size > 0;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800">Revenue Report</h2>
        {filtered.length > 0 && (
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download size={13} /> Download CSV
          </button>
        )}
      </div>

      {!hasUplisting ? (
        <p className="text-sm text-slate-400 py-4">Import properties from Uplisting to see reservation data here.</p>
      ) : (
        <>
          {/* Controls row */}
          <div className="flex flex-wrap gap-4 mb-5">
            {/* Date range */}
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar size={14} className="text-slate-400 flex-shrink-0" />
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
                <option value="accommodation">Accommodation Total</option>
              </select>
            </div>
          </div>

          {/* Commission summary badge */}
          {showCommission && filtered.length > 0 && (
            <div className="mb-4 inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
              <span className="text-indigo-600 font-medium">Commission ({commission.rate}% of {basisLabel}):</span>
              <span className="text-indigo-800 font-bold">{fmt(totals.commission)}</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No reservations found for this date range.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Property</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Guest</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Check-In</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Check-Out</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nts</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Channel</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Accom.</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cleaning</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payout</th>
                    {showCommission && (
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-indigo-500 uppercase tracking-wide">
                        Commission
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                      <td className="px-3 py-2.5 text-right font-semibold text-teal-700">{fmt(r.total_price)}</td>
                      {showCommission && (
                        <td className="px-3 py-2.5 text-right font-semibold text-indigo-600">
                          {fmt(calcCommission(r, commission.rate, commission.basis))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                    <td className="px-3 py-2.5 text-slate-700" colSpan={4}>Totals ({filtered.length} reservations)</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{totals.nights}</td>
                    <td />
                    <td className="px-3 py-2.5 text-right text-slate-700">{totals.accommodation > 0 ? fmt(totals.accommodation) : ''}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{totals.cleaning > 0 ? fmt(totals.cleaning) : ''}</td>
                    <td className="px-3 py-2.5 text-right text-teal-700">{fmt(totals.payout)}</td>
                    {showCommission && (
                      <td className="px-3 py-2.5 text-right text-indigo-700">{fmt(totals.commission)}</td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

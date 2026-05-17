import { useState, useMemo } from 'react';
import {
  ArrowLeft, Home, ChevronLeft, ChevronRight, Phone, Mail,
  Users, Bed, Calendar, ExternalLink, Edit2, Check, X, Wrench,
} from 'lucide-react';
import type { Owner, Property, PropertyInfo, PropertyStatus } from '../types';
import type { UplistingReservation, UplistingProperty } from '../services/uplisting';
import PropertyInfoPanel from './PropertyInfoPanel';

interface PropertyPortalProps {
  owner: Owner;
  property: Property;
  reservations: UplistingReservation[];
  uplistingProperties: UplistingProperty[];
  onBack: () => void;
  onViewOwner: (ownerId: string) => void;
  onUpdateProperty?: (property: Property) => Promise<void>;
}

const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  onboarding: 'bg-amber-100 text-amber-700',
};

function getUplistingId(propertyId: string): string | null {
  const parts = propertyId.split('_');
  return parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayInfo(dateStr: string, reservations: UplistingReservation[]) {
  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const cin = r.check_in.slice(0, 10);
    const cout = r.check_out.slice(0, 10);
    if (dateStr === cin) return { type: 'checkin' as const, reservation: r };
    if (dateStr === cout) return { type: 'checkout' as const, reservation: r };
    if (dateStr > cin && dateStr < cout) return { type: 'occupied' as const, reservation: r };
  }
  return { type: 'vacant' as const, reservation: null };
}

function channelStyle(channel?: string) {
  const c = (channel ?? '').toLowerCase();
  if (c.includes('airbnb')) return 'bg-rose-100 text-rose-700';
  if (c.includes('vrbo') || c.includes('homeaway')) return 'bg-blue-100 text-blue-700';
  if (c.includes('booking')) return 'bg-indigo-100 text-indigo-700';
  if (c.includes('direct')) return 'bg-teal-100 text-teal-700';
  return 'bg-slate-100 text-slate-600';
}

function fmt(n: number) {
  return `$${n.toLocaleString()}`;
}

function fmtDate(str: string) {
  const [y, m, d] = str.slice(0, 10).split('-');
  return `${MONTHS[parseInt(m) - 1].slice(0, 3)} ${parseInt(d)}, ${y}`;
}

function vendorEmoji(role: string): string {
  switch (role) {
    case 'Cleaner':      return '🧹';
    case 'Handyman':     return '🔧';
    case 'Plumber':      return '🪠';
    case 'Electrician':  return '⚡';
    case 'Landscaper':   return '🌿';
    case 'HVAC':         return '❄️';
    case 'Pool Service': return '🏊';
    case 'Pest Control': return '🐛';
    default:             return '🔨';
  }
}

type DetailForm = {
  bedrooms: string; bathrooms: string; maxGuests: string; type: string;
  monthlyRevenue: string; occupancyRate: string; status: PropertyStatus; photoUrl: string;
};

export default function PropertyPortal({ owner, property, reservations, uplistingProperties, onBack, onViewOwner, onUpdateProperty }: PropertyPortalProps) {
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [selectedReservation, setSelectedReservation] = useState<UplistingReservation | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState<DetailForm>({
    bedrooms: String(property.bedrooms),
    bathrooms: String(property.bathrooms),
    maxGuests: String(property.maxGuests),
    type: property.type,
    monthlyRevenue: String(property.monthlyRevenue),
    occupancyRate: String(property.occupancyRate),
    status: property.status,
    photoUrl: property.photoUrl ?? '',
  });
  const [savingDetails, setSavingDetails] = useState(false);

  async function savePropertyInfo(info: PropertyInfo) {
    if (!onUpdateProperty) return;
    await onUpdateProperty({ ...property, propertyInfo: info });
  }

  async function saveDetails() {
    if (!onUpdateProperty) return;
    setSavingDetails(true);
    await onUpdateProperty({
      ...property,
      bedrooms: Number(detailForm.bedrooms) || 0,
      bathrooms: Number(detailForm.bathrooms) || 0,
      maxGuests: Number(detailForm.maxGuests) || 0,
      type: detailForm.type,
      monthlyRevenue: Number(detailForm.monthlyRevenue) || 0,
      occupancyRate: Number(detailForm.occupancyRate) || 0,
      status: detailForm.status,
      photoUrl: detailForm.photoUrl || undefined,
    });
    setSavingDetails(false);
    setIsEditingDetails(false);
  }

  const today = toDateStr(now);
  const uplistingId = getUplistingId(property.id);
  const photoUrl = property.photoUrl
    || (uplistingId ? (uplistingProperties.find(p => p.id === uplistingId)?.photo_url ?? '') : '');

  const propReservations = useMemo(() =>
    uplistingId
      ? reservations.filter(r =>
          r.listing_id === uplistingId &&
          (r.status !== 'cancelled' || (r.total_price ?? 0) > 0)
        )
      : [],
    [uplistingId, reservations]
  );

  const arrivingToday = useMemo(
    () => propReservations.filter(r => r.status !== 'cancelled' && r.check_in.slice(0, 10) === today),
    [propReservations, today]
  );
  const departingToday = useMemo(
    () => propReservations.filter(r => r.status !== 'cancelled' && r.check_out.slice(0, 10) === today),
    [propReservations, today]
  );

  const upcoming = useMemo(() =>
    propReservations
      .filter(r => r.check_in.slice(0, 10) >= today)
      .sort((a, b) => a.check_in.localeCompare(b.check_in)),
    [propReservations, today]
  );

  const liveRevenue = useMemo(() => {
    if (!propReservations.length) return null;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rolling = propReservations
      .filter(r => r.status !== 'cancelled' && r.check_in.slice(0, 10) >= cutoff)
      .reduce((s, r) => s + (r.total_price ?? 0), 0);
    const activeCount = propReservations.filter(r => r.status !== 'cancelled').length;
    const occupied = propReservations
      .filter(r => r.status !== 'cancelled' && r.check_in.slice(0, 10) >= cutoff)
      .reduce((s, r) => {
        const ci = new Date(r.check_in); const co = new Date(r.check_out);
        return s + Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
      }, 0);
    const occRate = Math.min(100, Math.round((occupied / 30) * 100));
    return { rolling, activeCount, occRate };
  }, [propReservations]);

  // Calendar grid
  const calCells = useMemo(() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: Array<null | { day: number; dateStr: string; type: string; reservation: UplistingReservation | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const { type, reservation } = getDayInfo(dateStr, propReservations);
      cells.push({ day: d, dateStr, type, reservation });
    }
    return cells;
  }, [calYear, calMonth, propReservations]);

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  function dayCellStyle(type: string): React.CSSProperties {
    if (type === 'occupied') return { background: '#ccfbf1' };
    if (type === 'checkin')  return { background: 'linear-gradient(90deg, #f8fafc 50%, #ccfbf1 50%)' };
    if (type === 'checkout') return { background: 'linear-gradient(90deg, #ccfbf1 50%, #f8fafc 50%)' };
    return {};
  }

  const fullAddress = [property.address, property.city, property.state].filter(Boolean).join(', ');
  const vendors = owner.vendors ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Hero photo */}
      {photoUrl && (
        <div className="w-full h-52 rounded-2xl overflow-hidden mb-5 relative">
          <img src={photoUrl} alt={fullAddress} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 p-4">
            <h1 className="font-bold text-white text-lg leading-tight drop-shadow">{fullAddress}</h1>
            <p className="text-sm text-white/80 mt-0.5">
              Owner: <span className="font-medium text-white">{owner.name}</span>
            </p>
          </div>
          <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[property.status] ?? ''}`}>
            {property.status}
          </span>
          <button onClick={onBack} className="absolute top-3 left-3 p-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors">
            <ArrowLeft size={18} />
          </button>
        </div>
      )}

      {/* Header (no photo fallback) */}
      {!photoUrl && (
        <div className="flex items-start gap-4 mb-6">
          <button onClick={onBack} className="mt-1 p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors flex-shrink-0">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Home size={16} className="text-teal-600 flex-shrink-0" />
              <h1 className="font-bold text-slate-900 text-lg leading-tight truncate">{fullAddress}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[property.status] ?? ''}`}>
                {property.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 ml-6">
              Owner: <span className="font-medium text-slate-600">{owner.name}</span>
            </p>
          </div>
        </div>
      )}

      {/* Today's activity */}
      {(arrivingToday.length > 0 || departingToday.length > 0) && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Today — {fmtDate(today)}</p>
          <div className="flex flex-wrap gap-4">
            {arrivingToday.map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Arriving</span>
                <span className="text-sm font-medium text-slate-800">{r.guest_name}</span>
                {r.channel && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${channelStyle(r.channel)}`}>{r.channel}</span>}
                {r.guest_email && (
                  <a href={`mailto:${r.guest_email}`} className="text-xs text-teal-600 hover:underline">{r.guest_email}</a>
                )}
              </div>
            ))}
            {departingToday.map(r => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">Departing</span>
                <span className="text-sm font-medium text-slate-800">{r.guest_name}</span>
                {r.channel && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${channelStyle(r.channel)}`}>{r.channel}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live revenue stats */}
      {liveRevenue && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Revenue (30d)</p>
            <p className="text-xl font-bold text-teal-700">{fmt(liveRevenue.rolling)}</p>
            <p className="text-xs text-teal-500 mt-0.5">live from PMS</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Reservations</p>
            <p className="text-xl font-bold text-slate-800">{liveRevenue.activeCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">total booked</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Occupancy (30d)</p>
            <p className="text-xl font-bold text-slate-800">{liveRevenue.occRate}%</p>
            <p className="text-xs text-slate-400 mt-0.5">last 30 days</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Calendar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <p className="font-semibold text-slate-800 text-sm">{MONTHS[calMonth]} {calYear}</p>
            <button onClick={nextMonth} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {!uplistingId ? (
            <p className="text-xs text-slate-400 text-center py-8">No PMS data linked to this property.</p>
          ) : (
            <>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-lg overflow-hidden border border-slate-100">
                {calCells.map((cell, i) => (
                  cell === null
                    ? <div key={`empty-${i}`} className="bg-white h-9" />
                    : (
                      <button
                        key={cell.dateStr}
                        onClick={() => setSelectedReservation(cell.reservation === selectedReservation ? null : cell.reservation)}
                        disabled={cell.type === 'vacant'}
                        style={dayCellStyle(cell.type)}
                        className={`
                          bg-white h-9 relative flex items-center justify-center transition-opacity
                          ${cell.type !== 'vacant' ? 'cursor-pointer hover:opacity-80' : ''}
                          ${cell.dateStr === today ? 'ring-2 ring-inset ring-teal-500' : ''}
                        `}
                        title={cell.reservation ? `${cell.reservation.guest_name} · ${cell.type}` : undefined}
                      >
                        <span className={`text-xs font-medium ${
                          cell.type !== 'vacant' ? 'text-teal-800' : 'text-slate-500'
                        } ${cell.dateStr === today ? 'font-bold' : ''}`}>
                          {cell.day}
                        </span>
                      </button>
                    )
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 flex-wrap">
                {[
                  { style: { background: 'linear-gradient(90deg, #f8fafc 50%, #ccfbf1 50%)' }, label: 'Check-in' },
                  { style: { background: 'linear-gradient(90deg, #ccfbf1 50%, #f8fafc 50%)' }, label: 'Check-out' },
                  { style: { background: '#ccfbf1' }, label: 'Occupied' },
                ].map(({ style, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-5 h-3 rounded-sm border border-slate-200" style={style} />
                    <span className="text-xs text-slate-500">{label}</span>
                  </div>
                ))}
              </div>

              {/* Selected reservation detail */}
              {selectedReservation && (
                <div className="mt-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{selectedReservation.guest_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fmtDate(selectedReservation.check_in)} → {fmtDate(selectedReservation.check_out)}
                        {selectedReservation.nights ? ` · ${selectedReservation.nights} nights` : ''}
                      </p>
                      {selectedReservation.guest_email && (
                        <a href={`mailto:${selectedReservation.guest_email}`} className="text-xs text-teal-600 hover:underline mt-0.5 block">
                          {selectedReservation.guest_email}
                        </a>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {selectedReservation.channel && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${channelStyle(selectedReservation.channel)}`}>
                          {selectedReservation.channel}
                        </span>
                      )}
                      <p className="text-sm font-bold text-slate-800 mt-1">{fmt(selectedReservation.total_price)}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Upcoming reservations */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-semibold text-slate-800 text-sm">Upcoming Reservations</p>
            <span className="text-xs text-slate-400">{upcoming.length} booked</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">
              {uplistingId ? 'No upcoming reservations.' : 'No PMS data linked.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight: '380px' }}>
              {upcoming.map(r => {
                const nights = r.nights ?? Math.round(
                  (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86400000
                );
                const isCancelled = r.status === 'cancelled';
                return (
                  <div key={r.id} className={`px-5 py-3 hover:bg-slate-50 transition-colors ${isCancelled ? 'opacity-75' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium text-sm truncate ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{r.guest_name}</p>
                          {isCancelled && (
                            <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 font-medium">Cancelled</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {fmtDate(r.check_in)} → {fmtDate(r.check_out)} · {nights}n
                        </p>
                        {r.guest_email && (
                          <a href={`mailto:${r.guest_email}`} className="text-xs text-teal-600 hover:underline mt-0.5 block truncate">
                            {r.guest_email}
                          </a>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold text-sm ${isCancelled ? 'text-rose-500' : 'text-slate-800'}`}>{fmt(r.total_price)}</p>
                        {isCancelled && (
                          <p className="text-xs text-rose-400 mt-0.5">payout kept</p>
                        )}
                        {!isCancelled && r.channel && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-1 inline-block ${channelStyle(r.channel)}`}>
                            {r.channel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Property details + Owner contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Property details */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Property Details</p>
            {onUpdateProperty && !isEditingDetails && (
              <button
                onClick={() => setIsEditingDetails(true)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-600 transition-colors"
              >
                <Edit2 size={11} /> Edit
              </button>
            )}
            {isEditingDetails && (
              <div className="flex items-center gap-2">
                <button
                  onClick={saveDetails}
                  disabled={savingDetails}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors"
                >
                  <Check size={12} /> {savingDetails ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setIsEditingDetails(false)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            )}
          </div>

          {isEditingDetails ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Beds', key: 'bedrooms' as const },
                  { label: 'Baths', key: 'bathrooms' as const },
                  { label: 'Max guests', key: 'maxGuests' as const },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="text-xs text-slate-400 block mb-1">{label}</label>
                    <input
                      type="number" min="0"
                      value={detailForm[key]}
                      onChange={e => setDetailForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Property type</label>
                <input
                  value={detailForm.type}
                  onChange={e => setDetailForm(f => ({ ...f, type: e.target.value }))}
                  placeholder="e.g. Condo, House…"
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Est. monthly revenue</label>
                  <input
                    type="number" min="0"
                    value={detailForm.monthlyRevenue}
                    onChange={e => setDetailForm(f => ({ ...f, monthlyRevenue: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Occupancy %</label>
                  <input
                    type="number" min="0" max="100"
                    value={detailForm.occupancyRate}
                    onChange={e => setDetailForm(f => ({ ...f, occupancyRate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Status</label>
                <select
                  value={detailForm.status}
                  onChange={e => setDetailForm(f => ({ ...f, status: e.target.value as PropertyStatus }))}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="active">Active</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Photo URL</label>
                <input
                  value={detailForm.photoUrl}
                  onChange={e => setDetailForm(f => ({ ...f, photoUrl: e.target.value }))}
                  placeholder="https://…"
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Bed size={14} className="text-slate-400" />
                <span className="text-slate-600">{property.bedrooms} bed · {property.bathrooms} bath</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-slate-400" />
                <span className="text-slate-600">Up to {property.maxGuests} guests</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Home size={14} className="text-slate-400" />
                <span className="text-slate-600">{property.type || 'Residential'}</span>
              </div>
              {property.joinedAt && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={14} className="text-slate-400" />
                  <span className="text-slate-600">Joined {new Date(property.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                </div>
              )}
              {property.platforms.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs text-slate-400 mb-1.5">Listed on</p>
                  <div className="flex flex-wrap gap-1.5">
                    {property.platforms.map(p => (
                      <span key={p} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {(property.monthlyRevenue > 0 || property.occupancyRate > 0) && (
                <div className="pt-1 flex gap-4">
                  {property.monthlyRevenue > 0 && (
                    <div>
                      <p className="text-xs text-slate-400">Est. monthly</p>
                      <p className="text-sm font-bold text-teal-700">{fmt(property.monthlyRevenue)}</p>
                    </div>
                  )}
                  {property.occupancyRate > 0 && (
                    <div>
                      <p className="text-xs text-slate-400">Occupancy</p>
                      <p className="text-sm font-bold text-slate-800">{property.occupancyRate}%</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Owner contact */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Owner Contact</p>
          <p className="font-semibold text-slate-900 mb-3">{owner.name}</p>
          <div className="space-y-3">
            {owner.phone && (
              <a href={`tel:${owner.phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-teal-600 transition-colors group">
                <Phone size={14} className="text-slate-400 group-hover:text-teal-500" />
                {owner.phone}
              </a>
            )}
            {owner.email && (
              <a href={`mailto:${owner.email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-teal-600 transition-colors group">
                <Mail size={14} className="text-slate-400 group-hover:text-teal-500" />
                {owner.email}
              </a>
            )}
            {owner.notes && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-1">Notes</p>
                <p className="text-xs text-slate-600 leading-relaxed">{owner.notes}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => onViewOwner(owner.id)}
            className="mt-4 flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors"
          >
            <ExternalLink size={12} />
            View full client profile
          </button>
        </div>
      </div>

      {/* Vendors */}
      {vendors.length > 0 && (
        <div className="mt-5 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={14} className="text-slate-400" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendors</p>
          </div>
          <div className="divide-y divide-slate-100">
            {vendors.map(v => (
              <div key={v.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 text-base">
                  {vendorEmoji(v.role)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900">{v.name}</p>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{v.role}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {v.phone && <a href={`tel:${v.phone}`} className="text-xs text-teal-600 hover:underline">{v.phone}</a>}
                    {v.email && <a href={`mailto:${v.email}`} className="text-xs text-teal-600 hover:underline">{v.email}</a>}
                  </div>
                  {v.notes && <p className="text-xs text-slate-500 mt-1">{v.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Property Info */}
      {onUpdateProperty && (
        <div className="mt-5">
          <PropertyInfoPanel
            info={property.propertyInfo ?? {}}
            onSave={savePropertyInfo}
          />
        </div>
      )}
    </div>
  );
}

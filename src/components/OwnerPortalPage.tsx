import { useEffect, useState, useMemo } from 'react';
import { Building2, Loader, Calendar, TrendingUp, Home, Users, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

interface PortalOwner { id: string; name: string; email: string; phone: string; notes?: string; }
interface PortalProperty { id: string; name?: string; address: string; bedrooms: number; bathrooms: number; property_type?: string; }
interface PortalReservation {
  id: string; listing_id: string; guest_name: string; guest_email?: string;
  check_in: string; check_out: string; total_price: number;
  accommodation_total?: number; cleaning_fee?: number;
  status: string; channel?: string; nights?: number;
}
interface PortalData { owner: PortalOwner; properties: PortalProperty[]; reservations: PortalReservation[]; }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function fmt(n: number) { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function nightsBetween(a: string, b: string) { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }

function channelBadge(channel?: string) {
  const c = (channel ?? '').toLowerCase();
  if (c.includes('airbnb'))  return { label: 'Airbnb',      cls: 'bg-[#2a1515] text-[#e05c5c] border-[#5a2020]' };
  if (c.includes('vrbo') || c.includes('homeaway')) return { label: 'VRBO', cls: 'bg-[#162035] text-[#6ab0f5] border-[#1e3a5a]' };
  if (c.includes('booking')) return { label: 'Booking.com', cls: 'bg-[#1a1535] text-[#c4b5fd] border-[#3a2070]' };
  if (c.includes('direct'))  return { label: 'Direct',      cls: 'bg-[#0a2518] text-[#4ab57a] border-[#0a4a2a]' };
  return { label: channel || 'Other', cls: 'bg-[#1e2d45] text-[#b8d4f0] border-[#243550]' };
}

// ── Mini calendar for one property ────────────────────────────────────────────
function MiniCalendar({ reservations, uplistingId }: { reservations: PortalReservation[]; uplistingId: string | null }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const propRes = uplistingId ? reservations.filter(r => r.listing_id === uplistingId && r.status !== 'cancelled') : [];

  function dayStatus(dateStr: string) {
    for (const r of propRes) {
      const cin  = r.check_in.slice(0,10);
      const cout = r.check_out.slice(0,10);
      if (dateStr === cin)              return 'checkin';
      if (dateStr === cout)             return 'checkout';
      if (dateStr > cin && dateStr < cout) return 'occupied';
    }
    return 'vacant';
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toDateStr(today);

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const cells: (null | { day: number; dateStr: string; status: string })[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({ day: d, dateStr, status: dayStatus(dateStr) });
  }

  return (
    <div className="bg-[#111d30] rounded-xl border border-[#243550] p-3">
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={prev} className="p-1 rounded hover:bg-[#1e2d45] text-[#b8d4f0] transition-colors"><ChevronLeft size={14}/></button>
        <span className="text-xs font-semibold text-[#b8d4f0]">{MONTHS[month]} {year}</span>
        <button onClick={next} className="p-1 rounded hover:bg-[#1e2d45] text-[#b8d4f0] transition-colors"><ChevronRight size={14}/></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map(d => <div key={d} className="text-center text-[9px] text-[#3a5070] font-medium">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isToday = cell.dateStr === todayStr;
          const { status } = cell;
          let cls = 'text-[#3a5070]';
          if (isToday) cls = 'bg-[#4a90d9] text-white rounded-full';
          else if (status === 'occupied') cls = 'bg-[#4a90d9]/30 text-[#6ab0f5] rounded-sm';
          else if (status === 'checkin')  cls = 'bg-[#4a90d9] text-white rounded-l-full';
          else if (status === 'checkout') cls = 'bg-[#4a90d9]/40 text-[#6ab0f5] rounded-r-full';
          else cls = 'text-[#b8d4f0]';
          return (
            <div key={i} className={`text-center text-[10px] leading-5 h-5 ${cls}`}>{cell.day}</div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-[#243550]">
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-[#4a90d9]/30"/><span className="text-[9px] text-[#3a5070]">Booked</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-[#1e2d45]"/><span className="text-[9px] text-[#3a5070]">Vacant</span></div>
      </div>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent }: { label: string; value: string; sub?: string; icon: React.ElementType; accent: string }) {
  return (
    <div className="bg-[#1a2335] rounded-2xl border border-[#243550] p-5">
      <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center mb-3`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-[#b8d4f0] mt-0.5">{label}</div>
      {sub && <div className="text-xs text-[#3a5070] mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OwnerPortalPage({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.overflowX = 'visible';
    document.documentElement.style.maxWidth = '';
    document.body.style.overflowX = 'visible';
    document.body.style.maxWidth = '';
    document.body.style.overscrollBehaviorY = 'auto';
    return () => {
      document.documentElement.style.overflowX = '';
      document.documentElement.style.maxWidth = '';
      document.body.style.overflowX = '';
      document.body.style.maxWidth = '';
      document.body.style.overscrollBehaviorY = '';
    };
  }, []);

  useEffect(() => {
    fetch(`/api/uplisting-proxy?service=owner-portal&token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Failed to load portal. Please try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  const stats = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const todayStr = toDateStr(now);
    const ytdStart = `${now.getFullYear()}-01-01`;
    const active = data.reservations.filter(r => r.status !== 'cancelled');

    const ytdRevenue = active
      .filter(r => r.check_in >= ytdStart && r.check_in <= todayStr)
      .reduce((s, r) => s + r.total_price, 0);

    const upcoming = active.filter(r => r.check_in > todayStr);

    // Occupancy for last 30 days
    const thirtyAgo = new Date(now); thirtyAgo.setDate(now.getDate() - 30);
    const thirtyAgoStr = toDateStr(thirtyAgo);
    let bookedNights = 0;
    for (let d = new Date(thirtyAgo); d < now; d.setDate(d.getDate() + 1)) {
      const ds = toDateStr(d);
      const occupied = active.some(r => ds >= r.check_in.slice(0,10) && ds < r.check_out.slice(0,10));
      if (occupied) bookedNights++;
    }
    const occupancy = Math.round((bookedNights / (30 * Math.max(data.properties.length, 1))) * 100);

    // Monthly revenue (last 6 months)
    const monthly: { label: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = toDateStr(d);
      const end = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const rev = active.filter(r => r.check_in >= start && r.check_in <= end).reduce((s, r) => s + r.total_price, 0);
      monthly.push({ label: SHORT_MONTHS[d.getMonth()], revenue: rev });
    }

    return { ytdRevenue, upcoming: upcoming.length, occupancy, bookedNights, monthly, thirtyAgoStr };
  }, [data]);

  const filteredReservations = useMemo(() => {
    if (!data) return [];
    const todayStr = toDateStr(new Date());
    let list = data.reservations.filter(r => r.status !== 'cancelled');
    if (selectedProperty) {
      const upId = selectedProperty.split('_').slice(2).join('_');
      list = list.filter(r => r.listing_id === upId);
    }
    if (filter === 'upcoming') list = list.filter(r => r.check_out > todayStr);
    else if (filter === 'past') list = list.filter(r => r.check_out <= todayStr);
    return list.sort((a, b) => {
      if (filter === 'past') return b.check_in.localeCompare(a.check_in);
      return a.check_in.localeCompare(b.check_in);
    });
  }, [data, filter, selectedProperty]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1623] flex items-center justify-center">
        <Loader size={24} className="text-[#4a90d9] animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0f1623] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#1a2335] border border-[#243550] flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-[#e05c5c]" />
          </div>
          <p className="text-white font-semibold text-lg">Portal not found</p>
          <p className="text-[#b8d4f0] text-sm mt-1">{error || 'This link may be invalid or expired.'}</p>
        </div>
      </div>
    );
  }

  const maxMonthlyRev = Math.max(...(stats?.monthly.map(m => m.revenue) ?? [1]));

  return (
    <div className="min-h-screen bg-[#0f1623]">
      {/* Header */}
      <div className="bg-[#1a2335] border-b border-[#243550] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="E&J Retreats" className="w-9 h-9 rounded-xl object-cover flex-shrink-0"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }}
            />
            <div className="w-9 h-9 rounded-xl bg-[#4a90d9] items-center justify-center flex-shrink-0" style={{display:'none'}}>
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">E&amp;J Retreats</div>
              <div className="text-xs text-[#b8d4f0]">Owner Portal</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-white">{data.owner.name}</div>
            <div className="text-xs text-[#3a5070]">{data.owner.email}</div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome back, {data.owner.name.split(' ')[0]}</h1>
          <p className="text-[#b8d4f0] mt-1 text-sm">
            {data.properties.length} {data.properties.length === 1 ? 'property' : 'properties'} · Here's your performance overview
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Revenue YTD" value={fmt(stats?.ytdRevenue ?? 0)} sub="This calendar year" icon={TrendingUp} accent="bg-[#4a90d9]" />
          <StatCard label="Occupancy" value={`${stats?.occupancy ?? 0}%`} sub="Last 30 days" icon={Calendar} accent="bg-[#10b981]" />
          <StatCard label="Upcoming" value={String(stats?.upcoming ?? 0)} sub="Reservations" icon={Users} accent="bg-[#8b5cf6]" />
          <StatCard label="Properties" value={String(data.properties.length)} sub="Under management" icon={Home} accent="bg-[#f59e0b]" />
        </div>

        {/* Monthly revenue bar chart */}
        {stats && stats.monthly.some(m => m.revenue > 0) && (
          <div className="bg-[#1a2335] rounded-2xl border border-[#243550] p-5">
            <h2 className="text-sm font-bold text-white mb-4">Monthly Revenue</h2>
            <div className="flex items-end gap-2" style={{ height: 100 }}>
              {stats.monthly.map((m, i) => {
                const barH = maxMonthlyRev > 0 ? Math.max((m.revenue / maxMonthlyRev) * 64, 2) : 2;
                const isLast = i === stats.monthly.length - 1;
                return (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[9px] text-[#3a5070] font-medium leading-none">{m.revenue > 0 ? fmt(m.revenue) : ''}</div>
                    <div className="flex-1" />
                    <div className="w-full rounded-t-sm" style={{ height: barH, background: isLast ? '#4a90d9' : '#243550' }} />
                    <div className={`text-[9px] font-semibold leading-none ${isLast ? 'text-[#4a90d9]' : 'text-[#3a5070]'}`}>{m.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Properties */}
        {data.properties.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-white mb-3">Your Properties</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.properties.map(prop => {
                const upId = prop.id.split('_').slice(2).join('_');
                const propRes = data.reservations.filter(r => r.listing_id === upId && r.status !== 'cancelled');
                const now = new Date();
                const todayStr = toDateStr(now);
                const upcoming = propRes.filter(r => r.check_in > todayStr);
                const current = propRes.find(r => r.check_in <= todayStr && r.check_out > todayStr);

                // Per-property revenue (last 30 days)
                const thirtyAgo = new Date(now); thirtyAgo.setDate(now.getDate() - 30);
                const thirtyAgoStr = toDateStr(thirtyAgo);
                const propRevenue30d = propRes
                  .filter(r => r.check_in >= thirtyAgoStr && r.check_in <= todayStr)
                  .reduce((s, r) => s + r.total_price, 0);

                // Per-property YTD revenue
                const ytdStart = `${now.getFullYear()}-01-01`;
                const propRevenueYTD = propRes
                  .filter(r => r.check_in >= ytdStart && r.check_in <= todayStr)
                  .reduce((s, r) => s + r.total_price, 0);

                // Per-property occupancy (last 30 days)
                let bookedNights = 0;
                for (let d = new Date(thirtyAgo); d < now; d.setDate(d.getDate() + 1)) {
                  const ds = toDateStr(d);
                  if (propRes.some(r => ds >= r.check_in.slice(0, 10) && ds < r.check_out.slice(0, 10))) bookedNights++;
                }
                const occupancy = Math.round((bookedNights / 30) * 100);

                return (
                  <div key={prop.id} className="bg-[#1a2335] rounded-2xl border border-[#243550] overflow-hidden">
                    <div className="p-4 border-b border-[#243550]">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#243550] flex items-center justify-center flex-shrink-0">
                          <Home size={18} className="text-[#4a90d9]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm truncate">{prop.name || prop.address}</p>
                          <p className="text-xs text-[#b8d4f0] truncate mt-0.5">{prop.address}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs bg-[#243550] text-[#b8d4f0] px-2 py-0.5 rounded-full">{prop.bedrooms}BR</span>
                            {current
                              ? <span className="text-xs bg-[#2a1515] text-[#e05c5c] border border-[#5a2020] px-2 py-0.5 rounded-full">Occupied</span>
                              : upcoming.length > 0
                                ? <span className="text-xs bg-[#0a2518] text-[#4ab57a] border border-[#0a4a2a] px-2 py-0.5 rounded-full">Vacant · {upcoming.length} upcoming</span>
                                : <span className="text-xs bg-[#1e2d45] text-[#3a5070] px-2 py-0.5 rounded-full">Vacant</span>
                            }
                          </div>
                        </div>
                      </div>

                      {/* Per-property stats */}
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#1e2d45]">
                        <div className="text-center">
                          <div className="text-sm font-bold text-[#4ab57a]">{fmt(propRevenue30d)}</div>
                          <div className="text-[9px] text-[#3a5070] mt-0.5">Last 30d</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold text-white">{fmt(propRevenueYTD)}</div>
                          <div className="text-[9px] text-[#3a5070] mt-0.5">YTD Revenue</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold text-[#4a90d9]">{occupancy}%</div>
                          <div className="text-[9px] text-[#3a5070] mt-0.5">Occupancy</div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <MiniCalendar reservations={data.reservations} uplistingId={upId || null} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reservations */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-bold text-white">Reservations</h2>
            <div className="flex items-center gap-2">
              {data.properties.length > 1 && (
                <select
                  value={selectedProperty ?? ''}
                  onChange={e => setSelectedProperty(e.target.value || null)}
                  className="text-xs bg-[#1e2d45] border border-[#243550] text-[#b8d4f0] rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="">All properties</option>
                  {data.properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name || p.address}</option>
                  ))}
                </select>
              )}
              <div className="flex rounded-lg border border-[#243550] overflow-hidden">
                {(['upcoming','all','past'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-[#4a90d9] text-white' : 'bg-[#1e2d45] text-[#b8d4f0] hover:bg-[#243550]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredReservations.length === 0 ? (
            <div className="bg-[#1a2335] rounded-2xl border border-[#243550] py-12 text-center">
              <Calendar size={28} className="text-[#3a5070] mx-auto mb-2" />
              <p className="text-[#b8d4f0] text-sm">No {filter === 'all' ? '' : filter} reservations</p>
            </div>
          ) : (
            <div className="bg-[#1a2335] rounded-2xl border border-[#243550] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[2fr_1.5fr_1fr_auto] gap-3 px-4 py-2.5 border-b border-[#243550] bg-[#111d30]">
                <div className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide">Guest</div>
                <div className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide">Dates</div>
                <div className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide hidden sm:block">Nights</div>
                <div className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide">Revenue</div>
              </div>
              {filteredReservations.map((r) => {
                const badge = channelBadge(r.channel);
                const nights = r.nights ?? nightsBetween(r.check_in, r.check_out);
                const cin  = r.check_in.slice(0,10);
                const cout = r.check_out.slice(0,10);
                const todayStr = toDateStr(new Date());
                const isActive = cin <= todayStr && cout > todayStr;
                return (
                  <div key={r.id}
                    className={`grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[2fr_1.5fr_1fr_auto] gap-3 px-4 py-3.5 border-b border-[#1e2d45] last:border-0 ${isActive ? 'bg-[#4a90d9]/5' : ''}`}
                  >
                    {/* Guest */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold text-white ${isActive ? 'text-[#6ab0f5]' : ''}`}>{r.guest_name}</span>
                        {isActive && <span className="text-[9px] bg-[#4a90d9]/20 text-[#6ab0f5] border border-[#4a90d9]/30 px-1.5 py-0.5 rounded-full font-medium">Current</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${badge.cls}`}>{badge.label}</span>
                        {r.guest_email && <span className="text-[10px] text-[#3a5070] truncate hidden sm:block">{r.guest_email}</span>}
                      </div>
                    </div>
                    {/* Dates */}
                    <div className="flex-shrink-0">
                      <div className="text-xs text-[#b8d4f0] font-medium">{formatDate(cin)}</div>
                      <div className="text-[10px] text-[#3a5070] mt-0.5">→ {formatDate(cout)}</div>
                    </div>
                    {/* Nights */}
                    <div className="hidden sm:block text-sm font-semibold text-white text-center">{nights}<span className="text-[10px] text-[#3a5070] font-normal">n</span></div>
                    {/* Revenue */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-[#4ab57a]">{fmt(r.total_price)}</div>
                      {r.cleaning_fee && <div className="text-[10px] text-[#3a5070]">+{fmt(r.cleaning_fee)} clean</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4 border-t border-[#1e2d45]">
          <p className="text-xs text-[#3a5070]">E&amp;J Retreats · Owner Portal · All data is confidential</p>
        </div>
      </div>
    </div>
  );
}

function formatDate(str: string) {
  const [y, m, d] = str.split('-');
  return `${SHORT_MONTHS[parseInt(m)-1]} ${parseInt(d)}, ${y}`;
}

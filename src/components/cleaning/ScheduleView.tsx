import { useState } from 'react';
import { ChevronLeft, ChevronRight, Home, User, Calendar, DollarSign, X, Phone, Mail, KeyRound, Clock, MapPin } from 'lucide-react';
import type { CleaningJob, Cleaner, CleaningPropertyConfig } from '../../types/cleaning';
import type { UplistingProperty } from '../../services/uplisting';

interface Props {
  jobs: CleaningJob[];
  cleaners: Cleaner[];
  configs: CleaningPropertyConfig[];
  uplistingProperties: UplistingProperty[];
}

function displayName(propertyId: string | undefined, propertyName: string, props: UplistingProperty[]): string {
  const p = props.find(p => p.id === propertyId);
  return p?.nickname || p?.name || propertyName;
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-[#1a1800] border-[#3a3200] text-[#d0954a]',
  dispatched:  'bg-[#0d1e35] border-[#1e3a5a] text-[#4a90d9]',
  accepted:    'bg-[#0a1e30] border-[#1e3050] text-[#5aa0e9]',
  in_progress: 'bg-[#0d1e35] border-[#2a5080] text-[#70b0ff]',
  completed:   'bg-[#0a2518] border-[#1e4030] text-[#5ce0a0]',
  cancelled:   'bg-[#1a0e0e] border-[#3a1a1a] text-[#e05c5c]',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', dispatched: 'Dispatched', accepted: 'Accepted',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};

const STATUS_BAR: Record<string, string> = {
  pending: 'bg-[#d0954a]', dispatched: 'bg-[#4a90d9]', accepted: 'bg-[#5aa0e9]',
  in_progress: 'bg-[#70b0ff]', completed: 'bg-[#5ce0a0]', cancelled: 'bg-[#e05c5c]',
};

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toLocalDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDayLabel(d: Date): { weekday: string; day: string; month: string } {
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
}

function fmt(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

type CalView = 'week' | 'month';

// ── Job Detail Modal ─────────────────────────────────────────────────────────
function JobDetailModal({
  job, cleaners, configs, uplistingProperties, onClose,
}: {
  job: CleaningJob;
  cleaners: Cleaner[];
  configs: CleaningPropertyConfig[];
  uplistingProperties: UplistingProperty[];
  onClose: () => void;
}) {
  const cleaner = job.assignedCleanerId ? cleaners.find(c => c.id === job.assignedCleanerId) : null;
  const config = configs.find(c => c.propertyId === job.propertyId);
  const uplistingProp = uplistingProperties.find(p => p.id === job.propertyId);
  const propName = displayName(job.propertyId, job.propertyName, uplistingProperties);
  const isSameDay = job.checkinDate && job.checkinDate === job.checkoutDate;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-[#0f1923] border border-[#1e2d45] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] sticky top-0 bg-[#0f1923] z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_BAR[job.status] ?? 'bg-[#3a5070]'}`} />
            <h2 className="font-bold text-white text-base truncate">{propName}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Same-day alert */}
          {isSameDay && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <p className="text-red-400 font-semibold text-sm">Same-Day Check-In</p>
            </div>
          )}

          {/* Status */}
          <span className={`inline-flex text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_COLORS[job.status]}`}>
            {STATUS_LABELS[job.status]}
          </span>

          {/* Property photo */}
          {(config?.photoUrl || uplistingProp?.photo_url) && (
            <div className="rounded-xl overflow-hidden border border-[#1e2d45]">
              <img src={config?.photoUrl ?? uplistingProp?.photo_url} alt={propName} className="w-full h-40 object-cover" />
            </div>
          )}

          {/* Dates */}
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
            <InfoRow icon={<Calendar size={14} className="text-[#4a90d9]" />} label="Cleaning Date" value={fmt(job.checkoutDate)} />
            {config?.checkoutTime && <InfoRow icon={<Clock size={14} className="text-[#3a5070]" />} label="Guest Check-out" value={config.checkoutTime} />}
            {job.checkinDate && (
              <InfoRow
                icon={<Clock size={14} className={isSameDay ? 'text-red-400' : 'text-[#3a5070]'} />}
                label={isSameDay ? '⚡ Check-in (Same Day)' : 'Next Check-in'}
                value={`${fmt(job.checkinDate)}${config?.checkinTime ? ` · ${config.checkinTime}` : ''}`}
                highlight={!!isSameDay}
              />
            )}
            {job.guestName && <InfoRow icon={<User size={14} className="text-[#3a5070]" />} label="Departing Guest" value={job.guestName} />}
          </div>

          {/* Property details */}
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide">Property</p>
            <InfoRow icon={<Home size={14} className="text-[#4a90d9]" />} label="Name" value={propName} />
            {(config?.address || uplistingProp?.address) && (
              <InfoRow icon={<MapPin size={14} className="text-[#3a5070]" />} label="Address" value={config?.address ?? uplistingProp?.address ?? ''} />
            )}
            {config?.doorCode && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound size={14} className="text-[#4a90d9]" />
                  <span className="text-xs text-[#3a5070]">Door Code</span>
                </div>
                <p className="text-2xl font-bold text-white tracking-widest pl-6">{config.doorCode}</p>
              </div>
            )}
          </div>

          {/* Cleaner */}
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide">Cleaner</p>
            {cleaner ? (
              <>
                <InfoRow icon={<User size={14} className="text-[#d07af5]" />} label="Name" value={cleaner.name} />
                <InfoRow icon={<Mail size={14} className="text-[#3a5070]" />} label="Email" value={cleaner.email} />
                {cleaner.phone && <InfoRow icon={<Phone size={14} className="text-[#3a5070]" />} label="Phone" value={cleaner.phone} />}
              </>
            ) : (
              <p className="text-sm text-[#3a5070]">Not yet assigned</p>
            )}
          </div>

          {/* Financials */}
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide">Financials</p>
            {job.cleaningFee > 0 && <InfoRow icon={<DollarSign size={14} className="text-[#5ce0a0]" />} label="Client Charge" value={`$${job.cleaningFee}`} />}
            {job.cleanerPayout > 0 && <InfoRow icon={<DollarSign size={14} className="text-[#d07af5]" />} label="Cleaner Payout" value={`$${job.cleanerPayout}`} />}
            {job.cleaningFee > 0 && job.cleanerPayout > 0 && (
              <InfoRow icon={<DollarSign size={14} className="text-[#d0954a]" />} label="Net Profit" value={`$${job.cleaningFee - job.cleanerPayout}`} />
            )}
            {job.chargedAt && <InfoRow icon={<DollarSign size={14} className="text-[#5ce0a0]" />} label="Charged" value={new Date(job.chargedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />}
          </div>

          {/* Notes */}
          {job.notes && (
            <div className="bg-[#1a1800] border border-[#3a3200] rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-[#d0954a] mb-1">Notes</p>
              <p className="text-sm text-[#d0b870]">{job.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className={`text-sm font-medium leading-snug ${highlight ? 'text-red-400' : 'text-white'}`}>{value}</p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ScheduleView({ jobs, cleaners, configs, uplistingProperties }: Props) {
  const [calView, setCalView] = useState<CalView>('month');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<CleaningJob | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toLocalDateStr(today);

  const jobsByDate = new Map<string, CleaningJob[]>();
  for (const job of jobs) {
    const existing = jobsByDate.get(job.checkoutDate) ?? [];
    jobsByDate.set(job.checkoutDate, [...existing, job]);
  }

  // ── WEEK VIEW ────────────────────────────────────────────────────────────────
  const weekStart = addDays(today, weekOffset * 7 - today.getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const weekJobs = days.flatMap(d => jobsByDate.get(toLocalDateStr(d)) ?? []);

  // ── MONTH VIEW ───────────────────────────────────────────────────────────────
  const monthDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDayOfMonth = monthDate.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const calendarCells: (Date | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
  }
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const selectedDateJobs = selectedDate ? (jobsByDate.get(selectedDate) ?? []) : [];
  const monthCleanCount = jobs.filter(j => {
    const d = new Date(j.checkoutDate + 'T12:00:00');
    return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth() && j.status !== 'cancelled';
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">Cleaning schedule by week or month</p>
        </div>
        <div className="flex bg-[#0f1923] border border-[#1e2d45] rounded-xl p-0.5">
          {(['week', 'month'] as CalView[]).map(v => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${
                calView === v ? 'bg-[#4a90d9] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── MONTH VIEW ── */}
      {calView === 'month' && (
        <>
          {/* Month nav */}
          <div className="flex items-center justify-between bg-[#1a2335] border border-[#1e2d45] rounded-2xl px-4 py-3">
            <button
              onClick={() => { setMonthOffset(o => o - 1); setSelectedDate(null); }}
              className="p-1.5 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">{monthLabel}</p>
              <p className="text-xs text-[#3a5070]">{monthCleanCount} cleaning{monthCleanCount !== 1 ? 's' : ''} this month</p>
            </div>
            <div className="flex items-center gap-1">
              {monthOffset !== 0 && (
                <button
                  onClick={() => { setMonthOffset(0); setSelectedDate(null); }}
                  className="text-xs text-[#4a90d9] hover:underline px-2 py-1"
                >
                  Today
                </button>
              )}
              <button
                onClick={() => { setMonthOffset(o => o + 1); setSelectedDate(null); }}
                className="p-1.5 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-[#3a5070] py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cellDate, i) => {
              if (!cellDate) return <div key={i} className="aspect-square" />;
              const dateStr = toLocalDateStr(cellDate);
              const cellJobs = (jobsByDate.get(dateStr) ?? []).filter(j => j.status !== 'cancelled');
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(prev => prev === dateStr ? null : dateStr)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${
                    isSelected
                      ? 'bg-[#1e3a5a] border border-[#4a90d9]'
                      : isToday
                      ? 'bg-[#1a2d4a] border border-[#2a4060]'
                      : cellJobs.length > 0
                      ? 'bg-[#1a2335] border border-[#1e2d45] hover:border-[#2a4060]'
                      : 'bg-transparent hover:bg-[#1a2335] border border-transparent'
                  }`}
                >
                  <span className={`text-xs font-bold leading-none ${isToday ? 'text-[#4a90d9]' : 'text-[#b8d4f0]'}`}>
                    {cellDate.getDate()}
                  </span>
                  {cellJobs.length > 0 && (
                    <span className={`text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-[#4a90d9] text-white' : 'bg-[#1e3a5a] text-[#4a90d9]'
                    }`}>
                      {cellJobs.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day — job list */}
          {selectedDate && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e2d45] flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  {selectedDateJobs.length > 0 && (
                    <p className="text-xs text-[#3a5070] mt-0.5">{selectedDateJobs.filter(j => j.status !== 'cancelled').length} cleaning{selectedDateJobs.filter(j => j.status !== 'cancelled').length !== 1 ? 's' : ''} — tap to view details</p>
                  )}
                </div>
                <button onClick={() => setSelectedDate(null)} className="text-[#3a5070] hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              {selectedDateJobs.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[#3a5070]">No cleanings scheduled.</p>
              ) : (
                <div className="divide-y divide-[#1e2d45]">
                  {selectedDateJobs.map(job => {
                    const cleaner = job.assignedCleanerId ? cleaners.find(c => c.id === job.assignedCleanerId) : null;
                    const config = configs.find(c => c.propertyId === job.propertyId);
                    return (
                      <button
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#1e2d45] transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${STATUS_BAR[job.status] ?? 'bg-[#3a5070]'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {cleaner && (
                                <p className="text-xs text-[#3a5070] flex items-center gap-1">
                                  <User size={10} />
                                  {cleaner.name}
                                </p>
                              )}
                              {config?.doorCode && (
                                <p className="text-xs text-[#3a5070] flex items-center gap-1">
                                  <KeyRound size={10} />
                                  {config.doorCode}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[job.status]}`}>
                            {STATUS_LABELS[job.status]}
                          </span>
                          <ChevronRight size={14} className="text-[#3a5070]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── WEEK VIEW ── */}
      {calView === 'week' && (
        <>
          <div className="flex items-center justify-between bg-[#1a2335] border border-[#1e2d45] rounded-2xl px-4 py-3">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="p-1.5 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">{weekLabel}</p>
              <p className="text-xs text-[#3a5070]">{weekJobs.filter(j => j.status !== 'cancelled').length} jobs this week</p>
            </div>
            <div className="flex items-center gap-1">
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="text-xs text-[#4a90d9] hover:underline px-2 py-1">Today</button>
              )}
              <button
                onClick={() => setWeekOffset(w => w + 1)}
                className="p-1.5 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Mobile: stacked day rows */}
          <div className="lg:hidden flex flex-col gap-2">
            {days.map(d => {
              const dateStr = toLocalDateStr(d);
              const { weekday, day, month } = fmtDayLabel(d);
              const isToday = dateStr === todayStr;
              const dayJobs = (jobsByDate.get(dateStr) ?? []).filter(j => j.status !== 'cancelled');

              return (
                <div key={dateStr} className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
                  <div className={`flex items-center gap-3 px-4 py-2.5 ${isToday ? 'bg-[#4a90d9]' : 'bg-[#162035]'}`}>
                    <div className="flex flex-col items-center w-10 flex-shrink-0">
                      <span className={`text-[10px] font-semibold leading-none ${isToday ? 'text-white/80' : 'text-[#3a5070]'}`}>{weekday}</span>
                      <span className={`text-lg font-bold leading-none mt-0.5 ${isToday ? 'text-white' : 'text-[#b8d4f0]'}`}>{day}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${isToday ? 'text-white/80' : 'text-[#3a5070]'}`}>{month}</p>
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 ${isToday ? 'text-white/80' : 'text-[#3a5070]'}`}>
                      {dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {dayJobs.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-[#3a5070]">No cleanings scheduled.</p>
                  ) : (
                    <div className="divide-y divide-[#1e2d45]">
                      {dayJobs.map(job => {
                        const cleaner = job.assignedCleanerId ? cleaners.find(c => c.id === job.assignedCleanerId) : null;
                        return (
                          <button
                            key={job.id}
                            onClick={() => setSelectedJob(job)}
                            className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#1e2d45] transition-colors text-left"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Home size={15} className="text-[#3a5070] flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</p>
                                {cleaner && (
                                  <p className="text-xs text-[#3a5070] flex items-center gap-1 mt-0.5">
                                    <User size={11} />
                                    {cleaner.name}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${STATUS_COLORS[job.status]}`}>
                                {STATUS_LABELS[job.status]}
                              </span>
                              <ChevronRight size={14} className="text-[#3a5070]" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: 7-column grid */}
          <div className="hidden lg:grid grid-cols-7 gap-2">
            {days.map(d => {
              const dateStr = toLocalDateStr(d);
              const { weekday, day, month } = fmtDayLabel(d);
              const isToday = dateStr === todayStr;
              const dayJobs = (jobsByDate.get(dateStr) ?? []).filter(j => j.status !== 'cancelled');

              return (
                <div key={dateStr} className="flex flex-col gap-1.5">
                  <div className={`text-center py-2 rounded-xl ${isToday ? 'bg-[#4a90d9]' : 'bg-[#1a2335]'}`}>
                    <p className={`text-[10px] font-semibold ${isToday ? 'text-white/80' : 'text-[#3a5070]'}`}>{weekday}</p>
                    <p className={`text-base font-bold leading-none mt-0.5 ${isToday ? 'text-white' : 'text-[#b8d4f0]'}`}>{day}</p>
                    <p className={`text-[10px] ${isToday ? 'text-white/60' : 'text-[#2a4060]'}`}>{month}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayJobs.map(job => {
                      const cleaner = job.assignedCleanerId ? cleaners.find(c => c.id === job.assignedCleanerId) : null;
                      return (
                        <button
                          key={job.id}
                          onClick={() => setSelectedJob(job)}
                          className={`rounded-lg border px-1.5 py-1.5 text-[10px] leading-tight text-left w-full hover:opacity-80 transition-opacity ${STATUS_COLORS[job.status]}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <Home size={9} className="flex-shrink-0" />
                            <span className="font-semibold truncate">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</span>
                          </div>
                          <p className="opacity-70">{STATUS_LABELS[job.status]}</p>
                          {cleaner && (
                            <div className="flex items-center gap-1 mt-0.5 opacity-70">
                              <User size={9} />
                              <span className="truncate">{cleaner.name.split(' ')[0]}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Upcoming list */}
      <div>
        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Calendar size={15} className="text-[#4a90d9]" />
          Upcoming Cleanings
        </h2>
        {(() => {
          const futureStr = toLocalDateStr(addDays(today, 30));
          const upcoming = jobs
            .filter(j => j.checkoutDate >= todayStr && j.checkoutDate <= futureStr && j.status !== 'cancelled')
            .sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate));

          if (upcoming.length === 0) {
            return <p className="text-sm text-[#3a5070]">No upcoming cleanings in the next 30 days.</p>;
          }

          return (
            <div className="space-y-2">
              {upcoming.map(job => {
                const cleaner = job.assignedCleanerId ? cleaners.find(c => c.id === job.assignedCleanerId) : null;
                const d = new Date(job.checkoutDate + 'T12:00:00');
                const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className="w-full bg-[#1a2335] border border-[#1e2d45] rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-[#2a4060] transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</p>
                      <p className="text-xs text-[#3a5070]">{dateLabel}{job.guestName ? ` · ${job.guestName}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[job.status]}`}>
                          {STATUS_LABELS[job.status]}
                        </span>
                        {cleaner && <span className="text-xs text-[#3a5070]">{cleaner.name}</span>}
                      </div>
                      <ChevronRight size={14} className="text-[#3a5070]" />
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Job detail modal */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          cleaners={cleaners}
          configs={configs}
          uplistingProperties={uplistingProperties}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}

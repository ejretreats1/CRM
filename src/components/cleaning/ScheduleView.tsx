import { useState } from 'react';
import { ChevronLeft, ChevronRight, Home, User, Calendar } from 'lucide-react';
import type { CleaningJob, Cleaner } from '../../types/cleaning';
import type { UplistingProperty } from '../../services/uplisting';

interface Props {
  jobs: CleaningJob[];
  cleaners: Cleaner[];
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

const STATUS_DOT: Record<string, string> = {
  pending:     'bg-[#d0954a]',
  dispatched:  'bg-[#4a90d9]',
  accepted:    'bg-[#5aa0e9]',
  in_progress: 'bg-[#70b0ff]',
  completed:   'bg-[#5ce0a0]',
  cancelled:   'bg-[#e05c5c]',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', dispatched: 'Dispatched', accepted: 'Accepted',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
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

type CalView = 'week' | 'month';

export default function ScheduleView({ jobs, cleaners, uplistingProperties }: Props) {
  const [calView, setCalView] = useState<CalView>('month');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
  const firstDayOfMonth = monthDate.getDay(); // 0=Sun
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  // Build full calendar grid (6 rows × 7 cols)
  const calendarCells: (Date | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
  }
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const selectedDateJobs = selectedDate ? (jobsByDate.get(selectedDate) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">Cleaning schedule by week or month</p>
        </div>
        {/* View toggle */}
        <div className="flex bg-[#0f1923] border border-[#1e2d45] rounded-xl p-0.5">
          {(['week', 'month'] as CalView[]).map(v => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${
                calView === v
                  ? 'bg-[#4a90d9] text-white'
                  : 'text-[#3a5070] hover:text-[#b8d4f0]'
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
              <p className="text-xs text-[#3a5070]">
                {jobs.filter(j => {
                  const d = new Date(j.checkoutDate + 'T12:00:00');
                  return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth() && j.status !== 'cancelled';
                }).length} cleanings this month
              </p>
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
                  className={`aspect-square rounded-xl p-1 flex flex-col items-center gap-0.5 transition-colors ${
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
                  {/* Job dots */}
                  {cellJobs.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-0.5 mt-auto">
                      {cellJobs.slice(0, 3).map((job, idx) => (
                        <span
                          key={idx}
                          className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status] ?? 'bg-[#3a5070]'}`}
                        />
                      ))}
                      {cellJobs.length > 3 && (
                        <span className="text-[8px] text-[#3a5070] font-bold">+{cellJobs.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day detail */}
          {selectedDate && (
            <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e2d45] flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <button onClick={() => setSelectedDate(null)} className="text-[#3a5070] hover:text-white text-lg leading-none">×</button>
              </div>
              {selectedDateJobs.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[#3a5070]">No cleanings scheduled.</p>
              ) : (
                <div className="divide-y divide-[#1e2d45]">
                  {selectedDateJobs.map(job => {
                    const cleaner = job.assignedCleanerId ? cleaners.find(c => c.id === job.assignedCleanerId) : null;
                    return (
                      <div key={job.id} className="px-4 py-3 flex items-center justify-between gap-3">
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
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_COLORS[job.status]}`}>
                          {STATUS_LABELS[job.status]}
                        </span>
                      </div>
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
          {/* Week nav */}
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
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-xs text-[#4a90d9] hover:underline px-2 py-1"
                >
                  Today
                </button>
              )}
              <button
                onClick={() => setWeekOffset(w => w + 1)}
                className="p-1.5 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Day rows — mobile */}
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
                          <div key={job.id} className="px-4 py-3 flex items-center justify-between gap-3">
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
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full border flex-shrink-0 ${STATUS_COLORS[job.status]}`}>
                              {STATUS_LABELS[job.status]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Day columns — desktop */}
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
                        <div
                          key={job.id}
                          className={`rounded-lg border px-1.5 py-1.5 text-[10px] leading-tight ${STATUS_COLORS[job.status]}`}
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Upcoming list (next 30 days) */}
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
                  <div key={job.id} className="bg-[#1a2335] border border-[#1e2d45] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</p>
                      <p className="text-xs text-[#3a5070]">{dateLabel} {job.guestName && `· ${job.guestName}`}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[job.status]}`}>
                        {STATUS_LABELS[job.status]}
                      </span>
                      {cleaner && <span className="text-xs text-[#3a5070]">{cleaner.name}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

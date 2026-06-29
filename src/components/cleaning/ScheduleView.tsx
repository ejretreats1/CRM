import { useState } from 'react';
import { ChevronLeft, ChevronRight, Home, User, Calendar } from 'lucide-react';
import type { CleaningJob, Cleaner } from '../../types/cleaning';

interface Props {
  jobs: CleaningJob[];
  cleaners: Cleaner[];
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

export default function ScheduleView({ jobs, cleaners }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = addDays(today, weekOffset * 7 - today.getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const jobsByDate = new Map<string, CleaningJob[]>();
  for (const job of jobs) {
    const existing = jobsByDate.get(job.checkoutDate) ?? [];
    jobsByDate.set(job.checkoutDate, [...existing, job]);
  }

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const weekJobs = days.flatMap(d => jobsByDate.get(toLocalDateStr(d)) ?? []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Schedule</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Weekly view of all cleaning jobs</p>
      </div>

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

      {/* Day columns */}
      <div className="grid grid-cols-7 gap-2">
        {days.map(d => {
          const dateStr = toLocalDateStr(d);
          const { weekday, day, month } = fmtDayLabel(d);
          const isToday = dateStr === toLocalDateStr(today);
          const dayJobs = (jobsByDate.get(dateStr) ?? []).filter(j => j.status !== 'cancelled');

          return (
            <div key={dateStr} className="flex flex-col gap-1.5">
              {/* Day header */}
              <div className={`text-center py-2 rounded-xl ${isToday ? 'bg-[#4a90d9]' : 'bg-[#1a2335]'}`}>
                <p className={`text-[10px] font-semibold ${isToday ? 'text-white/80' : 'text-[#3a5070]'}`}>{weekday}</p>
                <p className={`text-base font-bold leading-none mt-0.5 ${isToday ? 'text-white' : 'text-[#b8d4f0]'}`}>{day}</p>
                <p className={`text-[10px] ${isToday ? 'text-white/60' : 'text-[#2a4060]'}`}>{month}</p>
              </div>
              {/* Jobs for this day */}
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
                        <span className="font-semibold truncate">{job.propertyName}</span>
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

      {/* Upcoming list (next 30 days) */}
      <div>
        <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Calendar size={15} className="text-[#4a90d9]" />
          Upcoming Cleanings
        </h2>
        {(() => {
          const todayStr = toLocalDateStr(today);
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
                      <p className="font-semibold text-white text-sm truncate">{job.propertyName}</p>
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

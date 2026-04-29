import { useState, useRef, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Video } from 'lucide-react';
import type { Lead } from '../types';

const HOUR_START = 7;
const HOUR_END = 22;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const HOUR_HEIGHT = 64;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isCrmCall?: boolean;
  meetLink?: string;
  leadId?: string;
  location?: string;
}

interface WeeklyCalendarModalProps {
  events: CalEvent[];
  leads: Lead[];
  onOpenLeadDetail: (lead: Lead) => void;
  onClose: () => void;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function eventsOnDate(events: CalEvent[], date: Date): CalEvent[] {
  const dateStr = date.toISOString().slice(0, 10);
  return events.filter(e => {
    const eDate = e.start.length === 10 ? e.start : new Date(e.start).toISOString().slice(0, 10);
    return eDate === dateStr;
  });
}

function getEventPosition(event: CalEvent): { top: number; height: number } | null {
  if (event.start.length === 10) return null; // all-day
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);

  const startH = start.getHours() + start.getMinutes() / 60;
  const endH = Math.max(
    end.getHours() + end.getMinutes() / 60,
    startH + 0.5
  );

  if (startH >= HOUR_END || endH <= HOUR_START) return null;

  const clampedStart = Math.max(startH, HOUR_START);
  const clampedEnd = Math.min(endH, HOUR_END);

  return {
    top: (clampedStart - HOUR_START) * HOUR_HEIGHT,
    height: Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 24),
  };
}

export default function WeeklyCalendarModal({ events, leads, onOpenLeadDetail, onClose }: WeeklyCalendarModalProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to 8am on open
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - HOUR_START) * HOUR_HEIGHT;
    }
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDay = weekDays[6];
  const weekLabel =
    weekStart.getMonth() === lastDay.getMonth()
      ? `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()}–${lastDay.getDate()}, ${lastDay.getFullYear()}`
      : `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTH_NAMES[lastDay.getMonth()]} ${lastDay.getDate()}, ${lastDay.getFullYear()}`;

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-zinc-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={prevWeek} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-700 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-zinc-100 min-w-[180px] text-center">{weekLabel}</span>
            <button onClick={nextWeek} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-700 transition-colors">
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setWeekStart(getWeekStart(new Date()))}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium px-2.5 py-1 rounded-lg hover:bg-teal-50 transition-colors"
            >
              Today
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Day headers */}
        <div
          className="grid border-b border-zinc-700 flex-shrink-0"
          style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}
        >
          <div className="border-r border-zinc-700" />
          {weekDays.map((day, i) => {
            const isToday = day.getTime() === today.getTime();
            return (
              <div
                key={i}
                className={`py-2 text-center border-l border-zinc-700 ${isToday ? 'bg-teal-50' : ''}`}
              >
                <p className="text-xs text-zinc-500 uppercase tracking-wide">{DAY_LABELS[day.getDay()]}</p>
                <div className={`text-sm font-bold w-7 h-7 mx-auto mt-0.5 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-teal-600 text-white' : 'text-zinc-100'
                }`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
          <div
            className="grid min-w-[500px]"
            style={{ gridTemplateColumns: '44px repeat(7, 1fr)', height: TOTAL_HOURS * HOUR_HEIGHT }}
          >
            {/* Time labels */}
            <div className="relative border-r border-zinc-700">
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div
                  key={i}
                  className="absolute w-full flex items-start justify-end pr-1.5"
                  style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <span className="text-xs text-zinc-500 -mt-2">{formatHour(HOUR_START + i)}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => {
              const isToday = day.getTime() === today.getTime();
              const dayEvents = eventsOnDate(events, day);
              const timedEvents = dayEvents.filter(e => e.start.length > 10);

              return (
                <div
                  key={dayIdx}
                  className={`relative border-l border-zinc-700 ${isToday ? 'bg-teal-50/20' : ''}`}
                >
                  {/* Hour lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="absolute w-full border-b border-zinc-700"
                      style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (() => {
                    const now = new Date();
                    const nowH = now.getHours() + now.getMinutes() / 60;
                    if (nowH < HOUR_START || nowH >= HOUR_END) return null;
                    return (
                      <div
                        className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
                        style={{ top: (nowH - HOUR_START) * HOUR_HEIGHT }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 -ml-1" />
                        <div className="flex-1 h-px bg-red-400" />
                      </div>
                    );
                  })()}

                  {/* Events */}
                  {timedEvents.map(event => {
                    const pos = getEventPosition(event);
                    if (!pos) return null;
                    const isCrm = !!event.isCrmCall;
                    return (
                      <div
                        key={event.id}
                        className={`absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 overflow-hidden z-20 transition-colors ${
                          isCrm
                            ? 'bg-blue-100 border border-blue-300 hover:bg-blue-200 cursor-pointer'
                            : 'bg-teal-100 border border-teal-200 hover:bg-teal-200'
                        }`}
                        style={{ top: pos.top + 1, height: pos.height - 2 }}
                        onClick={() => {
                          if (isCrm && event.leadId) {
                            const lead = leads.find(l => l.id === event.leadId);
                            if (lead) onOpenLeadDetail(lead);
                          }
                        }}
                        title={event.title}
                      >
                        <p className={`text-xs font-semibold truncate leading-tight ${
                          isCrm ? 'text-blue-800' : 'text-teal-800'
                        }`}>
                          {event.title}
                        </p>
                        {pos.height > 38 && (
                          <p className={`text-xs truncate ${isCrm ? 'text-blue-600' : 'text-teal-600'}`}>
                            {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                        {isCrm && event.meetLink && pos.height > 56 && (
                          <a
                            href={event.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline mt-0.5"
                          >
                            <Video size={9} /> Join
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-700 bg-zinc-900 flex-shrink-0 rounded-b-2xl">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-200 border border-blue-300" />
            <span className="text-xs text-zinc-400">CRM calls (click to view lead)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-teal-200 border border-teal-200" />
            <span className="text-xs text-zinc-400">Google Calendar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

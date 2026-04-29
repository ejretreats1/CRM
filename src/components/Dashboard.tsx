import { useState, useEffect } from 'react';
import {
  TrendingUp, Users, Home, Phone, ArrowRight, Wifi, WifiOff,
  RefreshCw, CalendarDays, ListTodo, CheckSquare, Square, MapPin, Plus, Hash, Video, CalendarRange,
} from 'lucide-react';
import type { Lead, Owner, OutreachEntry, Todo } from '../types';
import type { UplistingProperty, UplistingReservation } from '../services/uplisting';
import { estimateMonthlyRevenue, estimateOccupancy } from '../services/uplisting';
import WeeklyCalendarModal from './WeeklyCalendarModal';

interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  location: string;
  isCrmCall?: boolean;
  meetLink?: string;
  leadId?: string;
}

interface SlackMessage {
  ts: string;
  text: string;
  username: string;
  attachmentText: string;
  channelName: string;
}

interface SlackChannel {
  id: string;
  name: string;
}

interface DashboardProps {
  leads: Lead[];
  owners: Owner[];
  outreach: OutreachEntry[];
  todos: Todo[];
  calendarUrl: string;
  slackToken: string;
  slackChannels: SlackChannel[];
  onNavigate: (view: 'pipeline' | 'owners' | 'outreach' | 'owner-detail' | 'settings' | 'va-hub' | 'revenue-reports', extra?: string) => void;
  onToggleTodo: (todo: Todo) => void;
  onAddTodo: (todo: Todo) => void;
  onOpenLeadDetail: (lead: Lead) => void;
  uplistingConnected: boolean;
  uplistingProperties: UplistingProperty[];
  uplistingReservations: UplistingReservation[];
  lastSync: string | null;
  onSync: () => Promise<void>;
}

const STAGE_LABELS: Record<string, string> = {
  new:  'New Lead',
  cold: 'Old / Cold Lead',
  won:  'Won',
};

const OUTREACH_TYPE_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', text: '💬', meeting: '🤝', other: '📝',
};

const SLACK_EMOJI: Record<string, string> = {
  white_check_mark:'✅', x:'❌', heavy_check_mark:'✔️', ballot_box_with_check:'☑️',
  rocket:'🚀', tada:'🎉', fire:'🔥', star:'⭐', star2:'🌟', sparkles:'✨', zap:'⚡',
  house:'🏠', house_with_garden:'🏡', bed:'🛏️', key:'🔑', lock:'🔒', door:'🚪',
  calendar:'📅', date:'📅', clock1:'🕐', hourglass:'⏳', stopwatch:'⏱️',
  moneybag:'💰', dollar:'💵', credit_card:'💳', chart_with_upwards_trend:'📈', chart_with_downwards_trend:'📉',
  bell:'🔔', mega:'📣', loudspeaker:'📢', rotating_light:'🚨', warning:'⚠️', exclamation:'❗', question:'❓',
  email:'📧', mailbox:'📬', phone:'📞', iphone:'📱', computer:'💻', memo:'📝', clipboard:'📋', notebook:'📓',
  broom:'🧹', tools:'🛠️', wrench:'🔧', hammer:'🔨', mag:'🔍', eyes:'👀',
  thumbsup:'👍', thumbsdown:'👎', wave:'👋', pray:'🙏', handshake:'🤝', clap:'👏',
  heart:'❤️', '100':'💯', new:'🆕', trophy:'🏆', checkered_flag:'🏁',
  smile:'😊', joy:'😂', sunglasses:'😎', thinking_face:'🤔', raised_hands:'🙌',
  arrow_right:'➡️', arrow_left:'⬅️', arrow_up:'⬆️', arrow_down:'⬇️',
  information_source:'ℹ️', bulb:'💡', pencil:'✏️', paperclip:'📎',
  car:'🚗', airplane:'✈️', airplane_departure:'🛫',
  person:'👤', busts_in_silhouette:'👥', family:'👨‍👩‍👧',
};

function renderSlackText(text: string): string {
  return text
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2')   // <url|label> → label
    .replace(/<(https?:[^>]+)>/g, '$1')               // bare <url> → url
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1')        // <@U123|name> → @name
    .replace(/<@[A-Z0-9]+>/g, '@user')                // <@U123> → @user
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')        // <#C123|name> → #name
    .replace(/<!channel>/g, '@channel')
    .replace(/<!here>/g, '@here')
    .replace(/<!everyone>/g, '@everyone')
    .replace(/:[a-z0-9_+-]+:/gi, m => {
      const key = m.slice(1, -1);
      return SLACK_EMOJI[key] ?? m;
    });
}

function formatEventDate(start: string): { day: string; time: string; isToday: boolean; isTomorrow: boolean } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const isToday = start.slice(0, 10) === todayStr;
  const isTomorrow = start.slice(0, 10) === tomorrowStr;
  const isAllDay = start.length === 10;

  const date = new Date(isAllDay ? start + 'T00:00:00' : start);
  const day = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = isAllDay ? 'All day'
    : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return { day, time, isToday, isTomorrow };
}

function timeAgoShort(ts: string): string {
  const diff = Date.now() - parseFloat(ts) * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard({
  leads, owners, outreach, todos, calendarUrl, slackToken, slackChannels,
  onNavigate, onToggleTodo, onAddTodo, onOpenLeadDetail,
  uplistingConnected, uplistingProperties, uplistingReservations, lastSync, onSync,
}: DashboardProps) {
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackError, setSlackError] = useState('');
  const [slackExpanded, setSlackExpanded] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);

  // Fetch calendar events when calendarUrl is set
  useEffect(() => {
    if (!calendarUrl) { setCalEvents([]); return; }
    setCalLoading(true);
    fetch(`/api/calendar-proxy?url=${encodeURIComponent(calendarUrl)}`)
      .then(r => r.json())
      .then(d => setCalEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setCalLoading(false));
  }, [calendarUrl]);

  // Fetch Slack messages from all channels and poll every 60s
  useEffect(() => {
    if (!slackToken || slackChannels.length === 0) { setSlackMessages([]); return; }

    async function load() {
      try {
        const results = await Promise.all(
          slackChannels.map(async (ch) => {
            const r = await fetch(`/api/slack-feed?channelId=${encodeURIComponent(ch.id)}`, {
              headers: { 'x-slack-token': slackToken },
            });
            const d = await r.json();
            if (d.error) throw new Error(d.error);
            return (d.messages ?? []).map((m: Omit<SlackMessage, 'channelName'>) => ({
              ...m,
              channelName: ch.name || ch.id,
            }));
          })
        );
        const merged = (results.flat() as SlackMessage[])
          .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
        setSlackMessages(merged);
        setSlackError('');
      } catch (err) {
        setSlackError(err instanceof Error ? err.message : 'Could not reach Slack.');
      } finally {
        setSlackLoading(false);
      }
    }

    setSlackLoading(true);
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slackToken, JSON.stringify(slackChannels)]);

  // Prefer live Uplisting data when connected, fall back to manual data
  const allProperties = owners.flatMap(o => o.properties);
  const activeProperties = allProperties.filter(p => p.status === 'active');
  const activeOwners = owners.filter(o => o.properties.some(p => p.status === 'active'));

  const totalMonthlyRevenue = uplistingConnected && uplistingProperties.length > 0
    ? uplistingProperties.reduce((sum, p) => sum + estimateMonthlyRevenue(p.id, uplistingReservations), 0)
    : activeProperties.reduce((sum, p) => sum + p.monthlyRevenue, 0);


  const activePropertyCount = uplistingConnected && uplistingProperties.length > 0
    ? uplistingProperties.filter(p => p.status !== 'inactive').length
    : activeProperties.length;

  const pipelineLeads = leads.filter(l => l.stage !== 'won');
  const recentOutreach = [...outreach].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentLeads = [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);

  const incompleteTodos = todos.filter(t => !t.completed).slice(0, 6);

  function handleAddTodo() {
    if (!newTodoText.trim()) return;
    const now = new Date().toISOString();
    onAddTodo({
      id: `todo_${Date.now()}`,
      text: newTodoText.trim(),
      completed: false,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    });
    setNewTodoText('');
  }

  const stats: { label: string; value: string | number; sub: string; icon: React.ElementType; color: string; view?: Parameters<typeof onNavigate>[0] }[] = [
    {
      label: 'Monthly Revenue',
      value: `$${totalMonthlyRevenue.toLocaleString()}`,
      sub: `across ${activePropertyCount} active properties`,
      icon: TrendingUp,
      color: 'bg-teal-600',
      view: 'revenue-reports',
    },
    {
      label: 'Total Clients',
      value: owners.length,
      sub: `${activeOwners.length} with active properties`,
      icon: Users,
      color: 'bg-indigo-500',
      view: 'owners',
    },
    {
      label: 'Active Pipeline',
      value: pipelineLeads.length,
      sub: 'leads in progress',
      icon: Phone,
      color: 'bg-rose-500',
      view: 'pipeline',
    },
  ];

  // Merge Google Calendar events with CRM scheduled calls
  const now = new Date().toISOString();
  const crmCalls: CalEvent[] = leads
    .filter(l => l.scheduledCallAt && l.scheduledCallAt >= now)
    .map(l => ({
      id: `call_${l.id}`,
      title: `Call: ${l.name}`,
      start: l.scheduledCallAt!,
      end: l.scheduledCallAt!,
      description: l.notes,
      location: l.phone ?? '',
      isCrmCall: true,
      meetLink: l.scheduledCallLink,
      leadId: l.id,
    }));

  const allEvents = [...calEvents, ...crmCalls].sort((a, b) => a.start.localeCompare(b.start));

  // Next upcoming event (first one)
  const nextEvent = allEvents[0] ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Welcome back to E&amp;J Retreats CRM</p>
        </div>
        {uplistingConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
              <Wifi size={12} /> Live from Uplisting
              {lastSync && (
                <span className="text-emerald-500 ml-1">
                  · {new Date(lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
            <button
              onClick={onSync}
              className="p-1.5 rounded-full text-zinc-500 hover:text-teal-600 hover:bg-teal-50 transition-colors"
              title="Sync now"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onNavigate('settings')}
            className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-700 hover:bg-teal-50 hover:text-teal-600 border border-zinc-700 hover:border-teal-200 px-3 py-1.5 rounded-full transition-colors"
          >
            <WifiOff size={12} /> Connect Uplisting
          </button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color, view }) => {
          const inner = (
            <>
              <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
                <Icon size={18} className="text-white" />
              </div>
              <div className="text-2xl font-bold text-zinc-100">{value}</div>
              <div className="text-sm font-medium text-zinc-200 mt-0.5">{label}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>
              {view && <div className="text-xs text-teal-600 font-medium mt-2 flex items-center gap-0.5">View <ArrowRight size={11} /></div>}
            </>
          );
          return view ? (
            <button
              key={label}
              onClick={() => onNavigate(view)}
              className="bg-zinc-800 rounded-xl p-5 border border-zinc-700 shadow-sm text-left hover:border-teal-300 hover:shadow-md transition-all"
            >
              {inner}
            </button>
          ) : (
            <div key={label} className="bg-zinc-800 rounded-xl p-5 border border-zinc-700 shadow-sm">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Calendar + Todos row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Google Calendar Widget */}
        <div className="bg-zinc-800 rounded-xl border border-zinc-700 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
            <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
              <CalendarDays size={16} className="text-teal-600" /> Upcoming Calls/Meetings
            </h2>
            <div className="flex items-center gap-3">
              {allEvents.length > 0 && (
                <button
                  onClick={() => setShowWeekly(true)}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  <CalendarRange size={13} /> View week
                </button>
              )}
              {!calendarUrl && (
                <button
                  onClick={() => onNavigate('settings')}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  Connect Calendar
                </button>
              )}
            </div>
          </div>

          {!calendarUrl ? (
            <div className="px-5 py-8 text-center">
              <CalendarDays size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No calendar connected.</p>
              <button
                onClick={() => onNavigate('settings')}
                className="mt-2 text-xs text-teal-600 hover:underline"
              >
                Add your Google Calendar iCal URL in Settings
              </button>
            </div>
          ) : calLoading ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-zinc-500">Loading events...</p>
            </div>
          ) : allEvents.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-zinc-500">No upcoming events.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-700">
              {/* Next event — featured */}
              {nextEvent && (() => {
                const { day, time, isToday, isTomorrow } = formatEventDate(nextEvent.start);
                const eventDate = new Date(nextEvent.start.length === 10 ? nextEvent.start + 'T00:00:00' : nextEvent.start);
                return (
                  <div
                    className={`px-5 py-4 ${nextEvent.isCrmCall ? 'bg-blue-50/50 cursor-pointer hover:bg-blue-100/50' : 'bg-teal-50/40'} transition-colors`}
                    onClick={() => {
                      if (nextEvent.isCrmCall && nextEvent.leadId) {
                        const lead = leads.find(l => l.id === nextEvent.leadId);
                        if (lead) onOpenLeadDetail(lead);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm ${
                        nextEvent.isCrmCall
                          ? 'bg-blue-100 text-blue-700 text-base'
                          : `font-bold ${isToday ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-700'}`
                      }`}>
                        {nextEvent.isCrmCall ? '📞' : eventDate.getDate()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-zinc-100 text-sm">{nextEvent.title}</p>
                          {(isToday || isTomorrow) && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              isToday ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isToday ? 'Today' : 'Tomorrow'}
                            </span>
                          )}
                          {nextEvent.isCrmCall && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                              Scheduled Call
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">{day} · {time}</p>
                        {nextEvent.isCrmCall && nextEvent.location && (
                          <a href={`tel:${nextEvent.location}`} className="text-xs text-teal-600 mt-0.5 flex items-center gap-1 hover:underline">
                            <Phone size={10} /> {nextEvent.location}
                          </a>
                        )}
                        {nextEvent.isCrmCall && nextEvent.meetLink && (
                          <a href={nextEvent.meetLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 mt-0.5 flex items-center gap-1 hover:underline font-medium">
                            <Video size={10} /> Join Meeting
                          </a>
                        )}
                        {!nextEvent.isCrmCall && nextEvent.location && (
                          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                            <MapPin size={10} /> {nextEvent.location}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Remaining events (up to 4 more) */}
              {allEvents.slice(1, 5).map(event => {
                const { day, time } = formatEventDate(event.start);
                const eventDate = new Date(event.start.length === 10 ? event.start + 'T00:00:00' : event.start);
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-3 px-5 py-3 ${event.isCrmCall ? 'cursor-pointer hover:bg-zinc-900' : ''} transition-colors`}
                    onClick={() => {
                      if (event.isCrmCall && event.leadId) {
                        const lead = leads.find(l => l.id === event.leadId);
                        if (lead) onOpenLeadDetail(lead);
                      }
                    }}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs ${
                      event.isCrmCall ? 'bg-blue-50 text-blue-500 text-sm' : 'bg-zinc-700 text-zinc-400 font-bold'
                    }`}>
                      {event.isCrmCall ? '📞' : eventDate.getDate()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate font-medium">{event.title}</p>
                      <p className="text-xs text-zinc-500">{day} · {time}</p>
                    </div>
                    {event.isCrmCall && (
                      <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">Call</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Shared To-Do List Widget */}
        <div className="bg-zinc-800 rounded-xl border border-zinc-700 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
            <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
              <ListTodo size={16} className="text-teal-600" /> To-Do List
            </h2>
            <button
              onClick={() => onNavigate('va-hub')}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              See completed <ArrowRight size={13} />
            </button>
          </div>

          {/* Quick add */}
          <div className="px-4 py-2.5 border-b border-zinc-700">
            <div className="flex gap-2">
              <input
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTodo(); }}
                placeholder="Quick add task..."
                className="flex-1 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleAddTodo}
                disabled={!newTodoText.trim()}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <div className="divide-y divide-zinc-700">
            {incompleteTodos.length === 0 && (
              <div className="px-5 py-8 text-center">
                <CheckSquare size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">All caught up! No pending tasks.</p>
              </div>
            )}
            {incompleteTodos.map(todo => (
              <div key={todo.id} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-900 transition-colors">
                <button
                  onClick={() => onToggleTodo({ ...todo, completed: true, updatedAt: new Date().toISOString() })}
                  className="flex-shrink-0 text-zinc-600 hover:text-teal-600 transition-colors"
                >
                  <Square size={15} />
                </button>
                <span className="flex-1 text-sm text-zinc-200 truncate">{todo.text}</span>
              </div>
            ))}
            {todos.filter(t => !t.completed).length > 6 && (
              <div className="px-5 py-2.5 text-center">
                <button
                  onClick={() => onNavigate('va-hub')}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  +{todos.filter(t => !t.completed).length - 6} more in VA Hub
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent leads + outreach row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent leads */}
        <div className="bg-zinc-800 rounded-xl border border-zinc-700 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
            <h2 className="font-semibold text-zinc-100">Recent Leads</h2>
            <button
              onClick={() => onNavigate('pipeline')}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              View pipeline <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-zinc-700">
            {recentLeads.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">No leads yet.</p>
            )}
            {recentLeads.map(lead => (
              <div key={lead.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-teal-700 font-semibold text-xs">{lead.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{lead.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{lead.propertyAddress}</p>
                </div>
                <span className={`
                  text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
                  ${lead.stage === 'won' ? 'bg-emerald-100 text-emerald-700' :
                    lead.stage === 'cold' ? 'bg-blue-100 text-blue-700' :
                    'bg-teal-100 text-teal-700'}
                `}>
                  {STAGE_LABELS[lead.stage]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent outreach */}
        <div className="bg-zinc-800 rounded-xl border border-zinc-700 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
            <h2 className="font-semibold text-zinc-100">Recent Outreach</h2>
            <button
              onClick={() => onNavigate('outreach')}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-zinc-700">
            {recentOutreach.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">No outreach yet.</p>
            )}
            {recentOutreach.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className="text-base mt-0.5">{OUTREACH_TYPE_ICONS[entry.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{entry.subject}</p>
                  <p className="text-xs text-zinc-400 truncate">{entry.contactName}</p>
                </div>
                <div className="text-xs text-zinc-500 flex-shrink-0">
                  {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Uplisting properties */}
      {uplistingConnected && uplistingProperties.length > 0 && (
        <div className="bg-zinc-800 rounded-xl border border-zinc-700 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
            <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
              <Wifi size={14} className="text-emerald-500" /> Live Properties
            </h2>
            <span className="text-xs text-zinc-500">{uplistingProperties.length} from Uplisting</span>
          </div>
          <div className="divide-y divide-zinc-700">
            {uplistingProperties.map(p => {
              const rev = estimateMonthlyRevenue(p.id, uplistingReservations);
              const occ = estimateOccupancy(p.id, uplistingReservations);
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <Home size={16} className="text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{p.name || p.address}</p>
                    <p className="text-xs text-zinc-500">
                      {[p.city, p.state].filter(Boolean).join(', ')} · {p.bedrooms}bd · {p.property_type}
                    </p>
                    {p.channels && p.channels.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {p.channels.map(c => (
                          <span key={c} className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {rev > 0 && <p className="text-sm font-semibold text-teal-700">${rev.toLocaleString()}/mo</p>}
                    {occ > 0 && <p className="text-xs text-zinc-500">{occ}% occ.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Portfolio overview */}
      <div className="bg-zinc-800 rounded-xl border border-zinc-700 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <h2 className="font-semibold text-zinc-100">Portfolio Overview</h2>
          <button
            onClick={() => onNavigate('owners')}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            View owners <ArrowRight size={13} />
          </button>
        </div>
        <div className="divide-y divide-zinc-700">
          {owners.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">No owners yet.</p>
          )}
          {owners.map(owner => {
            const rev = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
            const activeProps = owner.properties.filter(p => p.status === 'active');
            return (
              <button
                key={owner.id}
                onClick={() => onNavigate('owner-detail', owner.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-900 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-semibold text-sm">{owner.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">{owner.name}</p>
                  <p className="text-xs text-zinc-500">
                    {owner.properties.length} {owner.properties.length === 1 ? 'property' : 'properties'}
                    {activeProps.length > 0 && ` · ${activeProps.length} active`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-zinc-100">${rev.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">/mo</p>
                </div>
                <Home size={14} className="text-zinc-600 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Slack Feed */}
      {(slackToken && slackChannels.length > 0) && (
        <div className="bg-zinc-800 rounded-xl border border-zinc-700 shadow-sm">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-zinc-700 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Hash size={16} className="text-purple-500 flex-shrink-0" />
              <h2 className="font-semibold text-zinc-100">Slack Notifications</h2>
              {slackChannels.map(ch => (
                <span key={ch.id} className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">
                  #{ch.name || ch.id}
                </span>
              ))}
            </div>
            <span className="text-xs text-zinc-500 flex items-center gap-1.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Live · 60s
            </span>
          </div>

          {slackError ? (
            <div className="px-5 py-4 text-sm text-red-500">{slackError}</div>
          ) : slackLoading && slackMessages.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-500">Loading messages...</div>
          ) : slackMessages.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-zinc-500">No recent messages.</div>
          ) : (
            <div className="divide-y divide-zinc-700">
              {(slackExpanded ? slackMessages : slackMessages.slice(0, 5)).map(msg => {
                const body = msg.text || msg.attachmentText;
                if (!body) return null;
                return (
                  <div key={`${msg.channelName}-${msg.ts}`} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-purple-600">
                        {msg.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-200">{msg.username}</span>
                        {slackChannels.length > 1 && (
                          <span className="text-xs bg-purple-50 text-purple-500 px-1.5 py-0.5 rounded-full">
                            #{msg.channelName}
                          </span>
                        )}
                        <span className="text-xs text-zinc-500">{timeAgoShort(msg.ts)}</span>
                      </div>
                      <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap break-words">
                        {renderSlackText(body)}
                      </p>
                      {msg.text && msg.attachmentText && msg.text !== msg.attachmentText && (
                        <p className="text-xs text-zinc-500 mt-1 italic truncate">{renderSlackText(msg.attachmentText)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {slackMessages.length > 5 && (
                <button
                  onClick={() => setSlackExpanded(v => !v)}
                  className="w-full py-3 text-xs font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 transition-colors"
                >
                  {slackExpanded ? 'Show less' : `Show ${slackMessages.length - 5} more messages`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showWeekly && (
        <WeeklyCalendarModal
          events={allEvents}
          leads={leads}
          onOpenLeadDetail={onOpenLeadDetail}
          onClose={() => setShowWeekly(false)}
        />
      )}
    </div>
  );
}

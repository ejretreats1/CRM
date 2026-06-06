import { useState, useEffect } from 'react';
import {
  TrendingUp, Users, Home, Phone, ArrowRight, Wifi, WifiOff, X,
  RefreshCw, CalendarDays, ListTodo, CheckSquare, Square, MapPin, Plus, Hash, Video, CalendarRange, Bell, ScanSearch,
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
  onNavigate: (view: 'pipeline' | 'owners' | 'outreach' | 'owner-detail' | 'settings' | 'va-hub' | 'revenue-reports' | 'deal-scanner', extra?: string) => void;
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
  new:       'New Lead',
  contacted: 'Contacted',
  cold:      'Old / Cold Lead',
  won:       'Won',
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
  const [todoAssignee, setTodoAssignee] = useState<'ethan' | 'jess' | 'va'>('ethan');
  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackError, setSlackError] = useState('');
  const [slackExpanded, setSlackExpanded] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [showRevenueBreakdown, setShowRevenueBreakdown] = useState(false);

  // Fetch calendar events when calendarUrl is set
  useEffect(() => {
    if (!calendarUrl) { setCalEvents([]); return; }
    setCalLoading(true);
    fetch(`/api/uplisting-proxy?service=calendar&url=${encodeURIComponent(calendarUrl)}`)
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

  // Prefer live PMS data when any properties are synced, fall back to manual data
  const allProperties = owners.flatMap(o => o.properties);
  const revenueProperties = allProperties.filter(p => p.status !== 'inactive');
  const activeOwners = owners.filter(o => o.properties.some(p => p.status !== 'inactive'));

  const totalMonthlyRevenue = uplistingProperties.length > 0
    ? uplistingProperties.reduce((sum, p) => sum + estimateMonthlyRevenue(p.id, uplistingReservations), 0)
    : revenueProperties.reduce((sum, p) => sum + p.monthlyRevenue, 0);

  const activePropertyCount = uplistingProperties.length > 0
    ? uplistingProperties.filter(p => p.status !== 'inactive').length
    : revenueProperties.length;

  // Per-owner last-30-day revenue computed directly from reservation data
  const ownerRevenueBreakdown = owners
    .map(owner => {
      let rev = 0;
      for (const prop of owner.properties) {
        if (prop.status === 'inactive') continue;
        if (uplistingProperties.length > 0) {
          // Extract PMS listing ID from property ID (format: p_{timestamp}_{listingId})
          const parts = prop.id.split('_');
          const listingId = parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
          rev += listingId
            ? estimateMonthlyRevenue(listingId, uplistingReservations)
            : prop.monthlyRevenue;
        } else {
          rev += prop.monthlyRevenue;
        }
      }
      const activeCount = owner.properties.filter(p => p.status !== 'inactive').length;
      return { owner, rev, activeCount };
    })
    .filter(x => x.rev > 0 || x.activeCount > 0)
    .sort((a, b) => b.rev - a.rev);

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
      assignedTo: todoAssignee,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    });
    setNewTodoText('');
  }

  const stats: { label: string; value: string | number; sub: string; icon: React.ElementType; color: string; view?: Parameters<typeof onNavigate>[0]; onClick?: () => void }[] = [
    {
      label: 'Monthly Revenue',
      value: `$${totalMonthlyRevenue.toLocaleString()}`,
      sub: `last 30 days · ${activePropertyCount} properties`,
      icon: TrendingUp,
      color: 'bg-[#4a90d9]',
      onClick: () => setShowRevenueBreakdown(true),
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
    {
      label: 'Deal Scanner',
      value: 'Scan',
      sub: 'find & score STR deals',
      icon: ScanSearch,
      color: 'bg-amber-500',
      view: 'deal-scanner',
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

  const uncontactedNewLeads = leads.filter(l => l.stage === 'new').length;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="hidden sm:block text-[#b8d4f0] text-sm mt-0.5">Welcome back to E&amp;J Retreats CRM</p>
        </div>
        {uplistingConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[#5ce0a0] bg-[#0a2518] border border-[#0a4a2a] px-3 py-1.5 rounded-full">
              <Wifi size={12} /> Live from Uplisting
              {lastSync && (
                <span className="text-emerald-500 ml-1">
                  · {new Date(lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
            <button
              onClick={onSync}
              className="p-1.5 rounded-full text-[#3a5070] hover:text-[#4a90d9] hover:bg-[#162035] transition-colors"
              title="Sync now"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onNavigate('settings')}
            className="flex items-center gap-1.5 text-xs text-[#b8d4f0] bg-[#1e2d45] hover:bg-[#162035] hover:text-[#4a90d9] border border-[#1e2d45] hover:border-[#1e3a5a] px-3 py-1.5 rounded-full transition-colors"
          >
            <WifiOff size={12} /> Connect Uplisting
          </button>
        )}
      </div>

      {/* Uncontacted new leads alert */}
      {uncontactedNewLeads > 0 && (
        <button
          onClick={() => onNavigate('pipeline')}
          className="w-full flex items-center gap-3 bg-[#2a1a0a] border border-[#5a3010] rounded-xl px-4 py-3 hover:bg-[#2a1a0a] transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
            <Bell size={15} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-amber-900 flex-1">
            {uncontactedNewLeads === 1
              ? "1 new lead hasn't been contacted yet"
              : `${uncontactedNewLeads} new leads haven't been contacted yet`}
          </p>
          <ArrowRight size={14} className="text-[#d0954a] flex-shrink-0" />
        </button>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color, view, onClick }) => {
          const handler = onClick ?? (view ? () => onNavigate(view) : undefined);
          const inner = (
            <>
              <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
                <Icon size={18} className="text-white" />
              </div>
              <div className="text-lg font-bold text-white sm:text-2xl truncate">{value}</div>
              <div className="text-sm font-medium text-[#b8d4f0] mt-0.5">{label}</div>
              <div className="text-xs text-[#3a5070] mt-0.5 truncate">{sub}</div>
              {handler && <div className="text-xs text-[#4a90d9] font-medium mt-2 flex items-center gap-0.5">View <ArrowRight size={11} /></div>}
            </>
          );
          return handler ? (
            <button
              key={label}
              onClick={handler}
              className="bg-[#1a2335] rounded-xl p-4 border border-[#1e2d45] shadow-sm text-left hover:border-[#4a90d9] hover:shadow-md transition-all overflow-hidden"
            >
              {inner}
            </button>
          ) : (
            <div key={label} className="bg-[#1a2335] rounded-xl p-4 border border-[#1e2d45] shadow-sm overflow-hidden">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Calendar + Todos row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Google Calendar Widget */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <CalendarDays size={16} className="text-[#4a90d9]" /> Upcoming Calls/Meetings
            </h2>
            <div className="flex items-center gap-3">
              {allEvents.length > 0 && (
                <button
                  onClick={() => setShowWeekly(true)}
                  className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium"
                >
                  <CalendarRange size={13} /> View week
                </button>
              )}
              {!calendarUrl && (
                <button
                  onClick={() => onNavigate('settings')}
                  className="text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium"
                >
                  Connect Calendar
                </button>
              )}
            </div>
          </div>

          {!calendarUrl ? (
            <div className="px-5 py-8 text-center">
              <CalendarDays size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-[#3a5070]">No calendar connected.</p>
              <button
                onClick={() => onNavigate('settings')}
                className="mt-2 text-xs text-[#4a90d9] hover:underline"
              >
                Add your Google Calendar iCal URL in Settings
              </button>
            </div>
          ) : calLoading ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[#3a5070]">Loading events...</p>
            </div>
          ) : allEvents.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[#3a5070]">No upcoming events.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1e2d45]">
              {/* Next event — featured */}
              {nextEvent && (() => {
                const { day, time, isToday, isTomorrow } = formatEventDate(nextEvent.start);
                const eventDate = new Date(nextEvent.start.length === 10 ? nextEvent.start + 'T00:00:00' : nextEvent.start);
                return (
                  <div
                    className={`px-5 py-4 ${nextEvent.isCrmCall ? 'bg-[#162035]/50 cursor-pointer hover:bg-[#162035]/50' : 'bg-[#162035]/40'} transition-colors`}
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
                          ? 'bg-[#162035] text-[#6ab0f5] text-base'
                          : `font-bold ${isToday ? 'bg-[#4a90d9] text-white' : 'bg-[#162035] text-[#4a90d9]'}`
                      }`}>
                        {nextEvent.isCrmCall ? '📞' : eventDate.getDate()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white text-sm truncate">{nextEvent.title}</p>
                          {(isToday || isTomorrow) && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              isToday ? 'bg-[#162035] text-[#4a90d9]' : 'bg-[#2a1a0a] text-[#d0954a]'
                            }`}>
                              {isToday ? 'Today' : 'Tomorrow'}
                            </span>
                          )}
                          {nextEvent.isCrmCall && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-[#162035] text-[#6ab0f5]">
                              Scheduled Call
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#b8d4f0] mt-0.5">{day} · {time}</p>
                        {nextEvent.isCrmCall && nextEvent.location && (
                          <a href={`tel:${nextEvent.location}`} className="text-xs text-[#4a90d9] mt-0.5 flex items-center gap-1 hover:underline">
                            <Phone size={10} /> {nextEvent.location}
                          </a>
                        )}
                        {nextEvent.meetLink && (
                          <a href={nextEvent.meetLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-[#6ab0f5] mt-0.5 flex items-center gap-1 hover:underline font-medium">
                            <Video size={10} /> Join Meeting
                          </a>
                        )}
                        {!nextEvent.isCrmCall && !nextEvent.meetLink && nextEvent.location && (
                          <p className="text-xs text-[#3a5070] mt-0.5 flex items-center gap-1">
                            <MapPin size={10} /> {nextEvent.location}
                          </p>
                        )}
                        {!nextEvent.isCrmCall && nextEvent.description && (
                          <p className="text-xs text-[#3a5070] mt-1 line-clamp-2 leading-relaxed">{nextEvent.description}</p>
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
                    className={`flex items-center gap-3 px-5 py-3 ${event.isCrmCall ? 'cursor-pointer hover:bg-[#1e2d45]' : ''} transition-colors`}
                    onClick={() => {
                      if (event.isCrmCall && event.leadId) {
                        const lead = leads.find(l => l.id === event.leadId);
                        if (lead) onOpenLeadDetail(lead);
                      }
                    }}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs ${
                      event.isCrmCall ? 'bg-[#162035] text-blue-500 text-sm' : 'bg-[#1e2d45] text-[#b8d4f0] font-bold'
                    }`}>
                      {event.isCrmCall ? '📞' : eventDate.getDate()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#b8d4f0] truncate font-medium">{event.title}</p>
                      <p className="text-xs text-[#3a5070]">{day} · {time}</p>
                    </div>
                    {event.meetLink && (
                      <a
                        href={event.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-[#6ab0f5] bg-[#162035] hover:bg-[#162035] px-2 py-1 rounded-full flex-shrink-0 font-medium transition-colors"
                      >
                        <Video size={10} /> Join
                      </a>
                    )}
                    {event.isCrmCall && !event.meetLink && (
                      <span className="text-xs text-blue-500 bg-[#162035] px-1.5 py-0.5 rounded-full flex-shrink-0">Call</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* To-Do Widget — click anywhere to open VA Hub */}
        {(() => {
          const ASSIGNEE_COLORS = { ethan: 'bg-blue-500', jess: 'bg-purple-500', va: 'bg-teal-500' };
          const ASSIGNEE_LABELS = { ethan: 'Ethan', jess: 'Jess', va: 'VA' };
          const ASSIGNEE_CYCLE: Array<'ethan' | 'jess' | 'va'> = ['ethan', 'jess', 'va'];
          return (
            <div
              className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm cursor-pointer hover:border-[#4a90d9] hover:shadow-md transition-all group"
              onClick={() => onNavigate('va-hub')}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <ListTodo size={16} className="text-[#4a90d9]" /> Team To-Do
                </h2>
                <span className="flex items-center gap-1 text-xs text-[#4a90d9] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Open VA Hub <ArrowRight size={13} />
                </span>
              </div>

              {/* Quick add — stop propagation so it doesn't navigate */}
              <div className="px-4 py-2.5 border-b border-[#1e2d45]" onClick={e => e.stopPropagation()}>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTodoAssignee(a => ASSIGNEE_CYCLE[(ASSIGNEE_CYCLE.indexOf(a) + 1) % 3])}
                    className={`flex-shrink-0 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${ASSIGNEE_COLORS[todoAssignee]}`}
                  >
                    {ASSIGNEE_LABELS[todoAssignee]}
                  </button>
                  <input
                    value={newTodoText}
                    onChange={e => setNewTodoText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddTodo(); }}
                    placeholder="Quick add task..."
                    className="flex-1 border border-[#1e2d45] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                  />
                  <button
                    onClick={handleAddTodo}
                    disabled={!newTodoText.trim()}
                    className="bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#1e2d45]">
                {incompleteTodos.length === 0 && (
                  <div className="px-5 py-8 text-center">
                    <CheckSquare size={24} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-[#3a5070]">All caught up! No pending tasks.</p>
                  </div>
                )}
                {incompleteTodos.map(todo => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[#1e2d45] transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onToggleTodo({ ...todo, completed: true, updatedAt: new Date().toISOString() })}
                      className="flex-shrink-0 text-[#3a5070] hover:text-[#4a90d9] transition-colors"
                    >
                      <Square size={15} />
                    </button>
                    <span className="flex-1 text-sm text-[#b8d4f0] truncate">{todo.text}</span>
                    {todo.assignedTo && (
                      <span className={`flex-shrink-0 text-white text-xs font-semibold px-1.5 py-0.5 rounded-full ${ASSIGNEE_COLORS[todo.assignedTo]}`}>
                        {ASSIGNEE_LABELS[todo.assignedTo]}
                      </span>
                    )}
                  </div>
                ))}
                {todos.filter(t => !t.completed).length > 6 && (
                  <div className="px-5 py-2.5 text-center text-xs text-[#3a5070]">
                    +{todos.filter(t => !t.completed).length - 6} more in VA Hub
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Recent leads + outreach row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent leads */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
            <h2 className="font-semibold text-white">Recent Leads</h2>
            <button
              onClick={() => onNavigate('pipeline')}
              className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium"
            >
              View pipeline <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-[#1e2d45]">
            {recentLeads.length === 0 && (
              <p className="text-sm text-[#3a5070] text-center py-8">No leads yet.</p>
            )}
            {recentLeads.map(lead => (
              <div key={lead.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-[#162035] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#4a90d9] font-semibold text-xs">{lead.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                  <p className="text-xs text-[#3a5070] truncate">{lead.propertyAddress}</p>
                </div>
                <span className={`
                  text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
                  ${lead.stage === 'won' ? 'bg-[#0a2518] text-[#4ab57a]' :
                    lead.stage === 'cold' ? 'bg-[#162035] text-[#6ab0f5]' :
                    lead.stage === 'contacted' ? 'bg-[#1a1535] text-[#d07af5]' :
                    'bg-[#162035] text-[#4a90d9]'}
                `}>
                  {STAGE_LABELS[lead.stage]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent outreach */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
            <h2 className="font-semibold text-white">Recent Outreach</h2>
            <button
              onClick={() => onNavigate('outreach')}
              className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium"
            >
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-[#1e2d45]">
            {recentOutreach.length === 0 && (
              <p className="text-sm text-[#3a5070] text-center py-8">No outreach yet.</p>
            )}
            {recentOutreach.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className="text-base mt-0.5">{OUTREACH_TYPE_ICONS[entry.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{entry.subject}</p>
                  <p className="text-xs text-[#b8d4f0] truncate">{entry.contactName}</p>
                </div>
                <div className="text-xs text-[#3a5070] flex-shrink-0">
                  {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Uplisting properties */}
      {uplistingConnected && uplistingProperties.length > 0 && (
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Wifi size={14} className="text-emerald-500" /> Live Properties
            </h2>
            <span className="text-xs text-[#3a5070]">{uplistingProperties.length} from Uplisting</span>
          </div>
          <div className="divide-y divide-[#1e2d45]">
            {uplistingProperties.map(p => {
              const rev = estimateMonthlyRevenue(p.id, uplistingReservations);
              const occ = estimateOccupancy(p.id, uplistingReservations);
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-[#162035] flex items-center justify-center flex-shrink-0">
                    <Home size={16} className="text-[#4a90d9]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.name || p.address}</p>
                    <p className="text-xs text-[#3a5070]">
                      {[p.city, p.state].filter(Boolean).join(', ')} · {p.bedrooms}bd · {p.property_type}
                    </p>
                    {p.channels && p.channels.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {p.channels.map(c => (
                          <span key={c} className="text-xs bg-[#162035] text-blue-500 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {rev > 0 && <p className="text-sm font-semibold text-[#4a90d9]">${rev.toLocaleString()}/mo</p>}
                    {occ > 0 && <p className="text-xs text-[#3a5070]">{occ}% occ.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Portfolio overview */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
          <h2 className="font-semibold text-white">Portfolio Overview</h2>
          <button
            onClick={() => onNavigate('owners')}
            className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium"
          >
            View owners <ArrowRight size={13} />
          </button>
        </div>
        <div className="divide-y divide-[#1e2d45]">
          {owners.length === 0 && (
            <p className="text-sm text-[#3a5070] text-center py-8">No owners yet.</p>
          )}
          {owners.map(owner => {
            const rev = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
            const activeProps = owner.properties.filter(p => p.status === 'active');
            return (
              <button
                key={owner.id}
                onClick={() => onNavigate('owner-detail', owner.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#1e2d45] text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-[#4a90d9] flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-semibold text-sm">{owner.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{owner.name}</p>
                  <p className="text-xs text-[#3a5070] truncate">
                    {owner.properties.length} {owner.properties.length === 1 ? 'property' : 'properties'}
                    {activeProps.length > 0 && ` · ${activeProps.length} active`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-white">${rev.toLocaleString()}</p>
                  <p className="text-xs text-[#3a5070]">/mo</p>
                </div>
                <Home size={14} className="text-[#3a5070] flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Slack Feed */}
      {(slackToken && slackChannels.length > 0) && (
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] shadow-sm">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-[#1e2d45] flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Hash size={16} className="text-[#d07af5] flex-shrink-0" />
              <h2 className="font-semibold text-white">Slack Notifications</h2>
              {slackChannels.map(ch => (
                <span key={ch.id} className="text-xs bg-[#2a1a35] text-[#d07af5] px-1.5 py-0.5 rounded-full font-medium">
                  #{ch.name || ch.id}
                </span>
              ))}
            </div>
            <span className="text-xs text-[#3a5070] flex items-center gap-1.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Live · 60s
            </span>
          </div>

          {slackError ? (
            <div className="px-5 py-4 text-sm text-[#e05c5c]">{slackError}</div>
          ) : slackLoading && slackMessages.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#3a5070]">Loading messages...</div>
          ) : slackMessages.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#3a5070]">No recent messages.</div>
          ) : (
            <div className="divide-y divide-[#1e2d45]">
              {(slackExpanded ? slackMessages : slackMessages.slice(0, 5)).map(msg => {
                const body = msg.text || msg.attachmentText;
                if (!body) return null;
                return (
                  <div key={`${msg.channelName}-${msg.ts}`} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-7 h-7 rounded-lg bg-[#2a1a35] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-[#d07af5]">
                        {msg.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#b8d4f0]">{msg.username}</span>
                        {slackChannels.length > 1 && (
                          <span className="text-xs bg-[#2a1a35] text-[#d07af5] px-1.5 py-0.5 rounded-full">
                            #{msg.channelName}
                          </span>
                        )}
                        <span className="text-xs text-[#3a5070]">{timeAgoShort(msg.ts)}</span>
                      </div>
                      <p className="text-sm text-[#b8d4f0] mt-0.5 whitespace-pre-wrap break-words">
                        {renderSlackText(body)}
                      </p>
                      {msg.text && msg.attachmentText && msg.text !== msg.attachmentText && (
                        <p className="text-xs text-[#3a5070] mt-1 italic truncate">{renderSlackText(msg.attachmentText)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {slackMessages.length > 5 && (
                <button
                  onClick={() => setSlackExpanded(v => !v)}
                  className="w-full py-3 text-xs font-medium text-[#d07af5] hover:text-purple-700 hover:bg-[#2a1a35] transition-colors"
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

      {showRevenueBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowRevenueBreakdown(false)}>
          <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
              <div>
                <h2 className="font-bold text-white">Revenue Breakdown</h2>
                <p className="text-xs text-[#3a5070] mt-0.5">Last 30 days per client</p>
              </div>
              <button onClick={() => setShowRevenueBreakdown(false)} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors p-1">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {ownerRevenueBreakdown.length === 0 ? (
                <p className="text-sm text-[#3a5070] text-center py-10">No revenue data yet.</p>
              ) : ownerRevenueBreakdown.map(({ owner, rev, activeCount }) => (
                <div key={owner.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-[#4a90d9] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-sm">{owner.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{owner.name}</p>
                    <p className="text-xs text-[#3a5070]">
                      {activeCount} active {activeCount === 1 ? 'property' : 'properties'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-[#4a90d9]">${rev.toLocaleString()}</p>
                    <p className="text-xs text-[#3a5070]">last 30d</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3.5 border-t border-[#1e2d45] flex items-center justify-between bg-[#1e2d45] rounded-b-2xl">
              <span className="text-xs font-medium text-[#b8d4f0]">Portfolio total</span>
              <span className="text-sm font-bold text-white">${totalMonthlyRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

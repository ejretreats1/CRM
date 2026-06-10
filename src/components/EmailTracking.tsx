import { useState, useEffect, useMemo } from 'react';
import { Mail, RefreshCw, MailOpen, MousePointer, AlertCircle, CheckCircle, Clock, Flame, Plus, Trash2, ShieldCheck, Info } from 'lucide-react';
import { fetchEmailLogs } from '../services/emailTracking';
import type { EmailLog, EmailType, EmailStatus } from '../services/emailTracking';

// ── Inbox Warm-up ────────────────────────────────────────────────────────────

interface WarmupEntry {
  id: string;
  email: string;
  name: string;
  startDate: string;
  status: 'warming' | 'ready' | 'paused';
}

const WARMUP_KEY = 'ej_warmup_addresses';

const SCHEDULE = [
  { label: 'Week 1', days: [1,7],   range: '10–15 / day' },
  { label: 'Week 2', days: [8,14],  range: '20–30 / day' },
  { label: 'Week 3', days: [15,21], range: '40–60 / day' },
  { label: 'Week 4', days: [22,28], range: '75–100 / day' },
  { label: 'Week 5', days: [29,35], range: '100–150 / day' },
  { label: 'Week 6', days: [36,42], range: '150–200 / day' },
];

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function targetForDay(d: number) {
  if (d <= 7)  return '10–15 emails / day';
  if (d <= 14) return '20–30 emails / day';
  if (d <= 21) return '40–60 emails / day';
  if (d <= 28) return '75–100 emails / day';
  if (d <= 35) return '100–150 emails / day';
  if (d <= 42) return '150–200 emails / day';
  return '200+ emails / day';
}

const TIPS = [
  { icon: ShieldCheck, text: 'Set up SPF, DKIM, and DMARC DNS records for your sending domain.' },
  { icon: Info, text: 'Use a consistent "From" name and reply-to address in every email.' },
  { icon: Info, text: 'Avoid spam trigger words like "FREE", "GUARANTEED", or excessive caps.' },
  { icon: Info, text: 'Remove bounced addresses immediately — a bounce rate over 2% hurts sender reputation.' },
  { icon: Info, text: 'Send plain-text or simple HTML emails during warm-up; save heavy templates for later.' },
  { icon: Info, text: 'Engage your list: ask recipients to reply or add you to contacts in early sends.' },
];

function InboxWarmup() {
  const [entries, setEntries] = useState<WarmupEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(WARMUP_KEY) ?? '[]'); } catch { return []; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState(() => new Date().toISOString().slice(0, 10));

  function save(next: WarmupEntry[]) {
    setEntries(next);
    localStorage.setItem(WARMUP_KEY, JSON.stringify(next));
  }

  function add() {
    if (!newEmail.trim()) return;
    const days = daysSince(newStart);
    save([...entries, {
      id: `wu_${Date.now()}`,
      email: newEmail.trim(),
      name: newName.trim(),
      startDate: newStart,
      status: days >= 42 ? 'ready' : 'warming',
    }]);
    setNewEmail(''); setNewName(''); setShowAdd(false);
  }

  function remove(id: string) { save(entries.filter(e => e.id !== id)); }

  function togglePause(id: string) {
    save(entries.map(e => {
      if (e.id !== id) return e;
      const days = daysSince(e.startDate);
      if (e.status === 'paused') return { ...e, status: days >= 42 ? 'ready' : 'warming' };
      if (e.status === 'warming') return { ...e, status: 'paused' };
      return e;
    }));
  }

  return (
    <div className="space-y-6">

      {/* Header + Add */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Inbox Warm-up</h2>
          <p className="text-xs text-[#b8d4f0] mt-0.5">Gradually ramp send volume so emails land in inbox, not spam.</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 text-sm bg-[#4a90d9] hover:bg-[#3a80c9] text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} /> Add Email
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-[#b8d4f0]">Add email address to warm up</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#b8d4f0] mb-1 block">Email address *</label>
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="you@yourdomain.com"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] mb-1 block">Display name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="E&J Retreats"
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] mb-1 block">Warm-up start date</label>
              <input
                type="date"
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm px-4 py-1.5 rounded-lg transition-colors">Add</button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-[#b8d4f0] hover:text-[#b8d4f0] px-4 py-1.5 rounded-lg hover:bg-[#1e2d45] transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Entry cards */}
      {entries.length === 0 && !showAdd && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl py-12 text-center">
          <Flame size={28} className="text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-[#b8d4f0]">No addresses being warmed up yet.</p>
          <p className="text-xs text-[#3a5070] mt-1">Add your sending address to track its warm-up progress.</p>
        </div>
      )}
      {entries.map(entry => {
        const days = daysSince(entry.startDate);
        const week = Math.min(Math.ceil(days / 7), 6);
        const pct = Math.min(Math.round((days / 42) * 100), 100);
        const isReady = entry.status === 'ready' || days >= 42;
        const isPaused = entry.status === 'paused';
        const currentSchedule = SCHEDULE[Math.min(week - 1, 5)];
        return (
          <div key={entry.id} className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white truncate">{entry.email}</p>
                  {entry.name && <span className="text-xs text-[#3a5070]">{entry.name}</span>}
                  {isReady ? (
                    <span className="text-xs font-medium bg-[#0a2518] text-[#4ab57a] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle size={10} /> Inbox Ready
                    </span>
                  ) : isPaused ? (
                    <span className="text-xs font-medium bg-[#1e2d45] text-[#b8d4f0] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock size={10} /> Paused
                    </span>
                  ) : (
                    <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Flame size={10} /> Warming Up
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#3a5070] mt-0.5">
                  Started {new Date(entry.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {isReady ? '6+ weeks complete' : `Day ${days} · Week ${week} of 6`}
                </p>

                {/* Progress bar */}
                <div className="mt-2.5 mb-1.5">
                  <div className="flex justify-between text-xs text-[#3a5070] mb-1">
                    <span>Warm-up progress</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-[#1e2d45] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isReady ? 'bg-emerald-500' : 'bg-orange-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {!isReady && !isPaused && (
                  <p className="text-xs font-medium text-[#b8d4f0] mt-1">
                    Today&apos;s target: <span className="text-[#4a90d9]">{targetForDay(days)}</span>
                    {currentSchedule && (
                      <span className="text-[#3a5070] font-normal ml-1">({currentSchedule.label} of warm-up)</span>
                    )}
                  </p>
                )}
                {isReady && (
                  <p className="text-xs text-[#4ab57a] mt-1 font-medium">
                    This address is warmed up. Send at full volume with confidence.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!isReady && (
                  <button
                    onClick={() => togglePause(entry.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e2d45] transition-colors"
                  >
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                )}
                <button
                  onClick={() => remove(entry.id)}
                  className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Schedule reference */}
      <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4">
        <p className="text-sm font-semibold text-white mb-3">Warm-up Schedule</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SCHEDULE.map((s, i) => (
            <div key={s.label} className={`rounded-lg px-3 py-2 ${i === 5 ? 'bg-[#0a2518] border border-[#0a4a2a]' : 'bg-[#1e2d45] border border-[#1e2d45]'}`}>
              <p className={`text-xs font-semibold ${i === 5 ? 'text-[#4ab57a]' : 'text-[#b8d4f0]'}`}>{s.label}</p>
              <p className={`text-xs mt-0.5 ${i === 5 ? 'text-[#5ce0a0]' : 'text-[#b8d4f0]'}`}>{s.range}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#3a5070] mt-3">After 6 weeks your domain reputation is established. Continue sending consistently to maintain it.</p>
      </div>

      {/* Tips */}
      <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4">
        <p className="text-sm font-semibold text-white mb-3">Deliverability Tips</p>
        <div className="space-y-2">
          {TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <tip.icon size={14} className="text-[#4a90d9] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#b8d4f0] leading-relaxed">{tip.text}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

const TYPE_LABELS: Record<EmailType, string> = {
  signing:     'Contract Signing',
  agreement:   'Rental Agreement',
  newsletter:  'Newsletter',
  quarterly:   'Quarterly Report',
  report:      'Revenue Report',
  outreach:    'Lead Outreach',
  other:       'Other',
};

const TYPE_COLORS: Record<EmailType, string> = {
  signing:     'bg-[#162035] text-[#4a90d9]',
  agreement:   'bg-[#1a1a35] text-[#d07af5]',
  newsletter:  'bg-[#1a1535] text-[#d07af5]',
  quarterly:   'bg-[#2a1a0a] text-[#d0954a]',
  report:      'bg-[#162035] text-[#6ab0f5]',
  outreach:    'bg-[#0a2518] text-[#4ab57a]',
  other:       'bg-[#1e2d45] text-[#b8d4f0]',
};

function StatusBadge({ log }: { log: EmailLog }) {
  const status = effectiveStatus(log);
  if (status === 'bounced' || status === 'complained') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-[#e05c5c] bg-[#2a0e0e] px-2 py-0.5 rounded-full">
        <AlertCircle size={10} /> Bounced
      </span>
    );
  }
  if (status === 'clicked') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-[#4ab57a] bg-[#0a2518] px-2 py-0.5 rounded-full">
        <MousePointer size={10} /> Clicked {log.clickCount > 1 ? `×${log.clickCount}` : ''}
      </span>
    );
  }
  if (status === 'opened') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-[#4a90d9] bg-[#162035] px-2 py-0.5 rounded-full">
        <MailOpen size={10} /> Opened {log.openCount > 1 ? `×${log.openCount}` : ''}
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-[#6ab0f5] bg-[#162035] px-2 py-0.5 rounded-full">
        <CheckCircle size={10} /> Delivered
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-[#b8d4f0] bg-[#1e2d45] px-2 py-0.5 rounded-full">
      <Clock size={10} /> Sent
    </span>
  );
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const STATUS_RANK: Record<EmailStatus, number> = {
  complained: 5, bounced: 4, clicked: 3, opened: 2, delivered: 1, sent: 0,
};

// Derive the true status from whichever is higher: the status column OR the
// raw open/click counts. The webhook sometimes updates counts but fails to
// promote status (race condition or rank guard misfiring).
function effectiveStatus(log: EmailLog): EmailStatus {
  if (log.status === 'bounced' || log.status === 'complained') return log.status;
  if (log.clickCount > 0 && STATUS_RANK[log.status] < STATUS_RANK.clicked) return 'clicked';
  if (log.openCount  > 0 && STATUS_RANK[log.status] < STATUS_RANK.opened)  return 'opened';
  return log.status;
}

export default function EmailTracking() {
  const [tab, setTab] = useState<'logs' | 'warmup'>('logs');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<EmailType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<EmailStatus | 'all'>('all');

  async function load(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await fetchEmailLogs(1000);
      setLogs(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (typeFilter !== 'all' && l.emailType !== typeFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      return true;
    });
  }, [logs, typeFilter, statusFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const total   = logs.length;
    const opened  = logs.filter(l => { const s = effectiveStatus(l); return s !== 'bounced' && s !== 'complained' && STATUS_RANK[s] >= STATUS_RANK.opened; }).length;
    const clicked = logs.filter(l => { const s = effectiveStatus(l); return s !== 'bounced' && s !== 'complained' && STATUS_RANK[s] >= STATUS_RANK.clicked; }).length;
    const bounced = logs.filter(l => l.status === 'bounced' || l.status === 'complained').length;
    const openRate   = total ? Math.round((opened  / total) * 100) : 0;
    const clickRate  = total ? Math.round((clicked / total) * 100) : 0;
    return { total, opened, clicked, bounced, openRate, clickRate };
  }, [logs]);

  const emailTypes = useMemo(() =>
    [...new Set(logs.map(l => l.emailType))] as EmailType[],
    [logs]
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Email Tracking</h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">Open rates, click data, and inbox warm-up</p>
        </div>
        {tab === 'logs' && (
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-[#b8d4f0] hover:text-[#b8d4f0] border border-[#1e2d45] bg-[#1a2335] px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1e2d45] p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setTab('logs')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${tab === 'logs' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#b8d4f0] hover:text-[#b8d4f0]'}`}
        >
          <Mail size={14} /> Email Logs
        </button>
        <button
          onClick={() => setTab('warmup')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${tab === 'warmup' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#b8d4f0] hover:text-[#b8d4f0]'}`}
        >
          <Flame size={14} /> Inbox Warm-up
        </button>
      </div>

      {tab === 'warmup' && <InboxWarmup />}
      {tab === 'logs' && (<>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Emails Sent',  value: stats.total,     sub: 'total logged',          color: 'text-white' },
          { label: 'Open Rate',    value: `${stats.openRate}%`,  sub: `${stats.opened} opened`,  color: 'text-[#4a90d9]' },
          { label: 'Click Rate',   value: `${stats.clickRate}%`, sub: `${stats.clicked} clicked`, color: 'text-[#4ab57a]' },
          { label: 'Bounced',      value: stats.bounced,   sub: 'delivery failures',     color: 'text-[#e05c5c]' },
        ].map(s => (
          <div key={s.label} className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4">
            <p className="text-xs text-[#3a5070] mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[#3a5070] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as EmailType | 'all')}
          className="text-sm border border-[#1e2d45] rounded-lg px-3 py-1.5 text-[#b8d4f0] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] bg-[#1a2335]"
        >
          <option value="all">All Types</option>
          {emailTypes.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as EmailStatus | 'all')}
          className="text-sm border border-[#1e2d45] rounded-lg px-3 py-1.5 text-[#b8d4f0] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] bg-[#1a2335]"
        >
          <option value="all">All Statuses</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="delivered">Delivered (not opened)</option>
          <option value="sent">Sent (pending)</option>
          <option value="bounced">Bounced</option>
        </select>
        <span className="text-sm text-[#3a5070] self-center ml-1">{filtered.length} emails</span>
      </div>

      {/* Table */}
      <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#3a5070] text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Mail size={32} className="text-[#3a5070] mx-auto mb-3" />
            <p className="text-[#b8d4f0] font-medium">No emails logged yet</p>
            <p className="text-sm text-[#3a5070] mt-1">Emails will appear here after they're sent from the CRM</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            {filtered.map(log => (
              <div key={log.id} className="px-5 py-3 hover:bg-[#1e2d45] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[log.emailType]}`}>
                        {TYPE_LABELS[log.emailType]}
                      </span>
                      <span className="text-sm font-medium text-white truncate">{log.recipientEmail}</span>
                      {log.recipientName && (
                        <span className="text-xs text-[#3a5070]">({log.recipientName})</span>
                      )}
                    </div>
                    {log.subject && (
                      <p className="text-xs text-[#b8d4f0] mt-0.5 truncate">{log.subject}</p>
                    )}
                    <p className="text-xs text-[#3a5070] mt-0.5">{fmtDate(log.sentAt)}</p>
                    {log.lastClickedUrl && (
                      <p className="text-xs text-[#4a90d9] mt-0.5 truncate" title={log.lastClickedUrl}>
                        Clicked: {log.lastClickedUrl}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <StatusBadge log={log} />
                    {log.openedAt && log.status !== 'bounced' && (
                      <p className="text-xs text-[#3a5070] mt-1 text-right">{fmtDate(log.openedAt)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 p-4 bg-[#2a1a0a] border border-[#5a3010] rounded-xl">
        <p className="text-xs text-[#f5c55c] font-medium mb-1">Setup required: Resend webhook</p>
        <p className="text-xs text-[#d0954a]">
          To see open/click data, go to your <strong>Resend dashboard → Webhooks</strong> and add a webhook pointing to{' '}
          <code className="bg-[#2a1a0a] px-1 rounded">{window.location.origin}/api/documents</code>{' '}
          with events: <code className="bg-[#2a1a0a] px-1 rounded">email.opened</code>,{' '}
          <code className="bg-[#2a1a0a] px-1 rounded">email.clicked</code>,{' '}
          <code className="bg-[#2a1a0a] px-1 rounded">email.delivered</code>,{' '}
          <code className="bg-[#2a1a0a] px-1 rounded">email.bounced</code>.
        </p>
      </div>
      </>)}
    </div>
  );
}

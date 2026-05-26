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
          <h2 className="text-base font-semibold text-slate-900">Inbox Warm-up</h2>
          <p className="text-xs text-slate-500 mt-0.5">Gradually ramp send volume so emails land in inbox, not spam.</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} /> Add Email
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-slate-700">Add email address to warm up</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Email address *</label>
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="you@yourdomain.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Display name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="E&J Retreats"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Warm-up start date</label>
              <input
                type="date"
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="bg-teal-600 hover:bg-teal-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors">Add</button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Entry cards */}
      {entries.length === 0 && !showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl py-12 text-center">
          <Flame size={28} className="text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-500">No addresses being warmed up yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add your sending address to track its warm-up progress.</p>
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
          <div key={entry.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900 truncate">{entry.email}</p>
                  {entry.name && <span className="text-xs text-slate-400">{entry.name}</span>}
                  {isReady ? (
                    <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle size={10} /> Inbox Ready
                    </span>
                  ) : isPaused ? (
                    <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock size={10} /> Paused
                    </span>
                  ) : (
                    <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Flame size={10} /> Warming Up
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Started {new Date(entry.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {isReady ? '6+ weeks complete' : `Day ${days} · Week ${week} of 6`}
                </p>

                {/* Progress bar */}
                <div className="mt-2.5 mb-1.5">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Warm-up progress</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isReady ? 'bg-emerald-500' : 'bg-orange-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {!isReady && !isPaused && (
                  <p className="text-xs font-medium text-slate-700 mt-1">
                    Today&apos;s target: <span className="text-teal-700">{targetForDay(days)}</span>
                    {currentSchedule && (
                      <span className="text-slate-400 font-normal ml-1">({currentSchedule.label} of warm-up)</span>
                    )}
                  </p>
                )}
                {isReady && (
                  <p className="text-xs text-emerald-700 mt-1 font-medium">
                    This address is warmed up. Send at full volume with confidence.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!isReady && (
                  <button
                    onClick={() => togglePause(entry.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                )}
                <button
                  onClick={() => remove(entry.id)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Schedule reference */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-900 mb-3">Warm-up Schedule</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SCHEDULE.map((s, i) => (
            <div key={s.label} className={`rounded-lg px-3 py-2 ${i === 5 ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100'}`}>
              <p className={`text-xs font-semibold ${i === 5 ? 'text-emerald-700' : 'text-slate-700'}`}>{s.label}</p>
              <p className={`text-xs mt-0.5 ${i === 5 ? 'text-emerald-600' : 'text-slate-500'}`}>{s.range}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">After 6 weeks your domain reputation is established. Continue sending consistently to maintain it.</p>
      </div>

      {/* Tips */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-900 mb-3">Deliverability Tips</p>
        <div className="space-y-2">
          {TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <tip.icon size={14} className="text-teal-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">{tip.text}</p>
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
  other:       'Other',
};

const TYPE_COLORS: Record<EmailType, string> = {
  signing:     'bg-teal-100 text-teal-700',
  agreement:   'bg-indigo-100 text-indigo-700',
  newsletter:  'bg-violet-100 text-violet-700',
  quarterly:   'bg-amber-100 text-amber-700',
  report:      'bg-blue-100 text-blue-700',
  other:       'bg-slate-100 text-slate-600',
};

function StatusBadge({ log }: { log: EmailLog }) {
  const status = effectiveStatus(log);
  if (status === 'bounced' || status === 'complained') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        <AlertCircle size={10} /> Bounced
      </span>
    );
  }
  if (status === 'clicked') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
        <MousePointer size={10} /> Clicked {log.clickCount > 1 ? `×${log.clickCount}` : ''}
      </span>
    );
  }
  if (status === 'opened') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
        <MailOpen size={10} /> Opened {log.openCount > 1 ? `×${log.openCount}` : ''}
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
        <CheckCircle size={10} /> Delivered
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
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
          <h1 className="text-xl font-bold text-slate-900">Email Tracking</h1>
          <p className="text-sm text-slate-500 mt-0.5">Open rates, click data, and inbox warm-up</p>
        </div>
        {tab === 'logs' && (
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setTab('logs')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${tab === 'logs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Mail size={14} /> Email Logs
        </button>
        <button
          onClick={() => setTab('warmup')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${tab === 'warmup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Flame size={14} /> Inbox Warm-up
        </button>
      </div>

      {tab === 'warmup' && <InboxWarmup />}
      {tab === 'logs' && (<>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Emails Sent',  value: stats.total,     sub: 'total logged',          color: 'text-slate-800' },
          { label: 'Open Rate',    value: `${stats.openRate}%`,  sub: `${stats.opened} opened`,  color: 'text-teal-700' },
          { label: 'Click Rate',   value: `${stats.clickRate}%`, sub: `${stats.clicked} clicked`, color: 'text-emerald-700' },
          { label: 'Bounced',      value: stats.bounced,   sub: 'delivery failures',     color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as EmailType | 'all')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        >
          <option value="all">All Types</option>
          {emailTypes.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as EmailStatus | 'all')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="delivered">Delivered (not opened)</option>
          <option value="sent">Sent (pending)</option>
          <option value="bounced">Bounced</option>
        </select>
        <span className="text-sm text-slate-400 self-center ml-1">{filtered.length} emails</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Mail size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No emails logged yet</p>
            <p className="text-sm text-slate-400 mt-1">Emails will appear here after they're sent from the CRM</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight: '60vh' }}>
            {filtered.map(log => (
              <div key={log.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[log.emailType]}`}>
                        {TYPE_LABELS[log.emailType]}
                      </span>
                      <span className="text-sm font-medium text-slate-800 truncate">{log.recipientEmail}</span>
                      {log.recipientName && (
                        <span className="text-xs text-slate-400">({log.recipientName})</span>
                      )}
                    </div>
                    {log.subject && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{log.subject}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDate(log.sentAt)}</p>
                    {log.lastClickedUrl && (
                      <p className="text-xs text-teal-600 mt-0.5 truncate" title={log.lastClickedUrl}>
                        Clicked: {log.lastClickedUrl}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <StatusBadge log={log} />
                    {log.openedAt && log.status !== 'bounced' && (
                      <p className="text-xs text-slate-400 mt-1 text-right">{fmtDate(log.openedAt)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-xs text-amber-800 font-medium mb-1">Setup required: Resend webhook</p>
        <p className="text-xs text-amber-700">
          To see open/click data, go to your <strong>Resend dashboard → Webhooks</strong> and add a webhook pointing to{' '}
          <code className="bg-amber-100 px-1 rounded">{window.location.origin}/api/documents</code>{' '}
          with events: <code className="bg-amber-100 px-1 rounded">email.opened</code>,{' '}
          <code className="bg-amber-100 px-1 rounded">email.clicked</code>,{' '}
          <code className="bg-amber-100 px-1 rounded">email.delivered</code>,{' '}
          <code className="bg-amber-100 px-1 rounded">email.bounced</code>.
        </p>
      </div>
      </>)}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { Mail, RefreshCw, MailOpen, MousePointer, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { fetchEmailLogs } from '../services/emailTracking';
import type { EmailLog, EmailType, EmailStatus } from '../services/emailTracking';

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
  if (log.status === 'bounced' || log.status === 'complained') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        <AlertCircle size={10} /> Bounced
      </span>
    );
  }
  if (log.status === 'clicked') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
        <MousePointer size={10} /> Clicked {log.clickCount > 1 ? `×${log.clickCount}` : ''}
      </span>
    );
  }
  if (log.status === 'opened') {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
        <MailOpen size={10} /> Opened {log.openCount > 1 ? `×${log.openCount}` : ''}
      </span>
    );
  }
  if (log.status === 'delivered') {
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

export default function EmailTracking() {
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
    const opened  = logs.filter(l => STATUS_RANK[l.status] >= STATUS_RANK.opened).length;
    const clicked = logs.filter(l => STATUS_RANK[l.status] >= STATUS_RANK.clicked).length;
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Email Tracking</h1>
          <p className="text-sm text-slate-500 mt-0.5">Open and click data for all emails sent from the CRM</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

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
    </div>
  );
}

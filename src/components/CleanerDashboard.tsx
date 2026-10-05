import { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, CheckCircle, Clock, DollarSign, Home, KeyRound, MapPin, X, ChevronRight, Loader, RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';

interface DashJob {
  id: string;
  propertyId: string;
  propertyName: string;
  checkoutDate: string;
  checkinDate?: string | null;
  guestName?: string | null;
  notes?: string | null;
  status: string;
  payout: number;
  doorCode?: string | null;
  address?: string | null;
  checkoutTime?: string | null;
  checkinTime?: string | null;
  photoUrl?: string | null;
  portalToken?: string | null;
  sameDay?: boolean;
  reportSubmitted?: boolean;
  completedAt?: string | null;
  billed?: boolean;
  paidOut?: boolean;
  payoutStatus?: string | null;
}

interface DashData {
  cleaner: { id: string; name: string; email: string; phone?: string | null };
  myJobs: DashJob[];
  availableJobs: DashJob[];
  serverTime?: string;
}

// ── Local cache: the last good copy renders instantly, then refreshes ────────
const CACHE_PREFIX = 'ej-cleaner-dash:';
function readCache(key: string): { data: DashData; savedAt: number } | null {
  try { const raw = localStorage.getItem(CACHE_PREFIX + key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeCache(key: string, data: DashData) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, savedAt: Date.now() })); } catch { /* private mode / full */ }
}

async function fetchDashboard(combined: string): Promise<DashData> {
  const r = await fetch(`/api/documents?flow=cleaner-dashboard&cleanerId=${encodeURIComponent(combined)}`, {
    signal: AbortSignal.timeout(15_000), cache: 'no-store', headers: { accept: 'application/json' },
  });
  const text = await r.text();
  let body: { error?: string } & Partial<DashData> = {};
  try { body = JSON.parse(text); } catch { throw new Error(r.ok ? 'Unexpected response from the server.' : `Server error (${r.status}). Please try again in a minute.`); }
  if (!r.ok || body.error) throw new Error(body.error ?? `Request failed (${r.status}).`);
  return body as DashData;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  pending: 'Pending', dispatched: 'Available', accepted: 'Accepted',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};

const STATUS_BAR: Record<string, string> = {
  pending: 'bg-[#d0954a]', dispatched: 'bg-[#4a90d9]', accepted: 'bg-[#5aa0e9]',
  in_progress: 'bg-[#70b0ff]', completed: 'bg-[#5ce0a0]', cancelled: 'bg-[#e05c5c]',
};

function fmt(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function fmtShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ── Job Detail Modal ──────────────────────────────────────────────────────────
function JobDetailModal({
  job, cleanerId, combined, onClose, onAccepted, onPassed,
}: {
  job: DashJob;
  cleanerId: string;
  /** Full portal link value (slug:cleanerId:token) — proves this cleaner may act on the job. */
  combined: string;
  onClose: () => void;
  onAccepted?: (jobId: string) => void;
  onPassed?: (jobId: string) => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [passing, setPassing] = useState(false);
  const isAvailable = job.status === 'dispatched';
  const isSameDay = job.sameDay || (job.checkinDate && job.checkinDate === job.checkoutDate);

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handlePass() {
    if (!confirm("Pass on this job? We'll contact the backup cleaner.")) return;
    setPassing(true);
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaner', action: 'dashboard-decline', jobId: job.id, cleanerId, combined }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error ?? 'Failed to pass. Please try again.'); return; }
      onPassed?.(job.id);
      onClose();
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setPassing(false);
    }
  }

  async function handleAccept() {
    setAccepting(true);
    setAcceptError('');
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaner', action: 'dashboard-accept', jobId: job.id, cleanerId, combined }),
      });
      const d = await r.json();
      if (!r.ok) { setAcceptError(d.error ?? 'Failed to accept.'); return; }
      setAccepted(true);
      onAccepted?.(job.id);
    } catch {
      setAcceptError('Network error. Please try again.');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-[#0f1923] border border-[#1e2d45] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] sticky top-0 bg-[#0f1923] z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_BAR[job.status] ?? 'bg-[#3a5070]'}`} />
            <h2 className="font-bold text-white text-base truncate">{job.propertyName}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Report overdue */}
          {['accepted', 'in_progress', 'completed'].includes(job.status) && !job.reportSubmitted && !job.billed && job.checkoutDate < todayLocal() && (
            <div className="bg-[#2a1a05] border border-[#6a4a10] rounded-xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-[#d0954a] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[#f0b860] font-semibold text-sm">Report not submitted yet</p>
                <p className="text-[#d0b870] text-xs mt-0.5">This clean was on {fmtShort(job.checkoutDate)}. Submit the report below so your payout can go out.</p>
              </div>
            </div>
          )}

          {/* Same-day alert */}
          {isSameDay && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <p className="text-red-400 font-semibold text-sm">Same-Day Check-In — Clean fast!</p>
            </div>
          )}

          {/* Accepted confirmation */}
          {accepted && (
            <div className="bg-green-900/30 border border-green-600/50 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" />
              <p className="text-green-400 font-semibold text-sm">Job accepted! It's now in My Cleans.</p>
            </div>
          )}

          {/* Property photo */}
          {job.photoUrl && (
            <div className="rounded-xl overflow-hidden border border-[#1e2d45]">
              <img src={job.photoUrl} alt={job.propertyName} className="w-full h-40 object-cover" />
            </div>
          )}

          {/* Payout — prominent */}
          <div className="bg-[#0a2518] border border-[#1e4030] rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#3a8060] uppercase tracking-wide">Your Payout</p>
              <p className="text-3xl font-bold text-[#5ce0a0] mt-0.5">${job.payout}</p>
            </div>
            <DollarSign size={28} className="text-[#5ce0a0]/30" />
          </div>

          {/* Dates */}
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <Calendar size={14} className="text-[#4a90d9] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide leading-none mb-0.5">Cleaning Date</p>
                <p className="text-sm font-medium text-white">{fmt(job.checkoutDate)}</p>
              </div>
            </div>
            {job.checkoutTime && (
              <div className="flex items-start gap-2.5">
                <Clock size={14} className="text-[#3a5070] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide leading-none mb-0.5">Guest Check-out</p>
                  <p className="text-sm font-medium text-white">{job.checkoutTime}</p>
                </div>
              </div>
            )}
            {job.checkinDate && (
              <div className="flex items-start gap-2.5">
                <Clock size={14} className={`mt-0.5 flex-shrink-0 ${isSameDay ? 'text-red-400' : 'text-[#3a5070]'}`} />
                <div>
                  <p className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide leading-none mb-0.5">
                    {isSameDay ? '⚡ Check-in (Same Day)' : 'Next Check-in'}
                  </p>
                  <p className={`text-sm font-medium ${isSameDay ? 'text-red-400' : 'text-white'}`}>
                    {fmt(job.checkinDate)}{job.checkinTime ? ` · ${job.checkinTime}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Property details */}
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide">Property</p>
            <div className="flex items-start gap-2.5">
              <Home size={14} className="text-[#4a90d9] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide leading-none mb-0.5">Name</p>
                <p className="text-sm font-medium text-white">{job.propertyName}</p>
              </div>
            </div>
            {job.address && (
              <div className="flex items-start gap-2.5">
                <MapPin size={14} className="text-[#3a5070] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide leading-none mb-0.5">Address</p>
                  <p className="text-sm font-medium text-white">{job.address}</p>
                </div>
              </div>
            )}
            {job.doorCode && (
              <div className="flex items-start gap-2.5">
                <KeyRound size={14} className="text-[#4a90d9] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold text-[#3a5070] uppercase tracking-wide leading-none mb-0.5">Door Code</p>
                  <p className="text-2xl font-bold text-white tracking-widest">{job.doorCode}</p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {job.notes && (
            <div className="bg-[#1a1800] border border-[#3a3200] rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-[#d0954a] mb-1">Notes</p>
              <p className="text-sm text-[#d0b870]">{job.notes}</p>
            </div>
          )}

          {/* Submit Cleaning Report button (accepted / in-progress jobs) */}
          {['accepted', 'in_progress', 'completed'].includes(job.status) && !job.reportSubmitted && job.portalToken && (
            <a
              href={`/?cleaner=${job.id}:${job.portalToken}`}
              className={`w-full font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base border ${
                job.billed
                  ? 'bg-transparent hover:bg-[#1e2d45] text-[#7a94b8] border-[#2a4060] font-semibold'
                  : job.checkoutDate < todayLocal()
                    ? 'bg-[#d0954a] hover:bg-[#e0a55a] text-[#0a1628] border-[#d0954a]'
                    : 'bg-[#2a6040] hover:bg-[#3a7050] text-[#5ce0a0] border-[#1e4030]'
              }`}
            >
              <CheckCircle size={18} />
              {job.billed ? 'Add photos / report (optional)' : job.checkoutDate < todayLocal() ? 'Submit Overdue Report' : 'Open Job & Submit Report'}
            </a>
          )}
          {job.billed && !job.reportSubmitted && (
            <div className="bg-[#0a2518] border border-[#1e4030] rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-[#5ce0a0]" />
              <p className="text-[#5ce0a0] text-sm font-semibold">{job.paidOut ? 'Paid' : job.payoutStatus === 'manual_due' ? 'Payout coming (paid directly by E&J)' : 'Billed — payout on its way'} · no report on file</p>
            </div>
          )}
          {job.reportSubmitted && (
            <div className="bg-[#0a2518] border border-[#1e4030] rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-[#5ce0a0]" />
              <p className="text-[#5ce0a0] text-sm font-semibold">Report submitted{job.completedAt ? ` · ${new Date(job.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</p>
            </div>
          )}

          {/* Accept + Pass buttons (available jobs only) */}
          {isAvailable && !accepted && (
            <div className="space-y-3">
              {acceptError && (
                <p className="text-sm text-red-400 text-center">{acceptError}</p>
              )}
              <button
                onClick={handleAccept}
                disabled={accepting || passing}
                className="w-full bg-[#4a90d9] hover:bg-[#5aa0e9] disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
              >
                {accepting ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                {accepting ? 'Accepting…' : 'Accept This Job'}
              </button>
              <button
                onClick={handlePass}
                disabled={accepting || passing}
                className="w-full bg-transparent border border-[#3a5070] text-[#3a5070] hover:border-[#e05c5c] hover:text-[#e05c5c] disabled:opacity-60 font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                {passing ? 'Passing…' : "Can't Do This Job — Pass"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CleanerDashboard({ combined }: { combined: string }) {
  // Handle all URL formats: "name-slug:cleanerId:token", "cleanerId:token", "cleanerId"
  const parts = combined.split(':');
  const cleanerId = parts.length >= 3 ? parts[1] : parts[0];

  const cached = useRef(readCache(combined));
  const [data, setData] = useState<DashData | null>(cached.current?.data ?? null);
  const [savedAt, setSavedAt] = useState<number | null>(cached.current?.savedAt ?? null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'my-jobs' | 'available'>('my-jobs');
  const [selectedJob, setSelectedJob] = useState<DashJob | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const fresh = await fetchDashboard(combined);
      setData(fresh);
      setSavedAt(Date.now());
      setError('');
      writeCache(combined, fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [combined]);

  // First load, refresh when the tab comes back into view, and every 5 minutes while open.
  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 5 * 60_000);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); window.clearInterval(id); };
  }, [load]);

  function handleAccepted(jobId: string) {
    if (!data) return;
    const curAvailable = Array.isArray(data.availableJobs) ? data.availableJobs : [];
    const curMyJobs = Array.isArray(data.myJobs) ? data.myJobs : [];
    const job = curAvailable.find(j => j.id === jobId);
    if (!job) return;
    const updated: DashJob = { ...job, status: 'accepted' };
    const next = {
      ...data,
      myJobs: [updated, ...curMyJobs].sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate)),
      availableJobs: curAvailable.filter(j => j.id !== jobId),
    };
    setData(next);
    writeCache(combined, next);
    setSelectedJob(updated);
    load(true); // pick up the portal token for the newly accepted job
  }

  function handlePassed(jobId: string) {
    if (!data) return;
    const next = { ...data, availableJobs: (data.availableJobs ?? []).filter(j => j.id !== jobId) };
    setData(next);
    writeCache(combined, next);
    setSelectedJob(null);
  }

  // Nothing cached and the request failed → full-screen error with retry.
  if (error && !data) {
    return (
      <div className="h-screen overflow-y-auto bg-[#0a1628] flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <AlertTriangle size={32} className="text-[#d0954a] mx-auto mb-3" />
          <p className="text-white font-semibold mb-2">Unable to load your portal</p>
          <p className="text-[#7a94b8] text-sm mb-5">{error}</p>
          <button onClick={() => load()} disabled={refreshing} className="bg-[#4a90d9] hover:bg-[#5aa0e9] disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl text-sm inline-flex items-center gap-2">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Try again
          </button>
        </div>
      </div>
    );
  }

  // Skeleton while the very first load is in flight.
  if (!data) {
    return (
      <div className="h-screen overflow-y-auto bg-[#0a1628]">
        <div className="bg-[#0f1923] border-b border-[#1e2d45] px-5 py-5">
          <div className="h-3 w-24 bg-[#1e2d45] rounded mb-2 animate-pulse" />
          <div className="h-6 w-40 bg-[#1e2d45] rounded animate-pulse" />
        </div>
        <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
          {[0, 1, 2].map(i => <div key={i} className="h-20 bg-[#0f1923] border border-[#1e2d45] rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const today = todayLocal();
  const myJobs = Array.isArray(data.myJobs) ? data.myJobs : [];
  const availableJobs = Array.isArray(data.availableJobs) ? data.availableJobs : [];
  // A clean needs a report until the cleaner actually submits one — even if the
  // office already marked the job Complete (that only affects billing).
  // Once the client has been billed the report is optional, so the job moves to Completed.
  const reportable = (j: DashJob) => ['accepted', 'in_progress', 'completed'].includes(j.status) && !j.reportSubmitted && !j.billed;
  const needsReport = myJobs.filter(j => reportable(j) && j.checkoutDate < today);
  const todayJobs   = myJobs.filter(j => reportable(j) && j.checkoutDate === today);
  const upcoming    = myJobs.filter(j => (j.status === 'accepted' || j.status === 'in_progress') && j.checkoutDate > today);
  const seen = new Set([...needsReport, ...todayJobs, ...upcoming].map(j => j.id));
  const completed   = myJobs.filter(j => !seen.has(j.id)).sort((a, b) => b.checkoutDate.localeCompare(a.checkoutDate));
  const openCount = needsReport.length + todayJobs.length + upcoming.length;
  const earned30 = completed.filter(j => j.checkoutDate >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).reduce((s, j) => s + (j.payout || 0), 0);
  const stale = savedAt ? Date.now() - savedAt > 10 * 60_000 : false;

  const Section = ({ title, tone, children }: { title: string; tone?: 'warn' | 'live'; children: React.ReactNode }) => (
    <>
      <p className={`text-xs font-semibold uppercase tracking-wide px-1 pt-2 ${tone === 'warn' ? 'text-[#d0954a]' : tone === 'live' ? 'text-[#5ce0a0]' : 'text-[#3a5070]'}`}>{title}</p>
      {children}
    </>
  );

  return (
    <div className="h-screen overflow-y-auto overscroll-contain bg-[#0a1628] pb-10" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Header */}
      <div className="bg-[#0f1923] border-b border-[#1e2d45] px-5 py-4">
        <div className="max-w-lg mx-auto flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#4a90d9] uppercase tracking-widest mb-0.5">E&J Retreats · Cleaner Portal</p>
            <h1 className="text-xl font-bold text-white truncate">{data.cleaner.name}</h1>
            {earned30 > 0 && <p className="text-xs text-[#3a8060] mt-0.5">${earned30} earned in the last 30 days</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setShowHelp(h => !h)} className="p-2 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45]" aria-label="How it works"><HelpCircle size={18} /></button>
            <button onClick={() => load()} disabled={refreshing} className="p-2 rounded-lg text-[#3a5070] hover:text-white hover:bg-[#1e2d45] disabled:opacity-60" aria-label="Refresh"><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button>
          </div>
        </div>
      </div>

      {/* Offline / stale banner */}
      {error && (
        <div className="bg-[#2a1a05] border-b border-[#4a3010] px-4 py-2 text-xs text-[#f0b860] text-center">
          Couldn't refresh — showing your last saved copy{savedAt ? ` from ${new Date(savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}. <button onClick={() => load()} className="underline font-semibold">Retry</button>
        </div>
      )}
      {!error && stale && !refreshing && (
        <div className="bg-[#0f1923] border-b border-[#1e2d45] px-4 py-1.5 text-[11px] text-[#3a5070] text-center">Last updated {new Date(savedAt!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#1e2d45] bg-[#0f1923] sticky top-0 z-10">
        {([['my-jobs', 'My Cleans', openCount, 'bg-[#4a90d9]'], ['available', 'Available', availableJobs.length, 'bg-[#d0954a]']] as const).map(([key, label, count, color]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex-1 py-3.5 text-sm font-semibold transition-colors relative ${tab === key ? 'text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
            {label}
            {count > 0 && <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === key ? `${color} text-white` : 'bg-[#1e2d45] text-[#b8d4f0]'}`}>{count}</span>}
            {tab === key && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${color}`} />}
          </button>
        ))}
      </div>

      {/* How it works (collapsed by default) */}
      {showHelp && (
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <div className="bg-[#0f1923] border border-[#1e2d45] rounded-2xl px-4 py-3.5 text-xs leading-relaxed">
            <p className="text-[#b8d4f0] font-semibold text-sm mb-1">How it works</p>
            <p className="text-[#7a94b8]">New jobs show under <strong className="text-[#b8d4f0]">Available</strong>: tap to accept or pass (pass quickly so the backup cleaner can be offered the job). On cleaning day open the job in <strong className="text-[#b8d4f0]">My Cleans</strong> for the address, door code and checklist, then submit photos and notes. Your payout is sent automatically once the report is in.</p>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {tab === 'my-jobs' && (
          myJobs.length === 0 ? (
            <div className="text-center py-16">
              <Home size={36} className="text-[#1e2d45] mx-auto mb-3" />
              <p className="text-[#3a5070] text-sm">No cleans assigned yet.</p>
              <p className="text-[#1e2d45] text-xs mt-1">Check the Available tab for open jobs.</p>
            </div>
          ) : (
            <>
              {needsReport.length > 0 && (
                <Section title={`Needs report · ${needsReport.length}`} tone="warn">
                  <div className="bg-[#2a1a05] border border-[#4a3010] rounded-xl px-3 py-2 text-xs text-[#d0b870]">These cleans are done but we don't have the report yet. Tap one and submit it so your payout can be sent.</div>
                  {needsReport.map(job => <JobCard key={job.id} job={job} overdue onClick={() => setSelectedJob(job)} />)}
                </Section>
              )}
              {todayJobs.length > 0 && (
                <Section title="Today" tone="live">
                  {todayJobs.map(job => <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />)}
                </Section>
              )}
              {upcoming.length > 0 && (
                <Section title="Upcoming">
                  {upcoming.map(job => <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />)}
                </Section>
              )}
              {needsReport.length === 0 && todayJobs.length === 0 && upcoming.length === 0 && (
                <div className="text-center py-10">
                  <CheckCircle size={32} className="text-[#1e4030] mx-auto mb-2" />
                  <p className="text-[#3a5070] text-sm">All caught up — no open cleans.</p>
                </div>
              )}
              {completed.length > 0 && (
                <>
                  <button onClick={() => setShowCompleted(v => !v)} className="w-full flex items-center justify-between px-1 pt-3 text-xs font-semibold text-[#3a5070] uppercase tracking-wide">
                    <span>Completed · {completed.length}</span>
                    <ChevronRight size={14} className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`} />
                  </button>
                  {showCompleted && completed.map(job => <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />)}
                </>
              )}
            </>
          )
        )}

        {tab === 'available' && (
          availableJobs.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle size={36} className="text-[#1e2d45] mx-auto mb-3" />
              <p className="text-[#3a5070] text-sm">No available cleans right now.</p>
              <p className="text-[#1e2d45] text-xs mt-1">You'll get an email when a new one is offered to you.</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide px-1">Tap a job to view details and accept</p>
              {availableJobs.map(job => <AvailableJobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />)}
            </>
          )
        )}
      </div>

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          cleanerId={cleanerId}
          combined={combined}
          onClose={() => setSelectedJob(null)}
          onAccepted={handleAccepted}
          onPassed={handlePassed}
        />
      )}
    </div>
  );
}

// ── Job Cards ─────────────────────────────────────────────────────────────────
function JobCard({ job, overdue, onClick }: { job: DashJob; overdue?: boolean; onClick: () => void }) {
  const isSameDay = job.sameDay || (job.checkinDate && job.checkinDate === job.checkoutDate);
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-4 flex items-center gap-3 transition-colors text-left border ${overdue ? 'bg-[#1a1200] border-[#6a4a10] hover:border-[#d0954a]' : 'bg-[#0f1923] border-[#1e2d45] hover:border-[#2a4060]'}`}
    >
      <div className={`w-1 h-12 rounded-full flex-shrink-0 ${overdue ? 'bg-[#d0954a]' : STATUS_BAR[job.status] ?? 'bg-[#3a5070]'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isSameDay && <span className="text-sm" title="Same-day turnover">⚡</span>}
          <p className="text-sm font-semibold text-white truncate">{job.propertyName}</p>
        </div>
        <p className="text-xs text-[#3a5070] mt-0.5">{fmtShort(job.checkoutDate)}{job.address ? ` · ${job.address}` : ''}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {job.payout > 0 && (
          <span className="text-sm font-bold text-[#5ce0a0]">${job.payout}</span>
        )}
        {overdue ? (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-[#2a1a05] border-[#d0954a] text-[#f0b860]">Submit report</span>
        ) : job.paidOut ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-[#0a2518] border-[#1e4030] text-[#5ce0a0]">Paid</span>
        ) : (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[job.status]}`}>
            {STATUS_LABELS[job.status]}
          </span>
        )}
        <ChevronRight size={14} className="text-[#3a5070]" />
      </div>
    </button>
  );
}

function AvailableJobCard({ job, onClick }: { job: DashJob; onClick: () => void }) {
  const isSameDay = job.sameDay || (job.checkinDate && job.checkinDate === job.checkoutDate);
  return (
    <button
      onClick={onClick}
      className="w-full bg-[#0f1923] border border-[#1e3a5a] rounded-2xl px-4 py-4 hover:border-[#4a90d9] transition-colors text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isSameDay && <span className="text-sm">⚡</span>}
            <p className="text-sm font-semibold text-white truncate">{job.propertyName}</p>
          </div>
          <p className="text-xs text-[#3a5070]">{fmtShort(job.checkoutDate)}</p>
          {job.address && <p className="text-xs text-[#3a5070] mt-0.5 truncate">{job.address}</p>}
        </div>
        {job.payout > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] font-semibold text-[#3a8060] uppercase tracking-wide">Payout</p>
            <p className="text-2xl font-bold text-[#5ce0a0]">${job.payout}</p>
          </div>
        )}
      </div>
      <div className="mt-3 bg-[#4a90d9] text-white text-sm font-bold py-2.5 rounded-xl text-center">
        View, Accept or Pass →
      </div>
    </button>
  );
}

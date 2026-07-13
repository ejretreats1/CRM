import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, Clock, DollarSign, Home, KeyRound, MapPin, X, ChevronRight, Loader } from 'lucide-react';

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
}

interface DashData {
  cleaner: { id: string; name: string; email: string; phone?: string | null };
  myJobs: DashJob[];
  availableJobs: DashJob[];
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
  job, cleanerId, onClose, onAccepted,
}: {
  job: DashJob;
  cleanerId: string;
  onClose: () => void;
  onAccepted?: (jobId: string) => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const isAvailable = job.status === 'dispatched';
  const isSameDay = job.checkinDate && job.checkinDate === job.checkoutDate;

  async function handleAccept() {
    setAccepting(true);
    setAcceptError('');
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaner', action: 'dashboard-accept', jobId: job.id, cleanerId }),
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
              <p className="text-green-400 font-semibold text-sm">Job accepted! It's now in My Jobs.</p>
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

          {/* Accept button (available jobs only) */}
          {isAvailable && !accepted && (
            <div>
              {acceptError && (
                <p className="text-sm text-red-400 text-center mb-3">{acceptError}</p>
              )}
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-[#4a90d9] hover:bg-[#5aa0e9] disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
              >
                {accepting ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                {accepting ? 'Accepting…' : 'Accept This Job'}
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
  const colonIdx = combined.indexOf(':');
  const cleanerId = colonIdx === -1 ? combined : combined.slice(0, colonIdx);

  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'my-jobs' | 'available'>('my-jobs');
  const [selectedJob, setSelectedJob] = useState<DashJob | null>(null);

  useEffect(() => {
    fetch(`/api/documents?flow=cleaner-dashboard&cleanerId=${encodeURIComponent(combined)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load. Please try again.'));
  }, [combined]);

  function handleAccepted(jobId: string) {
    if (!data) return;
    const curAvailable = Array.isArray(data.availableJobs) ? data.availableJobs : [];
    const curMyJobs = Array.isArray(data.myJobs) ? data.myJobs : [];
    const job = curAvailable.find(j => j.id === jobId);
    if (!job) return;
    const updated: DashJob = { ...job, status: 'accepted' };
    setData({
      ...data,
      myJobs: [updated, ...curMyJobs].sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate)),
      availableJobs: curAvailable.filter(j => j.id !== jobId),
    });
    setSelectedJob(updated);
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-white font-semibold mb-2">Unable to load dashboard</p>
          <p className="text-[#3a5070] text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader size={28} className="text-[#4a90d9] animate-spin" />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const myJobs = Array.isArray(data.myJobs) ? data.myJobs : [];
  const availableJobs = Array.isArray(data.availableJobs) ? data.availableJobs : [];
  const upcomingJobs = myJobs.filter(j => j.checkoutDate >= today);
  const pastJobs = myJobs.filter(j => j.checkoutDate < today);

  return (
    <div className="min-h-screen bg-[#0a1628]">
      {/* Header */}
      <div className="bg-[#0f1923] border-b border-[#1e2d45] px-5 py-5">
        <p className="text-xs font-semibold text-[#4a90d9] uppercase tracking-widest mb-1">E&J Retreats</p>
        <h1 className="text-xl font-bold text-white">{data.cleaner.name}</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Cleaner Dashboard</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e2d45] bg-[#0f1923]">
        <button
          onClick={() => setTab('my-jobs')}
          className={`flex-1 py-3.5 text-sm font-semibold transition-colors relative ${
            tab === 'my-jobs' ? 'text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'
          }`}
        >
          My Jobs
          {upcomingJobs.length > 0 && (
            <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
              tab === 'my-jobs' ? 'bg-[#4a90d9] text-white' : 'bg-[#1e2d45] text-[#4a90d9]'
            }`}>
              {upcomingJobs.length}
            </span>
          )}
          {tab === 'my-jobs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4a90d9]" />}
        </button>
        <button
          onClick={() => setTab('available')}
          className={`flex-1 py-3.5 text-sm font-semibold transition-colors relative ${
            tab === 'available' ? 'text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'
          }`}
        >
          Available
          {availableJobs.length > 0 && (
            <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
              tab === 'available' ? 'bg-[#d0954a] text-white' : 'bg-[#1a1800] text-[#d0954a]'
            }`}>
              {availableJobs.length}
            </span>
          )}
          {tab === 'available' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d0954a]" />}
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-5 space-y-3 max-w-lg mx-auto">

        {/* ── MY JOBS TAB ── */}
        {tab === 'my-jobs' && (
          <>
            {myJobs.length === 0 ? (
              <div className="text-center py-16">
                <Home size={36} className="text-[#1e2d45] mx-auto mb-3" />
                <p className="text-[#3a5070] text-sm">No jobs assigned yet.</p>
                <p className="text-[#1e2d45] text-xs mt-1">Check the Available tab for open jobs.</p>
              </div>
            ) : (
              <>
                {upcomingJobs.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide px-1">Upcoming</p>
                    {upcomingJobs.map(job => (
                      <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />
                    ))}
                  </>
                )}
                {pastJobs.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide px-1 pt-2">Past</p>
                    {pastJobs.map(job => (
                      <JobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── AVAILABLE TAB ── */}
        {tab === 'available' && (
          <>
            {availableJobs.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle size={36} className="text-[#1e2d45] mx-auto mb-3" />
                <p className="text-[#3a5070] text-sm">No available jobs right now.</p>
                <p className="text-[#1e2d45] text-xs mt-1">Check back later for new openings.</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wide px-1">
                  Tap a job to view details and accept
                </p>
                {availableJobs.map(job => (
                  <AvailableJobCard key={job.id} job={job} onClick={() => setSelectedJob(job)} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Job detail modal */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          cleanerId={cleanerId}
          onClose={() => setSelectedJob(null)}
          onAccepted={handleAccepted}
        />
      )}
    </div>
  );
}

// ── Job Cards ─────────────────────────────────────────────────────────────────
function JobCard({ job, onClick }: { job: DashJob; onClick: () => void }) {
  const isSameDay = job.checkinDate && job.checkinDate === job.checkoutDate;
  return (
    <button
      onClick={onClick}
      className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-2xl px-4 py-4 flex items-center gap-3 hover:border-[#2a4060] transition-colors text-left"
    >
      <div className={`w-1 h-12 rounded-full flex-shrink-0 ${STATUS_BAR[job.status] ?? 'bg-[#3a5070]'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isSameDay && <span className="text-sm">⚡</span>}
          <p className="text-sm font-semibold text-white truncate">{job.propertyName}</p>
        </div>
        <p className="text-xs text-[#3a5070] mt-0.5">{fmtShort(job.checkoutDate)}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {job.payout > 0 && (
          <span className="text-sm font-bold text-[#5ce0a0]">${job.payout}</span>
        )}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[job.status]}`}>
          {STATUS_LABELS[job.status]}
        </span>
        <ChevronRight size={14} className="text-[#3a5070]" />
      </div>
    </button>
  );
}

function AvailableJobCard({ job, onClick }: { job: DashJob; onClick: () => void }) {
  const isSameDay = job.checkinDate && job.checkinDate === job.checkoutDate;
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
        View &amp; Accept →
      </div>
    </button>
  );
}

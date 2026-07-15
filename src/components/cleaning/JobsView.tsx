import { useState, useRef, useEffect } from 'react';
import {
  Plus, Send, CheckCircle, XCircle, Clock, AlertCircle, Home, User, DollarSign, Calendar, CreditCard,
  ChevronDown, ChevronUp, Image, FileText,
} from 'lucide-react';
import type { CleaningJob, CleaningPropertyConfig, Cleaner } from '../../types/cleaning';
import type { UplistingProperty } from '../../services/uplisting';
import { dispatchCleaningJob } from '../../services/cleaningApi';

interface Props {
  jobs: CleaningJob[];
  configs: CleaningPropertyConfig[];
  cleaners: Cleaner[];
  uplistingProperties: UplistingProperty[];
  onSyncJobs: (newJobs: CleaningJob[]) => Promise<void>;
  onUpdateJob: (job: CleaningJob) => Promise<void>;
  onDeleteJob?: (id: string) => Promise<void>;
  onCleanupOrphans?: () => Promise<void>;
  autoSyncing?: boolean;
}

function displayName(propertyId: string | undefined, propertyName: string, props: UplistingProperty[]): string {
  const p = props.find(p => p.id === propertyId);
  return p?.nickname || p?.name || propertyName;
}

type StatusFilter = 'all' | 'pending' | 'dispatched' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', dispatched: 'Dispatched', accepted: 'Accepted',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-[#1a1800] border-[#3a3200] text-[#d0954a]',
  dispatched:  'bg-[#0d1e35] border-[#1e3a5a] text-[#4a90d9]',
  accepted:    'bg-[#0a1e30] border-[#1e3050] text-[#5aa0e9]',
  in_progress: 'bg-[#0d1e35] border-[#2a5080] text-[#70b0ff]',
  completed:   'bg-[#0a2518] border-[#1e4030] text-[#5ce0a0]',
  cancelled:   'bg-[#1a0e0e] border-[#3a1a1a] text-[#e05c5c]',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[status] ?? ''}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function fmt(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface ManualJobForm {
  propertyId: string;
  propertyName: string;
  checkoutDate: string;
  guestName: string;
  notes: string;
}

export default function JobsView({ jobs, configs, cleaners, uplistingProperties, onSyncJobs, onUpdateJob, onCleanupOrphans, autoSyncing }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [charging, setCharging] = useState<string | null>(null);
  const [chargeErrors, setChargeErrors] = useState<Record<string, string>>({});
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState<ManualJobForm>({
    propertyId: '', propertyName: '', checkoutDate: '', guestName: '', notes: '',
  });
  const [savingManual, setSavingManual] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const todayMarkerRef = useRef<HTMLDivElement | null>(null);
  const hasScrolled = useRef(false);

  const configPropertyIds = new Set(configs.map(c => c.propertyId));
  const orphanedCount = jobs.filter(j => !configPropertyIds.has(j.propertyId)).length;

  async function handleCleanup() {
    if (!onCleanupOrphans) return;
    if (!confirm(`Delete ${orphanedCount} orphaned job${orphanedCount !== 1 ? 's' : ''} from deleted properties? This cannot be undone.`)) return;
    setCleaningUp(true);
    try { await onCleanupOrphans(); } finally { setCleaningUp(false); }
  }

  const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'dispatched', label: 'Dispatched' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  const todayStr = new Date().toISOString().slice(0, 10);

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);
  const sortedJobs = [...filtered].sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate));
  const todayJobId = sortedJobs.find(j => j.checkoutDate >= todayStr)?.id ?? null;

  useEffect(() => {
    if (!hasScrolled.current && todayMarkerRef.current) {
      todayMarkerRef.current.scrollIntoView({ behavior: 'instant', block: 'start' });
      hasScrolled.current = true;
    }
  }, [todayJobId]);

  const configMap = new Map(configs.map(c => [c.propertyId, c]));

  async function handleRedispatch(job: CleaningJob) {
    const config = configMap.get(job.propertyId);
    if (!config || config.assignedCleaners.length === 0) {
      alert('No cleaners assigned to this property. Go to Properties tab to assign cleaners.');
      return;
    }
    const assignedCleaners = config.assignedCleaners
      .map(ac => {
        const profile = cleaners.find(c => c.id === ac.id);
        return profile && profile.status === 'active' ? { ...profile, payout: ac.payout } : null;
      })
      .filter((c): c is Cleaner & { payout: number } => !!c);

    if (assignedCleaners.length === 0) {
      alert('No active cleaners assigned to this property.');
      return;
    }

    setDispatching(job.id);
    try {
      // Clear the existing assignment then re-send to the full roster
      const now = new Date().toISOString();
      const cleared = {
        ...job,
        status: 'dispatched' as const,
        assignedCleanerId: undefined,
        assignedCleanerName: undefined,
        acceptedAt: undefined,
        dispatchedAt: now,
        updatedAt: now,
      };
      await onUpdateJob(cleared);
      await dispatchCleaningJob({
        jobId: job.id,
        propertyName: job.propertyName,
        checkoutDate: job.checkoutDate,
        checkinDate: job.checkinDate,
        guestName: job.guestName,
        cleanerPayout: 0,
        notes: job.notes,
        cleaners: assignedCleaners.map(c => ({ id: c.id, name: c.name, email: c.email, payout: c.payout })),
      });
    } catch (e) {
      alert(`Re-dispatch failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setDispatching(null);
    }
  }

  async function handleDispatch(job: CleaningJob) {
    const config = configMap.get(job.propertyId);
    if (!config || config.assignedCleaners.length === 0) {
      alert('No cleaners assigned to this property. Go to Properties tab to assign cleaners.');
      return;
    }
    // Build list: cleaner profile + their negotiated payout for this property
    const assignedCleaners = config.assignedCleaners
      .map(ac => {
        const profile = cleaners.find(c => c.id === ac.id);
        return profile && profile.status === 'active' ? { ...profile, payout: ac.payout } : null;
      })
      .filter((c): c is Cleaner & { payout: number } => !!c);

    if (assignedCleaners.length === 0) {
      alert('No active cleaners assigned to this property.');
      return;
    }

    setDispatching(job.id);
    try {
      await dispatchCleaningJob({
        jobId: job.id,
        propertyName: job.propertyName,
        checkoutDate: job.checkoutDate,
        checkinDate: job.checkinDate,
        guestName: job.guestName,
        cleanerPayout: 0, // individual payouts shown per-cleaner in email
        notes: job.notes,
        cleaners: assignedCleaners.map(c => ({ id: c.id, name: c.name, email: c.email, payout: c.payout })),
      });
      const now = new Date().toISOString();
      await onUpdateJob({ ...job, status: 'dispatched', dispatchedAt: now, updatedAt: now });
    } catch (e) {
      alert(`Dispatch failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setDispatching(null);
    }
  }

  async function handleStatusChange(job: CleaningJob, status: CleaningJob['status']) {
    const now = new Date().toISOString();
    const updates: Partial<CleaningJob> = { status, updatedAt: now };
    if (status === 'completed') updates.completedAt = now;
    if (status === 'accepted')  updates.acceptedAt  = now;
    await onUpdateJob({ ...job, ...updates });
    if (status === 'cancelled' && (job.assignedCleanerId || job.dispatchedAt)) {
      fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaning', action: 'cancellation', jobId: job.id }),
      }).catch(console.error);
    }
  }

  const [undoing, setUndoing] = useState<string | null>(null);

  async function handleUndoComplete(job: CleaningJob) {
    if (!confirm('Undo complete? This will set the job back to Accepted so it will still auto-charge today if the checkout date matches.')) return;
    setUndoing(job.id);
    try {
      const now = new Date().toISOString();
      await onUpdateJob({ ...job, status: 'accepted', completedAt: undefined, updatedAt: now });
    } finally {
      setUndoing(null);
    }
  }

  async function handleCharge(job: CleaningJob) {
    if (!confirm(`Charge $${job.cleaningFee} to the client card on file for ${displayName(job.propertyId, job.propertyName, uplistingProperties)}?`)) return;
    setCharging(job.id);
    setChargeErrors(prev => { const next = { ...prev }; delete next[job.id]; return next; });
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaning', action: 'charge-and-payout', jobId: job.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Charge failed.');
      const now = new Date().toISOString();
      await onUpdateJob({ ...job, chargedAt: now, updatedAt: now });
    } catch (e: unknown) {
      setChargeErrors(prev => ({ ...prev, [job.id]: e instanceof Error ? e.message : 'Charge failed.' }));
    } finally {
      setCharging(null);
    }
  }

  async function handleSaveManual() {
    if (!manualForm.propertyName || !manualForm.checkoutDate) return;
    setSavingManual(true);
    try {
      const now = new Date().toISOString();
      const configForProp = configs.find(c =>
        c.propertyId === manualForm.propertyId || c.propertyName === manualForm.propertyName
      );
      const job: CleaningJob = {
        id: `cj_manual_${Date.now()}`,
        propertyId: manualForm.propertyId || manualForm.propertyName,
        propertyName: manualForm.propertyName,
        guestName: manualForm.guestName || undefined,
        checkoutDate: manualForm.checkoutDate,
        status: 'pending',
        cleaningFee: configForProp?.cleaningFee ?? 0,
        cleanerPayout: 0, // set per-cleaner when they accept
        notes: manualForm.notes || undefined,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      };
      await onSyncJobs([job]);
      setShowManual(false);
      setManualForm({ propertyId: '', propertyName: '', checkoutDate: '', guestName: '', notes: '' });
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f1923] pb-3 -mx-4 px-4 pt-1 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Jobs</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">{jobs.length} total · {jobs.filter(j => j.status === 'pending').length} pending dispatch</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {orphanedCount > 0 && onCleanupOrphans && (
            <button
              onClick={handleCleanup}
              disabled={cleaningUp}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1a0e0e] border border-[#3a1a1a] text-[#e05c5c] text-xs font-semibold rounded-xl hover:bg-[#240e0e] transition-colors disabled:opacity-50"
            >
              <AlertCircle size={12} />
              {cleaningUp ? 'Cleaning…' : `Clean up ${orphanedCount} orphaned`}
            </button>
          )}
          {autoSyncing && (
            <span className="flex items-center gap-1.5 px-3 py-2 text-[#3a5070] text-xs">
              <span className="w-2 h-2 rounded-full bg-[#4a90d9] animate-pulse" />
              Syncing…
            </span>
          )}
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center gap-2 px-3 py-2 bg-[#4a90d9] hover:bg-[#5aa0e9] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={14} />
            Add Job
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-1">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filter === f.id
                ? 'bg-[#4a90d9] text-white'
                : 'bg-[#1a2335] border border-[#1e2d45] text-[#3a5070] hover:text-[#b8d4f0]'
            }`}
          >
            {f.label}
            {f.id !== 'all' && jobs.filter(j => j.status === f.id).length > 0 && (
              <span className="ml-1.5 opacity-70">{jobs.filter(j => j.status === f.id).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Job list */}
      {sortedJobs.length === 0 ? (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          {jobs.length === 0 ? (
            <>
              <Clock size={28} className="text-[#4a90d9]" />
              <p className="text-sm font-semibold text-white">No jobs yet</p>
              <p className="text-xs text-[#3a5070]">Click "Sync Uplisting" to auto-create jobs from upcoming checkouts, or add a manual job.</p>
            </>
          ) : (
            <>
              <AlertCircle size={28} className="text-[#3a5070]" />
              <p className="text-sm font-semibold text-white">No {filter} jobs</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedJobs.map(job => {
            const config = configMap.get(job.propertyId);
            const assignedCleaner = job.assignedCleanerId ? cleaners.find(c => c.id === job.assignedCleanerId) : null;

            return (
              <div key={job.id} ref={job.id === todayJobId ? todayMarkerRef : null} className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Row 1: property + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Home size={14} className="text-[#4a90d9] flex-shrink-0" />
                        <span className="font-semibold text-white text-sm">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</span>
                      </div>
                      <StatusBadge status={job.status} />
                      {job.portalData && (job.portalData.damageNotes?.trim() || (job.portalData.damageMedia ?? []).length > 0) && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-[#2a0a0a] border-[#e05c5c] text-[#e05c5c]">
                          🚨 Damage Reported
                        </span>
                      )}
                      {job.portalData?.suppliesNotes?.trim() && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-[#2a1e00] border-[#f59e0b] text-[#f59e0b]">
                          📦 Supplies Needed
                        </span>
                      )}
                      {job.source === 'manual' && (
                        <span className="text-xs text-[#3a5070] border border-[#2a4060] rounded-full px-2 py-0.5">Manual</span>
                      )}
                    </div>

                    {/* Row 2: date info */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar size={12} className="text-[#3a5070]" />
                        <span className="text-[#3a5070]">Cleaning:</span>
                        <span className="text-[#b8d4f0] font-medium">{fmt(job.checkoutDate)}</span>
                      </div>
                      {job.guestName && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <User size={12} className="text-[#3a5070]" />
                          <span className="text-[#3a5070]">Guest:</span>
                          <span className="text-[#b8d4f0]">{job.guestName}</span>
                        </div>
                      )}
                    </div>

                    {/* Row 3: financials + cleaner */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {job.cleaningFee > 0 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <DollarSign size={12} className="text-[#5ce0a0]" />
                          <span className="text-[#3a5070]">Client:</span>
                          <span className="text-[#5ce0a0] font-semibold">${job.cleaningFee}</span>
                        </div>
                      )}
                      {job.cleanerPayout > 0 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <DollarSign size={12} className="text-[#d07af5]" />
                          <span className="text-[#3a5070]">Payout:</span>
                          <span className="text-[#d07af5] font-semibold">${job.cleanerPayout}</span>
                        </div>
                      )}
                      {assignedCleaner && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <User size={12} className="text-[#4a90d9]" />
                          <span className="text-[#b8d4f0]">{assignedCleaner.name}</span>
                        </div>
                      )}
                      {config && config.assignedCleaners.length > 0 && !assignedCleaner && (
                        <div className="flex items-center gap-1.5 text-xs text-[#3a5070]">
                          <User size={12} />
                          <span>{config.assignedCleaners.length} cleaner{config.assignedCleaners.length > 1 ? 's' : ''} on roster</span>
                        </div>
                      )}
                    </div>

                    {/* Charge status row */}
                    {job.chargedAt && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 text-xs text-[#5ce0a0]">
                          <CreditCard size={12} />
                          <span>Charged {new Date(job.chargedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        {job.payoutSentAt && (
                          <span className="text-xs text-[#d07af5]">· Payout sent</span>
                        )}
                      </div>
                    )}

                    {job.notes && (
                      <p className="text-xs text-[#3a5070] italic">{job.notes}</p>
                    )}
                    {chargeErrors[job.id] && (
                      <p className="text-xs text-[#e05c5c]">{chargeErrors[job.id]}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {job.status === 'pending' && (
                      <button
                        onClick={() => handleDispatch(job)}
                        disabled={dispatching === job.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a90d9] hover:bg-[#5aa0e9] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <Send size={12} />
                        {dispatching === job.id ? 'Sending…' : 'Dispatch'}
                      </button>
                    )}
                    {job.status === 'dispatched' && (
                      <button
                        onClick={() => handleStatusChange(job, 'accepted')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#162035] border border-[#1e3a5a] text-[#4a90d9] text-xs font-semibold rounded-lg hover:bg-[#1e2d45] transition-colors whitespace-nowrap"
                      >
                        <CheckCircle size={12} />
                        Mark Accepted
                      </button>
                    )}
                    {(job.status === 'dispatched' || job.status === 'accepted') && (
                      <button
                        onClick={() => handleRedispatch(job)}
                        disabled={dispatching === job.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1000] border border-[#4a3a10] text-[#d0954a] text-xs font-semibold rounded-lg hover:bg-[#251800] transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <Send size={12} />
                        {dispatching === job.id ? 'Sending…' : 'Re-dispatch'}
                      </button>
                    )}
                    {(job.status === 'accepted' || job.status === 'in_progress') && (
                      <button
                        onClick={() => handleStatusChange(job, 'completed')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a2518] border border-[#1e4030] text-[#5ce0a0] text-xs font-semibold rounded-lg hover:bg-[#0f3020] transition-colors whitespace-nowrap"
                      >
                        <CheckCircle size={12} />
                        Complete
                      </button>
                    )}
                    {job.status === 'completed' && !job.chargedAt && (
                      <button
                        onClick={() => handleUndoComplete(job)}
                        disabled={undoing === job.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a2e] border border-[#3a3a5a] text-[#9090d0] text-xs font-semibold rounded-lg hover:bg-[#22223a] transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <XCircle size={12} />
                        {undoing === job.id ? 'Undoing…' : 'Undo Complete'}
                      </button>
                    )}
                    {job.status === 'completed' && config?.stripePaymentMethodId && !job.chargedAt && (
                      <button
                        onClick={() => handleCharge(job)}
                        disabled={charging === job.id}
                        title="Auto-charge failed — click to retry"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a1e0e] border border-[#5a3a1a] text-[#d0954a] text-xs font-semibold rounded-lg hover:bg-[#3a2810] transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <CreditCard size={12} />
                        {charging === job.id ? 'Retrying…' : `Retry Charge $${job.cleaningFee}`}
                      </button>
                    )}
                    {(job.status === 'pending' || job.status === 'dispatched' || job.status === 'accepted' || job.status === 'in_progress') && !job.chargedAt && (
                      <button
                        onClick={() => handleStatusChange(job, 'cancelled')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a0e0e] border border-[#3a1a1a] text-[#e05c5c] text-xs font-semibold rounded-lg hover:bg-[#240e0e] transition-colors whitespace-nowrap"
                      >
                        <XCircle size={12} />
                        Cancel
                      </button>
                    )}
                    {job.status === 'completed' && job.portalData && (
                      <button
                        onClick={() => setExpandedReport(expandedReport === job.id ? null : job.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a1e30] border border-[#1e3a5a] text-[#4a90d9] text-xs font-semibold rounded-lg hover:bg-[#0f2a40] transition-colors whitespace-nowrap"
                      >
                        <FileText size={12} />
                        {expandedReport === job.id ? 'Hide' : 'View Report'}
                        {expandedReport === job.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Cleaning Report Panel */}
                {expandedReport === job.id && job.portalData && (() => {
                  const pd = job.portalData;
                  const checkItems = Object.entries(pd.checklist);
                  const doneCount = checkItems.filter(([, v]) => v).length;
                  return (
                    <div className="mt-4 pt-4 border-t border-[#1e2d45] space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#b8d4f0]">Cleaning Report</p>
                        <p className="text-xs text-[#3a5070]">
                          Submitted {new Date(pd.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Checklist */}
                      {checkItems.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[#3a5070] mb-2">
                            Checklist — {doneCount}/{checkItems.length} completed
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {checkItems.map(([item, done]) => (
                              <div key={item} className="flex items-center gap-1.5 text-xs">
                                {done
                                  ? <CheckCircle size={12} className="text-[#5ce0a0] flex-shrink-0" />
                                  : <XCircle size={12} className="text-[#e05c5c] flex-shrink-0" />
                                }
                                <span className={done ? 'text-[#b8d4f0]' : 'text-[#e05c5c]'}>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cleaning Photos */}
                      {pd.photos.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[#3a5070] mb-2 flex items-center gap-1.5">
                            <Image size={12} />
                            {pd.photos.length} Cleaning Photo{pd.photos.length !== 1 ? 's' : ''}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {pd.photos.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`Photo ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-[#1e2d45] hover:border-[#4a90d9] transition-colors" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Damage Notes */}
                      {pd.damageNotes && (
                        <div className="bg-[#1a0e0e] border border-[#3a1a1a] rounded-xl p-3">
                          <p className="text-xs font-semibold text-[#e05c5c] mb-1">Damage / Notes</p>
                          <p className="text-xs text-[#f0b8b8] whitespace-pre-wrap">{pd.damageNotes}</p>
                        </div>
                      )}

                      {/* Damage Media */}
                      {pd.damageMedia && pd.damageMedia.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[#e05c5c] mb-2">
                            {pd.damageMedia.length} Damage Media File{pd.damageMedia.length !== 1 ? 's' : ''}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {pd.damageMedia.map((url, i) => {
                              const isVideo = url.startsWith('data:video') || /\.(mp4|webm|mov)$/i.test(url);
                              return isVideo ? (
                                <video
                                  key={i}
                                  src={url}
                                  controls
                                  className="w-28 h-20 object-cover rounded-lg border-2 border-[#e05c5c]"
                                />
                              ) : (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt={`Damage ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border-2 border-[#e05c5c] hover:opacity-80 transition-opacity" />
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {!pd.damageNotes && (!pd.damageMedia || pd.damageMedia.length === 0) && (
                        <p className="text-xs text-[#3a5070] italic">No damage reported.</p>
                      )}

                      {/* Supplies */}
                      {pd.suppliesNotes?.trim() && (
                        <div className="bg-[#1a1200] border border-[#f59e0b] rounded-xl p-3 mt-2">
                          <p className="text-xs font-semibold text-[#f59e0b] mb-1">📦 Supplies Needed</p>
                          <p className="text-xs text-[#fde68a] whitespace-pre-wrap">{pd.suppliesNotes}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Job Modal */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
              <h2 className="font-bold text-white">Add Manual Job</h2>
              <button onClick={() => setShowManual(false)} className="text-[#3a5070] hover:text-white transition-colors text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Property *</label>
                {configs.length > 0 ? (
                  <select
                    className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                    value={manualForm.propertyId}
                    onChange={e => {
                      const config = configs.find(c => c.propertyId === e.target.value);
                      setManualForm(f => ({ ...f, propertyId: e.target.value, propertyName: config?.propertyName ?? '' }));
                    }}
                  >
                    <option value="">Select enrolled property…</option>
                    {configs.map(c => <option key={c.id} value={c.propertyId}>{displayName(c.propertyId, c.propertyName, uplistingProperties)}</option>)}
                    <option value="__custom">Other / custom property</option>
                  </select>
                ) : (
                  <input
                    className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={manualForm.propertyName}
                    onChange={e => setManualForm(f => ({ ...f, propertyName: e.target.value, propertyId: e.target.value }))}
                    placeholder="Property name or address"
                  />
                )}
                {manualForm.propertyId === '__custom' && (
                  <input
                    className="w-full mt-2 bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={manualForm.propertyName}
                    onChange={e => setManualForm(f => ({ ...f, propertyName: e.target.value }))}
                    placeholder="Property name or address"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Cleaning Date *</label>
                <input
                  type="date"
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                  value={manualForm.checkoutDate}
                  onChange={e => setManualForm(f => ({ ...f, checkoutDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Guest Name</label>
                <input
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={manualForm.guestName}
                  onChange={e => setManualForm(f => ({ ...f, guestName: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Notes</label>
                <textarea
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none"
                  rows={2}
                  value={manualForm.notes}
                  onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Special instructions, access codes, etc."
                />
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => setShowManual(false)}
                className="flex-1 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveManual}
                disabled={savingManual || !manualForm.checkoutDate || (!manualForm.propertyId && !manualForm.propertyName)}
                className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors disabled:opacity-50"
              >
                {savingManual ? 'Saving…' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

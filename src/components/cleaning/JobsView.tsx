import { useState } from 'react';
import {
  RefreshCw, Plus, Send, CheckCircle, XCircle, Clock, AlertCircle, Home, User, DollarSign, Calendar, CreditCard,
} from 'lucide-react';
import type { CleaningJob, CleaningPropertyConfig, Cleaner } from '../../types/cleaning';
import type { UplistingReservation, UplistingProperty } from '../../services/uplisting';
import { dispatchCleaningJob } from '../../services/cleaningApi';

interface Props {
  jobs: CleaningJob[];
  configs: CleaningPropertyConfig[];
  cleaners: Cleaner[];
  reservations: UplistingReservation[];
  uplistingProperties: UplistingProperty[];
  onSyncJobs: (newJobs: CleaningJob[]) => Promise<void>;
  onUpdateJob: (job: CleaningJob) => Promise<void>;
  onDeleteJob?: (id: string) => Promise<void>;
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

export default function JobsView({ jobs, configs, cleaners, reservations, uplistingProperties, onSyncJobs, onUpdateJob, autoSyncing }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [charging, setCharging] = useState<string | null>(null);
  const [chargeErrors, setChargeErrors] = useState<Record<string, string>>({});
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState<ManualJobForm>({
    propertyId: '', propertyName: '', checkoutDate: '', guestName: '', notes: '',
  });
  const [savingManual, setSavingManual] = useState(false);
  const [syncingFees, setSyncingFees] = useState(false);
  const [feesSyncMsg, setFeesSyncMsg] = useState('');

  const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'dispatched', label: 'Dispatched' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);
  const sortedJobs = [...filtered].sort((a, b) => b.checkoutDate.localeCompare(a.checkoutDate));

  const configMap = new Map(configs.map(c => [c.propertyId, c]));
  const existingReservationIds = new Set(jobs.map(j => j.reservationId).filter(Boolean));

  async function handleSyncFees() {
    const toUpdate = jobs.filter(j => {
      if (j.chargedAt) return false; // never touch already-charged jobs
      const cfg = configMap.get(j.propertyId ?? '');
      return cfg && (cfg.cleaningFee !== j.cleaningFee);
    });
    if (!toUpdate.length) { setFeesSyncMsg('All uncharged jobs already match.'); return; }
    setSyncingFees(true);
    setFeesSyncMsg('');
    try {
      await Promise.all(toUpdate.map(j => {
        const cfg = configMap.get(j.propertyId ?? '')!;
        return onUpdateJob({ ...j, cleaningFee: cfg.cleaningFee, updatedAt: new Date().toISOString() });
      }));
      setFeesSyncMsg(`Updated ${toUpdate.length} job${toUpdate.length !== 1 ? 's' : ''}.`);
    } catch {
      setFeesSyncMsg('Update failed — please try again.');
    } finally {
      setSyncingFees(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const today = new Date();
      const windowStart = new Date(today); windowStart.setDate(today.getDate() - 14);
      const windowEnd   = new Date(today); windowEnd.setDate(today.getDate() + 90);
      const startStr = windowStart.toISOString().slice(0, 10);
      const endStr   = windowEnd.toISOString().slice(0, 10);

      const relevant = reservations.filter(r => {
        if (!r.check_out) return false;
        if (r.check_out < startStr || r.check_out > endStr) return false;
        if (!configMap.has(r.listing_id)) return false;
        if (existingReservationIds.has(r.id)) return false;
        return true;
      });

      if (relevant.length === 0) {
        setSyncMsg('All reservations are already synced — no new jobs created.');
        return;
      }

      const now = new Date().toISOString();
      const newJobs: CleaningJob[] = relevant.map(r => {
        const config = configMap.get(r.listing_id)!;
        return {
          id: `cj_${Date.now()}_${r.id}`,
          reservationId: r.id,
          propertyId: r.listing_id,
          propertyName: config.propertyName,
          guestName: r.guest_name || undefined,
          checkoutDate: r.check_out,
          checkinDate: undefined,
          status: 'pending' as const,
          cleaningFee: config.cleaningFee,
          cleanerPayout: 0, // set when cleaner accepts (each has own negotiated rate)
          source: 'uplisting' as const,
          createdAt: now,
          updatedAt: now,
        };
      });

      await onSyncJobs(newJobs);
      setSyncMsg(`✓ ${newJobs.length} new job${newJobs.length === 1 ? '' : 's'} created from Uplisting checkouts.`);
    } finally {
      setSyncing(false);
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Jobs</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">{jobs.length} total · {jobs.filter(j => j.status === 'pending').length} pending dispatch</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncFees}
            disabled={syncingFees}
            title="Update all uncharged jobs to use the current cleaning fee from Properties"
            className="flex items-center gap-2 px-3 py-2 bg-[#162035] border border-[#1e3a5a] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors disabled:opacity-50"
          >
            <DollarSign size={14} className={syncingFees ? 'animate-pulse' : ''} />
            {syncingFees ? 'Syncing…' : 'Sync Fees'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || autoSyncing}
            className="flex items-center gap-2 px-3 py-2 bg-[#162035] border border-[#1e3a5a] text-[#4a90d9] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing || autoSyncing ? 'animate-spin' : ''} />
            {autoSyncing ? 'Auto-syncing…' : 'Sync Uplisting'}
          </button>
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center gap-2 px-3 py-2 bg-[#4a90d9] hover:bg-[#5aa0e9] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={14} />
            Add Job
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="bg-[#0a2518] border border-[#1e4030] text-[#5ce0a0] text-sm px-4 py-2.5 rounded-xl">
          {syncMsg}
        </div>
      )}
      {feesSyncMsg && (
        <div className="bg-[#0a1f30] border border-[#1e3a5a] text-[#4a90d9] text-sm px-4 py-2.5 rounded-xl">
          {feesSyncMsg}
        </div>
      )}

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
              <div key={job.id} className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Row 1: property + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Home size={14} className="text-[#4a90d9] flex-shrink-0" />
                        <span className="font-semibold text-white text-sm">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</span>
                      </div>
                      <StatusBadge status={job.status} />
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
                    {(job.status === 'accepted' || job.status === 'in_progress') && (
                      <button
                        onClick={() => handleStatusChange(job, 'completed')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a2518] border border-[#1e4030] text-[#5ce0a0] text-xs font-semibold rounded-lg hover:bg-[#0f3020] transition-colors whitespace-nowrap"
                      >
                        <CheckCircle size={12} />
                        Complete
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
                    {(job.status === 'pending' || job.status === 'dispatched') && (
                      <button
                        onClick={() => handleStatusChange(job, 'cancelled')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a0e0e] border border-[#3a1a1a] text-[#e05c5c] text-xs font-semibold rounded-lg hover:bg-[#240e0e] transition-colors whitespace-nowrap"
                      >
                        <XCircle size={12} />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
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

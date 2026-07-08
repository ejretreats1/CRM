import { useState, useEffect, useRef } from 'react';
import {
  Briefcase, Users, CreditCard,
  CheckCircle, TrendingUp, DollarSign, Sparkles, AlertCircle, RefreshCw,
} from 'lucide-react';
import type { View } from '../../types';
import type { CleaningJob, Cleaner, CleaningPropertyConfig } from '../../types/cleaning';
import type { UplistingProperty, UplistingReservation } from '../../services/uplisting';
import { dispatchCleaningJob } from '../../services/cleaningApi';

function displayName(propertyId: string | undefined, propertyName: string, props: UplistingProperty[]): string {
  const p = props.find(up => up.id === propertyId);
  return p?.nickname || p?.name || propertyName;
}
import {
  type CleaningLead,
  type CleaningSop,
  fetchCleaners, upsertCleaner, deleteCleaner,
  fetchPropertyConfigs, upsertPropertyConfig, deletePropertyConfig,
  fetchCleaningJobs, upsertCleaningJob, bulkUpsertCleaningJobs, deleteCleaningJob,
  fetchCleaningLeads, upsertCleaningLead, bulkUpsertCleaningLeads, deleteCleaningLead,
  fetchCleaningSops, upsertCleaningSop, deleteCleaningSop,
} from '../../services/cleaningDb';
import JobsView from './JobsView';
import CleanersView from './CleanersView';
import PropertiesView from './PropertiesView';
import ScheduleView from './ScheduleView';
import CleaningLeadsView from './CleaningLeadsView';
import SopsView from './SopsView';
import EmailMarketingView from './EmailMarketingView';
import LeadScraperView from './LeadScraperView';

type CleaningView = 'cleaning-dashboard' | 'cleaning-schedule' | 'cleaning-jobs' | 'cleaning-properties' | 'cleaning-cleaners' | 'cleaning-payments' | 'cleaning-leads' | 'cleaning-sops' | 'cleaning-email' | 'cleaning-scraper';

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
  reservations: UplistingReservation[];
  uplistingProperties: UplistingProperty[];
}

function fmtCurrency(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function CleaningDashboard({ jobs, cleaners, configs, uplistingProperties }: { jobs: CleaningJob[]; cleaners: Cleaner[]; configs: CleaningPropertyConfig[]; uplistingProperties: UplistingProperty[] }) {
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekStr  = weekStart.toISOString().slice(0,10);
  const weekEndStr = weekEnd.toISOString().slice(0,10);
  const monthStr = monthStart.toISOString().slice(0,10);

  const jobsThisWeek = jobs.filter(j => j.checkoutDate >= weekStr && j.checkoutDate < weekEndStr && j.status !== 'cancelled').length;
  const chargedThisMonth = jobs
    .filter(j => j.checkoutDate >= monthStr && j.chargedAt)
    .reduce((s, j) => s + j.cleaningFee, 0);
  const activeCleaners = cleaners.filter(c => c.status === 'active').length;
  const profitThisMonth = jobs
    .filter(j => j.checkoutDate >= monthStr && j.chargedAt)
    .reduce((s, j) => s + (j.cleaningFee - j.cleanerPayout), 0);

  const awaitingCharge = jobs.filter(j => j.status === 'completed' && !j.chargedAt);

  const stats = [
    { label: 'Jobs This Week',      value: jobsThisWeek > 0 ? String(jobsThisWeek) : '—', icon: Briefcase,   color: 'text-[#4a90d9]', bg: 'bg-[#0d1e35]' },
    { label: 'Charged This Month',  value: chargedThisMonth > 0 ? fmtCurrency(chargedThisMonth) : '—', icon: DollarSign, color: 'text-[#5ce0a0]', bg: 'bg-[#0a2518]' },
    { label: 'Active Cleaners',     value: activeCleaners > 0 ? String(activeCleaners) : '—', icon: Users,       color: 'text-[#d07af5]', bg: 'bg-[#1a0a2e]' },
    { label: 'Net Profit',          value: profitThisMonth > 0 ? fmtCurrency(profitThisMonth) : '—', icon: TrendingUp,  color: 'text-[#d0954a]', bg: 'bg-[#1a1000]' },
  ];

  const upcomingJobs = jobs
    .filter(j => j.checkoutDate >= now.toISOString().slice(0,10) && j.status !== 'cancelled' && j.status !== 'completed')
    .sort((a, b) => a.checkoutDate.localeCompare(b.checkoutDate))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Cleaning Dashboard</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Overview of your cleaning business — {configs.length} properties · {cleaners.filter(c=>c.status==='active').length} cleaners</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`${s.bg} border border-[#1e2d45] rounded-2xl p-4 space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#3a5070] font-medium">{s.label}</span>
              <s.icon size={16} className={s.color} />
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {awaitingCharge.length > 0 && (
        <div className="flex items-center gap-2.5 bg-[#1a1000] border border-[#3a3200] rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-[#d0954a] flex-shrink-0" />
          <p className="text-xs text-[#d0954a]">
            <strong>{awaitingCharge.length}</strong> completed job{awaitingCharge.length > 1 ? 's' : ''} {awaitingCharge.length > 1 ? 'are' : 'is'} still awaiting charge — auto-charge may have failed. Check the Payments tab to retry.
          </p>
        </div>
      )}

      {upcomingJobs.length > 0 && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-3">Upcoming Cleanings</h2>
          <div className="space-y-2">
            {upcomingJobs.map(job => {
              const d = new Date(job.checkoutDate + 'T12:00:00');
              const statusBg: Record<string, string> = {
                pending: 'text-[#d0954a]', dispatched: 'text-[#4a90d9]', accepted: 'text-[#5aa0e9]',
              };
              return (
                <div key={job.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#1e2d45] last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</p>
                    <p className="text-xs text-[#3a5070]">{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} {job.guestName && `· ${job.guestName}`}</p>
                  </div>
                  <span className={`text-xs font-semibold ${statusBg[job.status] ?? 'text-[#3a5070]'}`}>{job.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-[#162035] border border-[#1e3a5a] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-[#4a90d9]" />
          <h2 className="text-sm font-bold text-white">Build Roadmap</h2>
        </div>
        <div className="space-y-2">
          {[
            { phase: 'Phase 1', label: 'CRM split + structure', done: true },
            { phase: 'Phase 2', label: 'Job engine — auto-create + auto-dispatch jobs from Uplisting checkouts', done: true },
            { phase: 'Phase 3', label: 'Cleaner portal — photos, checklist, damage reports', done: true },
            { phase: 'Phase 4', label: 'Client onboarding — agreement + card on file, batch invites', done: true },
            { phase: 'Phase 5', label: 'Automated payments — charge clients, pay cleaners via Stripe', done: true },
            { phase: 'Phase 6', label: 'Profit dashboard + payments reporting', done: true },
          ].map(row => (
            <div key={row.phase} className="flex items-center gap-3">
              <CheckCircle size={14} className={row.done ? 'text-[#5ce0a0]' : 'text-[#1e3a5a]'} />
              <span className="text-xs text-[#4a90d9] font-semibold w-16 flex-shrink-0">{row.phase}</span>
              <span className={`text-xs ${row.done ? 'text-white' : 'text-[#3a5070]'}`}>{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type PaymentFilter = 'all' | 'charged' | 'not_charged' | 'payout_sent';

function CleaningPayments({
  jobs, uplistingProperties, onRetryCharge,
}: {
  jobs: CleaningJob[];
  uplistingProperties: UplistingProperty[];
  onRetryCharge: (job: CleaningJob) => Promise<void>;
}) {
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  const completed = jobs.filter(j => j.status === 'completed');
  const totalCharged = completed.filter(j => j.chargedAt).reduce((s, j) => s + j.cleaningFee, 0);
  const totalPayouts = completed.filter(j => j.payoutSentAt).reduce((s, j) => s + j.cleanerPayout, 0);
  const netProfit = totalCharged - totalPayouts;
  const pendingCount = completed.filter(j => !j.chargedAt).length;

  const summary = [
    { label: 'Total Charged',   value: fmtCurrency(totalCharged), icon: DollarSign, color: 'text-[#5ce0a0]', bg: 'bg-[#0a2518]' },
    { label: 'Total Payouts',   value: fmtCurrency(totalPayouts), icon: CreditCard, color: 'text-[#d07af5]', bg: 'bg-[#1a0a2e]' },
    { label: 'Net Profit',      value: fmtCurrency(netProfit),    icon: TrendingUp, color: 'text-[#d0954a]', bg: 'bg-[#1a1000]' },
    { label: 'Awaiting Charge', value: String(pendingCount),      icon: AlertCircle, color: pendingCount > 0 ? 'text-[#e05c5c]' : 'text-[#3a5070]', bg: pendingCount > 0 ? 'bg-[#1a0e0e]' : 'bg-[#0d1e35]' },
  ];

  const FILTERS: { id: PaymentFilter; label: string }[] = [
    { id: 'all', label: 'All Completed' },
    { id: 'not_charged', label: 'Awaiting Charge' },
    { id: 'charged', label: 'Charged' },
    { id: 'payout_sent', label: 'Payout Sent' },
  ];

  let filtered = completed;
  if (filter === 'charged') filtered = filtered.filter(j => j.chargedAt);
  if (filter === 'not_charged') filtered = filtered.filter(j => !j.chargedAt);
  if (filter === 'payout_sent') filtered = filtered.filter(j => j.payoutSentAt);
  filtered = [...filtered].sort((a, b) => b.checkoutDate.localeCompare(a.checkoutDate));

  async function handleRetry(job: CleaningJob) {
    setRetrying(job.id);
    setRetryErrors(prev => { const next = { ...prev }; delete next[job.id]; return next; });
    try {
      await onRetryCharge(job);
    } catch (e) {
      setRetryErrors(prev => ({ ...prev, [job.id]: e instanceof Error ? e.message : 'Retry failed.' }));
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Payments</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Client charges, cleaner payouts, and profit tracking</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.map(s => (
          <div key={s.label} className={`${s.bg} border border-[#1e2d45] rounded-2xl p-4 space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#3a5070] font-medium">{s.label}</span>
              <s.icon size={16} className={s.color} />
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

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
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <DollarSign size={28} className="text-[#4a90d9]" />
          <p className="text-sm font-semibold text-white">No jobs here yet</p>
          <p className="text-xs text-[#3a5070]">Completed jobs with charge &amp; payout activity will show up here.</p>
        </div>
      ) : (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2d45] text-[#3a5070] text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Property</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
                <th className="text-right px-4 py-3">Fee</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Payout</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Net</th>
                <th className="text-left px-4 py-3">Charge</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Payout</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d45]">
              {filtered.map(job => (
                <tr key={job.id} className="hover:bg-[#162035] transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{displayName(job.propertyId, job.propertyName, uplistingProperties)}</td>
                  <td className="px-4 py-3 text-[#b8d4f0] hidden sm:table-cell">
                    {new Date(job.checkoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right text-[#5ce0a0] font-semibold">${job.cleaningFee}</td>
                  <td className="px-4 py-3 text-right text-[#d07af5] hidden md:table-cell">${job.cleanerPayout}</td>
                  <td className="px-4 py-3 text-right text-[#d0954a] font-semibold hidden lg:table-cell">${job.cleaningFee - job.cleanerPayout}</td>
                  <td className="px-4 py-3">
                    {job.chargedAt ? (
                      <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-medium">
                        <CheckCircle size={11} /> Charged
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[#e05c5c] font-medium">
                        <AlertCircle size={11} /> Not charged
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {job.payoutSentAt ? (
                      <span className="flex items-center gap-1 text-xs text-[#d07af5] font-medium">
                        <CheckCircle size={11} /> Sent
                      </span>
                    ) : (
                      <span className="text-xs text-[#3a5070]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!job.chargedAt && (
                      <button
                        onClick={() => handleRetry(job)}
                        disabled={retrying === job.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#2a1e0e] border border-[#5a3a1a] text-[#d0954a] text-xs font-semibold rounded-lg hover:bg-[#3a2810] transition-colors disabled:opacity-50 ml-auto"
                      >
                        <CreditCard size={11} />
                        {retrying === job.id ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                    {retryErrors[job.id] && (
                      <p className="text-xs text-[#e05c5c] mt-1 max-w-[160px]">{retryErrors[job.id]}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CleaningBusiness({ currentView, reservations, uplistingProperties }: Props) {
  const active = (currentView as CleaningView) || 'cleaning-dashboard';

  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [configs, setConfigs] = useState<CleaningPropertyConfig[]>([]);
  const [jobs, setJobs] = useState<CleaningJob[]>([]);
  const [leads, setLeads] = useState<CleaningLead[]>([]);
  const [sops, setSops] = useState<CleaningSop[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setDbError(null);
    try {
      const [c, pc, j] = await Promise.all([fetchCleaners(), fetchPropertyConfigs(), fetchCleaningJobs()]);
      setCleaners(c);
      setConfigs(pc);
      setJobs(j);
      fetchCleaningLeads().then(setLeads).catch(() => {});
      fetchCleaningSops().then(setSops).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('relation') || msg.includes('does not exist')) {
        setDbError('SETUP_NEEDED');
      } else {
        setDbError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // Cleaners
  async function handleSaveCleaner(c: Cleaner) {
    await upsertCleaner(c);
    setCleaners(prev => {
      const exists = prev.find(x => x.id === c.id);
      return exists ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev];
    });
  }
  async function handleDeleteCleaner(id: string) {
    await deleteCleaner(id);
    setCleaners(prev => prev.filter(c => c.id !== id));
  }

  // Property configs
  async function handleSaveConfig(c: CleaningPropertyConfig) {
    await upsertPropertyConfig(c);
    setConfigs(prev => {
      const exists = prev.find(x => x.id === c.id);
      return exists ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev];
    });
  }
  async function handleDeleteConfig(id: string) {
    await deletePropertyConfig(id);
    setConfigs(prev => prev.filter(c => c.id !== id));
  }

  // Jobs
  async function handleSyncJobs(newJobs: CleaningJob[]) {
    await bulkUpsertCleaningJobs(newJobs);
    setJobs(prev => {
      const existingIds = new Set(prev.map(j => j.id));
      const toAdd = newJobs.filter(j => !existingIds.has(j.id));
      return [...toAdd, ...prev];
    });
  }
  async function handleUpdateJob(job: CleaningJob) {
    await upsertCleaningJob(job);
    setJobs(prev => prev.map(j => j.id === job.id ? job : j));
  }
  async function handleDeleteJob(id: string) {
    await deleteCleaningJob(id);
    setJobs(prev => prev.filter(j => j.id !== id));
  }
  // iCal sync
  async function handleSyncIcal(propertyId: string) {
    const r = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow: 'cleaning', action: 'ical-sync', propertyId }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Sync failed.');
    const [j, pc] = await Promise.all([fetchCleaningJobs(), fetchPropertyConfigs()]);
    setJobs(j);
    setConfigs(pc);
    return d as { created: number; cancelled: number; errors: string[] };
  }

  async function handleSyncAllIcal() {
    const r = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow: 'cleaning', action: 'ical-sync-all' }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Sync all failed.');
    const [j, pc] = await Promise.all([fetchCleaningJobs(), fetchPropertyConfigs()]);
    setJobs(j);
    setConfigs(pc);
    return d as { created: number; cancelled: number; errors: string[]; properties: { property: string; created: number; cancelled: number; errors: string[] }[] };
  }

  // Leads
  async function handleSaveLead(lead: CleaningLead) {
    await upsertCleaningLead(lead);
    setLeads(prev => {
      const exists = prev.find(x => x.id === lead.id);
      return exists ? prev.map(x => x.id === lead.id ? lead : x) : [lead, ...prev];
    });
  }
  async function handleBulkSaveLead(newLeads: CleaningLead[]) {
    await bulkUpsertCleaningLeads(newLeads);
    setLeads(prev => {
      const map = new Map(prev.map(l => [l.id, l]));
      for (const l of newLeads) map.set(l.id, l);
      return Array.from(map.values());
    });
  }
  async function handleDeleteLead(id: string) {
    await deleteCleaningLead(id);
    setLeads(prev => prev.filter(l => l.id !== id));
  }

  async function handleSaveSop(sop: CleaningSop) {
    await upsertCleaningSop(sop);
    setSops(prev => {
      const exists = prev.find(x => x.id === sop.id);
      return exists ? prev.map(x => x.id === sop.id ? sop : x) : [...prev, sop];
    });
  }
  async function handleDeleteSop(id: string) {
    await deleteCleaningSop(id);
    setSops(prev => prev.filter(s => s.id !== id));
  }

  async function handleRetryCharge(job: CleaningJob) {
    const r = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow: 'cleaning', action: 'charge-and-payout', jobId: job.id }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Charge failed.');
    const now = new Date().toISOString();
    await handleUpdateJob({ ...job, chargedAt: now, updatedAt: now });
  }

  // Auto-create + auto-dispatch jobs the moment a new reservation checkout appears —
  // no manual "Sync" or "Dispatch" click needed when a property has an assigned cleaner roster.
  const autoSyncRef = useRef(false);
  const [autoSyncing, setAutoSyncing] = useState(false);

  useEffect(() => {
    if (loading || dbError) return;
    autoSyncAndDispatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, dbError, reservations, configs]);

  async function autoSyncAndDispatch() {
    if (autoSyncRef.current) return;
    autoSyncRef.current = true;
    setAutoSyncing(true);
    try {
      const configMap = new Map(configs.map(c => [c.propertyId, c]));
      const existingReservationIds = new Set(jobs.map(j => j.reservationId).filter(Boolean));

      const today = new Date();
      const windowStart = new Date(today); windowStart.setDate(today.getDate() - 14);
      const startStr = windowStart.toISOString().slice(0, 10);

      const relevant = reservations.filter(r => {
        if (!r.check_out) return false;
        if (r.check_out < startStr) return false; // skip checkouts older than 14 days
        if (!configMap.has(r.listing_id)) return false;
        if (existingReservationIds.has(r.id)) return false;
        return true;
      });

      if (relevant.length === 0) return;

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
          cleanerPayout: 0,
          source: 'uplisting' as const,
          createdAt: now,
          updatedAt: now,
        };
      });

      await handleSyncJobs(newJobs);

      // Dispatch each freshly created job to its property's full cleaner roster —
      // first cleaner to accept locks the job (race-safe on the server).
      for (const job of newJobs) {
        const config = configMap.get(job.propertyId)!;
        const assignedCleaners = config.assignedCleaners
          .map(ac => {
            const profile = cleaners.find(c => c.id === ac.id);
            return profile && profile.status === 'active' ? { id: profile.id, name: profile.name, email: profile.email, payout: ac.payout } : null;
          })
          .filter((c): c is { id: string; name: string; email: string; payout: number } => !!c);

        if (assignedCleaners.length === 0) continue; // no roster yet — leave pending for manual dispatch

        try {
          await dispatchCleaningJob({
            jobId: job.id,
            propertyName: job.propertyName,
            checkoutDate: job.checkoutDate,
            checkinDate: job.checkinDate,
            guestName: job.guestName,
            cleanerPayout: 0,
            notes: job.notes,
            cleaners: assignedCleaners,
          });
          const dispatchedAt = new Date().toISOString();
          await handleUpdateJob({ ...job, status: 'dispatched', dispatchedAt, updatedAt: dispatchedAt });
        } catch {
          // leave as pending — admin can dispatch manually from the Jobs tab
        }
      }
    } finally {
      setAutoSyncing(false);
      autoSyncRef.current = false;
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-[#3a5070]">Loading cleaning data…</p>
      </div>
    );
  }

  const SQL_SETUP = `-- Run in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS cleaners (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  stripe_account_id TEXT, status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cleaners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON cleaners FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS cleaning_property_configs (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL UNIQUE,
  property_name TEXT NOT NULL, cleaning_fee NUMERIC NOT NULL DEFAULT 0,
  assigned_cleaners JSONB NOT NULL DEFAULT '[]',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cleaning_property_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON cleaning_property_configs FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS cleaning_jobs (
  id TEXT PRIMARY KEY, reservation_id TEXT, property_id TEXT NOT NULL,
  property_name TEXT NOT NULL, guest_name TEXT,
  checkout_date DATE NOT NULL, checkin_date DATE, status TEXT NOT NULL DEFAULT 'pending',
  assigned_cleaner_id TEXT, assigned_cleaner_name TEXT,
  cleaning_fee NUMERIC NOT NULL DEFAULT 0, cleaner_payout NUMERIC NOT NULL DEFAULT 0,
  dispatched_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  notes TEXT, source TEXT NOT NULL DEFAULT 'uplisting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cleaning_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON cleaning_jobs FOR ALL USING (true) WITH CHECK (true);`;

  if (dbError === 'SETUP_NEEDED') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="bg-[#1a1000] border border-[#3a3200] rounded-2xl p-5">
              <p className="text-sm font-bold text-[#d0954a] mb-1">Database setup needed</p>
              <p className="text-xs text-[#8a6030] mb-3">
                The cleaning tables don't exist yet. Run this SQL in your Supabase dashboard under SQL Editor:
              </p>
              <pre className="bg-[#0f1200] rounded-lg p-3 text-xs text-[#b8d4a0] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {SQL_SETUP}
              </pre>
              <button
                onClick={() => navigator.clipboard?.writeText(SQL_SETUP)}
                className="mt-3 text-xs text-[#4a90d9] hover:underline"
              >
                Copy SQL
              </button>
            </div>
            <button
              onClick={loadAll}
              className="w-full py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors"
            >
              Retry after running SQL
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {autoSyncing && (
        <div className="border-b border-[#1e2d45] bg-[#1a2335] px-4 py-1.5 flex-shrink-0 hidden sm:flex items-center justify-end">
          <div className="flex items-center gap-1.5 text-xs text-[#3a5070]">
            <RefreshCw size={11} className="animate-spin" />
            Auto-syncing…
          </div>
        </div>
      )}

      {/* Full-height views (manage their own layout) */}
      {active === 'cleaning-sops' && (
        <div className="flex-1 overflow-hidden">
          <SopsView sops={sops} onSave={handleSaveSop} onDelete={handleDeleteSop} />
        </div>
      )}

      {/* Padded scrollable views */}
      {active !== 'cleaning-sops' && active !== 'cleaning-email' && active !== 'cleaning-scraper' && (
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {active === 'cleaning-dashboard' && (
            <CleaningDashboard jobs={jobs} cleaners={cleaners} configs={configs} uplistingProperties={uplistingProperties} />
          )}
          {active === 'cleaning-schedule' && (
            <ScheduleView jobs={jobs} cleaners={cleaners} configs={configs} uplistingProperties={uplistingProperties} />
          )}
          {active === 'cleaning-jobs' && (
            <JobsView
              jobs={jobs}
              configs={configs}
              cleaners={cleaners}
              reservations={reservations}
              uplistingProperties={uplistingProperties}
              onSyncJobs={handleSyncJobs}
              onUpdateJob={handleUpdateJob}
              onDeleteJob={handleDeleteJob}
              autoSyncing={autoSyncing}
            />
          )}
          {active === 'cleaning-properties' && (
            <PropertiesView
              configs={configs}
              cleaners={cleaners}
              uplistingProperties={uplistingProperties}
              reservations={reservations}
              onSave={handleSaveConfig}
              onDelete={handleDeleteConfig}
              onSyncIcal={handleSyncIcal}
              onSyncAllIcal={handleSyncAllIcal}
            />
          )}
          {active === 'cleaning-cleaners' && (
            <CleanersView
              cleaners={cleaners}
              onSave={handleSaveCleaner}
              onDelete={handleDeleteCleaner}
            />
          )}
          {active === 'cleaning-payments' && (
            <CleaningPayments jobs={jobs} uplistingProperties={uplistingProperties} onRetryCharge={handleRetryCharge} />
          )}
          {active === 'cleaning-leads' && (
            <CleaningLeadsView leads={leads} onSave={handleSaveLead} onBulkSave={handleBulkSaveLead} onDelete={handleDeleteLead} />
          )}
        </div>
      )}

      {active === 'cleaning-email' && (
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <EmailMarketingView />
        </div>
      )}
      {active === 'cleaning-scraper' && (
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <LeadScraperView />
        </div>
      )}
    </div>
  );
}

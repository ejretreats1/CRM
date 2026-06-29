import { useState, useEffect } from 'react';
import {
  LayoutDashboard, CalendarDays, Briefcase, Home, Users, CreditCard,
  CheckCircle, TrendingUp, DollarSign, Sparkles,
} from 'lucide-react';
import type { View } from '../../types';
import type { CleaningJob, Cleaner, CleaningPropertyConfig } from '../../types/cleaning';
import type { UplistingProperty, UplistingReservation } from '../../services/uplisting';
import {
  fetchCleaners, upsertCleaner, deleteCleaner,
  fetchPropertyConfigs, upsertPropertyConfig, deletePropertyConfig,
  fetchCleaningJobs, upsertCleaningJob, bulkUpsertCleaningJobs, deleteCleaningJob,
} from '../../services/cleaningDb';
import JobsView from './JobsView';
import CleanersView from './CleanersView';
import PropertiesView from './PropertiesView';
import ScheduleView from './ScheduleView';

type CleaningView = 'cleaning-dashboard' | 'cleaning-schedule' | 'cleaning-jobs' | 'cleaning-properties' | 'cleaning-cleaners' | 'cleaning-payments';

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
  reservations: UplistingReservation[];
  uplistingProperties: UplistingProperty[];
}

const TABS: { id: CleaningView; label: string; icon: React.ElementType }[] = [
  { id: 'cleaning-dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { id: 'cleaning-schedule',    label: 'Schedule',    icon: CalendarDays },
  { id: 'cleaning-jobs',        label: 'Jobs',        icon: Briefcase },
  { id: 'cleaning-properties',  label: 'Properties',  icon: Home },
  { id: 'cleaning-cleaners',    label: 'Cleaners',    icon: Users },
  { id: 'cleaning-payments',    label: 'Payments',    icon: CreditCard },
];

function ComingSoonCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-8 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-[#162035] border border-[#1e3a5a] flex items-center justify-center">
        <Icon size={26} className="text-[#4a90d9]" />
      </div>
      <h3 className="text-white font-semibold text-base">{title}</h3>
      <p className="text-xs text-[#3a5070] max-w-xs leading-relaxed">{description}</p>
      <span className="text-xs bg-[#0f1923] border border-[#1e3a5a] text-[#4a90d9] px-3 py-1 rounded-full font-medium">Coming soon</span>
    </div>
  );
}

function fmtCurrency(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function CleaningDashboard({ jobs, cleaners, configs }: { jobs: CleaningJob[]; cleaners: Cleaner[]; configs: CleaningPropertyConfig[] }) {
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekStr  = weekStart.toISOString().slice(0,10);
  const weekEndStr = weekEnd.toISOString().slice(0,10);
  const monthStr = monthStart.toISOString().slice(0,10);

  const jobsThisWeek = jobs.filter(j => j.checkoutDate >= weekStr && j.checkoutDate < weekEndStr && j.status !== 'cancelled').length;
  const revenueThisMonth = jobs
    .filter(j => j.checkoutDate >= monthStr && j.status === 'completed')
    .reduce((s, j) => s + j.cleaningFee, 0);
  const activeCleaners = cleaners.filter(c => c.status === 'active').length;
  const profitThisMonth = jobs
    .filter(j => j.checkoutDate >= monthStr && j.status === 'completed')
    .reduce((s, j) => s + (j.cleaningFee - j.cleanerPayout), 0);

  const stats = [
    { label: 'Jobs This Week',    value: jobsThisWeek > 0 ? String(jobsThisWeek) : '—', icon: Briefcase,   color: 'text-[#4a90d9]', bg: 'bg-[#0d1e35]' },
    { label: 'Revenue This Month', value: revenueThisMonth > 0 ? fmtCurrency(revenueThisMonth) : '—', icon: DollarSign, color: 'text-[#5ce0a0]', bg: 'bg-[#0a2518]' },
    { label: 'Active Cleaners',   value: activeCleaners > 0 ? String(activeCleaners) : '—', icon: Users,       color: 'text-[#d07af5]', bg: 'bg-[#1a0a2e]' },
    { label: 'Net Profit',        value: profitThisMonth > 0 ? fmtCurrency(profitThisMonth) : '—', icon: TrendingUp,  color: 'text-[#d0954a]', bg: 'bg-[#1a1000]' },
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
                    <p className="text-sm font-medium text-white truncate">{job.propertyName}</p>
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
            { phase: 'Phase 2', label: 'Job engine — Uplisting sync, dispatch emails, status tracking', done: true },
            { phase: 'Phase 3', label: 'Cleaner portal — photos, checklist, damage reports', done: false },
            { phase: 'Phase 4', label: 'Client onboarding — agreement + card on file', done: false },
            { phase: 'Phase 5', label: 'Automated payments — charge clients, pay cleaners via Stripe', done: false },
            { phase: 'Phase 6', label: 'Profit dashboard + reporting', done: false },
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

function CleaningPayments() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Payments</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Client charges, cleaner payouts, and profit tracking</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ComingSoonCard icon={DollarSign}  title="Client Charges"   description="Automatic card charge at check-in via Stripe. View status of each charge — pending, captured, or failed." />
        <ComingSoonCard icon={CreditCard}  title="Cleaner Payouts"  description="Triggered automatically when cleaner submits photos and checklist. Sent to their Stripe Express account." />
        <ComingSoonCard icon={TrendingUp}  title="Profit Tracker"   description="Revenue collected minus cleaner payouts minus Stripe fees = your net profit per job, per property, per month." />
      </div>
    </div>
  );
}

export default function CleaningBusiness({ currentView, onNavigate, reservations, uplistingProperties }: Props) {
  const active = (currentView as CleaningView) || 'cleaning-dashboard';

  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [configs, setConfigs] = useState<CleaningPropertyConfig[]>([]);
  const [jobs, setJobs] = useState<CleaningJob[]>([]);
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

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-[#1e2d45] bg-[#1a2335] px-4 flex-shrink-0">
          <div className="flex gap-1 overflow-x-auto hide-scrollbar">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex items-center gap-2 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  active === id ? 'border-[#4a90d9] text-[#4a90d9]' : 'border-transparent text-[#3a5070] hover:text-[#b8d4f0]'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[#3a5070]">Loading cleaning data…</p>
        </div>
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
        <div className="border-b border-[#1e2d45] bg-[#1a2335] px-4 flex-shrink-0">
          <div className="flex gap-1 overflow-x-auto hide-scrollbar">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => onNavigate(id)}
                className={`flex items-center gap-2 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  active === id ? 'border-[#4a90d9] text-[#4a90d9]' : 'border-transparent text-[#3a5070] hover:text-[#b8d4f0]'
                }`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
        </div>
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
      {/* Sub-navigation */}
      <div className="border-b border-[#1e2d45] bg-[#1a2335] px-4 flex-shrink-0">
        <div className="flex gap-1 overflow-x-auto hide-scrollbar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-2 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                active === id
                  ? 'border-[#4a90d9] text-[#4a90d9]'
                  : 'border-transparent text-[#3a5070] hover:text-[#b8d4f0]'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {active === 'cleaning-dashboard' && (
          <CleaningDashboard jobs={jobs} cleaners={cleaners} configs={configs} />
        )}
        {active === 'cleaning-schedule' && (
          <ScheduleView jobs={jobs} cleaners={cleaners} />
        )}
        {active === 'cleaning-jobs' && (
          <JobsView
            jobs={jobs}
            configs={configs}
            cleaners={cleaners}
            reservations={reservations}
            onSyncJobs={handleSyncJobs}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
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
          />
        )}
        {active === 'cleaning-cleaners' && (
          <CleanersView
            cleaners={cleaners}
            onSave={handleSaveCleaner}
            onDelete={handleDeleteCleaner}
          />
        )}
        {active === 'cleaning-payments' && <CleaningPayments />}
      </div>
    </div>
  );
}

import {} from 'react';
import {
  LayoutDashboard, CalendarDays, Briefcase, Home, Users, CreditCard,
  Clock, CheckCircle, AlertCircle, TrendingUp, DollarSign, Sparkles,
} from 'lucide-react';
import type { View } from '../../types';

type CleaningView = 'cleaning-dashboard' | 'cleaning-schedule' | 'cleaning-jobs' | 'cleaning-properties' | 'cleaning-cleaners' | 'cleaning-payments';

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
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

function CleaningDashboard() {
  const stats = [
    { label: 'Jobs This Week',    value: '—', icon: Briefcase,    color: 'text-[#4a90d9]', bg: 'bg-[#0d1e35]' },
    { label: 'Revenue This Month', value: '—', icon: DollarSign,  color: 'text-[#5ce0a0]', bg: 'bg-[#0a2518]' },
    { label: 'Active Cleaners',   value: '—', icon: Users,        color: 'text-[#d07af5]', bg: 'bg-[#1a0a2e]' },
    { label: 'Net Profit',        value: '—', icon: TrendingUp,   color: 'text-[#d0954a]', bg: 'bg-[#1a1000]' },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Cleaning Dashboard</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Overview of your cleaning business operations</p>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ComingSoonCard icon={Clock}        title="Upcoming Cleanings"  description="Today's and tomorrow's jobs with cleaner assignments and property details." />
        <ComingSoonCard icon={AlertCircle}  title="Pending Acceptances" description="Jobs dispatched to cleaners awaiting first-to-accept confirmation." />
        <ComingSoonCard icon={CheckCircle}  title="Awaiting Payout"     description="Completed jobs with submitted photos ready for cleaner payout approval." />
      </div>
      <div className="bg-[#162035] border border-[#1e3a5a] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-[#4a90d9]" />
          <h2 className="text-sm font-bold text-white">Build Roadmap</h2>
        </div>
        <div className="space-y-2">
          {[
            { phase: 'Phase 1', label: 'CRM split + structure', done: true },
            { phase: 'Phase 2', label: 'Job engine — reservation sync, dispatch emails, accept/decline', done: false },
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

function CleaningSchedule() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Schedule</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Visual calendar of all cleaning jobs linked to Uplisting reservations</p>
      </div>
      <ComingSoonCard icon={CalendarDays} title="Cleaning Calendar" description="Reservations from Uplisting sync automatically. Each checkout triggers a cleaning job shown here with assigned cleaner, status, and property color-coding." />
    </div>
  );
}

function CleaningJobs() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Jobs</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">All cleaning jobs — from Uplisting reservations or manual entry</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComingSoonCard icon={Briefcase}    title="Active Jobs"     description="Jobs currently pending assignment, in progress, or awaiting photo submission from cleaners." />
        <ComingSoonCard icon={CheckCircle}  title="Manual Job Entry" description="Create a cleaning job for any property not in Uplisting — same dispatch and payment flow." />
      </div>
    </div>
  );
}

function CleaningProperties() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Cleaning Properties</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Properties enrolled in the cleaning service, client billing info, and cleaner assignments</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComingSoonCard icon={Home}   title="Property Roster"      description="Each property linked to an owner/client. Set cleaning fee, cleaner payout, and which cleaners are assigned (with priority order)." />
        <ComingSoonCard icon={Users}  title="Client Onboarding"    description="Send onboarding link to property owner — they sign the agreement and save a card on file for automatic billing at each check-in." />
      </div>
    </div>
  );
}

function CleaningCleaners() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Cleaners</h1>
        <p className="text-sm text-[#3a5070] mt-0.5">Your cleaning team — assignments, payout accounts, and performance</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComingSoonCard icon={Users}       title="Cleaner Roster"       description="Add cleaners with name, contact, and assigned properties. They connect their bank account via Stripe Express for automatic payouts." />
        <ComingSoonCard icon={CreditCard}  title="Payout Accounts"      description="Stripe Connect Express — cleaners onboard in ~10 min, Stripe handles identity verification and 1099 tax forms automatically." />
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

export default function CleaningBusiness({ currentView, onNavigate }: Props) {
  const active = (currentView as CleaningView) || 'cleaning-dashboard';

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
        {active === 'cleaning-dashboard'   && <CleaningDashboard />}
        {active === 'cleaning-schedule'    && <CleaningSchedule />}
        {active === 'cleaning-jobs'        && <CleaningJobs />}
        {active === 'cleaning-properties'  && <CleaningProperties />}
        {active === 'cleaning-cleaners'    && <CleaningCleaners />}
        {active === 'cleaning-payments'    && <CleaningPayments />}
      </div>
    </div>
  );
}

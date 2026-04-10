import { TrendingUp, Users, Home, Phone, ArrowRight, Star, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import type { Lead, Owner, OutreachEntry } from '../types';
import type { UplistingProperty, UplistingReservation } from '../services/uplisting';
import { estimateMonthlyRevenue, estimateOccupancy } from '../services/uplisting';

interface DashboardProps {
  leads: Lead[];
  owners: Owner[];
  outreach: OutreachEntry[];
  onNavigate: (view: 'pipeline' | 'owners' | 'outreach' | 'owner-detail' | 'settings', extra?: string) => void;
  uplistingConnected: boolean;
  uplistingProperties: UplistingProperty[];
  uplistingReservations: UplistingReservation[];
  lastSync: string | null;
  onSync: () => Promise<void>;
}

const STAGE_LABELS: Record<string, string> = {
  new: 'New Lead',
  contacted: 'Contacted',
  proposal: 'Proposal Sent',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

const OUTREACH_TYPE_ICONS: Record<string, string> = {
  call: '📞',
  email: '✉️',
  text: '💬',
  meeting: '🤝',
  other: '📝',
};

export default function Dashboard({
  leads, owners, outreach, onNavigate,
  uplistingConnected, uplistingProperties, uplistingReservations, lastSync, onSync,
}: DashboardProps) {
  // Prefer live Uplisting data when connected, fall back to manual data
  const activeOwners = owners.filter(o => o.properties.some(p => p.status === 'active'));
  const allProperties = owners.flatMap(o => o.properties);
  const activeProperties = allProperties.filter(p => p.status === 'active');

  const totalMonthlyRevenue = uplistingConnected && uplistingProperties.length > 0
    ? uplistingProperties.reduce((sum, p) => sum + estimateMonthlyRevenue(p.id, uplistingReservations), 0)
    : activeProperties.reduce((sum, p) => sum + p.monthlyRevenue, 0);

  const avgOccupancy = uplistingConnected && uplistingProperties.length > 0
    ? Math.round(
        uplistingProperties.reduce((sum, p) => sum + estimateOccupancy(p.id, uplistingReservations), 0) /
        uplistingProperties.length
      )
    : activeProperties.length
      ? Math.round(activeProperties.reduce((sum, p) => sum + p.occupancyRate, 0) / activeProperties.length)
      : 0;

  const activePropertyCount = uplistingConnected && uplistingProperties.length > 0
    ? uplistingProperties.filter(p => p.status !== 'inactive').length
    : activeProperties.length;
  const pipelineLeads = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
  const recentOutreach = [...outreach].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentLeads = [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);

  const stats = [
    {
      label: 'Monthly Revenue',
      value: `$${totalMonthlyRevenue.toLocaleString()}`,
      sub: `across ${activePropertyCount} active properties`,
      icon: TrendingUp,
      color: 'bg-teal-600',
    },
    {
      label: 'Active Owners',
      value: uplistingConnected && uplistingProperties.length > 0 ? uplistingProperties.length : activeOwners.length,
      sub: uplistingConnected ? 'from Uplisting' : `${owners.length} total in portfolio`,
      icon: Users,
      color: 'bg-indigo-500',
    },
    {
      label: 'Avg Occupancy',
      value: `${avgOccupancy}%`,
      sub: 'active properties',
      icon: Star,
      color: 'bg-amber-500',
    },
    {
      label: 'Active Pipeline',
      value: pipelineLeads.length,
      sub: `leads in progress`,
      icon: Phone,
      color: 'bg-rose-500',
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Welcome back to E&amp;J Retreats CRM</p>
        </div>
        {uplistingConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
              <Wifi size={12} /> Live from Uplisting
              {lastSync && (
                <span className="text-emerald-500 ml-1">
                  · {new Date(lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
            <button
              onClick={onSync}
              className="p-1.5 rounded-full text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
              title="Sync now"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onNavigate('settings')}
            className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 hover:bg-teal-50 hover:text-teal-600 border border-slate-200 hover:border-teal-200 px-3 py-1.5 rounded-full transition-colors"
          >
            <WifiOff size={12} /> Connect Uplisting
          </button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon size={18} className="text-white" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            <div className="text-sm font-medium text-slate-700 mt-0.5">{label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent leads */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Recent Leads</h2>
            <button
              onClick={() => onNavigate('pipeline')}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              View pipeline <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentLeads.map(lead => (
              <div key={lead.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-teal-700 font-semibold text-xs">
                    {lead.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{lead.name}</p>
                  <p className="text-xs text-slate-400 truncate">{lead.propertyAddress}</p>
                </div>
                <span className={`
                  text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
                  ${lead.stage === 'won' ? 'bg-emerald-100 text-emerald-700' :
                    lead.stage === 'lost' ? 'bg-red-100 text-red-600' :
                    lead.stage === 'negotiating' ? 'bg-amber-100 text-amber-700' :
                    'bg-teal-100 text-teal-700'}
                `}>
                  {STAGE_LABELS[lead.stage]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent outreach */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Recent Outreach</h2>
            <button
              onClick={() => onNavigate('outreach')}
              className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentOutreach.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className="text-base mt-0.5">{OUTREACH_TYPE_ICONS[entry.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{entry.subject}</p>
                  <p className="text-xs text-slate-500 truncate">{entry.contactName}</p>
                </div>
                <div className="text-xs text-slate-400 flex-shrink-0">
                  {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Uplisting properties */}
      {uplistingConnected && uplistingProperties.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Wifi size={14} className="text-emerald-500" /> Live Properties
            </h2>
            <span className="text-xs text-slate-400">{uplistingProperties.length} from Uplisting</span>
          </div>
          <div className="divide-y divide-slate-100">
            {uplistingProperties.map(p => {
              const rev = estimateMonthlyRevenue(p.id, uplistingReservations);
              const occ = estimateOccupancy(p.id, uplistingReservations);
              return (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                    <Home size={16} className="text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name || p.address}</p>
                    <p className="text-xs text-slate-400">{[p.city, p.state].filter(Boolean).join(', ')} · {p.bedrooms}bd · {p.property_type}</p>
                    {p.channels && p.channels.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {p.channels.map(c => (
                          <span key={c} className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {rev > 0 && <p className="text-sm font-semibold text-teal-700">${rev.toLocaleString()}/mo</p>}
                    {occ > 0 && <p className="text-xs text-slate-400">{occ}% occ.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Portfolio overview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Portfolio Overview</h2>
          <button
            onClick={() => onNavigate('owners')}
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            View owners <ArrowRight size={13} />
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {owners.map(owner => {
            const rev = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
            const activeProps = owner.properties.filter(p => p.status === 'active');
            return (
              <button
                key={owner.id}
                onClick={() => onNavigate('owner-detail', owner.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 text-left transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-semibold text-sm">{owner.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{owner.name}</p>
                  <p className="text-xs text-slate-400">
                    {owner.properties.length} {owner.properties.length === 1 ? 'property' : 'properties'}
                    {activeProps.length > 0 && ` · ${activeProps.length} active`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-slate-800">${rev.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">/mo</p>
                </div>
                <Home size={14} className="text-slate-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

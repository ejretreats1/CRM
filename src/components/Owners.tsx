import { useState } from 'react';
import { Plus, Search, Home, TrendingUp, Phone, Mail, ChevronRight } from 'lucide-react';
import type { Owner } from '../types';

interface OwnersProps {
  owners: Owner[];
  onViewOwner: (id: string) => void;
  onOpenOwnerModal: (owner?: Owner) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  onboarding: 'bg-amber-100 text-amber-700',
  inactive: 'bg-slate-100 text-slate-500',
};

export default function Owners({ owners, onViewOwner, onOpenOwnerModal }: OwnersProps) {
  const [search, setSearch] = useState('');

  const filtered = owners.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.email.toLowerCase().includes(search.toLowerCase()) ||
    o.properties.some(p => p.address.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRevenue = owners.flatMap(o => o.properties).reduce((s, p) => s + p.monthlyRevenue, 0);
  const totalProperties = owners.flatMap(o => o.properties).length;
  const activeProperties = owners.flatMap(o => o.properties).filter(p => p.status === 'active').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Owners</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {owners.length} owners · {totalProperties} properties · ${totalRevenue.toLocaleString()}/mo revenue
          </p>
        </div>
        <button
          onClick={() => onOpenOwnerModal()}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Add Owner
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Owners', value: owners.length, icon: '👤' },
          { label: 'Active Properties', value: activeProperties, icon: '🏠' },
          { label: 'Monthly Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: '💰' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search owners, properties..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      {/* Owner cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">No owners found.</div>
        )}
        {filtered.map(owner => {
          const rev = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
          const avgOcc = owner.properties.filter(p => p.status === 'active').length
            ? Math.round(
                owner.properties.filter(p => p.status === 'active').reduce((s, p) => s + p.occupancyRate, 0) /
                owner.properties.filter(p => p.status === 'active').length
              )
            : null;

          return (
            <div
              key={owner.id}
              onClick={() => onViewOwner(owner.id)}
              className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:shadow-md hover:border-teal-200 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-base">{owner.name.charAt(0)}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{owner.name}</h3>
                    <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {owner.email && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Mail size={11} /> {owner.email}
                      </span>
                    )}
                    {owner.phone && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone size={11} /> {owner.phone}
                      </span>
                    )}
                  </div>

                  {/* Properties preview */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {owner.properties.map(p => (
                      <span
                        key={p.id}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}
                      >
                        {p.address.split(',')[0]} · {p.status}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Revenue col */}
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <div className="flex items-center gap-1 text-teal-700 font-bold">
                    <TrendingUp size={14} />
                    ${rev.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-400">/mo</div>
                  {avgOcc !== null && (
                    <div className="text-xs text-slate-500 mt-1">{avgOcc}% occ.</div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                    <Home size={11} />
                    {owner.properties.length} {owner.properties.length === 1 ? 'property' : 'properties'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

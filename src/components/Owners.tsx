import { useState } from 'react';
import { Plus, Search, Home, TrendingUp, Phone, Mail, ChevronRight, Trash2 } from 'lucide-react';
import type { Owner } from '../types';

interface OwnersProps {
  owners: Owner[];
  onViewOwner: (id: string) => void;
  onOpenOwnerModal: (owner?: Owner) => void;
  onDeleteOwner: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-[#0a2518] text-[#4ab57a]',
  onboarding: 'bg-[#2a1a0a] text-[#d0954a]',
  inactive: 'bg-[#1e2d45] text-[#8aaac8]',
};

export default function Owners({ owners, onViewOwner, onOpenOwnerModal, onDeleteOwner }: OwnersProps) {
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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clients</h1>
          <p className="text-sm text-[#8aaac8] mt-0.5">
            {owners.length} clients · {totalProperties} properties · ${totalRevenue.toLocaleString()}/mo revenue
          </p>
        </div>
        <button
          onClick={() => onOpenOwnerModal()}
          className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Add Client
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Clients', value: owners.length, icon: '👤' },
          { label: 'Active Properties', value: activeProperties, icon: '🏠' },
          { label: 'Monthly Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: '💰' },
        ].map(s => (
          <div key={s.label} className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-3 overflow-hidden">
            <div className="text-lg mb-1">{s.icon}</div>
            <div className="text-sm font-bold text-white truncate">{s.value}</div>
            <div className="text-xs text-[#8aaac8] leading-tight mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
        <input
          type="text"
          placeholder="Search clients, properties..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-[#1a2335] border border-[#1e2d45] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent"
        />
      </div>

      {/* Owner cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-[#3a5070] text-sm">No clients found.</div>
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
              className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 cursor-pointer hover:shadow-md hover:border-[#1e3a5a] transition-all group"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-[#4a90d9] flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-base">{owner.name.charAt(0)}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">{owner.name}</h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteOwner(owner.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#3a5070] hover:text-[#e05c5c]"
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={16} className="text-[#3a5070]" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {owner.email && (
                      <span className="flex items-center gap-1 text-xs text-[#8aaac8]">
                        <Mail size={11} /> {owner.email}
                      </span>
                    )}
                    {owner.phone && (
                      <span className="flex items-center gap-1 text-xs text-[#8aaac8]">
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
                  <div className="flex items-center gap-1 text-[#4a90d9] font-bold">
                    <TrendingUp size={14} />
                    ${rev.toLocaleString()}
                  </div>
                  <div className="text-xs text-[#3a5070]">/mo</div>
                  {avgOcc !== null && (
                    <div className="text-xs text-[#8aaac8] mt-1">{avgOcc}% occ.</div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-[#3a5070] mt-1">
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

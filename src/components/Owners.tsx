import { useState } from 'react';
import {
  Plus, Search, Home, TrendingUp, Phone, Mail, ChevronRight,
  Trash2, Archive, ArchiveRestore, ChevronDown, ChevronUp,
  Link2, Copy, Check, X, Loader2,
} from 'lucide-react';
import type { Owner } from '../types';

interface OwnersProps {
  owners: Owner[];
  onViewOwner: (id: string) => void;
  onOpenOwnerModal: (owner?: Owner) => void;
  onDeleteOwner: (id: string) => void;
  onArchiveOwner: (id: string, archived: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-[#0a2518] text-[#4ab57a]',
  onboarding: 'bg-[#2a1a0a] text-[#d0954a]',
  inactive:   'bg-[#1e2d45] text-[#b8d4f0]',
};

export default function Owners({ owners, onViewOwner, onOpenOwnerModal, onDeleteOwner, onArchiveOwner }: OwnersProps) {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [onboardingLink, setOnboardingLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  async function generateOnboardingLink() {
    setGeneratingLink(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'onboarding', action: 'create' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate link');
      setOnboardingLink(data.url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not generate onboarding link.');
    } finally {
      setGeneratingLink(false);
    }
  }

  function copyLink() {
    if (!onboardingLink) return;
    navigator.clipboard.writeText(onboardingLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const active   = owners.filter(o => !o.archived);
  const archived = owners.filter(o => o.archived);

  const filteredActive = active.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.email.toLowerCase().includes(search.toLowerCase()) ||
    o.properties.some(p => p.address.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredArchived = archived.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.email.toLowerCase().includes(search.toLowerCase()) ||
    o.properties.some(p => p.address.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRevenue     = active.flatMap(o => o.properties).reduce((s, p) => s + p.monthlyRevenue, 0);
  const totalProperties  = active.flatMap(o => o.properties).length;
  const activeProperties = active.flatMap(o => o.properties).filter(p => p.status === 'active').length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clients</h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">
            {active.length} active · {totalProperties} properties · ${totalRevenue.toLocaleString()}/mo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateOnboardingLink}
            disabled={generatingLink}
            className="flex items-center gap-1.5 border border-[#1e3a5a] text-[#4a90d9] hover:bg-[#1a2335] text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            title="Generate onboarding link for a new client"
          >
            {generatingLink ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            <span className="hidden sm:inline">Onboarding Link</span>
          </button>
          <button
            onClick={() => onOpenOwnerModal()}
            className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> Add Client
          </button>
        </div>
      </div>

      {/* Onboarding link modal */}
      {onboardingLink && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a2335] border border-[#1e3a5a] rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Onboarding Link Generated</h3>
                <p className="text-xs text-[#3a5070] mt-0.5">Share this link with your new client · expires in 30 days</p>
              </div>
              <button onClick={() => setOnboardingLink(null)} className="text-[#3a5070] hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>
            <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-3 flex items-center gap-3 mb-4">
              <p className="text-xs text-[#b8d4f0] flex-1 break-all font-mono leading-relaxed">{onboardingLink}</p>
              <button
                onClick={copyLink}
                className="flex-shrink-0 p-2 rounded-lg bg-[#1e2d45] hover:bg-[#1e3a5a] transition-colors"
              >
                {linkCopied ? <Check size={15} className="text-[#4ab57a]" /> : <Copy size={15} className="text-[#4a90d9]" />}
              </button>
            </div>
            <button
              onClick={copyLink}
              className="w-full flex items-center justify-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {linkCopied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Clients',    value: active.length,                         icon: '👤' },
          { label: 'Active Properties', value: activeProperties,                      icon: '🏠' },
          { label: 'Monthly Revenue',   value: `$${totalRevenue.toLocaleString()}`,   icon: '💰' },
        ].map(s => (
          <div key={s.label} className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-3 overflow-hidden">
            <div className="text-lg mb-1">{s.icon}</div>
            <div className="text-sm font-bold text-white truncate">{s.value}</div>
            <div className="text-xs text-[#b8d4f0] leading-tight mt-0.5">{s.label}</div>
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

      {/* Active client cards */}
      <div className="space-y-3">
        {filteredActive.length === 0 && (
          <div className="text-center py-12 text-[#3a5070] text-sm">No active clients found.</div>
        )}
        {filteredActive.map(owner => {
          const rev = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
          const activePropCount = owner.properties.filter(p => p.status === 'active').length;
          const avgOcc = activePropCount
            ? Math.round(
                owner.properties.filter(p => p.status === 'active').reduce((s, p) => s + p.occupancyRate, 0) /
                activePropCount
              )
            : null;

          return (
            <div
              key={owner.id}
              onClick={() => onViewOwner(owner.id)}
              className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 cursor-pointer hover:shadow-md hover:border-[#1e3a5a] transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-[#4a90d9] flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-base">{owner.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">{owner.name}</h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); onArchiveOwner(owner.id, true); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#3a5070] hover:text-[#d0954a] p-1.5 rounded"
                        title="Archive client"
                      >
                        <Archive size={14} />
                      </button>
                      <ChevronRight size={16} className="text-[#3a5070]" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {owner.email && (
                      <span className="flex items-center gap-1 text-xs text-[#b8d4f0]">
                        <Mail size={11} /> {owner.email}
                      </span>
                    )}
                    {owner.phone && (
                      <span className="flex items-center gap-1 text-xs text-[#b8d4f0]">
                        <Phone size={11} /> {owner.phone}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {owner.properties.map(p => (
                      <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? STATUS_COLORS.inactive}`}>
                        {p.address.split(',')[0]} · {p.status}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <div className="flex items-center gap-1 text-[#4a90d9] font-bold">
                    <TrendingUp size={14} />${rev.toLocaleString()}
                  </div>
                  <div className="text-xs text-[#3a5070]">/mo</div>
                  {avgOcc !== null && <div className="text-xs text-[#b8d4f0] mt-1">{avgOcc}% occ.</div>}
                  <div className="flex items-center gap-1 text-xs text-[#3a5070] mt-1">
                    <Home size={11} />{owner.properties.length} {owner.properties.length === 1 ? 'property' : 'properties'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Archived section */}
      {archived.length > 0 && (
        <div className="border-t border-[#1e2d45] pt-5">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-2 text-sm text-[#3a5070] hover:text-[#b8d4f0] transition-colors mb-4"
          >
            <Archive size={14} />
            Archived Clients ({archived.length})
            {showArchived ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showArchived && (
            <div className="space-y-3">
              {filteredArchived.length === 0 ? (
                <p className="text-sm text-[#3a5070] text-center py-6">No archived clients match your search.</p>
              ) : (
                filteredArchived.map(owner => {
                  const rev = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);

                  return (
                    <div
                      key={owner.id}
                      className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 opacity-60 group hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-full bg-[#2a3a50] flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-base">{owner.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="font-semibold text-white truncate">{owner.name}</h3>
                              <span className="text-xs bg-[#1e2d45] text-[#3a5070] px-2 py-0.5 rounded-full flex-shrink-0">Archived</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => onArchiveOwner(owner.id, false)}
                                className="flex items-center gap-1 text-xs text-[#4ab57a] border border-[#0a2518] hover:bg-[#0a2518] px-2 py-1 rounded-lg transition-colors"
                                title="Restore client"
                              >
                                <ArchiveRestore size={12} /> Restore
                              </button>
                              <button
                                onClick={() => onDeleteOwner(owner.id)}
                                className="text-[#3a5070] hover:text-[#e05c5c] transition-colors p-1.5"
                                title="Permanently delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1">
                            {owner.email && (
                              <span className="flex items-center gap-1 text-xs text-[#b8d4f0]">
                                <Mail size={11} /> {owner.email}
                              </span>
                            )}
                            {owner.phone && (
                              <span className="flex items-center gap-1 text-xs text-[#b8d4f0]">
                                <Phone size={11} /> {owner.phone}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {owner.properties.map(p => (
                              <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] ?? STATUS_COLORS.inactive}`}>
                                {p.address.split(',')[0]} · {p.status}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <div className="flex items-center gap-1 text-[#3a5070] font-bold">
                            <TrendingUp size={14} />${rev.toLocaleString()}
                          </div>
                          <div className="text-xs text-[#3a5070]">/mo</div>
                          <div className="flex items-center gap-1 text-xs text-[#3a5070] mt-1">
                            <Home size={11} />{owner.properties.length} {owner.properties.length === 1 ? 'property' : 'properties'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

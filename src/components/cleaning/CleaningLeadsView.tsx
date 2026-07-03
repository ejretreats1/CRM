import { useState } from 'react';
import { Plus, Phone, Mail, Trash2, X, ChevronDown, Search, UserPlus } from 'lucide-react';
import type {
  CleaningLead, CleaningLeadCategory, CleaningLeadSource,
  CleaningLeadOpportunityStatus, CleaningLeadOutreachStatus, CleaningLeadPriority, CleaningLeadMultiProp,
} from '../../services/cleaningDb';
import { CLEANING_LEAD_CATEGORIES, CLEANING_LEAD_SOURCES } from '../../services/cleaningDb';

// ─── Constants ────────────────────────────────────────────────────────────────

const OPP_STAGES: { id: CleaningLeadOpportunityStatus; short: string; color: string; bg: string }[] = [
  { id: 'New',                short: 'New',        color: '#4a90d9', bg: '#0e1e3a' },
  { id: 'Qualified',          short: 'Qualified',  color: '#9b7ae8', bg: '#1a0e3a' },
  { id: 'Quote Requested',    short: 'Quote Req.', color: '#d0954a', bg: '#2a1a05' },
  { id: 'Booked',             short: 'Booked',     color: '#4ab57a', bg: '#0a2518' },
  { id: 'Lost',               short: 'Lost',       color: '#6b7280', bg: '#1e2d45' },
  { id: 'Future Opportunity', short: 'Future Opp.',color: '#22d3ee', bg: '#0a2030' },
];

const OUTREACH_STATUSES: { id: CleaningLeadOutreachStatus; color: string }[] = [
  { id: 'Not Contacted',      color: '#6b7280' },
  { id: 'Contacted',          color: '#4a90d9' },
  { id: 'Follow-Up Required', color: '#d0954a' },
  { id: 'Responded',          color: '#22d3ee' },
  { id: 'Interested',         color: '#4ab57a' },
  { id: 'Not Interested',     color: '#e05c5c' },
];

const PRIORITIES: { id: CleaningLeadPriority; color: string; bg: string }[] = [
  { id: 'High',   color: '#e05c5c', bg: '#2a0e0e' },
  { id: 'Medium', color: '#d0954a', bg: '#2a1a05' },
  { id: 'Low',    color: '#6b7280', bg: '#1e2d45' },
];

const MULTI_PROP_OPTIONS: { id: CleaningLeadMultiProp; color: string; bg: string }[] = [
  { id: 'Yes',     color: '#4ab57a', bg: '#0a2518' },
  { id: 'No',      color: '#e05c5c', bg: '#2a0e0e' },
  { id: 'Unknown', color: '#6b7280', bg: '#1e2d45' },
];

const CATEGORY_COLORS: Record<CleaningLeadCategory, string> = {
  'Property Management':        'bg-[#1a0e3a] text-[#9b7ae8]',
  'Realtor / Real Estate Team': 'bg-[#0e1e3a] text-[#4a90d9]',
  'Short-Term Rental':          'bg-[#0a2518] text-[#4ab57a]',
  'Real Estate Investor':       'bg-[#2a1a05] text-[#d0954a]',
  'Strategic Partner':          'bg-[#2a0e2a] text-[#d07af5]',
  'Residential':                'bg-[#1e2d45] text-[#b8d4f0]',
};

const SOURCE_COLORS: Record<CleaningLeadSource, string> = {
  'Scraped List':         'bg-[#0e1e3a] text-[#4a90d9]',
  'Google':               'bg-[#1a0e0e] text-[#ef4444]',
  'LinkedIn':             'bg-[#0a1a2e] text-[#60a5fa]',
  'Facebook Group':       'bg-[#0e1a2a] text-[#38bdf8]',
  'Facebook Marketplace': 'bg-[#0e1a2a] text-[#22d3ee]',
  'Website':              'bg-[#1a1a0e] text-[#d4c060]',
  'Referral':             'bg-[#0a2010] text-[#3dd68c]',
  'Other':                'bg-[#1e2d45] text-[#b8d4f0]',
};

function oppStyle(id: CleaningLeadOpportunityStatus) {
  return OPP_STAGES.find(s => s.id === id) ?? OPP_STAGES[0];
}
function outreachStyle(id: CleaningLeadOutreachStatus) {
  return OUTREACH_STATUSES.find(s => s.id === id) ?? OUTREACH_STATUSES[0];
}
function priorityStyle(id: CleaningLeadPriority | undefined) {
  return PRIORITIES.find(p => p.id === id);
}

function blankLead(): CleaningLead {
  const now = new Date().toISOString();
  return {
    id: `cl_${Date.now()}`,
    name: '', email: '', phone: '', company: '',
    category: 'Property Management',
    source: 'Other',
    outreachStatus: 'Not Contacted',
    opportunityStatus: 'New',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Lead modal ───────────────────────────────────────────────────────────────

interface ModalProps {
  lead: CleaningLead;
  onSave: (lead: CleaningLead) => void;
  onClose: () => void;
}

function LeadModal({ lead: initial, onSave, onClose }: ModalProps) {
  const [lead, setLead] = useState<CleaningLead>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CleaningLead>(k: K, v: CleaningLead[K]) {
    setLead(prev => ({ ...prev, [k]: v, updatedAt: new Date().toISOString() }));
  }

  async function save() {
    if (!lead.name.trim()) return;
    setSaving(true);
    try { await onSave(lead); } finally { setSaving(false); }
  }

  const isNew = !initial.name;
  const inputCls = 'w-full bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]';
  const selectCls = 'w-full appearance-none bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-white text-lg">{isNew ? 'Add Lead' : 'Edit Lead'}</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors"><X size={20} /></button>
        </div>

        <div className="space-y-3.5">
          {/* Name + Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Name <span className="text-[#ef4444]">*</span></label>
              <input value={lead.name} onChange={e => set('name', e.target.value)} placeholder="Full name" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Company</label>
              <input value={lead.company} onChange={e => set('company', e.target.value)} placeholder="Company name" className={inputCls} />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Phone</label>
              <input value={lead.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" type="tel" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Email</label>
              <input value={lead.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" type="email" className={inputCls} />
            </div>
          </div>

          {/* Category + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Lead Category</label>
              <div className="relative">
                <select value={lead.category} onChange={e => set('category', e.target.value as CleaningLeadCategory)} className={selectCls}>
                  {CLEANING_LEAD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Lead Source</label>
              <div className="relative">
                <select value={lead.source} onChange={e => set('source', e.target.value as CleaningLeadSource)} className={selectCls}>
                  {CLEANING_LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Priority</label>
            <div className="flex gap-1.5">
              {PRIORITIES.map(p => (
                <button key={p.id} type="button" onClick={() => set('priority', p.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={lead.priority === p.id
                    ? { background: p.bg, color: p.color, borderColor: p.color + '80' }
                    : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                  {p.id}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Property Potential */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Multi-Property Potential</label>
            <div className="flex gap-1.5">
              {MULTI_PROP_OPTIONS.map(p => (
                <button key={p.id} type="button" onClick={() => set('multiProp', p.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={lead.multiProp === p.id
                    ? { background: p.bg, color: p.color, borderColor: p.color + '80' }
                    : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                  {p.id}
                </button>
              ))}
            </div>
          </div>

          {/* Outreach Status */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Outreach Status</label>
            <div className="relative">
              <select value={lead.outreachStatus} onChange={e => set('outreachStatus', e.target.value as CleaningLeadOutreachStatus)} className={selectCls}>
                {OUTREACH_STATUSES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
            </div>
          </div>

          {/* Opportunity Status */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Opportunity Status</label>
            <div className="flex gap-1.5 flex-wrap">
              {OPP_STAGES.map(s => (
                <button key={s.id} type="button" onClick={() => set('opportunityStatus', s.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={lead.opportunityStatus === s.id
                    ? { background: s.bg, color: s.color, borderColor: s.color + '80' }
                    : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                  {s.short}
                </button>
              ))}
            </div>
          </div>

          {/* Handoff Needed */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={!!lead.handoffNeeded}
              onChange={e => set('handoffNeeded', e.target.checked)}
              className="w-4 h-4 rounded accent-[#4a90d9]" />
            <span className="text-xs text-[#b8d4f0]">Handoff Needed</span>
          </label>

          {/* Notes */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Notes</label>
            <textarea value={lead.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Property count, follow-up notes, context…"
              rows={3}
              className="w-full bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] resize-none" />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium hover:bg-[#162035] transition-colors">Cancel</button>
          <button onClick={save} disabled={saving || !lead.name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#3dd68c] hover:bg-[#2dba7a] disabled:opacity-40 disabled:cursor-not-allowed text-[#0f2018] font-semibold text-sm transition-colors">
            {saving ? 'Saving…' : isNew ? 'Add Lead' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface Props {
  leads: CleaningLead[];
  onSave: (lead: CleaningLead) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function CleaningLeadsView({ leads, onSave, onDelete }: Props) {
  const [modal, setModal] = useState<CleaningLead | null>(null);
  const [oppFilter, setOppFilter] = useState<CleaningLeadOpportunityStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CleaningLeadCategory | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<CleaningLeadPriority | 'all'>('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = leads.filter(l => {
    if (oppFilter !== 'all' && l.opportunityStatus !== oppFilter) return false;
    if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
    if (priorityFilter !== 'all' && l.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.company.toLowerCase().includes(q) &&
          !l.email.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
    }
    return true;
  });

  const oppCounts: Record<string, number> = { all: leads.length };
  for (const s of OPP_STAGES) oppCounts[s.id] = leads.filter(l => l.opportunityStatus === s.id).length;

  async function handleDelete(id: string) {
    await onDelete(id);
    setConfirmDelete(null);
  }

  async function quickOppStatus(lead: CleaningLead, opportunityStatus: CleaningLeadOpportunityStatus) {
    await onSave({ ...lead, opportunityStatus, updatedAt: new Date().toISOString() });
  }

  async function quickOutreach(lead: CleaningLead, outreachStatus: CleaningLeadOutreachStatus) {
    await onSave({ ...lead, outreachStatus, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Cleaning Leads</h1>
          <p className="text-xs text-[#3a5070] mt-0.5">
            {leads.length} total · {leads.filter(l => l.opportunityStatus === 'Booked').length} booked
          </p>
        </div>
        <button onClick={() => setModal(blankLead())}
          className="flex items-center gap-2 bg-[#3dd68c] hover:bg-[#2dba7a] text-[#0f2018] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={15} /> Add Lead
        </button>
      </div>

      {/* Opportunity Status pipeline tabs */}
      <div className="flex gap-1 mb-4 bg-[#162035] p-1 rounded-xl w-fit flex-wrap">
        <button onClick={() => setOppFilter('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${oppFilter === 'all' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
          All ({oppCounts.all})
        </button>
        {OPP_STAGES.map(s => (
          <button key={s.id} onClick={() => setOppFilter(s.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${oppFilter === s.id ? 'bg-[#1a2335] shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
            style={oppFilter === s.id ? { color: s.color } : {}}>
            {s.short} ({oppCounts[s.id] ?? 0})
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, company, email, phone…"
            className="w-full pl-8 pr-3 py-2 text-xs bg-[#162035] border border-[#1e2d45] rounded-lg text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
        </div>
        <div className="relative">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as CleaningLeadCategory | 'all')}
            className="appearance-none bg-[#162035] border border-[#1e2d45] rounded-lg pl-3 pr-7 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
            <option value="all">All Categories</option>
            {CLEANING_LEAD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
        </div>
        <div className="relative">
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as CleaningLeadPriority | 'all')}
            className="appearance-none bg-[#162035] border border-[#1e2d45] rounded-lg pl-3 pr-7 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
            <option value="all">All Priorities</option>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.id} Priority</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-[#1e2d45] rounded-2xl">
          <UserPlus size={36} className="text-[#3a5070] mx-auto mb-3" />
          <p className="text-[#b8d4f0] font-medium">
            {leads.length === 0 ? 'No leads yet' : 'No leads match your filters'}
          </p>
          <p className="text-xs text-[#3a5070] mt-1 mb-4">
            {leads.length === 0 ? 'Add your first cleaning service lead to get started' : 'Try adjusting your search or filters'}
          </p>
          {leads.length === 0 && (
            <button onClick={() => setModal(blankLead())}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3dd68c] border border-[#0a2518] hover:bg-[#0a2518] px-4 py-2 rounded-lg transition-colors">
              <Plus size={14} /> Add Lead
            </button>
          )}
        </div>
      )}

      {/* Lead cards */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(lead => {
            const opp = oppStyle(lead.opportunityStatus);
            const outreach = outreachStyle(lead.outreachStatus);
            const pri = priorityStyle(lead.priority);
            return (
              <div key={lead.id}
                className="bg-[#1a2335] border border-[#1e2d45] rounded-xl px-4 py-3.5 hover:border-[#1e3a5a] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Name + company + priority badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setModal(lead)} className="font-semibold text-white hover:text-[#4a90d9] transition-colors text-sm">
                        {lead.name}
                      </button>
                      {lead.company && <span className="text-xs text-[#3a5070]">· {lead.company}</span>}
                      {pri && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ color: pri.color, background: pri.bg }}>
                          {pri.id}
                        </span>
                      )}
                      {lead.handoffNeeded && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a0e3a] text-[#9b7ae8] font-semibold">Handoff</span>
                      )}
                    </div>

                    {/* Category + Source + Outreach quick selector */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[lead.category] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                        {lead.category}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[lead.source] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                        {lead.source}
                      </span>
                      {lead.multiProp && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#1e2d45] text-[#b8d4f0]">
                          Multi: {lead.multiProp}
                        </span>
                      )}
                      {/* Outreach quick selector */}
                      <div className="relative group">
                        <button className="flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
                          style={{ color: outreach.color, borderColor: outreach.color + '50', background: outreach.color + '18' }}>
                          {lead.outreachStatus === 'Follow-Up Required' ? 'Follow-Up' : lead.outreachStatus}
                          <ChevronDown size={8} />
                        </button>
                        <div className="absolute left-0 top-full mt-1 bg-[#1a2335] border border-[#1e2d45] rounded-xl shadow-xl z-20 overflow-hidden hidden group-hover:block min-w-40">
                          {OUTREACH_STATUSES.map(s => (
                            <button key={s.id} onClick={() => quickOutreach(lead, s.id)}
                              className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[#162035]"
                              style={{ color: lead.outreachStatus === s.id ? s.color : '#b8d4f0' }}>
                              {s.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#4a90d9] transition-colors">
                          <Phone size={11} /> {lead.phone}
                        </a>
                      )}
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#4a90d9] transition-colors">
                          <Mail size={11} /> {lead.email}
                        </a>
                      )}
                      {lead.notes && (
                        <span className="text-xs text-[#3a5070] truncate max-w-xs hidden sm:inline" title={lead.notes}>{lead.notes}</span>
                      )}
                    </div>
                  </div>

                  {/* Opportunity status + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="relative group">
                      <button className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors"
                        style={{ background: opp.bg, color: opp.color, borderColor: opp.color + '60' }}>
                        {opp.short} <ChevronDown size={10} />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-[#1a2335] border border-[#1e2d45] rounded-xl shadow-xl z-20 overflow-hidden hidden group-hover:block min-w-40">
                        {OPP_STAGES.map(s => (
                          <button key={s.id} onClick={() => quickOppStatus(lead, s.id)}
                            className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[#162035]"
                            style={{ color: lead.opportunityStatus === s.id ? s.color : '#b8d4f0' }}>
                            {s.id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setModal(lead)}
                      className="text-xs text-[#3a5070] hover:text-[#b8d4f0] border border-[#1e2d45] hover:border-[#1e3a5a] px-2.5 py-1.5 rounded-lg transition-colors">
                      Edit
                    </button>
                    <button onClick={() => setConfirmDelete(lead.id)}
                      className="text-[#3a5070] hover:text-[#e05c5c] p-1.5 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lead modal */}
      {modal && (
        <LeadModal
          lead={modal}
          onSave={async lead => { await onSave(lead); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-[#1a2335] rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-white mb-2">Delete lead?</h3>
            <p className="text-sm text-[#b8d4f0] mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium hover:bg-[#162035] transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2.5 rounded-xl bg-[#e05c5c] hover:bg-[#c04040] text-white font-semibold text-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

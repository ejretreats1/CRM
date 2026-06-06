import { useState } from 'react';
import { Plus, Search, Phone, Mail, MessageSquare, Users, CalendarDays, Trash2 } from 'lucide-react';
import type { OutreachEntry, OutreachType } from '../types';

interface OutreachLogProps {
  outreach: OutreachEntry[];
  onUpdateOutreach: (entries: OutreachEntry[]) => void;
  onOpenOutreachModal: (entry?: OutreachEntry) => void;
}

const TYPE_ICONS: Record<OutreachType, React.ReactNode> = {
  call: <Phone size={14} />,
  email: <Mail size={14} />,
  text: <MessageSquare size={14} />,
  meeting: <Users size={14} />,
  other: <CalendarDays size={14} />,
};

const TYPE_COLORS: Record<OutreachType, string> = {
  call: 'bg-[#162035] text-[#6ab0f5]',
  email: 'bg-[#2a1a35] text-[#d07af5]',
  text: 'bg-[#162035] text-[#4a90d9]',
  meeting: 'bg-[#2a1a0a] text-[#d0954a]',
  other: 'bg-[#1e2d45] text-[#b8d4f0]',
};

const OUTCOME_STYLES: Record<string, string> = {
  positive: 'bg-[#0a2518] text-[#4ab57a]',
  neutral: 'bg-[#1e2d45] text-[#b8d4f0]',
  negative: 'bg-[#2a0e0e] text-[#e05c5c]',
  no_response: 'bg-[#1e2d45] text-[#3a5070]',
};

const OUTCOME_LABELS: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  no_response: 'No Response',
};

export default function OutreachLog({ outreach, onUpdateOutreach, onOpenOutreachModal }: OutreachLogProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<OutreachType | 'all'>('all');
  const [filterContact, setFilterContact] = useState<'all' | 'lead' | 'owner'>('all');

  const filtered = outreach
    .filter(e => {
      const matchSearch = search === '' ||
        e.contactName.toLowerCase().includes(search.toLowerCase()) ||
        e.subject.toLowerCase().includes(search.toLowerCase()) ||
        e.notes.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || e.type === filterType;
      const matchContact = filterContact === 'all' || e.contactType === filterContact;
      return matchSearch && matchType && matchContact;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const handleDelete = (id: string) => {
    if (confirm('Delete this outreach entry?')) {
      onUpdateOutreach(outreach.filter(e => e.id !== id));
    }
  };

  const upcomingFollowUps = outreach
    .filter(e => e.followUpDate && new Date(e.followUpDate) >= new Date())
    .sort((a, b) => (a.followUpDate ?? '').localeCompare(b.followUpDate ?? ''))
    .slice(0, 3);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Outreach Log</h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">{outreach.length} total interactions logged</p>
        </div>
        <button
          onClick={() => onOpenOutreachModal()}
          className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Log Outreach
        </button>
      </div>

      {/* Upcoming follow-ups */}
      {upcomingFollowUps.length > 0 && (
        <div className="bg-[#2a1a0a] border border-[#5a3010] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#f5c55c] mb-2">📅 Upcoming Follow-ups</h3>
          <div className="space-y-1.5">
            {upcomingFollowUps.map(e => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-[#d0954a]">{e.contactName} — {e.subject}</span>
                <span className="text-[#d0954a] font-medium text-xs">
                  {new Date(e.followUpDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
          <input
            type="text"
            placeholder="Search by name, subject..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#1a2335] border border-[#1e2d45] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as OutreachType | 'all')}
          className="px-3 py-2.5 bg-[#1a2335] border border-[#1e2d45] rounded-lg text-sm text-[#b8d4f0] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        >
          <option value="all">All Types</option>
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="text">Text</option>
          <option value="meeting">Meeting</option>
          <option value="other">Other</option>
        </select>
        <select
          value={filterContact}
          onChange={e => setFilterContact(e.target.value as 'all' | 'lead' | 'owner')}
          className="px-3 py-2.5 bg-[#1a2335] border border-[#1e2d45] rounded-lg text-sm text-[#b8d4f0] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        >
          <option value="all">All Contacts</option>
          <option value="lead">Leads</option>
          <option value="owner">Clients</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[#3a5070] text-sm">No outreach entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e2d45] border-b border-[#1e2d45]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Subject</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Outcome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Follow-up</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2d45]">
                {filtered.map(entry => (
                  <tr key={entry.id} className="hover:bg-[#1e2d45] transition-colors group">
                    <td className="px-4 py-3 text-[#b8d4f0] whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{entry.contactName}</div>
                      <div className="text-xs text-[#3a5070] capitalize">{entry.contactType}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[entry.type]}`}>
                        {TYPE_ICONS[entry.type]} {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{entry.subject}</div>
                      {entry.notes && (
                        <div className="text-xs text-[#3a5070] line-clamp-1 mt-0.5">{entry.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${OUTCOME_STYLES[entry.outcome]}`}>
                        {OUTCOME_LABELS[entry.outcome]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#d0954a]">
                      {entry.followUpDate
                        ? new Date(entry.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

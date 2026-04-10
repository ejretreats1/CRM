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
  call: 'bg-blue-100 text-blue-600',
  email: 'bg-purple-100 text-purple-600',
  text: 'bg-teal-100 text-teal-600',
  meeting: 'bg-amber-100 text-amber-600',
  other: 'bg-slate-100 text-slate-500',
};

const OUTCOME_STYLES: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-600',
  negative: 'bg-red-100 text-red-600',
  no_response: 'bg-slate-100 text-slate-400',
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
          <h1 className="text-xl font-bold text-slate-900">Outreach Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">{outreach.length} total interactions logged</p>
        </div>
        <button
          onClick={() => onOpenOutreachModal()}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Log Outreach
        </button>
      </div>

      {/* Upcoming follow-ups */}
      {upcomingFollowUps.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">📅 Upcoming Follow-ups</h3>
          <div className="space-y-1.5">
            {upcomingFollowUps.map(e => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-amber-700">{e.contactName} — {e.subject}</span>
                <span className="text-amber-600 font-medium text-xs">
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
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, subject..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as OutreachType | 'all')}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="all">All Contacts</option>
          <option value="lead">Leads</option>
          <option value="owner">Owners</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No outreach entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outcome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Follow-up</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{entry.contactName}</div>
                      <div className="text-xs text-slate-400 capitalize">{entry.contactType}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${TYPE_COLORS[entry.type]}`}>
                        {TYPE_ICONS[entry.type]} {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{entry.subject}</div>
                      {entry.notes && (
                        <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{entry.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${OUTCOME_STYLES[entry.outcome]}`}>
                        {OUTCOME_LABELS[entry.outcome]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-amber-600">
                      {entry.followUpDate
                        ? new Date(entry.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
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

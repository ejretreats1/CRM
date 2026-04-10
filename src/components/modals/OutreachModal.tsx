import { useState } from 'react';
import Modal from './Modal';
import type { OutreachEntry, OutreachType, OutreachOutcome, Lead, Owner } from '../../types';

interface OutreachModalProps {
  entry?: OutreachEntry;
  preselectedOwnerId?: string;
  leads: Lead[];
  owners: Owner[];
  onSave: (entry: OutreachEntry) => void;
  onClose: () => void;
}

const TYPES: { value: OutreachType; label: string }[] = [
  { value: 'call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'text', label: 'Text Message' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

const OUTCOMES: { value: OutreachOutcome; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'no_response', label: 'No Response' },
];

export default function OutreachModal({ entry, preselectedOwnerId, leads, owners, onSave, onClose }: OutreachModalProps) {
  const initialContactType = entry?.contactType ?? (preselectedOwnerId ? 'owner' : 'lead');
  const initialOwnerId = entry?.ownerId ?? preselectedOwnerId ?? '';
  const initialLeadId = entry?.leadId ?? '';

  const getContactName = (type: 'lead' | 'owner', id: string) => {
    if (type === 'lead') return leads.find(l => l.id === id)?.name ?? '';
    return owners.find(o => o.id === id)?.name ?? '';
  };

  const [form, setForm] = useState({
    contactType: initialContactType as 'lead' | 'owner',
    leadId: initialLeadId,
    ownerId: initialOwnerId,
    contactName: entry?.contactName ?? getContactName(initialContactType, initialOwnerId || initialLeadId),
    type: (entry?.type ?? 'call') as OutreachType,
    subject: entry?.subject ?? '',
    notes: entry?.notes ?? '',
    date: entry?.date ? entry.date.slice(0, 16) : new Date().toISOString().slice(0, 16),
    outcome: (entry?.outcome ?? 'neutral') as OutreachOutcome,
    followUpDate: entry?.followUpDate ? entry.followUpDate.slice(0, 10) : '',
  });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleContactTypeChange = (type: 'lead' | 'owner') => {
    setForm(f => ({ ...f, contactType: type, leadId: '', ownerId: '', contactName: '' }));
  };

  const handleContactSelect = (id: string) => {
    const name = getContactName(form.contactType, id);
    if (form.contactType === 'lead') {
      setForm(f => ({ ...f, leadId: id, contactName: name }));
    } else {
      setForm(f => ({ ...f, ownerId: id, contactName: name }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: entry?.id ?? `out_${Date.now()}`,
      contactType: form.contactType,
      leadId: form.contactType === 'lead' ? form.leadId : undefined,
      ownerId: form.contactType === 'owner' ? form.ownerId : undefined,
      contactName: form.contactName,
      type: form.type,
      subject: form.subject,
      notes: form.notes,
      date: new Date(form.date).toISOString(),
      outcome: form.outcome,
      followUpDate: form.followUpDate ? new Date(form.followUpDate).toISOString() : undefined,
    });
  };

  return (
    <Modal title={entry ? 'Edit Outreach' : 'Log Outreach'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Contact type toggle */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Contact Type</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['lead', 'owner'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => handleContactTypeChange(type)}
                className={`flex-1 py-2 text-sm font-medium capitalize transition-colors
                  ${form.contactType === type ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {type === 'lead' ? 'Lead' : 'Owner / Client'}
              </button>
            ))}
          </div>
        </div>

        {/* Contact selector */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Select Contact</label>
          <select
            value={form.contactType === 'lead' ? form.leadId : form.ownerId}
            onChange={e => handleContactSelect(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">— Select —</option>
            {form.contactType === 'lead'
              ? leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)
              : owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)
            }
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type *</label>
            <select value={form.type} onChange={e => set('type', e.target.value as OutreachType)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date & Time *</label>
            <input required type="datetime-local" value={form.date} onChange={e => set('date', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Subject *</label>
          <input required value={form.subject} onChange={e => set('subject', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="e.g. Initial discovery call" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            placeholder="Summary of the conversation..." />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
            <select value={form.outcome} onChange={e => set('outcome', e.target.value as OutreachOutcome)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Follow-up Date</label>
            <input type="date" value={form.followUpDate} onChange={e => set('followUpDate', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {entry ? 'Save Changes' : 'Log Outreach'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

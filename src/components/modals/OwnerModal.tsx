import { useState } from 'react';
import Modal from './Modal';
import type { Owner, LeadSource } from '../../types';

interface OwnerModalProps {
  owner?: Owner;
  onSave: (owner: Owner) => void;
  onClose: () => void;
}

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'social', label: 'Social Media' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

export default function OwnerModal({ owner, onSave, onClose }: OwnerModalProps) {
  const [form, setForm] = useState({
    name: owner?.name ?? '',
    email: owner?.email ?? '',
    phone: owner?.phone ?? '',
    source: (owner?.source ?? 'referral') as LeadSource,
    notes: owner?.notes ?? '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: owner?.id ?? `o_${Date.now()}`,
      ...form,
      properties: owner?.properties ?? [],
      createdAt: owner?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <Modal title={owner ? 'Edit Owner' : 'Add New Owner'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="e.g. John & Jane Doe" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="owner@email.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="(615) 555-0000" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Lead Source</label>
          <select value={form.source} onChange={e => set('source', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            placeholder="Any notes about this owner..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {owner ? 'Save Changes' : 'Add Owner'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

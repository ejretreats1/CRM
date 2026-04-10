import { useState } from 'react';
import Modal from './Modal';
import type { Lead, LeadStage, LeadSource } from '../../types';

interface LeadModalProps {
  lead?: Lead;
  onSave: (lead: Lead) => void;
  onClose: () => void;
}

const STAGES: { value: LeadStage; label: string }[] = [
  { value: 'new', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'proposal', label: 'Proposal Sent' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'social', label: 'Social Media' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

export default function LeadModal({ lead, onSave, onClose }: LeadModalProps) {
  const [form, setForm] = useState({
    name: lead?.name ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    propertyAddress: lead?.propertyAddress ?? '',
    propertyType: lead?.propertyType ?? '',
    bedrooms: lead?.bedrooms ?? 2,
    estimatedRevenue: lead?.estimatedRevenue ?? 0,
    stage: (lead?.stage ?? 'new') as LeadStage,
    source: (lead?.source ?? 'referral') as LeadSource,
    notes: lead?.notes ?? '',
  });

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    onSave({
      id: lead?.id ?? `l_${Date.now()}`,
      ...form,
      createdAt: lead?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <Modal title={lead ? 'Edit Lead' : 'Add New Lead'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g. John & Jane Doe" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="(615) 555-0000" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="owner@email.com" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Property Address *</label>
          <input required value={form.propertyAddress} onChange={e => set('propertyAddress', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="123 Mountain View Dr, Gatlinburg, TN" />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Property Type</label>
            <input value={form.propertyType} onChange={e => set('propertyType', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Cabin, Lake House..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bedrooms</label>
            <input type="number" min={1} max={20} value={form.bedrooms} onChange={e => set('bedrooms', Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Est. Revenue/mo ($)</label>
            <input type="number" min={0} value={form.estimatedRevenue} onChange={e => set('estimatedRevenue', Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="5000" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value as LeadStage)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
            <select value={form.source} onChange={e => set('source', e.target.value as LeadSource)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            placeholder="Add notes about this lead..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {lead ? 'Save Changes' : 'Add Lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

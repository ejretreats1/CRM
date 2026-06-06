import { useState } from 'react';
import Modal from './Modal';
import type { Lead, LeadStage, LeadSource } from '../../types';

interface LeadModalProps {
  lead?: Lead;
  onSave: (lead: Lead) => void;
  onClose: () => void;
}

const STAGES: { value: LeadStage; label: string }[] = [
  { value: 'new',       label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'cold',      label: 'Old / Cold Lead' },
  { value: 'won',       label: 'Won' },
];

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'referral',      label: 'Referral' },
  { value: 'website',       label: 'Website' },
  { value: 'social',        label: 'Social Media' },
  { value: 'cold_outreach',    label: 'Cold Outreach' },
  { value: 'facebook_outreach', label: 'Facebook Outreach' },
  { value: 'meta_ads',          label: 'Meta Ads' },
  { value: 'airbnb_outreach',   label: 'Airbnb Outreach' },
  { value: 'event',             label: 'Event' },
  { value: 'other',             label: 'Other' },
];

// Convert ISO string → datetime-local input value (YYYY-MM-DDTHH:MM)
function toDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  // Adjust for local timezone
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export default function LeadModal({ lead, onSave, onClose }: LeadModalProps) {
  const [form, setForm] = useState({
    name: lead?.name ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    propertyAddress: lead?.propertyAddress ?? '',
    propertyType: lead?.propertyType ?? '',
    bedrooms: lead?.bedrooms ?? 2,
    bathrooms: lead?.bathrooms ?? 1,
    estimatedRevenue: lead?.estimatedRevenue ?? 0,
    stage: (lead?.stage ?? 'new') as LeadStage,
    source: (lead?.source ?? 'referral') as LeadSource,
    notes: lead?.notes ?? '',
    scheduledCallAt: toDatetimeLocal(lead?.scheduledCallAt),
    scheduledCallLink: lead?.scheduledCallLink ?? '',
  });

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    onSave({
      id: lead?.id ?? `l_${Date.now()}`,
      name: form.name,
      email: form.email,
      phone: form.phone,
      propertyAddress: form.propertyAddress,
      propertyType: form.propertyType,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      estimatedRevenue: form.estimatedRevenue,
      stage: form.stage,
      source: form.source,
      notes: form.notes,
      scheduledCallAt: form.scheduledCallAt ? new Date(form.scheduledCallAt).toISOString() : undefined,
      scheduledCallLink: form.scheduledCallLink.trim() || undefined,
      createdAt: lead?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <Modal title={lead ? 'Edit Lead' : 'Add New Lead'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Full Name *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="e.g. John & Jane Doe" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="(615) 555-0000" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8aaac8] mb-1">Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="owner@email.com" />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8aaac8] mb-1">Property Address *</label>
          <input required value={form.propertyAddress} onChange={e => set('propertyAddress', e.target.value)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="123 Mountain View Dr, Gatlinburg, TN" />
        </div>

        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Property Type</label>
            <input value={form.propertyType} onChange={e => set('propertyType', e.target.value)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="Cabin, Lake House..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Bedrooms</label>
            <input type="number" min={1} max={20} value={form.bedrooms} onChange={e => set('bedrooms', Number(e.target.value))}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Bathrooms</label>
            <input type="number" min={1} max={20} step={0.5} value={form.bathrooms} onChange={e => set('bathrooms', Number(e.target.value))}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Est. Revenue/mo ($)</label>
            <input type="number" min={0} value={form.estimatedRevenue} onChange={e => set('estimatedRevenue', Number(e.target.value))}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="5000" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value as LeadStage)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
              {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Source</label>
            <select value={form.source} onChange={e => set('source', e.target.value as LeadSource)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Scheduled Call */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[#8aaac8]">
            Schedule Call
            <span className="ml-1 font-normal text-[#3a5070]">— shows on dashboard calendar</span>
          </label>
          <input
            type="datetime-local"
            value={form.scheduledCallAt}
            onChange={e => set('scheduledCallAt', e.target.value)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
          />
          <input
            type="url"
            value={form.scheduledCallLink}
            onChange={e => set('scheduledCallLink', e.target.value)}
            placeholder="Google Meet / Zoom link (optional)"
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
          />
          {(form.scheduledCallAt || form.scheduledCallLink) && (
            <button
              type="button"
              onClick={() => { set('scheduledCallAt', ''); set('scheduledCallLink', ''); }}
              className="text-xs text-[#e05c5c] hover:text-[#e05c5c]"
            >
              Clear scheduled call
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8aaac8] mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] resize-none"
            placeholder="Add notes about this lead..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-[#1e2d45] text-[#8aaac8] text-sm font-medium py-2.5 rounded-lg hover:bg-[#1e2d45] transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {lead ? 'Save Changes' : 'Add Lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

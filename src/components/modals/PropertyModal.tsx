import { useState } from 'react';
import Modal from './Modal';
import type { Property, PropertyStatus } from '../../types';

interface PropertyModalProps {
  property?: Property;
  onSave: (property: Property) => void;
  onClose: () => void;
}

const PROPERTY_TYPES = ['Cabin', 'Lake House', 'Mountain Cabin', 'Condo', 'Cottage', 'Farmhouse', 'Beach House', 'Tiny Home', 'Other'];
const PLATFORMS = ['Airbnb', 'VRBO', 'Booking.com', 'Direct', 'Other'];

export default function PropertyModal({ property, onSave, onClose }: PropertyModalProps) {
  const [form, setForm] = useState({
    address: property?.address ?? '',
    city: property?.city ?? '',
    state: property?.state ?? 'TN',
    type: property?.type ?? 'Cabin',
    bedrooms: property?.bedrooms ?? 2,
    bathrooms: property?.bathrooms ?? 1,
    maxGuests: property?.maxGuests ?? 6,
    monthlyRevenue: property?.monthlyRevenue ?? 0,
    occupancyRate: property?.occupancyRate ?? 0,
    platforms: property?.platforms ?? [] as string[],
    status: (property?.status ?? 'onboarding') as PropertyStatus,
  });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const togglePlatform = (platform: string) => {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(platform)
        ? f.platforms.filter(p => p !== platform)
        : [...f.platforms, platform],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: property?.id ?? `p_${Date.now()}`,
      ...form,
      joinedAt: property?.joinedAt ?? new Date().toISOString(),
    });
  };

  return (
    <Modal title={property ? 'Edit Property' : 'Add Property'} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Street Address *</label>
          <input required value={form.address} onChange={e => set('address', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="123 Mountain View Dr" />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">City *</label>
            <input required value={form.city} onChange={e => set('city', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Gatlinburg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
            <input value={form.state} onChange={e => set('state', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="TN" maxLength={2} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Property Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value as PropertyStatus)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bedrooms</label>
            <input type="number" min={1} max={20} value={form.bedrooms} onChange={e => set('bedrooms', Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bathrooms</label>
            <input type="number" min={1} max={20} step={0.5} value={form.bathrooms} onChange={e => set('bathrooms', Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Max Guests</label>
            <input type="number" min={1} max={50} value={form.maxGuests} onChange={e => set('maxGuests', Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Revenue ($)</label>
            <input type="number" min={0} value={form.monthlyRevenue} onChange={e => set('monthlyRevenue', Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="5000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Occupancy Rate (%)</label>
            <input type="number" min={0} max={100} value={form.occupancyRate} onChange={e => set('occupancyRate', Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="75" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-2">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(platform => (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${form.platforms.includes(platform)
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}
              >
                {platform}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {property ? 'Save Changes' : 'Add Property'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

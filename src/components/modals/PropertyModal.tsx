import { useState } from 'react';
import { X } from 'lucide-react';
import Modal from './Modal';
import type { Property, PropertyStatus } from '../../types';
import type { UplistingProperty } from '../../services/uplisting';

interface PropertyModalProps {
  property?: Property;
  onSave: (property: Property) => void;
  onClose: () => void;
  uplistingProperties?: UplistingProperty[];
}

const PROPERTY_TYPES = ['Cabin', 'Lake House', 'Mountain Cabin', 'Condo', 'Cottage', 'Farmhouse', 'Beach House', 'Tiny Home', 'Other'];
const PLATFORMS = ['Airbnb', 'VRBO', 'Booking.com', 'Direct', 'Other'];

export default function PropertyModal({ property, onSave, onClose, uplistingProperties = [] }: PropertyModalProps) {
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
    photoUrl: property?.photoUrl ?? '',
    linkedListingIds: property?.linkedListingIds ?? [] as string[],
  });
  const [linkedInput, setLinkedInput] = useState('');

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

  // Extract the primary uplisting ID from property.id (format: p_{ownerId}_{uplistingId})
  const primaryUplistingId = (() => {
    if (!property?.id) return null;
    const parts = property.id.split('_');
    return parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
  })();

  // Listings available to link: exclude primary and already-linked ones
  const availableToLink = uplistingProperties.filter(
    p => p.id !== primaryUplistingId && !form.linkedListingIds.includes(p.id)
  );

  const addLinkedId = (id: string) => {
    if (!id || form.linkedListingIds.includes(id)) return;
    setForm(f => ({ ...f, linkedListingIds: [...f.linkedListingIds, id] }));
    setLinkedInput('');
  };

  const removeLinkedId = (id: string) =>
    setForm(f => ({ ...f, linkedListingIds: f.linkedListingIds.filter(x => x !== id) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: property?.id ?? `p_${Date.now()}`,
      ...form,
      photoUrl: form.photoUrl.trim() || undefined,
      linkedListingIds: form.linkedListingIds.length ? form.linkedListingIds : undefined,
      joinedAt: property?.joinedAt ?? new Date().toISOString(),
    });
  };

  return (
    <Modal title={property ? 'Edit Property' : 'Add Property'} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#8aaac8] mb-1">Street Address *</label>
          <input required value={form.address} onChange={e => set('address', e.target.value)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="123 Mountain View Dr" />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">City *</label>
            <input required value={form.city} onChange={e => set('city', e.target.value)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="Gatlinburg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">State</label>
            <input value={form.state} onChange={e => set('state', e.target.value)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="TN" maxLength={2} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Property Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
              {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value as PropertyStatus)}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
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
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Max Guests</label>
            <input type="number" min={1} max={50} value={form.maxGuests} onChange={e => set('maxGuests', Number(e.target.value))}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Monthly Revenue ($)</label>
            <input type="number" min={0} value={form.monthlyRevenue} onChange={e => set('monthlyRevenue', Number(e.target.value))}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="5000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8aaac8] mb-1">Occupancy Rate (%)</label>
            <input type="number" min={0} max={100} value={form.occupancyRate} onChange={e => set('occupancyRate', Number(e.target.value))}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
              placeholder="75" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8aaac8] mb-1">Photo URL (optional)</label>
          <input
            value={form.photoUrl}
            onChange={e => set('photoUrl', e.target.value)}
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            placeholder="https://... (paste any image URL)"
          />
          {form.photoUrl.trim() && (
            <img
              src={form.photoUrl.trim()}
              alt="preview"
              className="mt-2 w-full h-28 object-cover rounded-lg border border-[#1e2d45]"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8aaac8] mb-1">Linked Listings <span className="text-[#3a5070] font-normal">(optional — for multi-unit properties)</span></label>
          <p className="text-xs text-[#3a5070] mb-2">Link other units at this property to aggregate occupancy &amp; revenue together in Revenue Intelligence.</p>

          {/* Picker from synced listings */}
          {availableToLink.length > 0 ? (
            <select
              value=""
              onChange={e => { if (e.target.value) addLinkedId(e.target.value); }}
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] mb-2"
            >
              <option value="">— Select a listing to link —</option>
              {availableToLink.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nickname || p.name} ({p.id})
                </option>
              ))}
            </select>
          ) : uplistingProperties.length === 0 ? (
            /* Fallback manual input when no sync data */
            <div className="flex gap-2 mb-2">
              <input
                value={linkedInput}
                onChange={e => setLinkedInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLinkedId(linkedInput.trim()); } }}
                className="flex-1 border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                placeholder="Paste Uplisting listing ID…"
              />
              <button type="button" onClick={() => addLinkedId(linkedInput.trim())}
                className="px-3 py-2 bg-[#4a90d9] text-white rounded-lg text-sm hover:bg-[#3a80c9] transition-colors">
                Add
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#3a5070] mb-2 italic">All synced listings are already linked.</p>
          )}

          {form.linkedListingIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.linkedListingIds.map(id => {
                const listing = uplistingProperties.find(p => p.id === id);
                return (
                  <span key={id} className="flex items-center gap-1 px-2 py-1 bg-[#162035] border border-[#1e3a5a] rounded-md text-xs text-[#6ab0f5]">
                    {listing ? (listing.nickname || listing.name) : id}
                    <button type="button" onClick={() => removeLinkedId(id)} className="text-[#6ab0f5] hover:text-[#e05c5c] transition-colors ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8aaac8] mb-2">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(platform => (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${form.platforms.includes(platform)
                    ? 'bg-[#4a90d9] text-white border-[#4a90d9]'
                    : 'bg-[#1a2335] text-[#8aaac8] border-[#1e2d45] hover:border-[#4a90d9]'}`}
              >
                {platform}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-[#1e2d45] text-[#8aaac8] text-sm font-medium py-2.5 rounded-lg hover:bg-[#1e2d45] transition-colors">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {property ? 'Save Changes' : 'Add Property'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

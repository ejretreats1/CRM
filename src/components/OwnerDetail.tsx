import { ArrowLeft, Mail, Phone, Home, TrendingUp, Plus, Edit2, Trash2, Wifi } from 'lucide-react';
import type { Owner, Property, OutreachEntry } from '../types';

interface OwnerDetailProps {
  owner: Owner;
  outreach: OutreachEntry[];
  onBack: () => void;
  onEdit: () => void;
  onAddProperty: () => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (propertyId: string) => void;
  onAddOutreach: () => void;
}

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  active: { badge: 'bg-emerald-100 text-emerald-700', label: 'Active' },
  onboarding: { badge: 'bg-amber-100 text-amber-700', label: 'Onboarding' },
  inactive: { badge: 'bg-slate-100 text-slate-500', label: 'Inactive' },
};

const OUTREACH_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', text: '💬', meeting: '🤝', other: '📝',
};

const OUTCOME_STYLES: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-600',
  negative: 'bg-red-100 text-red-600',
  no_response: 'bg-slate-100 text-slate-400',
};

export default function OwnerDetail({
  owner, outreach, onBack, onEdit, onAddProperty, onEditProperty, onDeleteProperty, onAddOutreach,
}: OwnerDetailProps) {
  const ownerOutreach = outreach.filter(e => e.ownerId === owner.id);
  const totalRevenue = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
  const activeProps = owner.properties.filter(p => p.status === 'active');
  const avgOccupancy = activeProps.length
    ? Math.round(activeProps.reduce((s, p) => s + p.occupancyRate, 0) / activeProps.length)
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Owners
        </button>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xl">{owner.name.charAt(0)}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{owner.name}</h1>
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-600 border border-slate-200 px-2.5 py-1 rounded-lg hover:border-teal-300 transition-colors"
              >
                <Edit2 size={12} /> Edit
              </button>
            </div>
            <div className="flex flex-wrap gap-4 mt-1.5">
              {owner.email && (
                <a href={`mailto:${owner.email}`} className="flex items-center gap-1.5 text-sm text-teal-600 hover:underline">
                  <Mail size={14} /> {owner.email}
                </a>
              )}
              {owner.phone && (
                <a href={`tel:${owner.phone}`} className="flex items-center gap-1.5 text-sm text-teal-600 hover:underline">
                  <Phone size={14} /> {owner.phone}
                </a>
              )}
            </div>
            {owner.notes && (
              <p className="text-sm text-slate-500 mt-2 bg-slate-50 px-3 py-2 rounded-lg">{owner.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Monthly Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-teal-600' },
          { label: 'Properties', value: owner.properties.length, icon: Home, color: 'text-indigo-500' },
          { label: 'Avg Occupancy', value: avgOccupancy ? `${avgOccupancy}%` : '—', icon: Wifi, color: 'text-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <s.icon size={18} className={`${s.color} mb-2`} />
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Properties */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Properties</h2>
          <button
            onClick={onAddProperty}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Plus size={13} /> Add Property
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {owner.properties.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No properties yet.</p>
          )}
          {owner.properties.map(property => {
            const style = STATUS_STYLES[property.status];
            return (
              <div key={property.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-slate-800">
                        {property.address}, {property.city}, {property.state}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-600">
                      <span>{property.type}</span>
                      <span>{property.bedrooms}bd / {property.bathrooms}ba</span>
                      <span>Max {property.maxGuests} guests</span>
                    </div>
                    {property.platforms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {property.platforms.map(p => (
                          <span key={p} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-teal-700">${property.monthlyRevenue.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">/mo</div>
                    {property.occupancyRate > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">{property.occupancyRate}% occ.</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onEditProperty(property)}
                    className="text-xs text-slate-500 hover:text-teal-600 flex items-center gap-1"
                  >
                    <Edit2 size={11} /> Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Remove this property?')) onDeleteProperty(property.id);
                    }}
                    className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outreach history */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Outreach History</h2>
          <button
            onClick={onAddOutreach}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Plus size={13} /> Log Outreach
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {ownerOutreach.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No outreach logged yet.</p>
          )}
          {[...ownerOutreach].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
            <div key={entry.id} className="flex items-start gap-3 px-5 py-4">
              <span className="text-lg mt-0.5">{OUTREACH_ICONS[entry.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-800">{entry.subject}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTCOME_STYLES[entry.outcome]}`}>
                    {entry.outcome.replace('_', ' ')}
                  </span>
                </div>
                {entry.notes && <p className="text-xs text-slate-500 mt-1">{entry.notes}</p>}
                {entry.followUpDate && (
                  <p className="text-xs text-amber-600 mt-1">
                    Follow-up: {new Date(entry.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="text-xs text-slate-400 flex-shrink-0">
                {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

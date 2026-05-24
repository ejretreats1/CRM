import { useMemo } from 'react';
import { Home, ChevronRight, TrendingUp, Calendar } from 'lucide-react';
import type { Owner, Property } from '../types';
import type { UplistingReservation, UplistingProperty } from '../services/uplisting';

interface PropertiesProps {
  owners: Owner[];
  reservations: UplistingReservation[];
  uplistingProperties: UplistingProperty[];
  onViewProperty: (ownerId: string, propertyId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  onboarding: 'bg-amber-100 text-amber-700',
};

function getUplistingId(propertyId: string): string | null {
  const parts = propertyId.split('_');
  return parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
}

export default function Properties({ owners, reservations, uplistingProperties, onViewProperty }: PropertiesProps) {
  const today = new Date().toISOString().slice(0, 10);

  const uplistingPhotoMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of uplistingProperties) {
      if (p.photo_url) map.set(p.id, p.photo_url);
    }
    return map;
  }, [uplistingProperties]);

  const allProperties = useMemo(() => {
    const result: Array<{
      property: Property;
      owner: Owner;
      upcomingCount: number;
      hasUplisting: boolean;
      photoUrl: string;
    }> = [];

    for (const owner of owners) {
      for (const property of owner.properties) {
        const uplistingId = getUplistingId(property.id);
        const upcomingCount = uplistingId
          ? reservations.filter(r =>
              r.listing_id === uplistingId &&
              r.status !== 'cancelled' &&
              r.check_in.slice(0, 10) >= today
            ).length
          : 0;
        const photoUrl = property.photoUrl || (uplistingId ? (uplistingPhotoMap.get(uplistingId) ?? '') : '');
        result.push({ property, owner, upcomingCount, hasUplisting: !!uplistingId, photoUrl });
      }
    }

    const STATUS_ORDER: Record<string, number> = { onboarding: 0, active: 1, inactive: 2 };
    return result.sort((a, b) => {
      const so = (STATUS_ORDER[a.property.status] ?? 3) - (STATUS_ORDER[b.property.status] ?? 3);
      if (so !== 0) return so;
      return a.property.address.localeCompare(b.property.address);
    });
  }, [owners, reservations, uplistingPhotoMap, today]);

  const activeCount = allProperties.filter(p => p.property.status === 'active').length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center">
          <Home size={18} className="text-white" />
        </div>
        <div>
          <h1 className="font-bold text-slate-900 text-lg leading-tight">Properties</h1>
          <p className="text-xs text-slate-400">
            {allProperties.length} total · {activeCount} active
          </p>
        </div>
      </div>

      {allProperties.length === 0 ? (
        <div className="text-center py-20 text-slate-400 text-sm">
          No properties yet. Add them from a client's detail page.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allProperties.map(({ property, owner, upcomingCount, hasUplisting, photoUrl }) => (
            <button
              key={property.id}
              onClick={() => onViewProperty(owner.id, property.id)}
              className="bg-white border border-slate-200 rounded-2xl text-left hover:border-teal-300 hover:shadow-md transition-all group overflow-hidden"
            >
              {/* Hero photo */}
              <div className="w-full h-40 bg-slate-100 overflow-hidden relative">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={property.address}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home size={32} className="text-slate-300" />
                  </div>
                )}
                <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[property.status] ?? STATUS_COLORS.inactive}`}>
                  {property.status}
                </span>
              </div>

              <div className="p-5">
              <div className="mb-2">
                <p className="font-semibold text-slate-900 text-sm truncate">{property.address}</p>
                <p className="text-xs text-slate-400">{property.city}, {property.state}</p>
              </div>

              <p className="text-xs text-slate-500 mb-3">
                <span className="text-slate-400">Owner:</span>{' '}
                <span className="font-medium text-slate-700">{owner.name}</span>
              </p>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center bg-slate-50 rounded-lg py-1.5">
                  <p className="text-sm font-bold text-slate-800">{property.bedrooms}bd</p>
                  <p className="text-xs text-slate-400">beds</p>
                </div>
                <div className="text-center bg-slate-50 rounded-lg py-1.5">
                  <p className="text-sm font-bold text-slate-800">{property.occupancyRate}%</p>
                  <p className="text-xs text-slate-400">occ.</p>
                </div>
                <div className="text-center bg-slate-50 rounded-lg py-1.5">
                  <p className={`text-sm font-bold ${hasUplisting ? 'text-teal-700' : 'text-slate-400'}`}>
                    {hasUplisting ? upcomingCount : '—'}
                  </p>
                  <p className="text-xs text-slate-400">upcoming</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {property.monthlyRevenue > 0 && (
                    <div className="flex items-center gap-1">
                      <TrendingUp size={11} className="text-teal-500" />
                      <span className="text-xs text-slate-600">${property.monthlyRevenue.toLocaleString()}/mo</span>
                    </div>
                  )}
                  {hasUplisting && (
                    <div className="flex items-center gap-1">
                      <Calendar size={11} className="text-teal-400" />
                      <span className="text-xs text-slate-400">synced</span>
                    </div>
                  )}
                </div>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-teal-500 transition-colors" />
              </div>
              </div>{/* end p-5 */}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

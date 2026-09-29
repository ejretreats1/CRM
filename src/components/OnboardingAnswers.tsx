import { useState } from 'react';
import { Eye, EyeOff, Home, Key, CalendarDays, Sparkles, Package, ScrollText } from 'lucide-react';
import type { PropertyInfo } from '../types';
import type { OnboardingEntry } from '../services/onboardingMatch';

// Shows what a client told us about one property on the onboarding form,
// falling back to the property's saved Property Info for anything the form
// didn't cover. Used on the CRM property page and in the client portal.

interface Props {
  entry?: OnboardingEntry | null;
  info?: PropertyInfo | null;
  /** Wrap in the standard card chrome (header + border). */
  title?: string;
  emptyMessage?: string;
}

type Row = { label: string; value: unknown; credential?: boolean; multiline?: boolean };
type Group = { id: string; label: string; icon: React.ElementType; rows: Row[] };

function present(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function display(v: unknown): string {
  if (Array.isArray(v)) {
    return v
      .map(x => (x && typeof x === 'object' && 'url' in x ? `${(x as { platform?: string }).platform ?? ''}: ${(x as { url: string }).url}` : String(x)))
      .join('\n');
  }
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return String(v);
}

export function buildGroups(entry: OnboardingEntry | null | undefined, info: PropertyInfo | null | undefined): Group[] {
  const e = entry ?? {};
  const i = info ?? {};
  const pick = (...vals: unknown[]) => vals.find(present);
  const groups: Group[] = [
    {
      id: 'property', label: 'Property', icon: Home, rows: [
        { label: 'Type',            value: e.propertyType },
        { label: 'Bedrooms',        value: e.bedrooms },
        { label: 'Bathrooms',       value: e.bathrooms },
        { label: 'Bed sizes',       value: e.bedSizes, multiline: true },
        { label: 'Max guests',      value: e.maxGuests },
        { label: 'Listed on',       value: e.platforms },
        { label: 'Listing links',   value: e.listingLinks, multiline: true },
        { label: 'Average rating',  value: e.averageRatings },
      ],
    },
    {
      id: 'access', label: 'Access & WiFi', icon: Key, rows: [
        { label: 'Entry type',        value: e.entryType },
        { label: 'Door / lock code',  value: pick(e.lockCode, e.doorCodes, i.doorCode), credential: true },
        { label: 'Gate code',         value: pick(e.gateCode, i.gateCode), credential: true },
        { label: 'Garage code',       value: pick(e.garageCode, i.garageCode), credential: true },
        { label: 'Parking / entry',   value: pick(e.parkingNotes, i.parkingNotes), multiline: true },
        { label: 'WiFi network',      value: pick(e.wifiName, i.wifiNetwork) },
        { label: 'WiFi password',     value: pick(e.wifiPassword, i.wifiPassword), credential: true },
        { label: 'Check-in time',     value: pick(e.checkInTime, i.checkInTime) },
        { label: 'Check-out time',    value: pick(e.checkOutTime, i.checkOutTime) },
        { label: 'Check-in instructions', value: pick(e.checkInInstructions, i.checkInInstructions), multiline: true },
      ],
    },
    {
      id: 'calendar', label: 'Booking Calendars (iCal)', icon: CalendarDays, rows: [
        { label: 'Calendar links', value: pick(e.icalLinks, i.icalLinks), multiline: true },
      ],
    },
    {
      id: 'amenities', label: 'Amenities', icon: Sparkles, rows: [
        { label: 'Amenities',       value: e.amenities },
        { label: 'Other amenities', value: pick(e.otherAmenities, i.generalNotes), multiline: true },
      ],
    },
    {
      id: 'supplies', label: 'Supplies, Trash & Systems', icon: Package, rows: [
        { label: 'Stocked',           value: e.stockedSupplies },
        { label: 'Supplies location', value: pick(e.suppliesLocation, i.suppliesLocation), multiline: true },
        { label: 'Trash pickup',      value: pick(e.trashPickupDays, i.trashPickupDays) },
        { label: 'Trash bins',        value: pick(e.trashBinLocation, i.trashBinLocation) },
        { label: 'Thermostat / HVAC', value: pick(e.thermostatNotes, i.thermostatNotes), multiline: true },
      ],
    },
    {
      id: 'rules', label: 'House Rules & Preferences', icon: ScrollText, rows: [
        { label: 'Blackout dates', value: e.blackoutDates, multiline: true },
        { label: 'Pets',           value: pick(e.petsAllowed, i.petPolicy) },
        { label: 'House rules',    value: pick(e.houseRules, i.houseRulesNotes), multiline: true },
        { label: 'Pro photos',     value: e.professionalPhotos },
      ],
    },
  ];
  return groups
    .map(g => ({ ...g, rows: g.rows.filter(r => present(r.value)) }))
    .filter(g => g.rows.length > 0);
}

export default function OnboardingAnswers({ entry, info, title = 'Onboarding Form Answers', emptyMessage }: Props) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const groups = buildGroups(entry, info);

  function toggle(key: string) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1e2d45]">
        <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">{title}</p>
      </div>
      {groups.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[#3a5070] text-center">
          {emptyMessage ?? 'No onboarding form answers for this property yet.'}
        </p>
      ) : (
        <div className="divide-y divide-[#1e2d45]">
          {groups.map(g => {
            const Icon = g.icon;
            return (
              <div key={g.id} className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Icon size={13} className="text-[#4a90d9]" />
                  <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">{g.label}</p>
                </div>
                <div className="space-y-2.5">
                  {g.rows.map(r => {
                    const key = `${g.id}:${r.label}`;
                    const hidden = r.credential && !revealed.has(key);
                    const text = display(r.value);
                    return (
                      <div key={key} className="flex items-start gap-3">
                        <span className="text-xs text-[#3a5070] w-36 flex-shrink-0 pt-0.5">{r.label}</span>
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className={`text-sm break-words ${r.multiline ? 'whitespace-pre-wrap leading-relaxed' : ''} ${r.credential ? 'font-mono' : ''} ${hidden ? 'text-[#3a5070] tracking-widest select-none' : 'text-white'}`}>
                            {hidden ? '••••••••' : text}
                          </span>
                          {r.credential && (
                            <button
                              type="button"
                              onClick={() => toggle(key)}
                              aria-label={hidden ? 'Reveal' : 'Hide'}
                              className="text-[#3a5070] hover:text-[#b8d4f0] flex-shrink-0 mt-0.5"
                            >
                              {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

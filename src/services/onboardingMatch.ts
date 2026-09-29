import { addressesMatch } from './addressMatch';
import type { PropertyInfo } from '../types';

/** One property's answers from the client onboarding form (form_data.properties[i]). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OnboardingEntry = Record<string, any>;

/**
 * The per-property entries in a submitted onboarding form. Older submissions
 * kept a single property's fields flat on the form itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function onboardingEntries(formData: Record<string, any> | null | undefined): OnboardingEntry[] {
  if (!formData) return [];
  const entries = Array.isArray(formData.properties) ? formData.properties : [];
  if (entries.length) return entries.filter(e => e && typeof e === 'object');
  return formData.propertyAddress ? [formData] : [];
}

/**
 * Pick the onboarding entry that describes `property`, comparing the form's
 * address against every address the property is known by (its own address plus
 * any manual record that was merged into it). Falls back to the only entry when
 * the form has just one.
 */
export function findOnboardingEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData: Record<string, any> | null | undefined,
  addresses: (string | null | undefined)[],
): OnboardingEntry | null {
  const entries = onboardingEntries(formData);
  if (!entries.length) return null;
  const known = addresses.filter((a): a is string => !!a && a.trim().length > 0);
  const match = entries.find(e => known.some(a => addressesMatch(e.propertyAddress, a)));
  if (match) return match;
  return entries.length === 1 ? entries[0] : null;
}

/**
 * Property Info fields derived from an onboarding entry. Only fills keys the
 * existing info leaves blank, so E&J's own edits are never overwritten.
 */
export function propertyInfoFromEntry(entry: OnboardingEntry, existing: PropertyInfo = {}): PropertyInfo {
  const icalLinks = Array.isArray(entry.icalLinks)
    ? entry.icalLinks
        .filter((l: { url?: string }) => l && typeof l.url === 'string' && l.url.trim())
        .map((l: { platform?: string; url: string }) => ({ platform: String(l.platform || 'Other'), url: l.url.trim() }))
    : [];
  const derived: PropertyInfo = {
    doorCode:            entry.lockCode || entry.doorCodes || undefined,
    gateCode:            entry.gateCode || undefined,
    garageCode:          entry.garageCode || undefined,
    parkingNotes:        entry.parkingNotes || undefined,
    wifiNetwork:         entry.wifiName || undefined,
    wifiPassword:        entry.wifiPassword || undefined,
    checkInTime:         entry.checkInTime || undefined,
    checkOutTime:        entry.checkOutTime || undefined,
    checkInInstructions: entry.checkInInstructions || undefined,
    thermostatNotes:     entry.thermostatNotes || undefined,
    trashPickupDays:     entry.trashPickupDays || undefined,
    trashBinLocation:    entry.trashBinLocation || undefined,
    suppliesLocation:    entry.suppliesLocation || undefined,
    icalLinks:           icalLinks.length ? icalLinks : undefined,
    petPolicy:           entry.petsAllowed === 'Yes' ? 'Pets allowed ($75 fee)' : entry.petsAllowed === 'No' ? 'No pets' : undefined,
    houseRulesNotes:     entry.houseRules || undefined,
    generalNotes:        entry.otherAmenities || undefined,
  };
  const merged: PropertyInfo = { ...existing };
  for (const [key, value] of Object.entries(derived) as [keyof PropertyInfo, unknown][]) {
    const current = existing[key];
    const blank = current === undefined || current === null || current === '' || (Array.isArray(current) && current.length === 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (blank && value !== undefined) (merged as any)[key] = value;
  }
  return merged;
}

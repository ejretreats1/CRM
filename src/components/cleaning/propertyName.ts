import type { UplistingProperty } from '../../services/uplisting';

/**
 * What to call a property across the cleaning CRM.
 *
 * The name saved in the CRM wins: it's the one the office can edit on the
 * property, the one copied onto each job when it's created, and the one
 * cleaners and clients see in their emails. A listing name from
 * Uplisting/Hostaway is only a fallback for rows that never got a name of
 * their own — otherwise an edit here would silently show the listing's name
 * instead.
 */
export function displayName(
  propertyId: string | undefined,
  propertyName: string,
  props: UplistingProperty[],
): string {
  if (propertyName?.trim()) return propertyName.trim();
  const p = props.find(up => up.id === propertyId);
  return p?.nickname || p?.name || propertyName;
}

/** The listing's own name, when this property came from Uplisting/Hostaway. */
export function listingName(propertyId: string | undefined, props: UplistingProperty[]): string | null {
  const p = props.find(up => up.id === propertyId);
  return p?.nickname || p?.name || null;
}

/**
 * A job's property name after the property is renamed. Jobs for a sub-unit are
 * named "<property> — <unit>", so the rename only replaces the property part.
 */
export function renamedJobName(current: string, from: string, to: string): string {
  if (current === from) return to;
  if (current.startsWith(`${from} — `)) return `${to}${current.slice(from.length)}`;
  return current;
}

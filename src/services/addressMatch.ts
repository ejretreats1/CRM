// Loose address comparison used to recognise the same property entered in
// different places (owner onboarding form vs. Uplisting/Hostaway listing).
// "123 Ocean Dr., Miami FL" and "123 ocean drive" should match.

const SUFFIXES: Record<string, string> = {
  street: 'st', st: 'st', avenue: 'ave', ave: 'ave', av: 'ave', boulevard: 'blvd', blvd: 'blvd',
  drive: 'dr', dr: 'dr', road: 'rd', rd: 'rd', lane: 'ln', ln: 'ln', court: 'ct', ct: 'ct',
  circle: 'cir', cir: 'cir', place: 'pl', pl: 'pl', terrace: 'ter', ter: 'ter', way: 'way',
  trail: 'trl', trl: 'trl', parkway: 'pkwy', pkwy: 'pkwy', highway: 'hwy', hwy: 'hwy',
  north: 'n', n: 'n', south: 's', s: 's', east: 'e', e: 'e', west: 'w', w: 'w',
};

/** Lower-cased, punctuation-free, suffix-normalised street line ("123 ocean dr"). */
export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  const streetLine = raw.split(',')[0] ?? raw;
  return streetLine
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => SUFFIXES[w] ?? w)
    .join(' ');
}

/**
 * True when two free-text addresses very likely describe the same property:
 * same street number and the normalised street lines share their first words.
 */
export function addressesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [numA, ...restA] = na.split(' ');
  const [numB, ...restB] = nb.split(' ');
  if (!/^\d/.test(numA) || numA !== numB) return false;
  // Same house number: compare the street name (first two words after the number).
  const streetA = restA.slice(0, 2).join(' ');
  const streetB = restB.slice(0, 2).join(' ');
  return !!streetA && (streetA === streetB || streetA.startsWith(streetB) || streetB.startsWith(streetA));
}

/** Property ids created from an Uplisting/Hostaway import look like p_<ts>_<listingId>. */
export function isListingLinkedPropertyId(id: string): boolean {
  const parts = id.split('_');
  return parts[0] === 'p' && parts.length >= 3;
}

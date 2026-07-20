import type { Owner, Property } from '../types';
import type { UplistingReservation } from './uplisting';

export interface GapInfo {
  start: string; // YYYY-MM-DD
  end: string;
  nights: number;
}

export interface PropertyInsight {
  ownerId: string;
  ownerName: string;
  propertyId: string;
  propertyAddress: string;
  uplistingId: string | null;
  unitCount: number;
  // Occupancy
  occupancy30d: number;
  occupancy60d: number;
  occupancy90d: number;
  // Revenue
  adr: number;
  revPar30d: number;
  totalRevenue30d: number;
  // Gaps in next 90 days
  gaps: GapInfo[];
  largestGap: GapInfo | null;
  urgentGap: GapInfo | null; // starts within 14 days
  // Velocity
  bookingsLast14d: number;
  bookingsLast14dPriorYear: number;
  // Lead time
  avgLeadTimeDays: number;
  // Channels
  channelMix: Record<string, number>;
  platforms: string[];
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

function getUplistingId(propertyId: string): string | null {
  const parts = propertyId.split('_');
  return parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
}

function bookedNightsInWindow(reservations: UplistingReservation[], windowStart: string, windowEnd: string): number {
  let booked = 0;
  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const cin = r.check_in.slice(0, 10);
    const cout = r.check_out.slice(0, 10);
    const overlapStart = cin > windowStart ? cin : windowStart;
    const overlapEnd = cout < windowEnd ? cout : windowEnd;
    if (overlapEnd > overlapStart) {
      booked += daysBetween(overlapStart, overlapEnd);
    }
  }
  return booked;
}

function findGaps(reservations: UplistingReservation[], today: string, horizonEnd: string): GapInfo[] {
  const active = reservations
    .filter(r => r.status !== 'cancelled' && r.check_out.slice(0, 10) > today && r.check_in.slice(0, 10) < horizonEnd)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  const gaps: GapInfo[] = [];
  let cursor = today;

  for (const r of active) {
    const cin = r.check_in.slice(0, 10);
    if (cin > cursor) {
      const gapEnd = cin < horizonEnd ? cin : horizonEnd;
      const nights = daysBetween(cursor, gapEnd);
      if (nights >= 2) gaps.push({ start: cursor, end: gapEnd, nights });
    }
    const cout = r.check_out.slice(0, 10);
    if (cout > cursor) cursor = cout;
  }

  // trailing gap
  if (cursor < horizonEnd) {
    const nights = daysBetween(cursor, horizonEnd);
    if (nights >= 2) gaps.push({ start: cursor, end: horizonEnd, nights });
  }

  return gaps;
}

function avgOccupancy(ids: string[], allReservations: UplistingReservation[], windowStart: string, windowEnd: string, windowDays: number): number {
  if (ids.length === 0) return 0;
  const totalBooked = ids.reduce((sum, id) => {
    const unitRes = allReservations.filter(r => r.listing_id === id);
    return sum + bookedNightsInWindow(unitRes, windowStart, windowEnd);
  }, 0);
  return Math.round((totalBooked / (ids.length * windowDays)) * 100);
}

export function analyzeProperty(
  owner: Owner,
  property: Property,
  allReservations: UplistingReservation[],
): PropertyInsight {
  const primaryId = getUplistingId(property.id);
  const linkedIds = property.linkedListingIds ?? [];
  const allIds = [primaryId, ...linkedIds].filter(Boolean) as string[];
  const isMultiUnit = allIds.length > 1;

  const now = new Date();
  const today = toDateStr(now);
  const d30 = addDays(today, 30);
  const d60 = addDays(today, 60);
  const d90 = addDays(today, 90);
  const d14ago = addDays(today, -14);
  const d90ago = addDays(today, -90);

  // All reservations across every listing in this group
  const propRes = allIds.length > 0
    ? allReservations.filter(r => allIds.includes(r.listing_id))
    : [];

  // Occupancy: average occupied nights per unit so multi-unit reads correctly
  const occupancy30d = Math.min(100, isMultiUnit ? avgOccupancy(allIds, allReservations, today, d30, 30) : Math.round((bookedNightsInWindow(propRes, today, d30) / 30) * 100));
  const occupancy60d = Math.min(100, isMultiUnit ? avgOccupancy(allIds, allReservations, today, d60, 60) : Math.round((bookedNightsInWindow(propRes, today, d60) / 60) * 100));
  const occupancy90d = Math.min(100, isMultiUnit ? avgOccupancy(allIds, allReservations, today, d90, 90) : Math.round((bookedNightsInWindow(propRes, today, d90) / 90) * 100));

  const past90 = propRes.filter(
    r => r.status !== 'cancelled' && r.check_out.slice(0, 10) >= d90ago && r.check_in.slice(0, 10) <= today,
  );
  // Revenue: sum across all listings in group
  const totalRevenue30d = propRes
    .filter(r => r.status !== 'cancelled' && r.check_in.slice(0, 10) >= today && r.check_in.slice(0, 10) <= d30)
    .reduce((s, r) => s + r.total_price, 0);

  const adrSource = past90.filter(r => (r.nights ?? 0) > 0);
  const adr = adrSource.length
    ? Math.round(adrSource.reduce((s, r) => {
        // Use accommodation_total if available to exclude cleaning fees from ADR
        const nightly = r.accommodation_total != null
          ? r.accommodation_total / (r.nights ?? 1)
          : r.cleaning_fee != null
          ? (r.total_price - r.cleaning_fee) / (r.nights ?? 1)
          : r.total_price / (r.nights ?? 1);
        return s + Math.max(0, nightly);
      }, 0) / adrSource.length)
    : 0;

  // Gaps: use primary listing only (the "entire property" view)
  const primaryRes = primaryId ? allReservations.filter(r => r.listing_id === primaryId) : propRes;
  const gaps = findGaps(primaryRes, today, d90);
  const largestGap = gaps.length ? gaps.reduce((a, b) => (b.nights > a.nights ? b : a)) : null;
  const urgentGap = gaps.find(g => daysBetween(today, g.start) <= 14) ?? null;

  const bookingsLast14d = propRes.filter(
    r => r.status !== 'cancelled' && r.check_in.slice(0, 10) >= d14ago && r.check_in.slice(0, 10) <= today,
  ).length;

  const priorYearStart = addDays(today, -365 - 14);
  const priorYearEnd = addDays(today, -365);
  const bookingsLast14dPriorYear = propRes.filter(
    r => r.status !== 'cancelled' &&
      r.check_in.slice(0, 10) >= priorYearStart &&
      r.check_in.slice(0, 10) <= priorYearEnd,
  ).length;

  // created_at is not guaranteed from PMS — only compute lead time when it's present and valid
  const withLeadTime = past90.filter(r => typeof (r as any).created_at === 'string' && (r as any).created_at.length >= 10);
  const avgLeadTimeDays = withLeadTime.length
    ? Math.round(withLeadTime.reduce((s, r) => s + Math.max(0, daysBetween((r as any).created_at.slice(0, 10), r.check_in.slice(0, 10))), 0) / withLeadTime.length)
    : 0;

  const channelMix: Record<string, number> = {};
  for (const r of past90) {
    if (r.channel) channelMix[r.channel] = (channelMix[r.channel] ?? 0) + 1;
  }

  const revPar30d = Math.round(totalRevenue30d / 30);

  return {
    ownerId: owner.id,
    ownerName: owner.name,
    propertyId: property.id,
    propertyAddress: [property.address, property.city, property.state].filter(Boolean).join(', '),
    uplistingId: primaryId,
    unitCount: allIds.length || 1,
    occupancy30d,
    occupancy60d,
    occupancy90d,
    adr,
    revPar30d,
    totalRevenue30d,
    gaps,
    largestGap,
    urgentGap,
    bookingsLast14d,
    bookingsLast14dPriorYear,
    avgLeadTimeDays,
    channelMix,
    platforms: property.platforms,
  };
}

export function urgencyLevel(insight: PropertyInsight): 'critical' | 'warning' | 'info' | 'ok' {
  if (insight.urgentGap && insight.urgentGap.nights >= 3) return 'critical';
  if (insight.occupancy30d < 30) return 'critical';
  if (insight.occupancy30d < 50 || (insight.largestGap && insight.largestGap.nights >= 7)) return 'warning';
  if (insight.occupancy60d < 50) return 'warning';
  return 'info';
}

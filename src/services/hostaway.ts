import { CANCELLED_STATUSES } from './uplisting';
import type { UplistingProperty, UplistingReservation, PropertyRevenueMap } from './uplisting';

export interface HostawayConnectionResult {
  ok: boolean;
  error?: string;
  properties?: UplistingProperty[];
}

async function apiFetch(
  path: string,
  accountId: string,
  secret: string,
  params?: Record<string, string>,
) {
  const q = new URLSearchParams({ path, ...(params ?? {}) });
  const res = await fetch(`/api/uplisting-proxy?${q}`, {
    headers: {
      'x-hostaway-account-id': accountId,
      'x-hostaway-secret':     secret,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProperty(p: any): UplistingProperty {
  const images: any[] = p.listingImages ?? p.images ?? [];
  const photo_url: string =
    images[0]?.url ?? images[0]?.smallUrl ?? images[0]?.largeThumbnailUrl ?? '';
  return {
    id:            String(p.id ?? ''),
    name:          p.name ?? p.internalListingName ?? '',
    nickname:      p.internalListingName ?? p.name ?? '',
    address:       p.address ?? p.street ?? '',
    city:          p.city ?? '',
    state:         p.state ?? '',
    bedrooms:      Number(p.bedrooms ?? 0),
    bathrooms:     Number(p.bathrooms ?? 0),
    max_guests:    Number(p.maxGuests ?? p.guestCapacity ?? 0),
    property_type: p.propertyType ?? '',
    channels:      [],
    status:        p.status ?? 'active',
    time_zone:     p.timeZone ?? '',
    photo_url,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReservation(r: any): UplistingReservation {
  const checkIn  = r.checkInDate  ?? r.arrivalDate   ?? '';
  const checkOut = r.checkOutDate ?? r.departureDate ?? '';
  const rawNights = Number(r.nights ?? 0);
  const nights = rawNights > 0 ? rawNights : (() => {
    if (!checkIn || !checkOut) return 0;
    const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  })();
  return {
    id:          String(r.id ?? ''),
    listing_id:  String(r.listingId ?? r.listing_id ?? r.listingMapId ?? ''),
    guest_name:  r.guestName ?? 'Guest',
    guest_email: r.guestEmail ?? '',
    check_in:    checkIn,
    check_out:   checkOut,
    total_price:         Number(r.hostPayout ?? r.totalPrice ?? r.payout ?? 0),
    accommodation_total: r.accommodationFare != null ? Number(r.accommodationFare) : r.totalRevenue != null ? Number(r.totalRevenue) : undefined,
    cleaning_fee:        r.cleaningFee != null ? Number(r.cleaningFee) : undefined,
    status:      r.status ?? 'confirmed',
    channel:     r.channelName ?? r.source ?? '',
    nights,
  };
}

export async function testHostawayConnection(
  accountId: string,
  secret: string,
): Promise<HostawayConnectionResult> {
  try {
    const data = await apiFetch('listings', accountId, secret, { limit: '5', offset: '0' });
    const list: any[] = data?.result ?? data?.data ?? [];
    return { ok: true, properties: list.map(normalizeProperty) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchHostawayProperties(
  accountId: string,
  secret: string,
): Promise<UplistingProperty[]> {
  const all: UplistingProperty[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const data = await apiFetch('listings', accountId, secret, {
      limit:  String(limit),
      offset: String(offset),
    });
    const list: any[] = data?.result ?? data?.data ?? [];
    all.push(...list.map(normalizeProperty));
    if (list.length < limit) break;
    offset += limit;
  }
  return all;
}

export async function fetchHostawayReservations(
  accountId: string,
  secret: string,
  from?: string,
  to?: string,
): Promise<{ reservations: UplistingReservation[]; revenueMap: PropertyRevenueMap }> {
  const all: UplistingReservation[] = [];
  let offset = 0;
  const limit = 100;
  const baseParams: Record<string, string> = { limit: String(limit) };
  if (from) baseParams.checkInDateFrom = from;
  if (to)   baseParams.checkInDateTo   = to;
  for (;;) {
    const data = await apiFetch('reservations', accountId, secret, {
      ...baseParams,
      offset: String(offset),
    });
    const list: any[] = data?.result ?? data?.data ?? [];
    all.push(...list.map(normalizeReservation));
    if (list.length < limit) break;
    offset += limit;
  }

  const today = new Date();
  const cutoff = new Date();
  cutoff.setDate(today.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const revenueMap: PropertyRevenueMap = { revenue: {}, occupancy: {} };
  const byProperty = new Map<string, UplistingReservation[]>();
  for (const r of all) {
    if (!r.listing_id) continue;
    const group = byProperty.get(r.listing_id) ?? [];
    group.push(r);
    byProperty.set(r.listing_id, group);
  }
  for (const [propId, resv] of byProperty) {
    const confirmed = resv.filter(r =>
      !CANCELLED_STATUSES.has(r.status) &&
      r.check_in.slice(0, 10) <= todayStr &&
      r.check_out.slice(0, 10) >= cutoffStr
    );
    revenueMap.revenue[propId] = confirmed.reduce((s, r) => s + r.total_price, 0);
    const bookedNights = resv.filter(r =>
      !CANCELLED_STATUSES.has(r.status) &&
      new Date(r.check_out) >= cutoff &&
      new Date(r.check_in) <= today
    ).reduce((s, r) => s + (r.nights || 1), 0);
    revenueMap.occupancy[propId] = Math.min(100, Math.round((bookedNights / 30) * 100));
  }

  return { reservations: all, revenueMap };
}

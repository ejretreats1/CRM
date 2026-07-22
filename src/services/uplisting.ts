/**
 * Uplisting API service
 * Docs: https://docs.uplisting.io
 * Auth: Bearer token (your API key)
 */

export interface UplistingProperty {
  id: string;
  name: string;
  nickname?: string;
  address: string;
  city?: string;
  state?: string;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  property_type?: string;
  channels?: string[];
  status?: string;
  time_zone?: string;
  photo_url?: string;
}

export interface UplistingUpsell {
  name: string;
  price: number;
}

export interface UplistingReservation {
  id: string;
  listing_id: string;
  guest_name: string;
  guest_email?: string;
  check_in: string;
  check_out: string;
  total_price: number;
  accommodation_total?: number;
  cleaning_fee?: number;
  upsells?: UplistingUpsell[];
  status: string;
  channel?: string;
  nights?: number;
}

export interface UplistingConnectionResult {
  ok: boolean;
  error?: string;
  properties?: UplistingProperty[];
  reservations?: UplistingReservation[];
}

export interface PropertyRevenueMap {
  revenue: Record<string, number>;
  occupancy: Record<string, number>;
}

async function apiFetch(path: string, apiKey: string, params?: Record<string, string>) {
  const q = new URLSearchParams({ path, ...params });
  const res = await fetch(`/api/uplisting-proxy?${q}`, {
    headers: { 'x-uplisting-key': apiKey },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

export async function testConnection(apiKey: string): Promise<UplistingConnectionResult> {
  try {
    const data = await apiFetch('properties', apiKey);
    const included: any[] = data?.included ?? [];
    const properties: UplistingProperty[] = (data?.properties ?? data?.data ?? data ?? []).map((p: any) => normalizeProperty(p, included));
    return { ok: true, properties };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchProperties(apiKey: string): Promise<UplistingProperty[]> {
  const data = await apiFetch('properties', apiKey);
  const list: any[] = data?.properties ?? data?.data ?? data ?? [];
  const included: any[] = data?.included ?? [];
  const base = list.map(p => normalizeProperty(p, included));

  // List endpoint has no photos — fetch individual details in parallel to get them
  const enriched = await Promise.all(base.map(async prop => {
    try {
      const detail = await apiFetch(`properties/${prop.id}`, apiKey);
      const d = detail?.property ?? detail?.data ?? detail;
      if (!d) return prop;
      const da = d.attributes ?? d;
      const photo_url = extractPhotoUrl(da, d, detail?.included ?? []);
      console.log('[Uplisting] detail keys for', prop.id, Object.keys(da).join(', '));
      return photo_url ? { ...prop, photo_url } : prop;
    } catch {
      return prop;
    }
  }));

  return enriched;
}

export async function fetchPropertyAllPhotos(apiKey: string, propertyId: string): Promise<string[]> {
  try {
    const detail = await apiFetch(`properties/${propertyId}`, apiKey);
    const d = detail?.property ?? detail?.data ?? detail;
    if (!d) return [];
    const a = d.attributes ?? d;
    const included: any[] = detail?.included ?? [];

    const urls: string[] = [];

    // Array field: photos / images / pictures
    const arr = a.photos ?? a.images ?? a.pictures;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'string') urls.push(item);
        else {
          const u = item?.url ?? item?.original ?? item?.large ?? item?.medium ?? item?.src ?? item?.href;
          if (u) urls.push(String(u));
        }
      }
    }

    // JSON:API relationships → included array
    const photoRel = d.relationships?.photos?.data ?? d.relationships?.images?.data ?? d.relationships?.photo?.data;
    if (photoRel && included.length > 0) {
      const refs: any[] = Array.isArray(photoRel) ? photoRel : [photoRel];
      for (const ref of refs) {
        const match = included.find((i: any) => i.id === ref.id && (i.type === ref.type || /photo|image/i.test(i.type ?? '')));
        if (match) {
          const ma = match.attributes ?? match;
          const u = ma.url ?? ma.original ?? ma.large ?? ma.medium ?? ma.src;
          if (u) urls.push(String(u));
        }
      }
    }

    // Fallback: cover photo
    if (urls.length === 0) {
      const cover = extractPhotoUrl(a, d, included);
      if (cover) urls.push(cover);
    }

    return [...new Set(urls)]; // deduplicate
  } catch {
    return [];
  }
}

export async function fetchReservations(
  apiKey: string,
  from?: string,
  to?: string,
  properties?: UplistingProperty[]
): Promise<{ reservations: UplistingReservation[]; revenueMap: PropertyRevenueMap }> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  const props = properties ?? await fetchProperties(apiKey);

  const today = new Date();
  const cutoff = new Date();
  cutoff.setDate(today.getDate() - 30);
  const ahead = new Date();
  ahead.setDate(today.getDate() + 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const aheadStr  = ahead.toISOString().slice(0, 10);

  const revenueMap: PropertyRevenueMap = { revenue: {}, occupancy: {} };
  const allBookings: UplistingReservation[] = (await Promise.all(props.map(async prop => {
    try {
      const data = await apiFetch(`bookings/${prop.id}`, apiKey, params);
      const rawList: any[] = data?.bookings ?? data?.data ?? data ?? [];
      const normalized = rawList.map(r => ({
        ...normalizeReservation(r),
        listing_id: prop.id,
      }));
      // Revenue = all confirmed bookings checking in within last 30 days OR next 30 days.
      // Including upcoming bookings prevents newly-live properties from always showing $0.
      const confirmed = normalized.filter(r =>
        !CANCELLED_STATUSES.has(r.status) &&
        r.check_in.slice(0, 10) <= aheadStr &&
        r.check_out.slice(0, 10) >= cutoffStr
      );
      revenueMap.revenue[prop.id] = confirmed.reduce((s, r) => s + r.total_price, 0);
      // Occupancy stays trailing-only (future nights aren't occupied yet)
      const bookedNights = normalized.filter(r =>
        !CANCELLED_STATUSES.has(r.status) &&
        new Date(r.check_out) >= cutoff &&
        new Date(r.check_in) <= today
      ).reduce((s, r) => s + (r.nights || 1), 0);
      revenueMap.occupancy[prop.id] = Math.min(100, Math.round((bookedNights / 30) * 100));
      return normalized;
    } catch {
      return [];
    }
  }))).flat();
  return { reservations: allBookings, revenueMap };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPhotoUrl(a: any, p: any, included: any[]): string {
  // 1. Direct attribute field guesses
  const direct = a.photo_url ?? a.thumbnail_url ?? a.cover_photo_url ?? a.cover_image_url
    ?? a.main_photo ?? a.main_image ?? a.hero_image ?? a.primary_image
    ?? a.picture ?? a.listing_image ?? a.listing_photo ?? a.featured_image;
  if (direct) return String(direct);

  // 2. Array of photos/images/pictures
  const arr = a.photos ?? a.images ?? a.pictures;
  if (Array.isArray(arr) && arr.length > 0) {
    const first = arr[0];
    if (typeof first === 'string') return first;
    const url = first?.url ?? first?.original ?? first?.large ?? first?.medium ?? first?.src ?? first?.href;
    if (url) return String(url);
  }

  // 3. JSON:API relationships → look in included array
  const photoRel = p.relationships?.photos?.data ?? p.relationships?.images?.data ?? p.relationships?.photo?.data;
  if (photoRel && included.length > 0) {
    const refs: any[] = Array.isArray(photoRel) ? photoRel : [photoRel];
    for (const ref of refs) {
      const match = included.find(i => i.id === ref.id && (i.type === ref.type || /photo|image/i.test(i.type ?? '')));
      if (match) {
        const ma = match.attributes ?? match;
        const url = ma.url ?? ma.original ?? ma.large ?? ma.medium ?? ma.src;
        if (url) return String(url);
      }
    }
  }

  return '';
}

// Normalise Uplisting response shapes into our expected structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProperty(p: any, included: any[] = []): UplistingProperty {
  const a = p.attributes ?? p; // Uplisting uses JSON:API format: data is under `attributes`
  const id = String(p.id ?? a.id ?? p.listing_id ?? '');

  const photo_url = extractPhotoUrl(a, p, included);

  return {
    id,
    name: a.name ?? a.title ?? a.listing_name ?? '',
    nickname: a.nickname ?? '',
    address: a.address ?? a.street ?? '',
    city: a.city ?? '',
    state: a.state ?? a.region ?? '',
    bedrooms: Number(a.bedrooms ?? a.bedroom_count ?? 0),
    bathrooms: Number(a.bathrooms ?? a.bathroom_count ?? 0),
    max_guests: Number(a.maximum_capacity ?? a.max_guests ?? a.guest_capacity ?? 0),
    property_type: a.property_type ?? (p.type !== 'listing' ? p.type : '') ?? '',
    channels: a.channels ?? a.active_channels ?? [],
    status: a.status ?? 'active',
    time_zone: a.time_zone ?? '',
    photo_url,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeUpsells(a: any): UplistingUpsell[] | undefined {
  // Array of upsell/service/add-on objects (all platforms)
  const rawArr = a.upsells ?? a.add_ons ?? a.extras ?? a.addons ?? a.services
    ?? a.upsell_items ?? a.extra_items ?? a.line_items ?? a.fees;
  if (Array.isArray(rawArr) && rawArr.length > 0) {
    const items: UplistingUpsell[] = [];
    for (const u of rawArr) {
      const price = Number(u.price ?? u.amount ?? u.total ?? u.charge ?? u.fee ?? u.value ?? 0);
      if (price === 0) continue;
      items.push({ name: String(u.name ?? u.title ?? u.description ?? u.type ?? u.label ?? 'Upsell'), price });
    }
    if (items.length > 0) return items;
  }
  // Uplisting / Hostaway return upsells as a flat numeric field
  const extra = Number(
    a.extra_charges ?? a.extras_total ?? a.upsell_total ?? a.upsells_total ??
    a.add_on_total ?? a.add_ons_total ?? a.services_total ?? a.additional_charges ??
    a.guest_charge_extras ?? a.extra_amount ?? 0
  );
  const other = Number(a.other_charges ?? a.misc_charges ?? a.other_fees ?? 0);
  const result: UplistingUpsell[] = [];
  if (extra > 0) result.push({ name: 'Extra Charges', price: extra });
  if (other > 0) result.push({ name: 'Other Charges', price: other });
  return result.length > 0 ? result : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReservation(r: any): UplistingReservation {
  const a = r.attributes ?? r; // handle JSON:API format
  const checkIn  = a.check_in  ?? a.start_date ?? '';
  const checkOut = a.check_out ?? a.end_date   ?? '';
  const rawNights = Number(a.number_of_nights ?? a.nights ?? 0);
  const nights = rawNights > 0 ? rawNights : (() => {
    if (!checkIn || !checkOut) return 0;
    const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  })();
  return {
    id: String(r.id ?? a.id ?? ''),
    listing_id: String(a.property_id ?? a.listing_id ?? a.listingId ?? r.property_id ?? r.listingId ?? ''),
    guest_name: a.guest_name ?? a.guest?.name ?? 'Guest',
    guest_email: a.guest_email ?? a.guest?.email ?? '',
    check_in:  checkIn,
    check_out: checkOut,
    total_price: Number(a.total_payout ?? a.host_payout ?? a.total_price ?? 0),
    accommodation_total: (a.accommodation_total ?? a.accomodation_total) != null
      ? Number(a.accommodation_total ?? a.accomodation_total)
      : undefined,
    cleaning_fee: a.cleaning_fee != null ? Number(a.cleaning_fee) : undefined,
    upsells: normalizeUpsells(a),
    status: a.status ?? 'confirmed',
    channel: a.channel ?? a.source ?? '',
    nights,
  };
}

// Denylist: anything NOT in this set is treated as a confirmed/revenue booking.
// This is more robust than an allowlist because PMS platforms use many different
// confirmed-status strings ('new', 'accepted', 'booked', 'reservation', etc.)
// while cancellation strings are predictable and finite.
export const CANCELLED_STATUSES = new Set([
  'cancelled', 'canceled', 'declined', 'expired',
  'rejected', 'request_denied', 'denied', 'no_show',
]);

// Keep for any external code that imported it; all internal logic uses CANCELLED_STATUSES.
export const CONFIRMED_STATUSES = new Set([
  'confirmed', 'accepted', 'checked_in', 'checked_out',
  'completed', 'stayed', 'departed', 'arrived',
  'new', 'checkedIn', 'checkedOut', 'modified', 'ownerStay',
]);

/** Extract the PMS listing ID from a CRM property ID (format: p_{timestamp}_{listingId}) */
export function extractListingId(propertyId: string): string | null {
  const parts = propertyId.split('_');
  return parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
}

/** Estimate revenue from confirmed reservations overlapping last 30 days or next 30 days */
export function estimateMonthlyRevenue(
  propertyId: string,
  reservations: UplistingReservation[]
): number {
  const today = new Date();
  const cutoff = new Date();
  cutoff.setDate(today.getDate() - 30);
  const ahead = new Date();
  ahead.setDate(today.getDate() + 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const aheadStr  = ahead.toISOString().slice(0, 10);
  return reservations
    .filter(
      (r) =>
        r.listing_id === propertyId &&
        !CANCELLED_STATUSES.has(r.status) &&
        r.check_in.slice(0, 10) <= aheadStr &&
        r.check_out.slice(0, 10) >= cutoffStr
    )
    .reduce((sum, r) => sum + r.total_price, 0);
}

/** Estimate occupancy % from reservations over the last 30 days */
export function estimateOccupancy(
  propertyId: string,
  reservations: UplistingReservation[]
): number {
  const today = new Date();
  const cutoff = new Date();
  cutoff.setDate(today.getDate() - 30);
  const bookedNights = reservations
    .filter(
      (r) =>
        r.listing_id === propertyId &&
        !CANCELLED_STATUSES.has(r.status) &&
        new Date(r.check_out) >= cutoff &&
        new Date(r.check_in) <= today
    )
    .reduce((sum, r) => sum + (r.nights || 1), 0);
  return Math.min(100, Math.round((bookedNights / 30) * 100));
}

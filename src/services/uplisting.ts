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
}

export interface UplistingReservation {
  id: string;
  listing_id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  total_price: number;
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
    const properties: UplistingProperty[] = (data?.properties ?? data?.data ?? data ?? []).map(normalizeProperty);
    return { ok: true, properties };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchProperties(apiKey: string): Promise<UplistingProperty[]> {
  const data = await apiFetch('properties', apiKey);
  return (data?.properties ?? data?.data ?? data ?? []).map(normalizeProperty);
}

export async function fetchReservations(
  apiKey: string,
  from?: string,
  to?: string
): Promise<UplistingReservation[]> {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  // bookings endpoint requires a listing_id; fetch all properties first and aggregate
  const properties = await fetchProperties(apiKey);
  const allBookings: UplistingReservation[] = [];
  for (const prop of properties) {
    try {
      const data = await apiFetch(`bookings/${prop.id}`, apiKey, params);
      const bookings = (data?.bookings ?? data?.data ?? data ?? []).map(normalizeReservation);
      allBookings.push(...bookings);
    } catch {
      // skip properties that fail
    }
  }
  return allBookings;
}

// Normalise Uplisting response shapes into our expected structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProperty(p: any): UplistingProperty {
  return {
    id: String(p.id ?? p.listing_id ?? ''),
    name: p.name ?? p.title ?? p.listing_name ?? '',
    nickname: p.nickname ?? '',
    address: p.address ?? p.street ?? '',
    city: p.city ?? '',
    state: p.state ?? p.region ?? '',
    bedrooms: Number(p.bedrooms ?? p.bedroom_count ?? 0),
    bathrooms: Number(p.bathrooms ?? p.bathroom_count ?? 0),
    max_guests: Number(p.max_guests ?? p.guest_capacity ?? 0),
    property_type: p.property_type ?? p.type ?? '',
    channels: p.channels ?? p.active_channels ?? [],
    status: p.status ?? 'active',
    time_zone: p.time_zone ?? '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReservation(r: any): UplistingReservation {
  return {
    id: String(r.id ?? ''),
    listing_id: String(r.property_id ?? r.listing_id ?? ''),
    guest_name: r.guest_name ?? 'Guest',
    check_in: r.check_in ?? '',
    check_out: r.check_out ?? '',
    total_price: Number(r.total_payout ?? r.accomodation_total ?? r.total_price ?? 0),
    status: r.status ?? 'confirmed',
    channel: r.channel ?? '',
    nights: Number(r.number_of_nights ?? r.nights ?? 0),
  };
}

/** Estimate monthly revenue from the last 30 days of reservations */
export function estimateMonthlyRevenue(
  propertyId: string,
  reservations: UplistingReservation[]
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return reservations
    .filter(
      (r) =>
        r.listing_id === propertyId &&
        r.status !== 'cancelled' &&
        new Date(r.check_out) >= cutoff
    )
    .reduce((sum, r) => sum + r.total_price, 0);
}

/** Estimate occupancy % from reservations over the last 30 days */
export function estimateOccupancy(
  propertyId: string,
  reservations: UplistingReservation[]
): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const bookedNights = reservations
    .filter(
      (r) =>
        r.listing_id === propertyId &&
        r.status !== 'cancelled' &&
        new Date(r.check_out) >= cutoff
    )
    .reduce((sum, r) => sum + (r.nights || 1), 0);
  return Math.min(100, Math.round((bookedNights / 30) * 100));
}

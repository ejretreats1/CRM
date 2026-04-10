/**
 * Uplisting API service
 * Docs: https://docs.uplisting.io
 * Auth: Bearer token (your API key)
 */

const BASE_URL = 'https://api.uplisting.io/v1';

export interface UplistingProperty {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  property_type?: string;
  channels?: string[];
  status?: string;
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

async function apiFetch(path: string, apiKey: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

export async function testConnection(apiKey: string): Promise<UplistingConnectionResult> {
  try {
    const data = await apiFetch('/listings', apiKey);
    const properties: UplistingProperty[] = (data?.data ?? data ?? []).map(normalizeProperty);
    return { ok: true, properties };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchProperties(apiKey: string): Promise<UplistingProperty[]> {
  const data = await apiFetch('/listings', apiKey);
  return (data?.data ?? data ?? []).map(normalizeProperty);
}

export async function fetchReservations(
  apiKey: string,
  from?: string,
  to?: string
): Promise<UplistingReservation[]> {
  const params = new URLSearchParams();
  if (from) params.set('start_date', from);
  if (to) params.set('end_date', to);
  const query = params.toString() ? `?${params}` : '';
  const data = await apiFetch(`/reservations${query}`, apiKey);
  return (data?.data ?? data ?? []).map(normalizeReservation);
}

// Normalise Uplisting response shapes into our expected structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProperty(p: any): UplistingProperty {
  return {
    id: String(p.id ?? p.listing_id ?? ''),
    name: p.name ?? p.title ?? p.listing_name ?? '',
    address: p.address ?? p.street ?? '',
    city: p.city ?? '',
    state: p.state ?? p.region ?? '',
    bedrooms: Number(p.bedrooms ?? p.bedroom_count ?? 0),
    bathrooms: Number(p.bathrooms ?? p.bathroom_count ?? 0),
    max_guests: Number(p.max_guests ?? p.guest_capacity ?? 0),
    property_type: p.property_type ?? p.type ?? '',
    channels: p.channels ?? p.active_channels ?? [],
    status: p.status ?? 'active',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeReservation(r: any): UplistingReservation {
  return {
    id: String(r.id ?? r.reservation_id ?? ''),
    listing_id: String(r.listing_id ?? r.property_id ?? ''),
    guest_name: r.guest_name ?? r.guest?.name ?? r.guest?.full_name ?? 'Guest',
    check_in: r.check_in ?? r.arrival ?? r.start_date ?? '',
    check_out: r.check_out ?? r.departure ?? r.end_date ?? '',
    total_price: Number(r.total_price ?? r.price ?? r.amount ?? 0),
    status: r.status ?? 'confirmed',
    channel: r.channel ?? r.source ?? '',
    nights: Number(r.nights ?? r.duration ?? 0),
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

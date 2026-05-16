export interface PLListing {
  listing_id: string;
  listing_nickname: string;
  last_synced?: string | null;
  health?: number | null;
  [key: string]: unknown;
}

export async function fetchPLListings(apiKey: string): Promise<PLListing[]> {
  const res = await fetch('/api/uplisting-proxy?service=pricelabs&path=listing_data', {
    headers: { 'x-pricelabs-key': apiKey },
  });
  if (!res.ok) throw new Error(`PriceLabs error ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.listing_data ?? []);
}

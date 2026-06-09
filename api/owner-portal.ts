import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uplistingFetch(path: string, apiKey: string, params?: Record<string, string>): Promise<any> {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  const encoded = Buffer.from(apiKey.trim()).toString('base64');
  const res = await fetch(`https://connect.uplisting.io/${path}${query}`, {
    headers: { Authorization: `Basic ${encoded}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Uplisting ${path}: ${res.status}`);
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'private, no-cache');

  const { token } = req.query;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Missing token' });

  // Owner by portal token
  const { data: ownerRow } = await supabase
    .from('owners')
    .select('id, name, email, phone, notes')
    .eq('portal_token', token)
    .maybeSingle();
  if (!ownerRow) return res.status(404).json({ error: 'Portal not found' });

  // Owner's properties
  const { data: propRows } = await supabase
    .from('properties')
    .select('id, name, address, bedrooms, bathrooms, property_type')
    .eq('owner_id', ownerRow.id);

  // Uplisting key from settings
  const { data: settings } = await supabase
    .from('settings')
    .select('uplisting_api_key')
    .eq('id', 'default')
    .maybeSingle();

  const uplistingKey = settings?.uplisting_api_key ?? '';
  const properties = propRows ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reservations: any[] = [];

  if (uplistingKey) {
    // Extract Uplisting listing IDs from property IDs (format: p_{ownerId}_{uplistingId})
    const uplistingIds = properties
      .map(p => {
        const parts = (p.id as string).split('_');
        return parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
      })
      .filter(Boolean) as string[];

    if (uplistingIds.length > 0) {
      const from = new Date(); from.setMonth(from.getMonth() - 12);
      const to   = new Date(); to.setMonth(to.getMonth() + 6);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr   = to.toISOString().slice(0, 10);

      await Promise.allSettled(
        uplistingIds.map(async upId => {
          try {
            const data = await uplistingFetch(`bookings/${upId}`, uplistingKey, { from: fromStr, to: toStr });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw: any[] = data?.bookings ?? data?.data ?? (Array.isArray(data) ? data : []);
            reservations.push(...raw.map(b => ({
              id:                   b.id ?? b.uid ?? '',
              listing_id:           upId,
              guest_name:           b.guest_name ?? b.guestName ?? 'Guest',
              guest_email:          b.guest_email ?? b.guestEmail ?? '',
              check_in:             b.check_in   ?? b.checkIn   ?? b.arrival   ?? '',
              check_out:            b.check_out  ?? b.checkOut  ?? b.departure ?? '',
              total_price:          Number(b.total_price ?? b.totalPrice ?? b.amount ?? 0),
              accommodation_total:  b.accommodation_total ? Number(b.accommodation_total) : null,
              cleaning_fee:         b.cleaning_fee ? Number(b.cleaning_fee) : null,
              status:               b.status ?? 'confirmed',
              channel:              b.channel ?? b.source ?? b.booking_source ?? '',
              nights:               b.nights ?? b.duration ?? null,
            })));
          } catch { /* skip failed property */ }
        })
      );
    }
  }

  return res.status(200).json({ owner: ownerRow, properties, reservations });
}

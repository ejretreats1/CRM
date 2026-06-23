/*
 * Required Supabase table — run once in Supabase SQL editor:
 *
 *   create table if not exists onboarding_requests (
 *     id           text primary key,
 *     token        uuid unique not null,
 *     status       text not null default 'pending',
 *     owner_id     text,
 *     form_data    jsonb,
 *     created_at   timestamptz default now(),
 *     expires_at   timestamptz not null,
 *     submitted_at timestamptz
 *   );
 *   alter table onboarding_requests enable row level security;
 *   create policy "anon all" on onboarding_requests
 *     for all to anon using (true) with check (true);
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

function getSupabase() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET /api/onboarding?token=xxx — check status (public)
  if (req.method === 'GET') {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('onboarding_requests')
      .select('status, expires_at')
      .eq('token', token)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });
    if (data.status === 'completed') return res.status(200).json({ status: 'completed' });
    if (new Date(data.expires_at) < new Date()) return res.status(200).json({ status: 'expired' });
    return res.status(200).json({ status: 'pending' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body ?? {};
  const supabase = getSupabase();

  // POST { action: 'create' } — generate new onboarding link (authenticated CRM use)
  if (action === 'create') {
    const token = randomUUID();
    const id = `onboard_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    const { error } = await supabase.from('onboarding_requests').insert({
      id,
      token,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
    if (error) return res.status(500).json({ error: error.message });

    const appUrl = (process.env.VITE_APP_URL ?? '').replace(/\/$/, '')
      || `https://${req.headers.host}`;
    return res.status(200).json({ token, url: `${appUrl}?onboarding=${token}` });
  }

  // POST { action: 'submit', token, formData } — submit form, create owner + property
  if (action === 'submit') {
    const { token, formData } = req.body;
    if (!token || !formData) return res.status(400).json({ error: 'Missing token or formData' });

    const { data: request, error: fetchErr } = await supabase
      .from('onboarding_requests')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchErr || !request) return res.status(404).json({ error: 'Invalid token' });
    if (request.status === 'completed') return res.status(400).json({ error: 'Already submitted' });
    if (new Date(request.expires_at) < new Date()) return res.status(400).json({ error: 'Link expired' });

    const now = new Date().toISOString();
    const ownerId = `owner_${Date.now()}`;
    const portalToken = randomUUID();

    const { error: ownerErr } = await supabase.from('owners').insert({
      id: ownerId,
      name: formData.fullName,
      email: formData.email,
      phone: formData.phone,
      notes: buildNotes(formData),
      source: 'website',
      vendors: [],
      created_at: now,
      archived: false,
      portal_token: portalToken,
    });
    if (ownerErr) return res.status(500).json({ error: ownerErr.message });

    if (formData.propertyAddress?.trim()) {
      const propInfo = {
        doorCode:       formData.lockCode   || undefined,
        wifiNetwork:    formData.wifiName   || undefined,
        wifiPassword:   formData.wifiPassword || undefined,
        petPolicy:      formData.petsAllowed === 'Yes' ? 'Pets allowed ($75 fee)' : formData.petsAllowed === 'No' ? 'No pets' : undefined,
        houseRulesNotes: formData.houseRules || undefined,
        generalNotes:   formData.otherAmenities || undefined,
      };
      await supabase.from('properties').insert({
        id:              `prop_${Date.now()}`,
        owner_id:        ownerId,
        address:         formData.propertyAddress,
        city:            '',
        state:           '',
        type:            formData.propertyType || '',
        bedrooms:        parseInt(formData.bedrooms) || 0,
        bathrooms:       parseFloat(formData.bathrooms) || 0,
        max_guests:      parseInt(formData.maxGuests) || 0,
        monthly_revenue: 0,
        occupancy_rate:  0,
        platforms:       formData.platforms ?? [],
        status:          'onboarding',
        joined_at:       now,
        property_info:   propInfo,
      }).catch(() => {});
    }

    await supabase.from('onboarding_requests').update({
      status:       'completed',
      owner_id:     ownerId,
      form_data:    formData,
      submitted_at: now,
    }).eq('token', token);

    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNotes(f: any): string {
  const lines: string[] = ['=== ONBOARDING FORM SUBMISSION ==='];
  if (f.monthlyCosts)       lines.push(`Monthly costs: ${f.monthlyCosts}`);
  if (f.propertyType)       lines.push(`Property type: ${f.propertyType}`);
  if (f.bedrooms)           lines.push(`Bedrooms: ${f.bedrooms}`);
  if (f.bathrooms)          lines.push(`Bathrooms: ${f.bathrooms}`);
  if (f.bedSizes)           lines.push(`Bed sizes: ${f.bedSizes}`);
  if (f.maxGuests)          lines.push(`Max guests: ${f.maxGuests}`);
  if (f.doorCodes)          lines.push(`Door codes: ${f.doorCodes}`);
  if (f.platforms?.length)  lines.push(`Platforms: ${f.platforms.join(', ')}`);
  if (f.listingLinks)       lines.push(`Listing links: ${f.listingLinks}`);
  if (f.airbnbLogin)        lines.push(`Airbnb login: ${f.airbnbLogin}`);
  if (f.vrboLogin)          lines.push(`VRBO login: ${f.vrboLogin}`);
  if (f.bookingLogin)       lines.push(`Booking.com login: ${f.bookingLogin}`);
  if (f.stripeLogin)        lines.push(`Stripe login: ${f.stripeLogin}`);
  if (f.averageRatings)     lines.push(`Average ratings: ${f.averageRatings}`);
  if (f.accountPreference)  lines.push(`Account preference: ${f.accountPreference}`);
  if (f.bankInfo)           lines.push(`Bank info: ${f.bankInfo}`);
  if (f.entryType)          lines.push(`Entry type: ${f.entryType}`);
  if (f.lockCode)           lines.push(`Lock code: ${f.lockCode}`);
  if (f.wifiName)           lines.push(`WiFi: ${f.wifiName} / ${f.wifiPassword ?? ''}`);
  if (f.amenities?.length)  lines.push(`Amenities: ${f.amenities.join(', ')}`);
  if (f.otherAmenities)     lines.push(`Other amenities: ${f.otherAmenities}`);
  if (f.stockedSupplies)    lines.push(`Stocked supplies: ${f.stockedSupplies}`);
  if (f.supplyOrdering)     lines.push(`Supply ordering addon: ${f.supplyOrdering}`);
  if (f.preferredCleaner)   lines.push(`Has preferred cleaner: ${f.preferredCleaner}`);
  if (f.cleanerContact)     lines.push(`Cleaner contact: ${f.cleanerContact}`);
  if (f.preferredHandyman)  lines.push(`Has preferred handyman: ${f.preferredHandyman}`);
  if (f.handymanContact)    lines.push(`Handyman contact: ${f.handymanContact}`);
  if (f.pricingTool)        lines.push(`Current pricing tool: ${f.pricingTool}`);
  if (f.priceLabs)          lines.push(`PriceLabs: ${f.priceLabs}`);
  if (f.blackoutDates)      lines.push(`Blackout dates: ${f.blackoutDates}`);
  if (f.pms)                lines.push(`PMS: ${f.pms}`);
  if (f.petsAllowed)        lines.push(`Pets allowed: ${f.petsAllowed}`);
  if (f.houseRules)         lines.push(`House rules: ${f.houseRules}`);
  if (f.professionalPhotos) lines.push(`Professional photos: ${f.professionalPhotos}`);
  if (f.additionalInfo)     lines.push(`Additional info: ${f.additionalInfo}`);
  if (f.questions)          lines.push(`Questions/concerns: ${f.questions}`);
  return lines.join('\n');
}

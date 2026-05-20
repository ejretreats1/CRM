import type { VercelRequest, VercelResponse } from '@vercel/node';

const CLERK_BASE = 'https://api.clerk.com/v1';

function clerkHeaders(secretKey: string) {
  return { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'CLERK_SECRET_KEY not set' });

  // ── LIST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const r = await fetch(`${CLERK_BASE}/users?limit=100`, { headers: clerkHeaders(secretKey) });
    if (!r.ok) return res.status(r.status).json({ error: `Clerk API error ${r.status}` });
    const users: any[] = await r.json();
    const list = users.map(u => ({
      id: u.id,
      email: u.email_addresses.find((e: any) => e.id === u.primary_email_address_id)?.email_address
        ?? u.email_addresses[0]?.email_address ?? '',
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Team member',
      role: (u.public_metadata?.role as string) ?? 'va',
    })).filter(u => u.email);
    return res.status(200).json({ users: list });
  }

  // ── CREATE ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { email, firstName, lastName, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const r = await fetch(`${CLERK_BASE}/users`, {
      method: 'POST',
      headers: clerkHeaders(secretKey),
      body: JSON.stringify({
        email_address: [email.trim().toLowerCase()],
        password,
        first_name: firstName?.trim() || undefined,
        last_name: lastName?.trim() || undefined,
        public_metadata: { role: 'va' },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.errors?.[0]?.long_message ?? data.errors?.[0]?.message ?? 'Failed to create user' });

    return res.status(200).json({
      user: {
        id: data.id,
        email: data.email_addresses?.[0]?.email_address ?? email,
        name: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'VA',
        role: 'va',
      },
    });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const r = await fetch(`${CLERK_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: clerkHeaders(secretKey),
    });
    if (!r.ok) return res.status(r.status).json({ error: `Clerk API error ${r.status}` });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

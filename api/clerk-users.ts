import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'CLERK_SECRET_KEY not set' });

  try {
    const r = await fetch('https://api.clerk.com/v1/users?limit=100', {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!r.ok) throw new Error(`Clerk API error ${r.status}`);
    const users: Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      username: string | null;
      primary_email_address_id: string | null;
      public_metadata: Record<string, unknown>;
      email_addresses: Array<{ id: string; email_address: string }>;
    }> = await r.json();

    const list = users.map(u => ({
      email: u.email_addresses.find(e => e.id === u.primary_email_address_id)?.email_address
        ?? u.email_addresses[0]?.email_address ?? '',
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Team member',
      role: (u.public_metadata?.role as string) ?? 'va',
    })).filter(u => u.email);

    return res.status(200).json({ users: list });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch users' });
  }
}

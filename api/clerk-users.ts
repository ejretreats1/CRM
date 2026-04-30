import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClerkClient } from '@clerk/backend';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'CLERK_SECRET_KEY not set' });

  try {
    const clerk = createClerkClient({ secretKey });
    const { data: users } = await clerk.users.getUserList({ limit: 100 });

    const list = users.map(u => ({
      email: u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? '',
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'Team member',
      role: (u.publicMetadata?.role as string) ?? 'va',
    })).filter(u => u.email);

    return res.status(200).json({ users: list });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch users' });
  }
}

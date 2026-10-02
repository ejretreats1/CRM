import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// ── Shared server-side config ────────────────────────────────────────────────
// Links in emails and Stripe return URLs are built from APP_URL, never from a
// value the caller sends, so nobody can make us email links to another host.
export const APP_URL = (process.env.APP_URL ?? 'https://crm-nine-delta-37.vercel.app').replace(/\/$/, '');
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'ejretreats1@gmail.com';

/** Escape text before interpolating it into email / page HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Clerk session verification ───────────────────────────────────────────────
// The CRM signs admins in with Clerk in the browser. Admin API actions must
// carry that session token (Authorization: Bearer <jwt>); we verify it against
// the Clerk instance's JWKS. The instance is derived from the publishable key
// (pk_test_<base64(frontend-api-host$)>), so no extra secret is needed.
// CLERK_JWKS_URL can override the derived URL.

function clerkFrontendApi(): string | null {
  const pk = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';
  const m = pk.match(/^pk_(?:test|live)_(.+)$/);
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    return decoded.endsWith('$') ? decoded.slice(0, -1) : decoded;
  } catch {
    return null;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer: string | null = null;

function getJwks() {
  if (jwks) return jwks;
  const url = process.env.CLERK_JWKS_URL
    ?? (clerkFrontendApi() ? `https://${clerkFrontendApi()}/.well-known/jwks.json` : null);
  if (!url) return null;
  jwksIssuer = new URL(url).origin; // Clerk's `iss` is the frontend API origin
  jwks = createRemoteJWKSet(new URL(url), { cooldownDuration: 60_000, cacheMaxAge: 10 * 60_000 });
  return jwks;
}

export interface AdminIdentity { userId: string; sessionId?: string }

/** Returns the signed-in admin for this request, or null when the token is missing / invalid. */
export async function getAdmin(req: VercelRequest): Promise<AdminIdentity | null> {
  const header = req.headers['authorization'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || !raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  if (!token) return null;
  const keys = getJwks();
  if (!keys) return null;
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: jwksIssuer ?? undefined,
      clockTolerance: 30,
    });
    if (!payload.sub) return null;
    return { userId: payload.sub, sessionId: typeof payload.sid === 'string' ? payload.sid : undefined };
  } catch {
    return null;
  }
}

/**
 * Gate an admin-only action. Writes the 401 and returns null when the caller is
 * not a signed-in CRM user, so handlers can `if (!(await requireAdmin(req, res))) return;`.
 */
export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<AdminIdentity | null> {
  const admin = await getAdmin(req);
  if (admin) return admin;
  const configured = !!(process.env.CLERK_JWKS_URL || clerkFrontendApi());
  res.status(401).json({
    error: configured
      ? 'Sign in to the CRM to do this.'
      : 'Server auth is not configured (set CLERK_PUBLISHABLE_KEY or CLERK_JWKS_URL).',
  });
  return null;
}

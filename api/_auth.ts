import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicKey, createVerify, type KeyObject } from 'crypto';

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
// carry that session token (Authorization: Bearer <jwt>); we verify its RS256
// signature against the Clerk instance's JWKS. The instance is derived from the
// publishable key (pk_test_<base64(frontend-api-host$)>), so no extra secret is
// needed. CLERK_JWKS_URL can override the derived URL. Implemented with Node's
// built-in crypto so the API has no extra dependency to bundle.

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

function jwksUrl(): string | null {
  if (process.env.CLERK_JWKS_URL) return process.env.CLERK_JWKS_URL;
  const host = clerkFrontendApi();
  return host ? `https://${host}/.well-known/jwks.json` : null;
}

interface Jwk { kid?: string; kty: string; n?: string; e?: string; alg?: string; use?: string }

let keyCache: { fetchedAt: number; keys: Map<string, KeyObject> } | null = null;
const KEY_TTL_MS = 10 * 60_000;
const REFETCH_COOLDOWN_MS = 60_000;

async function loadKeys(force = false): Promise<Map<string, KeyObject>> {
  const now = Date.now();
  if (keyCache && !force && now - keyCache.fetchedAt < KEY_TTL_MS) return keyCache.keys;
  if (keyCache && force && now - keyCache.fetchedAt < REFETCH_COOLDOWN_MS) return keyCache.keys;
  const url = jwksUrl();
  if (!url) return new Map();
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
    try {
      keys.set(jwk.kid ?? '', createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
    } catch { /* skip malformed key */ }
  }
  keyCache = { fetchedAt: now, keys };
  return keys;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

interface Claims { sub?: string; sid?: string; iss?: string; exp?: number; nbf?: number; [k: string]: unknown }

/** Verify an RS256 JWT against the Clerk JWKS; returns its claims or null. */
async function verifyClerkJwt(token: string): Promise<Claims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let claims: Claims;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
    claims = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;

  const url = jwksUrl();
  if (!url) return null;
  const expectedIssuer = new URL(url).origin; // Clerk's `iss` is the frontend API origin
  if (claims.iss !== expectedIssuer) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const skew = 30;
  if (typeof claims.exp !== 'number' || claims.exp + skew < nowSec) return null;
  if (typeof claims.nbf === 'number' && claims.nbf - skew > nowSec) return null;

  let keys = await loadKeys();
  let key = keys.get(header.kid ?? '');
  if (!key) {
    // Key rotation: refetch once, then give up.
    keys = await loadKeys(true);
    key = keys.get(header.kid ?? '');
    if (!key) return null;
  }
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  const ok = verifier.verify(key, b64urlToBuffer(parts[2]));
  return ok ? claims : null;
}

export interface AdminIdentity { userId: string; sessionId?: string }

/** Returns the signed-in admin for this request, or null when the token is missing / invalid. */
export async function getAdmin(req: VercelRequest): Promise<AdminIdentity | null> {
  const header = req.headers['authorization'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || !raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  if (!token) return null;
  try {
    const claims = await verifyClerkJwt(token);
    if (!claims?.sub) return null;
    return { userId: claims.sub, sessionId: typeof claims.sid === 'string' ? claims.sid : undefined };
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
  res.status(401).json({
    error: jwksUrl()
      ? 'Sign in to the CRM to do this.'
      : 'Server auth is not configured (set CLERK_PUBLISHABLE_KEY or CLERK_JWKS_URL).',
  });
  return null;
}

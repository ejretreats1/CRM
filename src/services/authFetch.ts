// Attach the signed-in admin's Clerk session token to every same-origin /api/
// request. Admin actions on the server require it; public pages (no session)
// simply send no header and use their own link tokens.

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;
let installed = false;

function isApiUrl(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
}

export function installAuthFetch(getToken: TokenGetter) {
  tokenGetter = getToken;
  if (installed) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isApiUrl(input)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('authorization') && tokenGetter) {
      try {
        const token = await tokenGetter();
        if (token) headers.set('authorization', `Bearer ${token}`);
      } catch { /* not signed in */ }
    }
    return original(input, { ...init, headers });
  };
}

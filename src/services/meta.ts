export interface MetaPage {
  id: string;
  name: string;
  igAccount: { id: string; username: string } | null;
}

export interface MetaConnection {
  pages: MetaPage[];
  connectedAt: string;
  expiresAt: string;
}

declare global {
  interface Window {
    FB: {
      init(o: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
      login(
        cb: (r: { authResponse: { accessToken: string } | null }) => void,
        o: { scope: string }
      ): void;
    };
    fbAsyncInit: () => void;
  }
}

const BASE = '/api/documents';

export function loadFbSdk(appId: string): void {
  if (document.getElementById('facebook-jssdk')) return;
  window.fbAsyncInit = () => {
    window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
  };
  const js = document.createElement('script');
  js.id = 'facebook-jssdk';
  js.src = 'https://connect.facebook.net/en_US/sdk.js';
  document.head.appendChild(js);
}

export function fbLogin(scope: string): Promise<string | null> {
  return new Promise(resolve => {
    window.FB.login(r => resolve(r.authResponse?.accessToken ?? null), { scope });
  });
}

export async function connectMeta(shortLivedToken: string): Promise<MetaConnection> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'meta', action: 'connect', shortLivedToken }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Connection failed');
  return d.connection as MetaConnection;
}

export async function postToFacebook(pageId: string, message: string, imageUrl?: string): Promise<string> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'meta', action: 'post-facebook', pageId, message, imageUrl }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Post failed');
  return d.postId as string;
}

export async function postToInstagram(igAccountId: string, pageId: string, imageUrl: string, caption: string): Promise<string> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'meta', action: 'post-instagram', igAccountId, pageId, imageUrl, caption }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Post failed');
  return d.postId as string;
}

export async function postCarousel(pageId: string, igAccountId: string | null, imageUrls: string[], caption: string): Promise<{ fbPostId: string | null; igPostId: string | null }> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'meta', action: 'post-carousel', pageId, igAccountId, imageUrls, caption }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Post failed');
  return d as { fbPostId: string | null; igPostId: string | null };
}

export async function disconnectMeta(): Promise<void> {
  await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'meta', action: 'disconnect' }),
  });
}

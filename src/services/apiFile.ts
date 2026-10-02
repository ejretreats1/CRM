/**
 * Download a file from an authenticated /api/ URL. window.open can't carry the
 * Authorization header, so fetch it (the auth interceptor adds the token) and
 * hand the browser a blob.
 */
export async function downloadApiFile(url: string, fallbackName = 'document.pdf'): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename\*?=(?:UTF-8\'\')?"?([^";]+)"?/i.exec(cd)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = decodeURIComponent(name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

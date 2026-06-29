const BASE = '/api/documents';

interface DispatchCleaner {
  id: string;
  name: string;
  email: string;
  payout: number;
}

interface DispatchPayload {
  jobId: string;
  propertyName: string;
  checkoutDate: string;
  checkinDate?: string;
  guestName?: string;
  cleanerPayout: number;
  notes?: string;
  cleaners: DispatchCleaner[];
}

export async function dispatchCleaningJob(payload: DispatchPayload): Promise<{ sent: number }> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flow: 'cleaning',
      action: 'dispatch',
      appUrl: window.location.origin,
      ...payload,
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Dispatch failed');
  return d as { sent: number };
}

export async function acceptCleaningJob(jobId: string, token: string): Promise<void> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'cleaning', action: 'accept', combined: `${jobId}:${token}` }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Accept failed');
}

export async function submitCleaningJob(
  jobId: string,
  token: string,
  data: { checklist: Record<string, boolean>; photos: string[]; damageNotes?: string },
): Promise<void> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flow: 'cleaning',
      action: 'submit',
      combined: `${jobId}:${token}`,
      ...data,
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Submit failed');
}

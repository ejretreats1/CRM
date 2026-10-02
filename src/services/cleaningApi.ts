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
  jobType?: string;
  /** Clear the current assignment and offer the job to the roster again */
  redispatch?: boolean;
  cleaners: DispatchCleaner[];
}

export async function dispatchCleaningJob(payload: DispatchPayload): Promise<{ sent: number; warning?: string }> {
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
  return d as { sent: number; warning?: string };
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
  data: { checklist: Record<string, boolean>; photos: string[]; damageNotes?: string; damageMedia?: string[]; suppliesNotes?: string },
): Promise<void> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flow: 'cleaning',
      action: 'submit',
      combined: `${jobId}:${token}`,
      appUrl: window.location.origin,
      ...data,
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Submit failed');
}

/** Run the booking sync (iCal + Uplisting → jobs) and offer new jobs, server side. */
export async function syncCleaningJobsNow(): Promise<{ created: number; updated: number; cancelled: number; dispatched: number; errors: string[] }> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'cleaning', action: 'sync-now' }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Sync failed');
  return d;
}

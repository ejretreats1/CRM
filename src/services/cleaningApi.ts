const BASE = '/api/documents';

interface DispatchPayload {
  jobId: string;
  propertyName: string;
  propertyAddress?: string;
  checkoutDate: string;
  checkinDate?: string;
  guestName?: string;
  cleanerPayout: number;
  notes?: string;
  cleaners: { id: string; name: string; email: string }[];
}

export async function dispatchCleaningJob(payload: DispatchPayload): Promise<{ sent: number }> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: 'cleaning', action: 'dispatch', ...payload }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Dispatch failed');
  return d as { sent: number };
}

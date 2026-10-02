// Shared SMS helpers (Twilio) — not a Vercel function (_ prefix).
import { todayET, dateLabel } from './_jobs';
import { cleanerPortalUrl } from './_emails';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type SmsSender = (to: string, body: string) => Promise<string | null>;

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return null;
}

export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _twilio: any = null;
/** Send one SMS through Twilio. Returns the message SID, or null when Twilio isn't configured. */
export const sendSms: SmsSender = async (to, body) => {
  if (!smsConfigured()) return null;
  if (!_twilio) {
    const { default: Twilio } = await import('twilio');
    _twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  const msg = await _twilio.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER!, to });
  return msg.sid as string;
};

export interface MorningSmsResult { sent: number; skipped: number; errors: string[] }

/**
 * Morning-of reminder to every cleaner with a clean today. Runs inside the
 * 11:00 UTC cron (≈7am Eastern). Idempotent via cleaning_jobs.morning_sms_sent_at.
 */
export async function sendMorningReminders(db: Db, send: SmsSender, now: Date = new Date()): Promise<MorningSmsResult> {
  const result: MorningSmsResult = { sent: 0, skipped: 0, errors: [] };
  const today = todayET(now);
  const { data: jobs, error } = await db.from('cleaning_jobs').select('*')
    .in('status', ['accepted', 'in_progress']).eq('checkout_date', today).is('morning_sms_sent_at', null).not('assigned_cleaner_id', 'is', null).limit(100);
  if (error) { result.errors.push(`load jobs: ${error.message}`); return result; }
  if (!jobs?.length) return result;

  const cleanerIds = [...new Set((jobs as Row[]).map(j => j.assigned_cleaner_id))];
  const { data: cleaners } = await db.from('cleaners').select('*').in('id', cleanerIds);
  const cleanerById = new Map<string, Row>((cleaners ?? []).map((c: Row) => [c.id, c] as [string, Row]));
  const { data: configs } = await db.from('cleaning_property_configs').select('*');
  const configByProperty = new Map<string, Row>();
  for (const c of (configs ?? []) as Row[]) {
    configByProperty.set(c.property_id, c);
    for (const sub of (c.linked_property_ids ?? []) as string[]) configByProperty.set(sub, c);
  }

  // One text per cleaner listing all of today's jobs.
  const byCleaner = new Map<string, Row[]>();
  for (const j of jobs as Row[]) { const list = byCleaner.get(j.assigned_cleaner_id) ?? []; list.push(j); byCleaner.set(j.assigned_cleaner_id, list); }

  for (const [cleanerId, list] of byCleaner) {
    const cleaner = cleanerById.get(cleanerId);
    const phone = normalizePhone(cleaner?.phone);
    if (!cleaner || !phone) { result.skipped += list.length; continue; }
    const first = String(cleaner.name ?? '').split(' ')[0] || 'there';
    const lines = list.sort((a, b) => String(a.property_name).localeCompare(String(b.property_name))).map(j => {
      const config = configByProperty.get(j.property_id);
      const bits = [`• ${j.property_name}`];
      if (config?.checkout_time) bits.push(`checkout ${config.checkout_time}`);
      if (j.same_day) bits.push(`⚡ SAME-DAY turnover${config?.checkin_time ? ` — guest arrives ${config.checkin_time}` : ''}`);
      else if (j.checkin_date) bits.push(`next guest ${dateLabel(j.checkin_date).replace(/^\w+, /, '')}`);
      if (config?.door_code) bits.push(`door ${config.door_code}`);
      return bits.join(' · ');
    });
    const portal = cleaner.dashboard_token ? `\nPortal: ${cleanerPortalUrl(cleaner, cleaner.dashboard_token)}` : '';
    const body = `Good morning ${first}! Today's clean${list.length === 1 ? '' : 's'} for E&J Retreats:\n${lines.join('\n')}${portal}\nPlease submit photos + checklist in the portal when done. Reply to this text with any issues.`;
    try {
      const sid = await send(phone, body);
      if (sid === null) { result.skipped += list.length; continue; } // Twilio not configured
      const stamp = now.toISOString();
      for (const j of list) await db.from('cleaning_jobs').update({ morning_sms_sent_at: stamp }).eq('id', j.id);
      result.sent++;
    } catch (e) {
      result.errors.push(`${cleaner.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

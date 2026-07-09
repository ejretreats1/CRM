import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
function sb() { return createClient(SUPABASE_URL, SUPABASE_ANON); }

export type EmailType = 'signing' | 'agreement' | 'newsletter' | 'quarterly' | 'report' | 'outreach' | 'warmup' | 'lead-sequence' | 'other';
export type EmailStatus = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained';

export interface EmailLog {
  id: string;               // Resend email ID
  emailType: EmailType;
  recordId?: string;        // linked sig request / agreement submission
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  sentAt: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  bouncedAt?: string;
  openCount: number;
  clickCount: number;
  lastClickedUrl?: string;
  status: EmailStatus;
}

function row(r: Record<string, unknown>): EmailLog {
  return {
    id:              String(r.id),
    emailType:       (r.email_type as EmailType) ?? 'other',
    recordId:        r.record_id ? String(r.record_id) : undefined,
    recipientEmail:  String(r.recipient_email ?? ''),
    recipientName:   r.recipient_name ? String(r.recipient_name) : undefined,
    subject:         r.subject ? String(r.subject) : undefined,
    sentAt:          String(r.sent_at ?? ''),
    deliveredAt:     r.delivered_at ? String(r.delivered_at) : undefined,
    openedAt:        r.opened_at ? String(r.opened_at) : undefined,
    clickedAt:       r.clicked_at ? String(r.clicked_at) : undefined,
    bouncedAt:       r.bounced_at ? String(r.bounced_at) : undefined,
    openCount:       Number(r.open_count ?? 0),
    clickCount:      Number(r.click_count ?? 0),
    lastClickedUrl:  r.last_clicked_url ? String(r.last_clicked_url) : undefined,
    status:          (r.status as EmailStatus) ?? 'sent',
  };
}

export async function fetchEmailLogs(limit = 500): Promise<EmailLog[]> {
  const { data, error } = await sb()
    .from('email_logs')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => row(r as Record<string, unknown>));
}

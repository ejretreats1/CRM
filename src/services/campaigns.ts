import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export interface FollowUpStep {
  step_number: number;
  template_id: string;
  delay_days: number;
}

export interface Campaign {
  id: string;
  name: string;
  fromName: string;
  replyTo: string;
  subject: string;
  body: string;
  leadIds: string[];
  sentLeadIds: string[];
  contactIds: string[];
  sentContactIds: string[];
  scrapedLeadIds: string[];
  sentScrapedLeadIds: string[];
  followUpSteps: FollowUpStep[];
  linkedSequenceId: string;
  dailyLimit: number;
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampaign(r: any): Campaign {
  return {
    id:              r.id,
    name:            r.name ?? '',
    fromName:        r.from_name ?? '',
    replyTo:         r.reply_to ?? '',
    subject:         r.subject ?? '',
    body:            r.body ?? '',
    leadIds:         r.lead_ids ?? [],
    sentLeadIds:     r.sent_lead_ids ?? [],
    contactIds:         r.contact_ids ?? [],
    sentContactIds:     r.sent_contact_ids ?? [],
    scrapedLeadIds:     r.scraped_lead_ids ?? [],
    sentScrapedLeadIds: r.sent_scraped_lead_ids ?? [],
    followUpSteps:      r.follow_up_steps ?? [],
    linkedSequenceId:   r.linked_sequence_id ?? '',
    dailyLimit:      r.daily_limit ?? 20,
    status:          r.status ?? 'draft',
    createdAt:       r.created_at ?? '',
    updatedAt:       r.updated_at ?? '',
  };
}

function campaignToRow(c: Campaign) {
  return {
    id:               c.id,
    name:             c.name,
    from_name:        c.fromName,
    reply_to:         c.replyTo,
    subject:          c.subject,
    body:             c.body,
    lead_ids:         c.leadIds,
    sent_lead_ids:    c.sentLeadIds,
    contact_ids:          c.contactIds,
    sent_contact_ids:     c.sentContactIds,
    scraped_lead_ids:      c.scrapedLeadIds,
    sent_scraped_lead_ids: c.sentScrapedLeadIds,
    follow_up_steps:       c.followUpSteps,
    linked_sequence_id:    c.linkedSequenceId || null,
    daily_limit:      c.dailyLimit,
    status:           c.status,
    created_at:       c.createdAt,
    updated_at:       c.updatedAt,
  };
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('lead_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCampaign);
}

export async function upsertCampaign(c: Campaign): Promise<void> {
  const { error } = await supabase.from('lead_campaigns').upsert(campaignToRow(c));
  if (error) throw error;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('lead_campaigns').delete().eq('id', id);
  if (error) throw error;
}

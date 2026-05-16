import { supabase } from './supabase';

export interface SlackChannel {
  id: string;
  name: string;
}

export interface AppSettings {
  slackToken: string;
  slackChannels: SlackChannel[];
  calendarUrl: string;
  uplistingApiKey: string;
}

const DEFAULTS: AppSettings = {
  slackToken: '',
  slackChannels: [],
  calendarUrl: '',
  uplistingApiKey: '',
};

export async function fetchSettings(): Promise<AppSettings> {
  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (!data) return DEFAULTS;

  return {
    slackToken: data.slack_token ?? '',
    slackChannels: data.slack_channels ?? [],
    calendarUrl: data.calendar_url ?? '',
    uplistingApiKey: data.uplisting_api_key ?? '',
  };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const row: Record<string, unknown> = { id: 'default', updated_at: new Date().toISOString() };
  if (patch.slackToken !== undefined)     row.slack_token       = patch.slackToken;
  if (patch.slackChannels !== undefined)  row.slack_channels    = patch.slackChannels;
  if (patch.calendarUrl !== undefined)    row.calendar_url      = patch.calendarUrl;
  if (patch.uplistingApiKey !== undefined) row.uplisting_api_key = patch.uplistingApiKey;

  await supabase.from('settings').upsert(row);
}

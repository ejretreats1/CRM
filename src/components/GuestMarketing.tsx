import { useState, useMemo, useEffect } from 'react';
import {
  Search, Send, CheckSquare, Square, X, RefreshCw, Flame,
  Calendar, Trash2, Play, Clock, CheckCircle, FileText, ChevronRight,
} from 'lucide-react';
import type { UplistingReservation } from '../services/uplisting';
import { fetchReservations } from '../services/uplisting';
import { supabase } from '../services/supabase';
import { cacheGet, cacheSet } from '../services/appCache';

// ─── Draft & Campaign types ──────────────────────────────────────────────────

interface EmailDraft {
  id: string;
  name: string;
  subject: string;
  body: string;
  fromName: string;
  createdAt: string;
}

interface CampaignRecipient { email: string; name: string; }

interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  fromName: string;
  recipients: CampaignRecipient[];
  scheduledDate: string;
  batchSize: number;
  batchesSent: number;
  warmupCopies: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  sentLog: Array<{ sentAt: string; count: number; failed: number }>;
}


// ─── Guest types & helpers ───────────────────────────────────────────────────

interface GuestMarketingProps {
  reservations: UplistingReservation[];
  apiKey?: string;
  warmupAddresses?: string[];
}
interface Guest {
  email: string; name: string;
  stays: UplistingReservation[];
  lastStay: string; channels: string[];
}

const CHANNEL_LABEL: Record<string, string> = {
  airbnb: 'Airbnb', airbnb_official: 'Airbnb',
  booking_dot_com: 'Booking.com',
  homeaway: 'VRBO', vrbo: 'VRBO',
  uplisting: 'Direct', direct: 'Direct',
};
function channelLabel(c: string) { return CHANNEL_LABEL[c] ?? c; }
function isRealEmail(email: string) {
  if (!email) return false;
  if (email.includes('@guest.airbnb.com') || email.includes('@m.airbnb.com')) return false;
  return email.includes('@');
}

// ─── Core send helper (used by Send Now + batch sends) ─────────────────────

async function sendEmails(params: {
  recipients: CampaignRecipient[];
  subject: string; body: string; fromName: string;
  warmupCopies: number; warmupAddrs: string[];
}): Promise<{ sent: number; failed: number }> {
  const emails = [
    ...params.recipients.map(r => {
      const first = r.name.split(' ')[0] || r.name;
      const pSubj = params.subject.replace(/\{\{first_name\}\}/gi, first);
      const pBody = params.body.replace(/\{\{first_name\}\}/gi, first);
      return { to: r.email, subject: pSubj, html: buildGuestEmailHtml(pBody, pSubj, params.fromName), recipientName: r.name, leadId: r.email };
    }),
    ...(params.warmupCopies > 0 && params.warmupAddrs.length > 0
      ? [...params.warmupAddrs].sort(() => Math.random() - 0.5)
          .slice(0, Math.min(params.warmupCopies, params.warmupAddrs.length))
          .map((addr, i) => ({
            to: addr, subject: params.subject,
            html: buildGuestEmailHtml(params.body.replace(/\{\{first_name\}\}/gi, 'there'), params.subject, params.fromName),
            recipientName: 'Warmup', leadId: `warmup_${i}`,
          }))
      : []),
  ];
  const res  = await fetch('/api/send-newsletter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'lead-outreach', fromName: params.fromName, replyTo: 'ejretreats1@gmail.com', campaignId: `guest_${Date.now()}`, emails }),
  });
  const data = await res.json() as { sent?: number; failed?: number; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Send failed');
  const warmupSent = params.warmupCopies > 0 && params.warmupAddrs.length > 0 ? Math.min(params.warmupCopies, params.warmupAddrs.length) : 0;
  return { sent: (data.sent ?? params.recipients.length) - warmupSent, failed: data.failed ?? 0 };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GuestMarketing({ reservations, apiKey, warmupAddresses = [] }: GuestMarketingProps) {
  const warmupAddrs = warmupAddresses;

  // Tab
  const [tab, setTab] = useState<'guests' | 'drafts' | 'campaigns'>('guests');

  // Guest list
  const [search, setSearch]               = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [showNoEmail, setShowNoEmail]     = useState(false);
  const [selected, setSelected]           = useState<Set<string>>(new Set());

  // Compose modal
  const [composing, setComposing]       = useState(false);
  const [subject, setSubject]           = useState('');
  const [body, setBody]                 = useState('');
  const [fromName, setFromName]         = useState('E&J Retreats');
  const [warmupCopies, setWarmupCopies] = useState(1);
  const [sending, setSending]           = useState(false);
  const [sentResult, setSentResult]     = useState<{ sent: number; failed: number } | null>(null);
  const [sendError, setSendError]       = useState('');

  // Schedule section (inside compose)
  const [schedMode, setSchedMode]     = useState(false);
  const [schedDate, setSchedDate]     = useState('');
  const [batchSize, setBatchSize]     = useState(50);
  const [campName, setCampName]       = useState('');

  // Drafts & campaigns
  const [drafts, setDrafts]       = useState<EmailDraft[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sendingBatch, setSendingBatch] = useState<string | null>(null);
  const [batchError, setBatchError]   = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<{ id: string; sent: number } | null>(null);

  useEffect(() => {
    supabase.from('gm_drafts').select('data').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load drafts:', error.message); return; }
        setDrafts((data ?? []).map((r: { data: EmailDraft }) => r.data));
      });
    supabase.from('gm_campaigns').select('data').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load campaigns:', error.message); return; }
        setCampaigns((data ?? []).map((r: { data: Campaign }) => r.data).filter(c => c.status !== 'cancelled'));
      });
  }, []);

  // History
  const [history, setHistory]               = useState<UplistingReservation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError]     = useState('');
  const [historyLastFetched, setHistoryLastFetched] = useState<string | null>(null);

  useEffect(() => {
    cacheGet<UplistingReservation[]>('ej_uplisting_history').then(v => { if (v) setHistory(v); });
    cacheGet<string>('ej_uplisting_history_date').then(v => { if (v) setHistoryLastFetched(v); });
  }, []);

  async function fetchHistory() {
    if (!apiKey) return;
    setLoadingHistory(true); setHistoryError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const ago   = new Date(); ago.setFullYear(ago.getFullYear() - 3);
      const hist  = await fetchReservations(apiKey, ago.toISOString().slice(0, 10), today);
      cacheSet('ej_uplisting_history', hist); setHistory(hist);
      cacheSet('ej_uplisting_history_date', today);
      setHistoryLastFetched(today);
    } catch (err) { setHistoryError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoadingHistory(false); }
  }

  const allReservations = useMemo(() => {
    const map = new Map<string, UplistingReservation>();
    for (const r of history) map.set(r.id, r);
    for (const r of reservations) map.set(r.id, r);
    return Array.from(map.values());
  }, [reservations, history]);

  const guests = useMemo<Guest[]>(() => {
    const map = new Map<string, Guest>();
    for (const r of allReservations) {
      if (r.status === 'cancelled') continue;
      const key = r.guest_email && isRealEmail(r.guest_email)
        ? r.guest_email.toLowerCase() : `__nomail__${r.guest_name}`;
      const ex  = map.get(key);
      if (ex) {
        ex.stays.push(r);
        if (r.check_out > ex.lastStay) { ex.lastStay = r.check_out; ex.name = r.guest_name; }
        const ch = channelLabel(r.channel ?? '');
        if (ch && !ex.channels.includes(ch)) ex.channels.push(ch);
      } else {
        map.set(key, { email: r.guest_email && isRealEmail(r.guest_email) ? r.guest_email : '', name: r.guest_name, stays: [r], lastStay: r.check_out, channels: r.channel ? [channelLabel(r.channel)] : [] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastStay.localeCompare(a.lastStay));
  }, [allReservations]);

  const allChannels = useMemo(() => {
    const s = new Set<string>(); guests.forEach(g => g.channels.forEach(c => s.add(c)));
    return Array.from(s).sort();
  }, [guests]);

  const filtered = useMemo(() => guests.filter(g => {
    if (!showNoEmail && !g.email) return false;
    if (channelFilter !== 'all' && !g.channels.includes(channelFilter)) return false;
    if (search) { const q = search.toLowerCase(); return g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q); }
    return true;
  }), [guests, search, channelFilter, showNoEmail]);

  const emailable  = filtered.filter(g => g.email);
  const allSel     = emailable.length > 0 && emailable.every(g => selected.has(g.email));

  function toggleAll() {
    if (allSel) setSelected(p => { const n = new Set(p); emailable.forEach(g => n.delete(g.email)); return n; });
    else        setSelected(p => { const n = new Set(p); emailable.forEach(g => n.add(g.email));    return n; });
  }
  function toggle(email: string) {
    setSelected(p => { const n = new Set(p); n.has(email) ? n.delete(email) : n.add(email); return n; });
  }

  function openCompose() {
    setComposing(true); setSchedMode(false); setSchedDate(''); setCampName(''); setSendError(''); setSentResult(null);
  }

  // ── Drafts ────────────────────────────────────────────────────────────────

  async function saveDraft() {
    if (!subject.trim() && !body.trim()) { alert('Add a subject or body before saving.'); return; }
    const name = campName.trim() || subject.trim().slice(0, 40) || 'Untitled Draft';
    const d: EmailDraft = { id: `d_${Date.now()}`, name, subject, body, fromName, createdAt: new Date().toISOString() };
    const { error } = await supabase.from('gm_drafts').upsert({ id: d.id, data: d, created_at: d.createdAt });
    if (error) { alert(`Failed to save draft: ${error.message}`); return; }
    setDrafts(prev => [d, ...prev]);
    alert(`Draft "${name}" saved!`);
  }

  function useDraft(d: EmailDraft) { setSubject(d.subject); setBody(d.body); setFromName(d.fromName); }

  async function deleteDraft(id: string) {
    const { error } = await supabase.from('gm_drafts').delete().eq('id', id);
    if (error) { alert(`Failed to delete draft: ${error.message}`); return; }
    setDrafts(prev => prev.filter(d => d.id !== id));
  }

  // ── Send now ──────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    const recipients = filtered.filter(g => g.email && selected.has(g.email)).map(g => ({ email: g.email, name: g.name }));
    if (!recipients.length) return;
    setSending(true); setSendError(''); setSentResult(null);
    try {
      const r = await sendEmails({ recipients, subject, body, fromName, warmupCopies, warmupAddrs });
      setSentResult(r); setComposing(false); setSubject(''); setBody(''); setSelected(new Set());
    } catch (err) { setSendError(err instanceof Error ? err.message : 'Failed to send'); }
    finally { setSending(false); }
  }

  // ── Schedule ──────────────────────────────────────────────────────────────

  async function handleSchedule() {
    if (!subject.trim() || !body.trim()) { alert('Subject and body are required.'); return; }
    if (!schedDate) { alert('Please pick a send date.'); return; }
    const recipients = filtered.filter(g => g.email && selected.has(g.email)).map(g => ({ email: g.email, name: g.name }));
    if (!recipients.length) { alert('No recipients selected.'); return; }
    const name = campName.trim() || `${subject.slice(0, 30)} — ${schedDate}`;
    const c: Campaign = {
      id: `c_${Date.now()}`, name, subject, body, fromName, recipients,
      scheduledDate: schedDate, batchSize: Math.max(1, batchSize),
      batchesSent: 0, warmupCopies, status: 'scheduled',
      createdAt: new Date().toISOString(), sentLog: [],
    };
    const { error } = await supabase.from('gm_campaigns').upsert({ id: c.id, data: c, created_at: c.createdAt });
    if (error) { alert(`Failed to schedule campaign: ${error.message}`); return; }
    setCampaigns(prev => [c, ...prev]);
    setComposing(false); setSubject(''); setBody(''); setSelected(new Set());
    setTab('campaigns');
  }

  // ── Send next batch ───────────────────────────────────────────────────────

  async function sendNextBatch(c: Campaign) {
    const start = c.batchesSent * c.batchSize;
    const batch = c.recipients.slice(start, start + c.batchSize);
    if (!batch.length) return;
    setSendingBatch(c.id); setBatchError(null); setBatchResult(null);
    try {
      const r = await sendEmails({ recipients: batch, subject: c.subject, body: c.body, fromName: c.fromName, warmupCopies: c.warmupCopies, warmupAddrs });
      const bSent = c.batchesSent + 1;
      const done  = bSent * c.batchSize >= c.recipients.length;
      const updated: Campaign = {
        ...c, batchesSent: bSent,
        status: done ? 'completed' : 'in_progress',
        sentLog: [...c.sentLog, { sentAt: new Date().toISOString(), count: r.sent, failed: r.failed }],
      };
      const { error } = await supabase.from('gm_campaigns').upsert({ id: updated.id, data: updated, created_at: updated.createdAt });
      if (error) throw new Error(`Emails sent but failed to save campaign progress: ${error.message}`);
      setCampaigns(prev => prev.map(x => x.id === c.id ? updated : x));
      setBatchResult({ id: c.id, sent: r.sent });
    } catch (err) { setBatchError(err instanceof Error ? err.message : 'Send failed'); }
    finally { setSendingBatch(null); }
  }

  async function cancelCampaign(id: string) {
    if (!confirm('Cancel this campaign?')) return;
    const target = campaigns.find(c => c.id === id);
    if (!target) return;
    const updated = { ...target, status: 'cancelled' as const };
    const { error } = await supabase.from('gm_campaigns').upsert({ id, data: updated, created_at: updated.createdAt });
    if (error) { alert(`Failed to cancel campaign: ${error.message}`); return; }
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign permanently?')) return;
    const { error } = await supabase.from('gm_campaigns').delete().eq('id', id);
    if (error) { alert(`Failed to delete campaign: ${error.message}`); return; }
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  // ── Derived counts ────────────────────────────────────────────────────────

  const withEmail    = guests.filter(g => g.email).length;
  const withoutEmail = guests.filter(g => !g.email).length;
  const activeCampaigns = campaigns.filter(c => c.status !== 'cancelled');
  const readyNow = campaigns.filter(c =>
    (c.status === 'scheduled' || c.status === 'in_progress') &&
    new Date(c.scheduledDate) <= new Date()
  );
  const selectedRecipients = filtered.filter(g => g.email && selected.has(g.email));
  const totalBatches = Math.ceil(selectedRecipients.length / Math.max(1, batchSize));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Guest Marketing</h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">
            {withEmail} guests with email · {withoutEmail} without · {allReservations.filter(r => r.status !== 'cancelled').length} stays
            {historyLastFetched && <span className="ml-2 text-[#3a5070]">· history through {historyLastFetched}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {apiKey && (
            <button onClick={fetchHistory} disabled={loadingHistory}
              className="flex items-center gap-2 border border-[#1e2d45] bg-[#1a2335] hover:bg-[#1e2d45] text-[#b8d4f0] text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
              {loadingHistory ? 'Loading…' : historyLastFetched ? 'Refresh' : 'Load History'}
            </button>
          )}
          {selected.size > 0 && (
            <button onClick={openCompose}
              className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Send size={14} /> Compose to {selected.size}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#111d30] rounded-xl p-1 border border-[#1e2d45]">
        {(['guests', 'drafts', 'campaigns'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-[#4a90d9] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
          >
            {t === 'guests'    ? 'Guests'
              : t === 'drafts'   ? `Drafts${drafts.length ? ` (${drafts.length})` : ''}`
              : `Campaigns${activeCampaigns.length ? ` (${activeCampaigns.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Ready-to-send banner */}
      {readyNow.length > 0 && tab !== 'campaigns' && (
        <button onClick={() => setTab('campaigns')}
          className="w-full flex items-center justify-between bg-[#2a1a0a] border border-[#d0954a] rounded-xl px-4 py-3 text-sm hover:bg-[#3a2a10] transition-colors"
        >
          <span className="text-[#d0954a] font-medium">
            🕐 {readyNow.length} campaign{readyNow.length !== 1 ? 's' : ''} ready to send
          </span>
          <ChevronRight size={16} className="text-[#d0954a]" />
        </button>
      )}

      {historyError && (
        <div className="bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg px-4 py-3 text-sm text-[#e05c5c]">{historyError}</div>
      )}
      {sentResult && (
        <div className="bg-[#0a2518] border border-[#0a4a2a] rounded-lg px-4 py-3 text-sm text-[#4ab57a] font-medium">
          ✓ Sent to {sentResult.sent} guest{sentResult.sent !== 1 ? 's' : ''}{sentResult.failed > 0 ? ` · ${sentResult.failed} failed` : ''}
        </div>
      )}

      {/* ── GUESTS TAB ───────────────────────────────────────────────────── */}
      {tab === 'guests' && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Guests', value: guests.length, icon: '👤' },
              { label: 'Have Email',   value: withEmail,     icon: '📧' },
              { label: 'Total Stays',  value: allReservations.filter(r => r.status !== 'cancelled').length, icon: '🏠' },
            ].map(s => (
              <div key={s.label} className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-3 overflow-hidden">
                <div className="text-lg mb-1">{s.icon}</div>
                <div className="text-sm font-bold text-white">{s.value}</div>
                <div className="text-xs text-[#b8d4f0] leading-tight mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
              <input type="text" placeholder="Search guests..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#1a2335] border border-[#1e2d45] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
            </div>
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
              className="text-sm border border-[#1e2d45] rounded-lg px-3 py-2 bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
              <option value="all">All Channels</option>
              {allChannels.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-[#b8d4f0] cursor-pointer select-none">
              <input type="checkbox" checked={showNoEmail} onChange={e => setShowNoEmail(e.target.checked)} className="accent-teal-600" />
              Show guests without email
            </label>
          </div>

          <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] overflow-hidden">
            <div className="hidden sm:flex items-center gap-3 px-4 py-3 border-b border-[#1e2d45] bg-[#1e2d45]">
              <button onClick={toggleAll} className="text-[#3a5070] hover:text-[#4a90d9] flex-shrink-0">
                {allSel ? <CheckSquare size={16} className="text-[#4a90d9]" /> : <Square size={16} />}
              </button>
              <div className="grid grid-cols-4 flex-1 gap-2 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">
                <span>Guest</span><span>Email</span><span>Last Stay</span><span>Channels · Stays</span>
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="text-center text-[#3a5070] text-sm py-10">No guests found.</p>
            ) : (
              <div className="divide-y divide-[#1e2d45]">
                {filtered.map(g => (
                  <div key={g.email || g.name}>
                    <div className="sm:hidden flex items-start gap-3 px-4 py-3 hover:bg-[#1e2d45]">
                      <div className="flex-shrink-0 pt-0.5">
                        {g.email ? (
                          <button onClick={() => toggle(g.email)} className="text-[#3a5070] hover:text-[#4a90d9]">
                            {selected.has(g.email) ? <CheckSquare size={16} className="text-[#4a90d9]" /> : <Square size={16} />}
                          </button>
                        ) : <Square size={16} className="text-slate-200" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#162035] flex items-center justify-center flex-shrink-0">
                            <span className="text-[#4a90d9] font-bold text-xs">{g.name.charAt(0)}</span>
                          </div>
                          <span className="text-sm font-semibold text-white truncate">{g.name}</span>
                          <span className="text-xs text-[#3a5070] flex-shrink-0">{g.stays.length} stay{g.stays.length !== 1 ? 's' : ''}</span>
                        </div>
                        {g.email && <p className="text-xs text-[#b8d4f0] truncate mt-0.5 ml-9">{g.email}</p>}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 px-4 py-3 hover:bg-[#1e2d45]">
                      <div className="flex-shrink-0">
                        {g.email ? (
                          <button onClick={() => toggle(g.email)} className="text-[#3a5070] hover:text-[#4a90d9]">
                            {selected.has(g.email) ? <CheckSquare size={16} className="text-[#4a90d9]" /> : <Square size={16} />}
                          </button>
                        ) : <Square size={16} className="text-slate-200" />}
                      </div>
                      <div className="grid grid-cols-4 flex-1 gap-2 items-center min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#162035] flex items-center justify-center flex-shrink-0">
                            <span className="text-[#4a90d9] font-bold text-xs">{g.name.charAt(0)}</span>
                          </div>
                          <span className="text-sm font-medium text-white truncate">{g.name}</span>
                        </div>
                        <div className="min-w-0">
                          {g.email ? <span className="text-sm text-[#b8d4f0] truncate block">{g.email}</span>
                            : <span className="text-xs text-[#3a5070] italic">No email</span>}
                        </div>
                        <div className="text-sm text-[#b8d4f0]">
                          {g.lastStay ? new Date(g.lastStay + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {g.channels.slice(0, 2).map(c => (
                            <span key={c} className="text-xs bg-[#1e2d45] text-[#b8d4f0] px-2 py-0.5 rounded-full">{c}</span>
                          ))}
                          <span className="text-xs text-[#3a5070]">{g.stays.length} stay{g.stays.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DRAFTS TAB ───────────────────────────────────────────────────── */}
      {tab === 'drafts' && (
        <div className="space-y-3">
          {drafts.length === 0 ? (
            <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-10 text-center">
              <FileText size={32} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-sm text-[#3a5070]">No saved drafts yet.</p>
              <p className="text-xs text-[#3a5070] mt-1">Select guests → Compose → Save Draft</p>
            </div>
          ) : (
            drafts.map(d => (
              <div key={d.id} className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-4 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-[#1e2d45] flex items-center justify-center flex-shrink-0">
                  <FileText size={16} className="text-[#4a90d9]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm">{d.name}</p>
                  <p className="text-xs text-[#b8d4f0] truncate mt-0.5">{d.subject || <em className="text-[#3a5070]">No subject</em>}</p>
                  <p className="text-xs text-[#3a5070] mt-1">
                    {new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' · '}From: {d.fromName}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { useDraft(d); setComposing(true); setSchedMode(false); setSendError(''); setTab('guests'); }}
                    className="text-xs text-[#4a90d9] hover:text-[#3a80c9] font-medium border border-[#1e3a5a] px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Use Draft
                  </button>
                  <button onClick={() => deleteDraft(d.id)} className="text-[#3a5070] hover:text-[#e05c5c] p-1.5 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CAMPAIGNS TAB ────────────────────────────────────────────────── */}
      {tab === 'campaigns' && (
        <div className="space-y-3">
          {batchError && (
            <div className="bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg px-4 py-3 text-sm text-[#e05c5c]">{batchError}</div>
          )}
          {batchResult && (
            <div className="bg-[#0a2518] border border-[#0a4a2a] rounded-lg px-4 py-3 text-sm text-[#4ab57a] font-medium">
              ✓ Batch sent — {batchResult.sent} emails delivered
            </div>
          )}

          {activeCampaigns.length === 0 ? (
            <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-10 text-center">
              <Calendar size={32} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-sm text-[#3a5070]">No campaigns yet.</p>
              <p className="text-xs text-[#3a5070] mt-1">Select guests → Compose → Schedule</p>
            </div>
          ) : (
            activeCampaigns.map(c => {
              const totalB    = Math.ceil(c.recipients.length / c.batchSize);
              const emailsSent = c.batchesSent * c.batchSize;
              const isReady   = (c.status === 'scheduled' || c.status === 'in_progress') && new Date(c.scheduledDate) <= new Date();
              const nextBatch = c.recipients.slice(c.batchesSent * c.batchSize, (c.batchesSent + 1) * c.batchSize);
              const isSending = sendingBatch === c.id;

              const statusColor = c.status === 'completed' ? 'text-[#4ab57a] bg-[#0a2518]'
                : c.status === 'in_progress' ? 'text-[#4a90d9] bg-[#0a1a35]'
                : isReady ? 'text-[#d0954a] bg-[#2a1a0a]'
                : 'text-[#b8d4f0] bg-[#1e2d45]';

              return (
                <div key={c.id} className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#1e2d45] flex items-center justify-center flex-shrink-0 mt-0.5">
                      {c.status === 'completed' ? <CheckCircle size={16} className="text-[#4ab57a]" />
                        : c.status === 'in_progress' ? <Play size={16} className="text-[#4a90d9]" />
                        : <Clock size={16} className="text-[#b8d4f0]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-white text-sm">{c.name}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusColor}`}>
                          {c.status === 'in_progress' ? 'In Progress' : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </span>
                        {isReady && c.status !== 'completed' && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-[#d0954a] bg-[#2a1a0a] border border-[#5a3010]">
                            Ready to Send
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#b8d4f0] mt-0.5 truncate">{c.subject}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#3a5070]">
                        <span>📧 {c.recipients.length} recipients</span>
                        <span>📦 {c.batchSize}/batch → {totalB} batch{totalB !== 1 ? 'es' : ''}</span>
                        <span>📅 {new Date(c.scheduledDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>

                      {/* Progress bar */}
                      {c.status !== 'scheduled' && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-[#b8d4f0] mb-1">
                            <span>Batch {c.batchesSent}/{totalB} sent</span>
                            <span>{Math.min(emailsSent, c.recipients.length)}/{c.recipients.length} emails</span>
                          </div>
                          <div className="h-1.5 bg-[#1e2d45] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#4a90d9] transition-all"
                              style={{ width: `${Math.min(100, (c.batchesSent / totalB) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Sent log */}
                      {c.sentLog.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {c.sentLog.map((log, i) => (
                            <p key={i} className="text-[10px] text-[#3a5070]">
                              Batch {i + 1} · {log.count} sent{log.failed > 0 ? `, ${log.failed} failed` : ''} · {new Date(log.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {c.status !== 'completed' && (
                        <button onClick={() => cancelCampaign(c.id)} className="text-[#3a5070] hover:text-[#e05c5c] p-1.5 transition-colors" title="Cancel campaign">
                          <X size={14} />
                        </button>
                      )}
                      <button onClick={() => deleteCampaign(c.id)} className="text-[#3a5070] hover:text-[#e05c5c] p-1.5 transition-colors" title="Delete campaign">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Send next batch button */}
                  {isReady && nextBatch.length > 0 && (
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={() => sendNextBatch(c)}
                        disabled={isSending}
                        className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                      >
                        <Send size={14} />
                        {isSending ? 'Sending…' : `Send Batch ${c.batchesSent + 1} of ${totalB} (${nextBatch.length} emails)`}
                      </button>
                      {c.batchesSent === 0 && !isReady && (
                        <span className="text-xs text-[#3a5070]">Scheduled for {c.scheduledDate}</span>
                      )}
                    </div>
                  )}
                  {!isReady && c.status === 'scheduled' && (
                    <p className="mt-3 text-xs text-[#3a5070]">
                      Scheduled to send starting {new Date(c.scheduledDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── COMPOSE MODAL ────────────────────────────────────────────────── */}
      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2d45]">
              <div>
                <h2 className="font-semibold text-white">Compose Email</h2>
                <p className="text-xs text-[#b8d4f0] mt-0.5">To {selected.size} guest{selected.size !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setComposing(false)} className="text-[#3a5070] hover:text-white transition-colors"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Load draft */}
              {drafts.length > 0 && (
                <div className="flex items-center gap-2">
                  <FileText size={13} className="text-[#3a5070] flex-shrink-0" />
                  <select
                    onChange={e => { const d = drafts.find(x => x.id === e.target.value); if (d) useDraft(d); e.target.value = ''; }}
                    defaultValue=""
                    className="text-xs bg-[#111d30] border border-[#243550] rounded-lg px-3 py-1.5 text-[#b8d4f0] focus:outline-none"
                  >
                    <option value="">Load a saved draft…</option>
                    {drafts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              {/* Campaign / draft name */}
              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Campaign Name <span className="font-normal text-[#3a5070] normal-case">(optional)</span></label>
                <input type="text" value={campName} onChange={e => setCampName(e.target.value)} placeholder="e.g. Summer re-engagement June 2026"
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">From Name</label>
                <input type="text" value={fromName} onChange={e => setFromName(e.target.value)}
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Subject</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="{{first_name}}, book directly with us and save!"
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={9}
                  placeholder={`Hi {{first_name}},\n\nThank you for staying with us!...\n\nBest,\nE&J Retreats`}
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] font-mono resize-none" />
                <p className="text-xs text-[#3a5070] mt-1">Use <code className="text-[#4a90d9]">{'{{first_name}}'}</code> to personalize each email.</p>
              </div>

              {/* Warmup */}
              {warmupAddrs.length > 0 && (
                <div className="bg-[#1a2a20] border border-[#1e4530] rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Flame size={13} className="text-[#f0a940]" />
                    <span className="text-xs font-semibold text-white">Warmup mixing</span>
                    <span className="text-xs text-[#4ab57a] ml-1">{warmupAddrs.length} seed addresses</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#b8d4f0]">Copies per send:</span>
                    <select className="bg-[#111d30] border border-[#243550] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      value={warmupCopies} onChange={e => setWarmupCopies(Number(e.target.value))}>
                      {[0, 1, 2, 3, 5].map(n => <option key={n} value={n}>{n === 0 ? 'Off' : n}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Schedule section */}
              <div className="border border-[#1e2d45] rounded-xl overflow-hidden">
                <button
                  onClick={() => setSchedMode(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#b8d4f0] hover:bg-[#1e2d45] transition-colors"
                >
                  <span className="flex items-center gap-2"><Calendar size={14} /> Schedule for later</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full transition-colors ${schedMode ? 'bg-[#4a90d9] text-white' : 'bg-[#1e2d45] text-[#3a5070]'}`}>
                    {schedMode ? 'On' : 'Off'}
                  </span>
                </button>

                {schedMode && (
                  <div className="border-t border-[#1e2d45] px-4 py-4 space-y-3 bg-[#111d30]">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#b8d4f0] mb-1.5">Send Date</label>
                        <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                          min={new Date().toISOString().slice(0, 10)}
                          className="w-full bg-[#1a2335] border border-[#243550] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                          style={{ colorScheme: 'dark' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#b8d4f0] mb-1.5">Emails per Batch</label>
                        <input type="number" min={1} max={500} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
                          className="w-full bg-[#1a2335] border border-[#243550] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
                      </div>
                    </div>
                    <p className="text-xs text-[#3a5070]">
                      {selectedRecipients.length} recipients ÷ {Math.max(1, batchSize)} per batch
                      = <span className="text-[#b8d4f0] font-medium">{totalBatches} batch{totalBatches !== 1 ? 'es' : ''}</span>.
                      {' '}Send each batch manually from the Campaigns tab.
                    </p>
                  </div>
                )}
              </div>

              {sendError && <p className="text-sm text-[#e05c5c]">{sendError}</p>}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#1e2d45] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setComposing(false)} className="text-sm text-[#b8d4f0] hover:text-white px-3 py-2 transition-colors">
                  Cancel
                </button>
                <button onClick={saveDraft}
                  className="flex items-center gap-1.5 text-sm text-[#b8d4f0] hover:text-white border border-[#1e2d45] hover:border-[#3a5070] px-3 py-2 rounded-lg transition-colors"
                >
                  <FileText size={13} /> Save Draft
                </button>
              </div>
              {schedMode ? (
                <button onClick={handleSchedule} disabled={!schedDate || !subject.trim() || !body.trim()}
                  className="flex items-center gap-2 bg-[#d0954a] hover:bg-[#c08540] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  <Calendar size={14} /> Schedule {totalBatches} Batch{totalBatches !== 1 ? 'es' : ''}
                </button>
              ) : (
                <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}
                  className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  <Send size={14} />
                  {sending ? 'Sending…' : `Send Now to ${selected.size}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Email HTML builder ───────────────────────────────────────────────────────

function buildGuestEmailHtml(bodyText: string, preheader: string, fromName: string): string {
  const preview    = preheader.replace(/<[^>]+>/g, '').slice(0, 120);
  const paragraphs = bodyText.split(/\n{2,}/).filter(Boolean);
  const bodyHtml   = paragraphs.map(p => {
    const safe = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1a1a1a">${safe.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${preview}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f8fafc">${preview}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:8px;padding:36px 32px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 20px">
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">
      — ${fromName.replace(/&/g, '&amp;')}<br>
      <a href="https://ejretreats.com" style="color:#0d9488;text-decoration:none">ejretreats.com</a>
    </p>
  </div>
  <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">You're receiving this because you've stayed with E&amp;J Retreats.</p>
</div>
</body></html>`;
}

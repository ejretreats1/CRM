import { useState, useMemo } from 'react';
import { Search, Send, CheckSquare, Square, X, RefreshCw, Flame } from 'lucide-react';
import type { UplistingReservation } from '../services/uplisting';
import { fetchReservations } from '../services/uplisting';

const HISTORY_KEY = 'ej_uplisting_history';

function loadHistory(): UplistingReservation[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function saveHistory(r: UplistingReservation[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(r));
}

interface GuestMarketingProps {
  reservations: UplistingReservation[];
  apiKey?: string;
  warmupAddresses?: string[];
}

interface Guest {
  email: string;
  name: string;
  stays: UplistingReservation[];
  lastStay: string;
  channels: string[];
}

const CHANNEL_LABEL: Record<string, string> = {
  airbnb: 'Airbnb', airbnb_official: 'Airbnb',
  booking_dot_com: 'Booking.com',
  homeaway: 'VRBO', vrbo: 'VRBO',
  uplisting: 'Direct', direct: 'Direct',
};

function channelLabel(c: string) {
  return CHANNEL_LABEL[c] ?? c;
}

function isRealEmail(email: string) {
  if (!email) return false;
  if (email.includes('@guest.airbnb.com')) return false;
  if (email.includes('@m.airbnb.com')) return false;
  return email.includes('@');
}

export default function GuestMarketing({ reservations, apiKey, warmupAddresses = [] }: GuestMarketingProps) {
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [showNoEmail, setShowNoEmail] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromName, setFromName] = useState('E&J Retreats');
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<{ sent: number; failed: number } | null>(null);
  const [sendError, setSendError] = useState('');
  const warmupAddrs = warmupAddresses;
  const [warmupCopies, setWarmupCopies] = useState(1);
  const [history, setHistory] = useState<UplistingReservation[]>(() => loadHistory());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyLastFetched, setHistoryLastFetched] = useState<string | null>(
    () => localStorage.getItem('ej_uplisting_history_date')
  );

  async function fetchHistory() {
    if (!apiKey) return;
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      const from = threeYearsAgo.toISOString().slice(0, 10);
      const hist = await fetchReservations(apiKey, from, today);
      saveHistory(hist);
      setHistory(hist);
      localStorage.setItem('ej_uplisting_history_date', today);
      setHistoryLastFetched(today);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  }

  // Merge regular reservations + history, dedupe by id
  const allReservations = useMemo(() => {
    const map = new Map<string, UplistingReservation>();
    for (const r of history) map.set(r.id, r);
    for (const r of reservations) map.set(r.id, r);
    return Array.from(map.values());
  }, [reservations, history]);

  // Deduplicate guests by email, fall back to guest_name for no-email entries
  const guests = useMemo<Guest[]>(() => {
    const map = new Map<string, Guest>();
    for (const r of allReservations) {
      if (r.status === 'cancelled') continue;
      const key = r.guest_email && isRealEmail(r.guest_email)
        ? r.guest_email.toLowerCase()
        : `__nomail__${r.guest_name}`;
      const existing = map.get(key);
      if (existing) {
        existing.stays.push(r);
        if (r.check_out > existing.lastStay) {
          existing.lastStay = r.check_out;
          existing.name = r.guest_name;
        }
        const ch = channelLabel(r.channel ?? '');
        if (ch && !existing.channels.includes(ch)) existing.channels.push(ch);
      } else {
        map.set(key, {
          email: r.guest_email && isRealEmail(r.guest_email) ? r.guest_email : '',
          name: r.guest_name,
          stays: [r],
          lastStay: r.check_out,
          channels: r.channel ? [channelLabel(r.channel)] : [],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastStay.localeCompare(a.lastStay));
  }, [reservations]);

  const allChannels = useMemo(() => {
    const s = new Set<string>();
    guests.forEach(g => g.channels.forEach(c => s.add(c)));
    return Array.from(s).sort();
  }, [guests]);

  const filtered = useMemo(() => {
    return guests.filter(g => {
      if (!showNoEmail && !g.email) return false;
      if (channelFilter !== 'all' && !g.channels.includes(channelFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [guests, search, channelFilter, showNoEmail]);

  const emailable = filtered.filter(g => g.email);
  const allSelected = emailable.length > 0 && emailable.every(g => selected.has(g.email));

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        emailable.forEach(g => next.delete(g.email));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        emailable.forEach(g => next.add(g.email));
        return next;
      });
    }
  }

  function toggle(email: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError('');
    setSentResult(null);

    const selectedGuests = filtered.filter(g => g.email && selected.has(g.email));
    if (!selectedGuests.length) { setSending(false); return; }

    // Build personalized email per guest
    const emails = [
      ...selectedGuests.map(g => {
        const firstName = g.name.split(' ')[0] || g.name;
        const pSubject = subject.replace(/\{\{first_name\}\}/gi, firstName);
        const pBody    = body.replace(/\{\{first_name\}\}/gi, firstName);
        return {
          to:            g.email,
          subject:       pSubject,
          html:          buildGuestEmailHtml(pBody, pSubject, fromName),
          recipientName: g.name,
          leadId:        g.email,
        };
      }),
      // Warmup copies
      ...(warmupCopies > 0 && warmupAddrs.length > 0
        ? [...warmupAddrs].sort(() => Math.random() - 0.5)
            .slice(0, Math.min(warmupCopies, warmupAddrs.length))
            .map((addr, i) => ({
              to:            addr,
              subject,
              html:          buildGuestEmailHtml(body.replace(/\{\{first_name\}\}/gi, 'there'), subject, fromName),
              recipientName: 'Warmup',
              leadId:        `warmup_${i}`,
            }))
        : []),
    ];

    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:     'lead-outreach',
          fromName,
          replyTo:    'ejretreats1@gmail.com',
          campaignId: `guest_${Date.now()}`,
          emails,
        }),
      });
      const data = await res.json() as { sent?: number; failed?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Send failed');
      const warmupSent = warmupCopies > 0 && warmupAddrs.length > 0 ? Math.min(warmupCopies, warmupAddrs.length) : 0;
      setSentResult({ sent: (data.sent ?? selectedGuests.length) - warmupSent, failed: data.failed ?? 0 });
      setComposing(false);
      setSubject('');
      setBody('');
      setSelected(new Set());
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  const withEmail = guests.filter(g => g.email).length;
  const withoutEmail = guests.filter(g => !g.email).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Guest Marketing</h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">
            {withEmail} guests with email · {withoutEmail} without · {allReservations.filter(r => r.status !== 'cancelled').length} total stays
            {historyLastFetched && <span className="ml-2 text-[#3a5070]">· history through {historyLastFetched}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {apiKey && (
            <button
              onClick={fetchHistory}
              disabled={loadingHistory}
              className="flex items-center gap-2 border border-[#1e2d45] bg-[#1a2335] hover:bg-[#1e2d45] text-[#b8d4f0] text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
              {loadingHistory ? 'Loading…' : historyLastFetched ? 'Refresh History' : 'Load Full History'}
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => setComposing(true)}
              className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Send size={15} /> Compose to {selected.size} guest{selected.size !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Guests', value: guests.length, icon: '👤' },
          { label: 'Have Email', value: withEmail, icon: '📧' },
          { label: 'Total Stays', value: allReservations.filter(r => r.status !== 'cancelled').length, icon: '🏠' },
        ].map(s => (
          <div key={s.label} className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-3 overflow-hidden">
            <div className="text-lg mb-1">{s.icon}</div>
            <div className="text-sm font-bold text-white">{s.value}</div>
            <div className="text-xs text-[#b8d4f0] leading-tight mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
          <input
            type="text"
            placeholder="Search guests..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#1a2335] border border-[#1e2d45] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
          />
        </div>
        <select
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value)}
          className="text-sm border border-[#1e2d45] rounded-lg px-3 py-2 bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        >
          <option value="all">All Channels</option>
          {allChannels.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-[#b8d4f0] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showNoEmail}
            onChange={e => setShowNoEmail(e.target.checked)}
            className="accent-teal-600"
          />
          Show guests without email
        </label>
      </div>

      {historyError && (
        <div className="bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg px-4 py-3 text-sm text-[#e05c5c]">{historyError}</div>
      )}

      {sentResult && (
        <div className="bg-[#0a2518] border border-[#0a4a2a] rounded-lg px-4 py-3 text-sm text-[#4ab57a] font-medium">
          Sent to {sentResult.sent} guest{sentResult.sent !== 1 ? 's' : ''}
          {sentResult.failed > 0 ? ` · ${sentResult.failed} failed` : ''}.
        </div>
      )}

      {/* Guest list — card layout on mobile, table on sm+ */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] overflow-hidden">
        {/* Table header — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-3 px-4 py-3 border-b border-[#1e2d45] bg-[#1e2d45]">
          <button onClick={toggleAll} className="text-[#3a5070] hover:text-[#4a90d9] flex-shrink-0">
            {allSelected ? <CheckSquare size={16} className="text-[#4a90d9]" /> : <Square size={16} />}
          </button>
          <div className="grid grid-cols-4 flex-1 gap-2 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">
            <span>Guest</span>
            <span>Email</span>
            <span>Last Stay</span>
            <span>Channels · Stays</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-center text-[#3a5070] text-sm py-10">No guests found.</p>
        ) : (
          <div className="divide-y divide-[#1e2d45]">
            {filtered.map(g => (
              <div key={g.email || g.name}>
                {/* Mobile card layout */}
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

                {/* Desktop table row */}
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

      {/* Compose modal */}
      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2d45]">
              <div>
                <h2 className="font-semibold text-white">Compose Email</h2>
                <p className="text-xs text-[#b8d4f0] mt-0.5">Sending to {selected.size} guest{selected.size !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setComposing(false)} className="text-[#3a5070] hover:text-[#b8d4f0]">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">From Name</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={e => setFromName(e.target.value)}
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="{{first_name}}, book directly with us and save!"
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Message</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={10}
                  placeholder={`Hi {{first_name}},\n\nThank you for staying with us! We'd love to have you back...\n\nBook directly at ejretreats.com for exclusive rates.\n\nBest,\nE&J Retreats`}
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] font-mono resize-none"
                />
                <p className="text-xs text-[#3a5070] mt-1.5">
                  Use <code className="text-[#4a90d9]">{'{{first_name}}'}</code> to personalize — each guest gets their own email, which boosts deliverability.
                </p>
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
                    <span className="text-xs text-[#b8d4f0]">Warmup copies per send:</span>
                    <select
                      className="bg-[#111d30] border border-[#243550] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      value={warmupCopies}
                      onChange={e => setWarmupCopies(Number(e.target.value))}
                    >
                      {[0, 1, 2, 3, 5].map(n => <option key={n} value={n}>{n === 0 ? 'Off' : n}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {sendError && <p className="text-sm text-[#e05c5c]">{sendError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-[#1e2d45] flex justify-end gap-3">
              <button onClick={() => setComposing(false)} className="text-sm text-[#b8d4f0] hover:text-white px-4 py-2">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim()}
                className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                <Send size={14} />
                {sending ? 'Sending…' : `Send to ${selected.size} guest${selected.size !== 1 ? 's' : ''}${warmupCopies > 0 && warmupAddrs.length > 0 ? ` + ${Math.min(warmupCopies, warmupAddrs.length)} warmup` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildGuestEmailHtml(bodyText: string, preheader: string, fromName: string): string {
  const preview = preheader.replace(/<[^>]+>/g, '').slice(0, 120);
  const paragraphs = bodyText.split(/\n{2,}/).filter(Boolean);
  const bodyHtml = paragraphs
    .map(p => {
      const safe = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1a1a1a">${safe.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
  return `<!DOCTYPE html><html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${preview}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">
<!-- Preheader (shows in inbox preview line) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f8fafc;line-height:1px">${preview}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#ffffff;border-radius:8px;padding:36px 32px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 20px">
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">
      — ${fromName.replace(/&/g, '&amp;')}<br>
      <a href="https://ejretreats.com" style="color:#0d9488;text-decoration:none">ejretreats.com</a>
    </p>
  </div>
  <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5">
    You're receiving this because you've stayed with E&amp;J Retreats.
  </p>
</div>
</body></html>`;
}

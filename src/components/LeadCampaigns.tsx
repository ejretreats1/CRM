import { useState, useEffect, useMemo } from 'react';
import {
  Mail, Plus, Edit2, Trash2, Send, ChevronLeft,
  Eye, EyeOff, Flame, CheckCircle2, Clock, Search,
  Play, Pause, RefreshCw,
} from 'lucide-react';
import type { Lead } from '../types';
import type { Campaign } from '../services/campaigns';
import { fetchCampaigns, upsertCampaign, deleteCampaign } from '../services/campaigns';

const WARMUP_LS_KEY = 'ej_warmup_addresses';

interface Props {
  leads: Lead[];
}

type Screen = 'list' | 'compose' | 'detail';

function getWarmupAddresses(): string[] {
  try {
    const raw = localStorage.getItem(WARMUP_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((a: unknown) => (typeof a === 'string' ? a : (a as Record<string, string>)?.email ?? ''))
      .filter(Boolean);
  } catch { return []; }
}

function replaceTokens(text: string, lead: { name: string; email: string; propertyAddress?: string }): string {
  const firstName = (lead.name ?? '').split(' ')[0] || lead.name;
  return text
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{full_name\}\}/gi, lead.name ?? '')
    .replace(/\{\{property\}\}/gi, lead.propertyAddress ?? '')
    .replace(/\{\{email\}\}/gi, lead.email ?? '');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEmailHtml(bodyText: string, fromName: string): string {
  const paragraphs = bodyText.split(/\n{2,}/).filter(Boolean);
  const bodyHtml = paragraphs
    .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1a1a1a">${escHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border-radius:8px;padding:36px 32px;border:1px solid #e2e8f0">
${bodyHtml}
<hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 20px">
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5">${escHtml(fromName)}</p>
</div>
</div>
</body></html>`;
}

function blankCampaign(): Campaign {
  return {
    id: `camp_${Date.now()}`,
    name: '',
    fromName: 'E&J Retreats',
    replyTo: 'ejretreats1@gmail.com',
    subject: '',
    body: '',
    leadIds: [],
    sentLeadIds: [],
    dailyLimit: 20,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const STAGES = [
  { value: '', label: 'All stages' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'cold', label: 'Cold' },
  { value: 'won', label: 'Won' },
];

const STATUS_PILL: Record<Campaign['status'], string> = {
  draft:     'bg-[#1e2d45] text-[#b8d4f0]',
  active:    'bg-[#0a2518] text-[#4ab57a]',
  paused:    'bg-[#2a1800] text-[#f0a940]',
  completed: 'bg-[#162035] text-[#4a90d9]',
};

const STAGE_PILL: Record<string, string> = {
  new:       'bg-[#0a2518] text-[#4ab57a]',
  contacted: 'bg-[#162035] text-[#4a90d9]',
  cold:      'bg-[#1e2d45] text-[#b8d4f0]',
  won:       'bg-[#2a1800] text-[#f0a940]',
};

export default function LeadCampaigns({ leads }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('list');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<Campaign>(blankCampaign());
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [warmupAddrs, setWarmupAddrs] = useState<string[]>([]);
  const [warmupCopies, setWarmupCopies] = useState(1);
  const [showPreview, setShowPreview] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  useEffect(() => {
    fetchCampaigns()
      .then(c => setCampaigns(c))
      .catch(() => {})
      .finally(() => setLoading(false));
    setWarmupAddrs(getWarmupAddresses());
  }, []);

  const detailCampaign = campaigns.find(c => c.id === detailId) ?? null;

  const filteredLeads = useMemo(() => {
    const q = leadSearch.toLowerCase();
    return leads.filter(l => {
      if (!l.email) return false;
      const matchSearch = !q || l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || (l.propertyAddress ?? '').toLowerCase().includes(q);
      const matchStage = !stageFilter || l.stage === stageFilter;
      return matchSearch && matchStage;
    });
  }, [leads, leadSearch, stageFilter]);

  function openCompose(c?: Campaign) {
    setForm(c ? { ...c } : blankCampaign());
    setLeadSearch('');
    setStageFilter('');
    setShowPreview(false);
    setScreen('compose');
  }

  function openDetail(id: string) {
    setDetailId(id);
    setSendMsg(null);
    setScreen('detail');
  }

  async function saveCampaign() {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const updated: Campaign = { ...form, updatedAt: new Date().toISOString() };
      await upsertCampaign(updated);
      setCampaigns(prev => {
        const exists = prev.find(c => c.id === updated.id);
        return exists ? prev.map(c => c.id === updated.id ? updated : c) : [updated, ...prev];
      });
      setScreen('list');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm('Delete this campaign?')) return;
    await deleteCampaign(id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (detailId === id) setScreen('list');
  }

  async function toggleStatus() {
    if (!detailCampaign) return;
    const newStatus: Campaign['status'] = detailCampaign.status === 'active' ? 'paused' : 'active';
    const updated: Campaign = { ...detailCampaign, status: newStatus, updatedAt: new Date().toISOString() };
    await upsertCampaign(updated);
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  async function sendBatch() {
    if (!detailCampaign) return;
    const sentSet = new Set(detailCampaign.sentLeadIds);
    const pending = detailCampaign.leadIds
      .map(id => leads.find(l => l.id === id))
      .filter((l): l is Lead => !!l && !!l.email && !sentSet.has(l.id));

    const batch = pending.slice(0, detailCampaign.dailyLimit);
    if (!batch.length) { setSendMsg('No pending leads to send to.'); return; }

    const warmupBatch = warmupCopies > 0 && warmupAddrs.length > 0
      ? [...warmupAddrs].sort(() => Math.random() - 0.5).slice(0, Math.min(warmupCopies, warmupAddrs.length))
      : [];

    setSending(true);
    setSendMsg(null);
    try {
      const emails = [
        ...batch.map(lead => ({
          to: lead.email,
          subject: replaceTokens(detailCampaign.subject, lead),
          html: buildEmailHtml(replaceTokens(detailCampaign.body, lead), detailCampaign.fromName),
          recipientName: lead.name,
          leadId: lead.id,
        })),
        ...warmupBatch.map((email, i) => ({
          to: email,
          subject: replaceTokens(detailCampaign.subject, { name: 'Warmup', email, propertyAddress: '' }),
          html: buildEmailHtml(replaceTokens(detailCampaign.body, { name: 'Warmup', email, propertyAddress: '' }), detailCampaign.fromName),
          recipientName: 'Warmup',
          leadId: `warmup_${i}`,
        })),
      ];

      const resp = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lead-outreach',
          fromName: detailCampaign.fromName,
          replyTo: detailCampaign.replyTo,
          campaignId: detailCampaign.id,
          emails,
        }),
      });

      const result = await resp.json() as { sent?: number; failed?: number };
      const newSentIds = [...detailCampaign.sentLeadIds, ...batch.map(l => l.id)];
      const allDone = newSentIds.length >= detailCampaign.leadIds.length;
      const newStatus: Campaign['status'] = allDone ? 'completed' : (detailCampaign.status === 'draft' ? 'active' : detailCampaign.status);

      const updated: Campaign = { ...detailCampaign, sentLeadIds: newSentIds, status: newStatus, updatedAt: new Date().toISOString() };
      await upsertCampaign(updated);
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));

      const sentCount = result.sent ?? batch.length;
      setSendMsg(`✓ Sent to ${sentCount} lead${sentCount !== 1 ? 's' : ''}${warmupBatch.length ? ` + ${warmupBatch.length} warmup cop${warmupBatch.length > 1 ? 'ies' : 'y'}` : ''}.${allDone ? ' Campaign complete!' : ''}`);
    } catch {
      setSendMsg('Send failed. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function resetSent() {
    if (!detailCampaign) return;
    if (!confirm('Reset sent list? All leads will appear as pending again.')) return;
    const updated: Campaign = { ...detailCampaign, sentLeadIds: [], status: 'draft', updatedAt: new Date().toISOString() };
    await upsertCampaign(updated);
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSendMsg(null);
  }

  const previewLead = useMemo(
    () => (form.leadIds.length ? leads.find(l => form.leadIds.includes(l.id) && l.email) ?? null : null),
    [form.leadIds, leads],
  );

  // ── COMPOSE ──────────────────────────────────────────────────────────────────
  if (screen === 'compose') {
    const isEdit = campaigns.some(c => c.id === form.id);
    const allFilteredSelected = filteredLeads.length > 0 && filteredLeads.every(l => form.leadIds.includes(l.id));

    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setScreen('list')} className="text-[#b8d4f0] hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Campaign' : 'New Campaign'}</h2>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Campaign Name</label>
            <input
              className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              placeholder="e.g. June STR Owner Outreach"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* From Name & Reply-To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">From Name</label>
              <input
                className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                placeholder="E&J Retreats"
                value={form.fromName}
                onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Reply-To Email</label>
              <input
                className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                placeholder="you@example.com"
                value={form.replyTo}
                onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))}
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Subject Line</label>
            <input
              className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              placeholder="{{first_name}}, quick question about your property"
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Email Body</label>
              {previewLead && (
                <button
                  onClick={() => setShowPreview(p => !p)}
                  className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#6aaff0] transition-colors"
                >
                  {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showPreview ? 'Edit' : 'Preview'}
                </button>
              )}
            </div>
            {showPreview && previewLead ? (
              <div className="bg-white rounded-lg border border-[#243550] overflow-auto" style={{ maxHeight: 300 }}>
                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-400 font-mono">Subject: </span>
                  <span className="text-xs text-gray-700 font-mono">{replaceTokens(form.subject, previewLead)}</span>
                </div>
                <div className="px-4 py-3">
                  {replaceTokens(form.body, previewLead).split('\n').map((line, i) => (
                    line ? <p key={i} className="text-sm text-gray-700 leading-relaxed mb-2">{line}</p>
                         : <div key={i} className="h-2" />
                  ))}
                </div>
              </div>
            ) : (
              <textarea
                className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none font-mono"
                rows={9}
                placeholder={`Hi {{first_name}},\n\nI came across your property at {{property}} and wanted to reach out about short-term rental management...\n\nWould love to connect.\n\nBest,\nEthan`}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              />
            )}
            <p className="text-xs text-[#3a5070] mt-1">
              Tokens: <code className="text-[#4a90d9]">{'{{first_name}}'}</code> · <code className="text-[#4a90d9]">{'{{full_name}}'}</code> · <code className="text-[#4a90d9]">{'{{property}}'}</code> · <code className="text-[#4a90d9]">{'{{email}}'}</code>
            </p>
          </div>

          {/* Daily Limit */}
          <div>
            <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Daily Send Limit</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={500}
                className="w-24 bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                value={form.dailyLimit}
                onChange={e => setForm(f => ({ ...f, dailyLimit: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
              <span className="text-sm text-[#3a5070]">emails per day</span>
            </div>
          </div>

          {/* Lead Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">
                Select Leads
              </label>
              {form.leadIds.length > 0 && (
                <span className="text-xs text-[#4a90d9] font-medium">{form.leadIds.length} selected</span>
              )}
            </div>

            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
                <input
                  className="w-full bg-[#111d30] border border-[#243550] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  placeholder="Search by name, email, or address..."
                  value={leadSearch}
                  onChange={e => setLeadSearch(e.target.value)}
                />
              </div>
              <select
                className="bg-[#111d30] border border-[#243550] rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value)}
              >
                {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {filteredLeads.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const ids = filteredLeads.map(l => l.id);
                  setForm(f => ({
                    ...f,
                    leadIds: allFilteredSelected
                      ? f.leadIds.filter(id => !ids.includes(id))
                      : [...new Set([...f.leadIds, ...ids])],
                  }));
                }}
                className="text-xs text-[#4a90d9] hover:underline mb-2 block"
              >
                {allFilteredSelected ? `Deselect all ${filteredLeads.length}` : `Select all ${filteredLeads.length} filtered`}
              </button>
            )}

            <div className="bg-[#111d30] border border-[#243550] rounded-lg divide-y divide-[#1e2d45]" style={{ maxHeight: 260, overflow: 'auto' }}>
              {filteredLeads.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#3a5070]">
                  {leads.filter(l => l.email).length === 0 ? 'No leads with email addresses in pipeline' : 'No leads match filter'}
                </div>
              ) : filteredLeads.map(lead => {
                const selected = form.leadIds.includes(lead.id);
                return (
                  <label key={lead.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#1a2335] cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[#4a90d9] flex-shrink-0"
                      checked={selected}
                      onChange={() => setForm(f => ({
                        ...f,
                        leadIds: selected ? f.leadIds.filter(id => id !== lead.id) : [...f.leadIds, lead.id],
                      }))}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{lead.name}</div>
                      <div className="text-xs text-[#3a5070] truncate">{lead.email}{lead.propertyAddress ? ` · ${lead.propertyAddress}` : ''}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${STAGE_PILL[lead.stage] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                      {lead.stage}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={saveCampaign}
            disabled={saving || !form.name.trim() || !form.subject.trim() || !form.body.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save Campaign'}
          </button>
        </div>
      </div>
    );
  }

  // ── DETAIL ───────────────────────────────────────────────────────────────────
  if (screen === 'detail' && detailCampaign) {
    const c = detailCampaign;
    const sentSet = new Set(c.sentLeadIds);
    const campaignLeads = c.leadIds.map(id => leads.find(l => l.id === id)).filter((l): l is Lead => !!l);
    const pendingLeads = campaignLeads.filter(l => l.email && !sentSet.has(l.id));
    const nextBatch = pendingLeads.slice(0, c.dailyLimit);
    const effectiveWarmup = Math.min(warmupCopies, warmupAddrs.length);

    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setScreen('list')} className="text-[#b8d4f0] hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="flex-1 text-lg font-bold text-white truncate">{c.name}</h2>
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${STATUS_PILL[c.status]}`}>{c.status}</span>
        </div>

        {/* Action bar */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {c.status !== 'completed' && (
            <button
              onClick={toggleStatus}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                c.status === 'active' ? 'bg-[#2a1800] text-[#f0a940] hover:bg-[#3a2200]' : 'bg-[#0a2518] text-[#4ab57a] hover:bg-[#0d3020]'
              }`}
            >
              {c.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
              {c.status === 'active' ? 'Pause' : 'Activate'}
            </button>
          )}
          <button
            onClick={() => openCompose(c)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1e2d45] text-[#b8d4f0] hover:bg-[#243550] transition-colors"
          >
            <Edit2 size={13} /> Edit
          </button>
          <button
            onClick={() => handleDelete(c.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1e2d45] text-[#b8d4f0] hover:bg-[#2a0e0e] hover:text-[#e05c5c] transition-colors"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: 'Total Leads', value: c.leadIds.length },
            { label: 'Sent', value: c.sentLeadIds.length },
            { label: 'Pending', value: pendingLeads.length },
            { label: 'Daily Limit', value: c.dailyLimit },
          ].map(s => (
            <div key={s.label} className="bg-[#1a2335] rounded-xl p-3 text-center border border-[#243550]">
              <div className="text-lg font-bold text-white">{s.value}</div>
              <div className="text-[10px] text-[#3a5070] mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Warmup panel */}
        <div className="bg-[#1a2335] rounded-xl border border-[#243550] p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-[#f0a940]" />
            <span className="text-sm font-semibold text-white">Email Warmup</span>
          </div>
          {warmupAddrs.length > 0 ? (
            <>
              <p className="text-xs text-[#b8d4f0] mb-3 leading-relaxed">
                {warmupAddrs.length} seed address{warmupAddrs.length > 1 ? 'es' : ''} active. Mixing warmup copies into sends boosts deliverability by signaling engagement to inbox providers.
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#b8d4f0]">Warmup copies per batch:</span>
                <select
                  className="bg-[#111d30] border border-[#243550] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  value={warmupCopies}
                  onChange={e => setWarmupCopies(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 5].map(n => <option key={n} value={n}>{n === 0 ? 'None' : n}</option>)}
                </select>
              </div>
            </>
          ) : (
            <p className="text-xs text-[#3a5070] leading-relaxed">
              No warmup addresses configured. Add seed email addresses in Email Tracking → Warmup to enable inbox warming.
            </p>
          )}
        </div>

        {/* Send panel */}
        {c.status !== 'completed' && (
          <div className="bg-[#1a2335] rounded-xl border border-[#243550] p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Send size={14} className="text-[#4a90d9]" />
                <span className="text-sm font-semibold text-white">Send Today's Batch</span>
              </div>
              {pendingLeads.length > 0 && (
                <span className="text-xs text-[#3a5070]">{nextBatch.length} of {pendingLeads.length} pending</span>
              )}
            </div>

            {pendingLeads.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-[#4ab57a]">
                <CheckCircle2 size={15} />
                All leads contacted — campaign complete!
              </div>
            ) : (
              <>
                <div className="space-y-1.5 mb-3">
                  {nextBatch.slice(0, 4).map(lead => (
                    <div key={lead.id} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#4a90d9] flex-shrink-0" />
                      <span className="text-xs text-white font-medium">{lead.name}</span>
                      <span className="text-xs text-[#3a5070] truncate">{lead.email}</span>
                    </div>
                  ))}
                  {nextBatch.length > 4 && (
                    <div className="text-xs text-[#3a5070] pl-3.5">+ {nextBatch.length - 4} more</div>
                  )}
                  {warmupCopies > 0 && warmupAddrs.length > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <Flame size={11} className="text-[#f0a940] flex-shrink-0" />
                      <span className="text-xs text-[#f0a940]">{effectiveWarmup} warmup cop{effectiveWarmup > 1 ? 'ies' : 'y'} included</span>
                    </div>
                  )}
                </div>

                {sendMsg && (
                  <p className={`text-xs mb-3 font-medium ${sendMsg.startsWith('✓') ? 'text-[#4ab57a]' : 'text-[#e05c5c]'}`}>
                    {sendMsg}
                  </p>
                )}

                <button
                  onClick={sendBatch}
                  disabled={sending || c.status === 'paused'}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={14} />
                  {sending
                    ? 'Sending…'
                    : `Send to ${nextBatch.length} lead${nextBatch.length !== 1 ? 's' : ''}${effectiveWarmup > 0 ? ` + ${effectiveWarmup} warmup` : ''}`}
                </button>
                {c.status === 'paused' && (
                  <p className="text-xs text-[#f0a940] mt-2">Campaign is paused. Activate it to send.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Reset sent list */}
        {c.sentLeadIds.length > 0 && (
          <div className="mb-5">
            <button
              onClick={resetSent}
              className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#b8d4f0] transition-colors"
            >
              <RefreshCw size={11} />
              Reset sent list
            </button>
          </div>
        )}

        {/* Lead list */}
        <div>
          <h3 className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2">
            Campaign Leads ({campaignLeads.length})
          </h3>
          <div className="bg-[#1a2335] rounded-xl border border-[#243550] divide-y divide-[#243550]">
            {campaignLeads.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#3a5070]">No leads added</div>
            ) : campaignLeads.map(lead => {
              const sent = sentSet.has(lead.id);
              return (
                <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
                  {sent
                    ? <CheckCircle2 size={14} className="text-[#4ab57a] flex-shrink-0" />
                    : <Clock size={14} className="text-[#3a5070] flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">{lead.name}</div>
                    <div className="text-xs text-[#3a5070] truncate">{lead.email}</div>
                  </div>
                  <span className={`text-[10px] font-semibold ${sent ? 'text-[#4ab57a]' : 'text-[#3a5070]'}`}>
                    {sent ? 'sent' : 'pending'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── LIST ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Lead Campaigns</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">Email outreach to pipeline & scraped leads</p>
        </div>
        <button
          onClick={() => openCompose()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] transition-colors"
        >
          <Plus size={15} />
          New Campaign
        </button>
      </div>

      {warmupAddrs.length > 0 && (
        <div className="bg-[#162a1e] border border-[#1e4530] rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
          <Flame size={15} className="text-[#4ab57a] flex-shrink-0" />
          <p className="text-xs text-[#4ab57a] leading-relaxed">
            <strong>{warmupAddrs.length} warmup address{warmupAddrs.length > 1 ? 'es' : ''} active</strong> — sends will include warmup copies to improve inbox placement.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-sm text-[#3a5070]">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-[#1a2335] border border-[#243550] rounded-2xl px-6 py-16 text-center">
          <Mail size={36} className="text-[#3a5070] mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">No campaigns yet</p>
          <p className="text-sm text-[#3a5070] mb-5">Create a campaign, pick your leads, and start sending personalized outreach.</p>
          <button
            onClick={() => openCompose()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] transition-colors"
          >
            <Plus size={15} />
            New Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const sent = c.sentLeadIds.length;
            const total = c.leadIds.length;
            const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
            return (
              <div
                key={c.id}
                className="bg-[#1a2335] border border-[#243550] rounded-xl p-4 hover:border-[#2a4060] transition-colors cursor-pointer"
                onClick={() => openDetail(c.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white truncate">{c.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_PILL[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#3a5070] truncate mb-2.5">{c.subject}</p>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[#b8d4f0]"><strong className="text-white">{total}</strong> leads</span>
                      <span className="text-xs text-[#4ab57a]"><strong>{sent}</strong> sent</span>
                      <span className="text-xs text-[#3a5070]"><strong>{total - sent}</strong> pending</span>
                      <span className="text-xs text-[#3a5070]">limit {c.dailyLimit}/day</span>
                    </div>
                    {total > 0 && (
                      <div className="mt-2.5 h-1 bg-[#243550] rounded-full overflow-hidden">
                        <div className="h-full bg-[#4ab57a] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => { e.stopPropagation(); openCompose(c); }}
                      className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#1e2d45] transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={e => handleDelete(c.id, e)}
                      className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick tip */}
      {campaigns.length > 0 && warmupAddrs.length === 0 && (
        <div className="mt-5 flex items-start gap-2 px-4 py-3 bg-[#1a2335] border border-[#243550] rounded-xl">
          <Flame size={14} className="text-[#f0a940] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[#b8d4f0] leading-relaxed">
            <strong className="text-[#f0a940]">Tip:</strong> Add warmup seed addresses in Email Tracking to mix warmup copies into campaign sends — this improves deliverability and inbox placement.
          </p>
        </div>
      )}
    </div>
  );
}

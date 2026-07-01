import { useState, useEffect, useMemo } from 'react';
import {
  Mail, Plus, Edit2, Trash2, Send, ChevronLeft,
  Eye, EyeOff, Flame, CheckCircle2, Clock, Search,
  Play, Pause, RefreshCw, Users, Upload,
} from 'lucide-react';
import type { Lead, Contact, ContactCategory } from '../types';
import type { Campaign } from '../services/campaigns';
import { fetchCampaigns, upsertCampaign, deleteCampaign } from '../services/campaigns';
import { upsertContact, deleteContact } from '../services/contacts';
import LeadImportModal from './modals/LeadImportModal';

interface Props {
  leads: Lead[];
  contacts: Contact[];
  onContactsChange: (contacts: Contact[]) => void;
  warmupAddresses?: string[];
}

type TopTab   = 'campaigns' | 'contacts';
type Screen   = 'list' | 'compose' | 'detail';
type RecipTab = 'leads' | 'contacts';

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  real_estate_agent: 'Real Estate Agent',
  referral_partner:  'Referral Partner',
  investor:          'Investor',
  vendor:            'Vendor',
  other:             'Other',
};

const CATEGORY_COLORS: Record<ContactCategory, string> = {
  real_estate_agent: 'bg-[#162035] text-[#4a90d9]',
  referral_partner:  'bg-[#0a2518] text-[#4ab57a]',
  investor:          'bg-[#2a1800] text-[#f0a940]',
  vendor:            'bg-[#1a1535] text-[#c4b5fd]',
  other:             'bg-[#1e2d45] text-[#b8d4f0]',
};

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

const LEAD_STAGES = [
  { value: '', label: 'All stages' },
  { value: 'new',       label: 'New'       },
  { value: 'contacted', label: 'Contacted' },
  { value: 'cold',      label: 'Cold'      },
  { value: 'won',       label: 'Won'       },
];

const CONTACT_CATS: { value: string; label: string }[] = [
  { value: '', label: 'All categories' },
  { value: 'real_estate_agent', label: 'Real Estate Agent' },
  { value: 'referral_partner',  label: 'Referral Partner'  },
  { value: 'investor',          label: 'Investor'          },
  { value: 'vendor',            label: 'Vendor'            },
  { value: 'other',             label: 'Other'             },
];


function replaceTokens(text: string, r: { name: string; email: string; propertyAddress?: string }): string {
  const firstName = (r.name ?? '').split(' ')[0] || r.name;
  return text
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{full_name\}\}/gi,  r.name ?? '')
    .replace(/\{\{property\}\}/gi,   r.propertyAddress ?? '')
    .replace(/\{\{email\}\}/gi,      r.email ?? '');
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
</div></div></body></html>`;
}

function blankCampaign(): Campaign {
  return {
    id: `camp_${Date.now()}`,
    name: '', fromName: 'E&J Retreats', replyTo: 'ejretreats1@gmail.com',
    subject: '', body: '',
    leadIds: [], sentLeadIds: [],
    contactIds: [], sentContactIds: [],
    dailyLimit: 20, status: 'draft',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

export default function LeadCampaigns({ leads, contacts, onContactsChange, warmupAddresses = [] }: Props) {
  const [campaigns,    setCampaigns]    = useState<Campaign[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [topTab,       setTopTab]       = useState<TopTab>('campaigns');
  const [screen,       setScreen]       = useState<Screen>('list');
  const [detailId,     setDetailId]     = useState<string | null>(null);
  const [form,         setForm]         = useState<Campaign>(blankCampaign());
  const [recipTab,     setRecipTab]     = useState<RecipTab>('leads');
  const [saving,       setSaving]       = useState(false);
  const [sending,      setSending]      = useState(false);
  const [sendMsg,      setSendMsg]      = useState<string | null>(null);
  const warmupAddrs = warmupAddresses;
  const [warmupCopies, setWarmupCopies] = useState(1);
  const [showPreview,  setShowPreview]  = useState(false);
  const [leadSearch,   setLeadSearch]   = useState('');
  const [stageFilter,  setStageFilter]  = useState('');
  const [contSearch,   setContSearch]   = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [contImportOpen, setContImportOpen] = useState(false);
  const [contactSearch,  setContactSearch]  = useState('');
  const [contactCatFilter, setContactCatFilter] = useState('');

  useEffect(() => {
    fetchCampaigns()
      .then(c => setCampaigns(c))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const detailCampaign = campaigns.find(c => c.id === detailId) ?? null;

  // Filtered leads/contacts for compose picker
  const filteredLeads = useMemo(() => {
    const q = leadSearch.toLowerCase();
    return leads.filter(l => {
      if (!l.email) return false;
      const ms = !q || l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || (l.propertyAddress ?? '').toLowerCase().includes(q);
      const mst = !stageFilter || l.stage === stageFilter;
      return ms && mst;
    });
  }, [leads, leadSearch, stageFilter]);

  const filteredContacts = useMemo(() => {
    const q = contSearch.toLowerCase();
    return contacts.filter(c => {
      if (!c.email) return false;
      const ms = !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
      const mc = !catFilter || c.category === catFilter;
      return ms && mc;
    });
  }, [contacts, contSearch, catFilter]);

  // Contacts list tab filtering
  const visibleContacts = useMemo(() => {
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => {
      const ms = !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
      const mc = !contactCatFilter || c.category === contactCatFilter;
      return ms && mc;
    });
  }, [contacts, contactSearch, contactCatFilter]);

  const existingContactEmails = useMemo(
    () => new Set(contacts.map(c => c.email.toLowerCase()).filter(Boolean)),
    [contacts],
  );

  function openCompose(c?: Campaign) {
    setForm(c ? { ...c } : blankCampaign());
    setLeadSearch(''); setStageFilter('');
    setContSearch(''); setCatFilter('');
    setRecipTab('leads');
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
    } catch (err) {
      alert(`Failed to save campaign: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setSaving(false); }
  }

  async function handleDeleteCampaign(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm('Delete this campaign?')) return;
    await deleteCampaign(id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
    if (detailId === id) setScreen('list');
  }

  async function handleDeleteContact(id: string) {
    if (!confirm('Delete this contact?')) return;
    await deleteContact(id);
    onContactsChange(contacts.filter(c => c.id !== id));
  }

  async function toggleStatus() {
    if (!detailCampaign) return;
    const newStatus: Campaign['status'] = detailCampaign.status === 'active' ? 'paused' : 'active';
    const updated: Campaign = { ...detailCampaign, status: newStatus, updatedAt: new Date().toISOString() };
    try {
      await upsertCampaign(updated);
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) {
      alert(`Failed to update campaign: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function sendBatch() {
    if (!detailCampaign) return;
    const sentLeadSet    = new Set(detailCampaign.sentLeadIds);
    const sentContactSet = new Set(detailCampaign.sentContactIds);

    const pendingLeads = detailCampaign.leadIds
      .map(id => leads.find(l => l.id === id))
      .filter((l): l is Lead => !!l && !!l.email && !sentLeadSet.has(l.id));

    const pendingContacts = detailCampaign.contactIds
      .map(id => contacts.find(c => c.id === id))
      .filter((c): c is Contact => !!c && !!c.email && !sentContactSet.has(c.id));

    // Interleave leads and contacts up to daily limit
    const allPending: Array<{ type: 'lead' | 'contact'; item: Lead | Contact }> = [
      ...pendingLeads.map(l => ({ type: 'lead' as const, item: l })),
      ...pendingContacts.map(c => ({ type: 'contact' as const, item: c })),
    ];
    const batch = allPending.slice(0, detailCampaign.dailyLimit);
    if (!batch.length) { setSendMsg('No pending recipients to send to.'); return; }

    const warmupBatch = warmupCopies > 0 && warmupAddrs.length > 0
      ? [...warmupAddrs].sort(() => Math.random() - 0.5).slice(0, Math.min(warmupCopies, warmupAddrs.length))
      : [];

    setSending(true);
    setSendMsg(null);
    try {
      const emails = [
        ...batch.map(({ item }) => ({
          to:            item.email,
          subject:       replaceTokens(detailCampaign.subject, item),
          html:          buildEmailHtml(replaceTokens(detailCampaign.body, item), detailCampaign.fromName),
          recipientName: item.name,
          leadId:        item.id,
        })),
        ...warmupBatch.map((email, i) => ({
          to:            email,
          subject:       replaceTokens(detailCampaign.subject, { name: 'Warmup', email, propertyAddress: '' }),
          html:          buildEmailHtml(replaceTokens(detailCampaign.body, { name: 'Warmup', email }), detailCampaign.fromName),
          recipientName: 'Warmup',
          leadId:        `warmup_${i}`,
        })),
      ];

      const resp = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lead-outreach',
          fromName: detailCampaign.fromName,
          replyTo:  detailCampaign.replyTo,
          campaignId: detailCampaign.id,
          emails,
        }),
      });
      const result = await resp.json() as { sent?: number };

      const newSentLeadIds    = [...detailCampaign.sentLeadIds,    ...batch.filter(b => b.type === 'lead').map(b => b.item.id)];
      const newSentContactIds = [...detailCampaign.sentContactIds, ...batch.filter(b => b.type === 'contact').map(b => b.item.id)];
      const totalSent  = newSentLeadIds.length + newSentContactIds.length;
      const totalAll   = detailCampaign.leadIds.length + detailCampaign.contactIds.length;
      const allDone    = totalSent >= totalAll;
      const newStatus: Campaign['status'] = allDone ? 'completed' : (detailCampaign.status === 'draft' ? 'active' : detailCampaign.status);

      const updated: Campaign = {
        ...detailCampaign,
        sentLeadIds:    newSentLeadIds,
        sentContactIds: newSentContactIds,
        status:         newStatus,
        updatedAt:      new Date().toISOString(),
      };
      await upsertCampaign(updated);
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));

      const sentCount = result.sent ?? batch.length;
      setSendMsg(`✓ Sent to ${sentCount} recipient${sentCount !== 1 ? 's' : ''}${warmupBatch.length ? ` + ${warmupBatch.length} warmup` : ''}.${allDone ? ' Campaign complete!' : ''}`);
    } catch {
      setSendMsg('Send failed. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function resetSent() {
    if (!detailCampaign) return;
    if (!confirm('Reset sent list? All recipients will appear as pending again.')) return;
    const updated: Campaign = { ...detailCampaign, sentLeadIds: [], sentContactIds: [], status: 'draft', updatedAt: new Date().toISOString() };
    try {
      await upsertCampaign(updated);
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSendMsg(null);
    } catch (err) {
      alert(`Failed to reset campaign: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  const previewRecipient = useMemo(() => {
    // Find first selected lead or contact with email for preview
    const lead = form.leadIds.length ? leads.find(l => form.leadIds.includes(l.id) && l.email) : null;
    if (lead) return lead;
    const contact = form.contactIds.length ? contacts.find(c => form.contactIds.includes(c.id) && c.email) : null;
    return contact ?? null;
  }, [form.leadIds, form.contactIds, leads, contacts]);

  // ── COMPOSE ──────────────────────────────────────────────────────────────────
  if (screen === 'compose') {
    const isEdit = campaigns.some(c => c.id === form.id);
    const totalSelected = form.leadIds.length + form.contactIds.length;

    const allLeadsSelected = filteredLeads.length > 0 && filteredLeads.every(l => form.leadIds.includes(l.id));
    const allContsSelected = filteredContacts.length > 0 && filteredContacts.every(c => form.contactIds.includes(c.id));

    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto pb-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setScreen('list')} className="text-[#b8d4f0] hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Campaign' : 'New Campaign'}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Campaign Name</label>
            <input
              className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              placeholder="e.g. Realtor Referral Outreach — June"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

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
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Reply-To</label>
              <input
                className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                placeholder="you@example.com"
                value={form.replyTo}
                onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Subject Line</label>
            <input
              className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              placeholder="{{first_name}}, partnering with STR managers?"
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Email Body</label>
              {previewRecipient && (
                <button
                  onClick={() => setShowPreview(p => !p)}
                  className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#6aaff0] transition-colors"
                >
                  {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showPreview ? 'Edit' : 'Preview'}
                </button>
              )}
            </div>
            {showPreview && previewRecipient ? (
              <div className="bg-white rounded-lg border border-[#243550] overflow-auto" style={{ maxHeight: 280 }}>
                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-400 font-mono">Subject: </span>
                  <span className="text-xs text-gray-700 font-mono">{replaceTokens(form.subject, previewRecipient)}</span>
                </div>
                <div className="px-4 py-3">
                  {replaceTokens(form.body, previewRecipient).split('\n').map((line, i) => (
                    line ? <p key={i} className="text-sm text-gray-700 leading-relaxed mb-2">{line}</p>
                         : <div key={i} className="h-2" />
                  ))}
                </div>
              </div>
            ) : (
              <textarea
                className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none font-mono"
                rows={9}
                placeholder={`Hi {{first_name}},\n\nI'm reaching out because we manage short-term rentals and are always looking for great agent partners...\n\nBest,\nEthan`}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              />
            )}
            <p className="text-xs text-[#3a5070] mt-1">
              Tokens: <code className="text-[#4a90d9]">{'{{first_name}}'}</code> · <code className="text-[#4a90d9]">{'{{full_name}}'}</code> · <code className="text-[#4a90d9]">{'{{property}}'}</code>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Daily Send Limit</label>
            <div className="flex items-center gap-3">
              <input
                type="number" min={1} max={500}
                className="w-24 bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                value={form.dailyLimit}
                onChange={e => setForm(f => ({ ...f, dailyLimit: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
              <span className="text-sm text-[#3a5070]">emails per day</span>
            </div>
          </div>

          {/* Recipient selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Recipients</label>
              {totalSelected > 0 && (
                <span className="text-xs text-[#4a90d9] font-medium">{totalSelected} selected</span>
              )}
            </div>

            {/* Leads / Contacts tabs */}
            <div className="flex gap-1 bg-[#111d30] p-1 rounded-lg mb-3">
              {(['leads', 'contacts'] as RecipTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setRecipTab(t)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    recipTab === t ? 'bg-[#1e2d45] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'
                  }`}
                >
                  {t === 'leads' ? <><Send size={11} /> Pipeline Leads {form.leadIds.length > 0 && <span className="ml-1 bg-[#4a90d9] text-white text-[9px] px-1.5 py-0.5 rounded-full">{form.leadIds.length}</span>}</>
                                 : <><Users size={11} /> Contacts {form.contactIds.length > 0 && <span className="ml-1 bg-[#4ab57a] text-white text-[9px] px-1.5 py-0.5 rounded-full">{form.contactIds.length}</span>}</>}
                </button>
              ))}
            </div>

            {recipTab === 'leads' ? (
              <>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
                    <input
                      className="w-full bg-[#111d30] border border-[#243550] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                      placeholder="Search leads..."
                      value={leadSearch}
                      onChange={e => setLeadSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="bg-[#111d30] border border-[#243550] rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none"
                    value={stageFilter}
                    onChange={e => setStageFilter(e.target.value)}
                  >
                    {LEAD_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {filteredLeads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      leadIds: allLeadsSelected
                        ? f.leadIds.filter(id => !filteredLeads.find(l => l.id === id))
                        : [...new Set([...f.leadIds, ...filteredLeads.map(l => l.id)])],
                    }))}
                    className="text-xs text-[#4a90d9] hover:underline mb-2 block"
                  >
                    {allLeadsSelected ? `Deselect all ${filteredLeads.length}` : `Select all ${filteredLeads.length} filtered`}
                  </button>
                )}
                <div className="bg-[#111d30] border border-[#243550] rounded-lg divide-y divide-[#1e2d45]" style={{ maxHeight: 240, overflow: 'auto' }}>
                  {filteredLeads.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[#3a5070]">
                      {leads.filter(l => l.email).length === 0 ? 'No leads with emails in Pipeline' : 'No leads match filter'}
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
              </>
            ) : (
              <>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
                    <input
                      className="w-full bg-[#111d30] border border-[#243550] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                      placeholder="Search contacts..."
                      value={contSearch}
                      onChange={e => setContSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="bg-[#111d30] border border-[#243550] rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none"
                    value={catFilter}
                    onChange={e => setCatFilter(e.target.value)}
                  >
                    {CONTACT_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                {filteredContacts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      contactIds: allContsSelected
                        ? f.contactIds.filter(id => !filteredContacts.find(c => c.id === id))
                        : [...new Set([...f.contactIds, ...filteredContacts.map(c => c.id)])],
                    }))}
                    className="text-xs text-[#4ab57a] hover:underline mb-2 block"
                  >
                    {allContsSelected ? `Deselect all ${filteredContacts.length}` : `Select all ${filteredContacts.length} filtered`}
                  </button>
                )}
                <div className="bg-[#111d30] border border-[#243550] rounded-lg divide-y divide-[#1e2d45]" style={{ maxHeight: 240, overflow: 'auto' }}>
                  {filteredContacts.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[#3a5070]">
                      {contacts.length === 0 ? 'No contacts yet — add them in the Contacts tab' : 'No contacts match filter'}
                    </div>
                  ) : filteredContacts.map(contact => {
                    const selected = form.contactIds.includes(contact.id);
                    return (
                      <label key={contact.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#1a2335] cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-[#4ab57a] flex-shrink-0"
                          checked={selected}
                          onChange={() => setForm(f => ({
                            ...f,
                            contactIds: selected ? f.contactIds.filter(id => id !== contact.id) : [...f.contactIds, contact.id],
                          }))}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{contact.name}</div>
                          <div className="text-xs text-[#3a5070] truncate">{contact.email}</div>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${CATEGORY_COLORS[contact.category]}`}>
                          {CATEGORY_LABELS[contact.category]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
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
    const sentLeadSet    = new Set(c.sentLeadIds);
    const sentContactSet = new Set(c.sentContactIds);

    const campLeads    = c.leadIds.map(id => leads.find(l => l.id === id)).filter((l): l is Lead => !!l);
    const campContacts = c.contactIds.map(id => contacts.find(ct => ct.id === id)).filter((ct): ct is Contact => !!ct);

    const pendingLeads    = campLeads.filter(l => l.email && !sentLeadSet.has(l.id));
    const pendingContacts = campContacts.filter(ct => ct.email && !sentContactSet.has(ct.id));
    const totalPending    = pendingLeads.length + pendingContacts.length;
    const nextBatch       = [...pendingLeads, ...pendingContacts].slice(0, c.dailyLimit);
    const effectiveWarmup = Math.min(warmupCopies, warmupAddrs.length);
    const totalAll        = c.leadIds.length + c.contactIds.length;
    const totalSent       = c.sentLeadIds.length + c.sentContactIds.length;

    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setScreen('list')} className="text-[#b8d4f0] hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="flex-1 text-lg font-bold text-white truncate">{c.name}</h2>
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${STATUS_PILL[c.status]}`}>{c.status}</span>
        </div>

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
            onClick={() => handleDeleteCampaign(c.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1e2d45] text-[#b8d4f0] hover:bg-[#2a0e0e] hover:text-[#e05c5c] transition-colors"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: 'Total', value: totalAll },
            { label: 'Sent',  value: totalSent },
            { label: 'Pending', value: totalPending },
            { label: 'Limit/day', value: c.dailyLimit },
          ].map(s => (
            <div key={s.label} className="bg-[#1a2335] rounded-xl p-3 text-center border border-[#243550]">
              <div className="text-lg font-bold text-white">{s.value}</div>
              <div className="text-[10px] text-[#3a5070] mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Warmup */}
        <div className="bg-[#1a2335] rounded-xl border border-[#243550] p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-[#f0a940]" />
            <span className="text-sm font-semibold text-white">Email Warmup</span>
          </div>
          {warmupAddrs.length > 0 ? (
            <>
              <p className="text-xs text-[#b8d4f0] mb-3 leading-relaxed">
                {warmupAddrs.length} seed address{warmupAddrs.length > 1 ? 'es' : ''} active — mixing warmup copies boosts inbox placement.
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
            <p className="text-xs text-[#3a5070]">Add seed addresses in Email Tracking → Warmup to enable mixing.</p>
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
              {totalPending > 0 && (
                <span className="text-xs text-[#3a5070]">{nextBatch.length} of {totalPending} pending</span>
              )}
            </div>
            {totalPending === 0 ? (
              <div className="flex items-center gap-2 text-sm text-[#4ab57a]">
                <CheckCircle2 size={15} />
                All recipients contacted — campaign complete!
              </div>
            ) : (
              <>
                <div className="space-y-1.5 mb-3">
                  {nextBatch.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#4a90d9] flex-shrink-0" />
                      <span className="text-xs text-white font-medium">{r.name}</span>
                      <span className="text-xs text-[#3a5070] truncate">{r.email}</span>
                    </div>
                  ))}
                  {nextBatch.length > 4 && <div className="text-xs text-[#3a5070] pl-3.5">+ {nextBatch.length - 4} more</div>}
                  {effectiveWarmup > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Flame size={11} className="text-[#f0a940] flex-shrink-0" />
                      <span className="text-xs text-[#f0a940]">{effectiveWarmup} warmup cop{effectiveWarmup > 1 ? 'ies' : 'y'} included</span>
                    </div>
                  )}
                </div>
                {sendMsg && (
                  <p className={`text-xs mb-3 font-medium ${sendMsg.startsWith('✓') ? 'text-[#4ab57a]' : 'text-[#e05c5c]'}`}>{sendMsg}</p>
                )}
                <button
                  onClick={sendBatch}
                  disabled={sending || c.status === 'paused'}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={14} />
                  {sending ? 'Sending…' : `Send to ${nextBatch.length}${effectiveWarmup > 0 ? ` + ${effectiveWarmup} warmup` : ''}`}
                </button>
                {c.status === 'paused' && <p className="text-xs text-[#f0a940] mt-2">Campaign is paused. Activate to send.</p>}
              </>
            )}
          </div>
        )}

        {totalSent > 0 && (
          <div className="mb-5">
            <button onClick={resetSent} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#b8d4f0] transition-colors">
              <RefreshCw size={11} /> Reset sent list
            </button>
          </div>
        )}

        {/* Recipient lists */}
        {campLeads.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2">Pipeline Leads ({campLeads.length})</h3>
            <div className="bg-[#1a2335] rounded-xl border border-[#243550] divide-y divide-[#243550]">
              {campLeads.map(lead => {
                const sent = sentLeadSet.has(lead.id);
                return (
                  <div key={lead.id} className="flex items-center gap-3 px-4 py-3">
                    {sent ? <CheckCircle2 size={14} className="text-[#4ab57a] flex-shrink-0" /> : <Clock size={14} className="text-[#3a5070] flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium">{lead.name}</div>
                      <div className="text-xs text-[#3a5070] truncate">{lead.email}</div>
                    </div>
                    <span className={`text-[10px] font-semibold ${sent ? 'text-[#4ab57a]' : 'text-[#3a5070]'}`}>{sent ? 'sent' : 'pending'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {campContacts.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2">Contacts ({campContacts.length})</h3>
            <div className="bg-[#1a2335] rounded-xl border border-[#243550] divide-y divide-[#243550]">
              {campContacts.map(ct => {
                const sent = sentContactSet.has(ct.id);
                return (
                  <div key={ct.id} className="flex items-center gap-3 px-4 py-3">
                    {sent ? <CheckCircle2 size={14} className="text-[#4ab57a] flex-shrink-0" /> : <Clock size={14} className="text-[#3a5070] flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium">{ct.name}</div>
                      <div className="text-xs text-[#3a5070] truncate">{ct.email}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${CATEGORY_COLORS[ct.category]}`}>
                      {CATEGORY_LABELS[ct.category]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TOP-LEVEL TABS (list view) ────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-[#111d30] p-1 rounded-xl mb-5 max-w-xs">
        {(['campaigns', 'contacts'] as TopTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTopTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
              topTab === t ? 'bg-[#1e2d45] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'
            }`}
          >
            {t === 'campaigns' ? `Campaigns${campaigns.length > 0 ? ` (${campaigns.length})` : ''}` : `Contacts${contacts.length > 0 ? ` (${contacts.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── CAMPAIGNS LIST ──────────────────────────────────────────── */}
      {topTab === 'campaigns' && (
        <>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold text-white">Lead Campaigns</h1>
              <p className="text-sm text-[#3a5070] mt-0.5">Email outreach to leads &amp; referral contacts</p>
            </div>
            <button
              onClick={() => openCompose()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] transition-colors"
            >
              <Plus size={15} /> New Campaign
            </button>
          </div>

          {warmupAddrs.length > 0 && (
            <div className="bg-[#162a1e] border border-[#1e4530] rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
              <Flame size={15} className="text-[#4ab57a] flex-shrink-0" />
              <p className="text-xs text-[#4ab57a] leading-relaxed">
                <strong>{warmupAddrs.length} warmup address{warmupAddrs.length > 1 ? 'es' : ''} active</strong> — sends include warmup copies to improve inbox placement.
              </p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-sm text-[#3a5070]">Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="bg-[#1a2335] border border-[#243550] rounded-2xl px-6 py-16 text-center">
              <Mail size={36} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">No campaigns yet</p>
              <p className="text-sm text-[#3a5070] mb-5">Create a campaign and target pipeline leads or contacts.</p>
              <button onClick={() => openCompose()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] transition-colors">
                <Plus size={15} /> New Campaign
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => {
                const totalAll  = c.leadIds.length + c.contactIds.length;
                const totalSent = c.sentLeadIds.length + c.sentContactIds.length;
                const pct = totalAll > 0 ? Math.round((totalSent / totalAll) * 100) : 0;
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
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_PILL[c.status]}`}>{c.status}</span>
                        </div>
                        <p className="text-xs text-[#3a5070] truncate mb-2.5">{c.subject}</p>
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="text-xs text-[#b8d4f0]"><strong className="text-white">{totalAll}</strong> recipients</span>
                          <span className="text-xs text-[#4ab57a]"><strong>{totalSent}</strong> sent</span>
                          <span className="text-xs text-[#3a5070]"><strong>{totalAll - totalSent}</strong> pending</span>
                          {c.contactIds.length > 0 && <span className="text-xs text-[#4ab57a]"><strong>{c.contactIds.length}</strong> contacts</span>}
                        </div>
                        {totalAll > 0 && (
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
                          onClick={e => handleDeleteCampaign(c.id, e)}
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
        </>
      )}

      {/* ── CONTACTS LIST ──────────────────────────────────────────── */}
      {topTab === 'contacts' && (
        <>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold text-white">Contacts</h1>
              <p className="text-sm text-[#3a5070] mt-0.5">Agents, investors &amp; referral partners</p>
            </div>
            <button
              onClick={() => setContImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4ab57a] text-white hover:bg-[#3aa56a] transition-colors"
            >
              <Upload size={15} /> Import
            </button>
          </div>

          {/* Search + filter */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
              <input
                className="w-full bg-[#1a2335] border border-[#243550] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                placeholder="Search contacts..."
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
              />
            </div>
            <select
              className="bg-[#1a2335] border border-[#243550] rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none"
              value={contactCatFilter}
              onChange={e => setContactCatFilter(e.target.value)}
            >
              {CONTACT_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {contacts.length === 0 ? (
            <div className="bg-[#1a2335] border border-[#243550] rounded-2xl px-6 py-16 text-center">
              <Users size={36} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">No contacts yet</p>
              <p className="text-sm text-[#3a5070] mb-5">Import real estate agents, investors, or referral partners to run campaigns to them.</p>
              <button onClick={() => setContImportOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4ab57a] text-white hover:bg-[#3aa56a] transition-colors">
                <Upload size={15} /> Import Contacts
              </button>
            </div>
          ) : visibleContacts.length === 0 ? (
            <div className="text-center py-10 text-sm text-[#3a5070]">No contacts match filter</div>
          ) : (
            <div className="bg-[#1a2335] border border-[#243550] rounded-xl divide-y divide-[#243550]">
              {visibleContacts.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-8 h-8 rounded-full bg-[#1e2d45] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#4a90d9]">{c.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">{c.name}</div>
                    <div className="text-xs text-[#3a5070]">{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${CATEGORY_COLORS[c.category]}`}>
                    {CATEGORY_LABELS[c.category]}
                  </span>
                  <button
                    onClick={() => handleDeleteContact(c.id)}
                    className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {contacts.length > 0 && (
            <p className="text-xs text-[#3a5070] mt-3 text-center">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} total</p>
          )}
        </>
      )}

      {contImportOpen && (
        <LeadImportModal
          mode="contacts"
          existingEmails={existingContactEmails}
          onImportContacts={async (newContacts) => {
            for (const c of newContacts) await upsertContact(c);
            onContactsChange([...newContacts, ...contacts]);
          }}
          onClose={() => setContImportOpen(false)}
        />
      )}
    </div>
  );
}

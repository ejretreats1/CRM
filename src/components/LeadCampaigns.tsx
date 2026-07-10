import { useState, useEffect, useMemo } from 'react';
import {
  Mail, Plus, Edit2, Trash2, Send, ChevronLeft,
  Eye, EyeOff, Flame, CheckCircle2, Clock, Search,
  Play, Pause, RefreshCw, Users, Upload, Zap, CheckCircle, X,
} from 'lucide-react';
import type { Lead, Contact, ContactCategory } from '../types';
import type { Campaign } from '../services/campaigns';
import { fetchCampaigns, upsertCampaign, deleteCampaign } from '../services/campaigns';
import { upsertContact, deleteContact } from '../services/contacts';
import { fetchCleaningLeads } from '../services/cleaningDb';
import type { CleaningLead } from '../services/cleaningDb';
import LeadImportModal from './modals/LeadImportModal';

interface Props {
  leads: Lead[];
  contacts: Contact[];
  onContactsChange: (contacts: Contact[]) => void;
  warmupAddresses?: string[];
}

type TopTab   = 'campaigns' | 'sequences' | 'templates' | 'contacts';
type Screen   = 'list' | 'compose' | 'detail';
type RecipTab = 'leads' | 'contacts' | 'scraped';

interface LeadTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface PMSequenceStep {
  step_number: number;
  template_id: string;
  delay_days: number;
}

interface PMSequence {
  id: string;
  name: string;
  steps: PMSequenceStep[];
  created_at: string;
  active_count: number;
  due_count: number;
  completed_count: number;
}

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


function replaceTokens(text: string, r: { name: string; email: string; propertyAddress?: string; company?: string }): string {
  const firstName = (r.name ?? '').split(' ')[0] || r.name;
  return text
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{full_name\}\}/gi,  r.name ?? '')
    .replace(/\{\{property\}\}/gi,   r.propertyAddress ?? r.company ?? '')
    .replace(/\{\{company\}\}/gi,    r.company ?? r.propertyAddress ?? '')
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
    scrapedLeadIds: [], sentScrapedLeadIds: [],
    followUpSteps: [], linkedSequenceId: '',
    dailyLimit: 20, status: 'draft',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

// ── Lead Template Modal ───────────────────────────────────────────────────────

function LeadTemplateModal({ template, onClose, onSave }: {
  template: Partial<LeadTemplate>;
  onClose: () => void;
  onSave: (t: { id?: string; name: string; subject: string; body: string }) => Promise<void>;
}) {
  const [name, setName] = useState(template.name ?? '');
  const [subject, setSubject] = useState(template.subject ?? '');
  const [body, setBody] = useState(template.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim() || !subject.trim() || !body.trim()) { setError('All fields required.'); return; }
    setSaving(true); setError('');
    try { await onSave({ id: template.id, name: name.trim(), subject: subject.trim(), body: body.trim() }); onClose(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#1a2335] border border-[#243550] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550] flex-shrink-0">
          <h2 className="font-bold text-white">{template.id ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-white text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Template Name</label>
            <input className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={name} onChange={e => setName(e.target.value)} placeholder="PM Follow-Up #1" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Subject Line</label>
            <input className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={subject} onChange={e => setSubject(e.target.value)} placeholder="Following up, {{first_name}}" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1">Body</label>
            <p className="text-xs text-[#3a5070] mb-1.5">Tokens: <code className="text-[#4a90d9]">{'{{first_name}}'}</code> · <code className="text-[#4a90d9]">{'{{full_name}}'}</code> · <code className="text-[#4a90d9]">{'{{property}}'}</code> · <code className="text-[#4a90d9]">{'{{company}}'}</code></p>
            <textarea rows={10} className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none font-mono leading-relaxed"
              value={body} onChange={e => setBody(e.target.value)} placeholder={`Hi {{first_name}},\n\nJust following up on my previous email...`} />
          </div>
          {error && <p className="text-xs text-[#e05c5c]">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#111d30] border border-[#243550] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !subject.trim() || !body.trim()}
            className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#3a7bc8] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lead Sequence Modal ───────────────────────────────────────────────────────

function LeadSequenceModal({ sequence, templates, onClose, onSave }: {
  sequence: Partial<PMSequence>;
  templates: LeadTemplate[];
  onClose: () => void;
  onSave: (s: { id?: string; name: string; steps: PMSequenceStep[] }) => Promise<void>;
}) {
  const [name, setName] = useState(sequence.name ?? '');
  const [steps, setSteps] = useState<PMSequenceStep[]>(
    sequence.steps?.length ? sequence.steps : [{ step_number: 1, template_id: '', delay_days: 3 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addStep() {
    const maxDelay = steps.length ? Math.max(...steps.map(s => s.delay_days)) : 0;
    setSteps(prev => [...prev, { step_number: prev.length + 1, template_id: '', delay_days: maxDelay + 4 }]);
  }
  function removeStep(i: number) { setSteps(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 }))); }
  function updateStep(i: number, field: keyof PMSequenceStep, value: string | number) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name required.'); return; }
    if (steps.some(s => !s.template_id)) { setError('Every step needs a template.'); return; }
    setSaving(true); setError('');
    try { await onSave({ id: sequence.id, name: name.trim(), steps }); onClose(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#1a2335] border border-[#243550] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550] flex-shrink-0">
          <h2 className="font-bold text-white">{sequence.id ? 'Edit Sequence' : 'New Follow-Up Sequence'}</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-white text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Sequence Name</label>
            <input className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={name} onChange={e => setName(e.target.value)} placeholder="PM Realtor Follow-Up" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Follow-Up Steps</p>
              <p className="text-[10px] text-[#3a5070]">Days = days after enrollment</p>
            </div>
            {steps.map((step, i) => (
              <div key={i} className="bg-[#111d30] border border-[#243550] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#4a90d9]">Follow-Up {i + 1}</span>
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(i)} className="text-[#3a5070] hover:text-[#e05c5c]"><X size={13} /></button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-[#3a5070] mb-1">Template</label>
                    <select className="w-full bg-[#1a2335] border border-[#243550] rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[#4a90d9]"
                      value={step.template_id} onChange={e => updateStep(i, 'template_id', e.target.value)}>
                      <option value="">— Pick template —</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#3a5070] mb-1">Send on Day</label>
                    <input type="number" min="1" max="365"
                      className="w-full bg-[#1a2335] border border-[#243550] rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[#4a90d9]"
                      value={step.delay_days} onChange={e => updateStep(i, 'delay_days', Math.max(1, parseInt(e.target.value) || 1))} />
                  </div>
                </div>
                {step.template_id && (
                  <p className="text-[10px] text-[#3a5070]">
                    Sends <span className="text-[#d0954a] font-semibold">Day {step.delay_days}</span> after enrollment ·{' '}
                    <span className="text-[#b8d4f0]">{templates.find(t => t.id === step.template_id)?.subject}</span>
                  </p>
                )}
              </div>
            ))}
            <button onClick={addStep} className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-[#6ab0f9] font-semibold transition-colors">
              <Plus size={13} /> Add Another Follow-Up
            </button>
          </div>
          {error && <p className="text-xs text-[#e05c5c]">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#111d30] border border-[#243550] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#3a7bc8] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Sequence'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lead Enroll Modal ─────────────────────────────────────────────────────────

function LeadEnrollModal({ sequence, campaigns, onClose, onEnroll }: {
  sequence: PMSequence;
  campaigns: Campaign[];
  onClose: () => void;
  onEnroll: (sequenceId: string, campaignId: string) => Promise<{ enrolled: number; skipped: number }>;
}) {
  const [campaignId, setCampaignId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null);
  const [error, setError] = useState('');

  const sentCampaigns = campaigns.filter(c =>
    c.sentLeadIds.length + c.sentContactIds.length + (c.sentScrapedLeadIds?.length ?? 0) > 0
  );
  const selected = sentCampaigns.find(c => c.id === campaignId);
  const firstStep = sequence.steps?.sort((a, b) => a.delay_days - b.delay_days)[0];
  const totalSent = selected ? selected.sentLeadIds.length + selected.sentContactIds.length + (selected.sentScrapedLeadIds?.length ?? 0) : 0;

  async function handleEnroll() {
    if (!campaignId) return;
    setLoading(true); setError('');
    try { setResult(await onEnroll(sequence.id, campaignId)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Enrollment failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#1a2335] border border-[#243550] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550]">
          <div>
            <h2 className="font-bold text-white">Enroll in Sequence</h2>
            <p className="text-xs text-[#3a5070] mt-0.5">{sequence.name}</p>
          </div>
          <button onClick={onClose} className="text-[#3a5070] hover:text-white text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          {result ? (
            <div className="bg-[#0a2518] border border-[#1e4030] rounded-xl px-4 py-4 text-center space-y-2">
              <CheckCircle size={24} className="text-[#4ab57a] mx-auto" />
              <p className="text-white font-semibold">{result.enrolled} recipients enrolled</p>
              {result.skipped > 0 && <p className="text-xs text-[#3a5070]">{result.skipped} skipped (already enrolled)</p>}
              <p className="text-xs text-[#3a5070]">Follow-ups will send on their scheduled days. Click "Send X Due" to send them.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5">Pick the original campaign</label>
                <select className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                  value={campaignId} onChange={e => setCampaignId(e.target.value)}>
                  <option value="">— Select campaign —</option>
                  {sentCampaigns.map(c => {
                    const cnt = c.sentLeadIds.length + c.sentContactIds.length + (c.sentScrapedLeadIds?.length ?? 0);
                    return <option key={c.id} value={c.id}>{c.name} ({cnt} sent)</option>;
                  })}
                </select>
                {sentCampaigns.length === 0 && <p className="text-xs text-[#d0954a] mt-1">No sent campaigns. Send a campaign batch first.</p>}
              </div>
              {selected && firstStep && (
                <div className="bg-[#0d1e35] border border-[#1e3a5a] rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold text-[#4a90d9]">Preview</p>
                  <p className="text-xs text-[#b8d4f0]">{totalSent} sent recipients will be enrolled</p>
                  <p className="text-xs text-[#3a5070]">Follow-ups send Day {firstStep.delay_days} after today (enrollment date)</p>
                  {sequence.steps.sort((a, b) => a.delay_days - b.delay_days).map(s => (
                    <p key={s.step_number} className="text-xs text-[#3a5070]">· Day {s.delay_days}: Follow-Up {s.step_number}</p>
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-[#e05c5c]">{error}</p>}
            </>
          )}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#111d30] border border-[#243550] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={handleEnroll} disabled={!campaignId || loading}
              className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#3a7bc8] disabled:opacity-50 transition-colors">
              {loading ? 'Enrolling…' : 'Enroll Recipients'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
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
  const [scrapedLeads,   setScrapedLeads]   = useState<CleaningLead[]>([]);
  const [scrapedSearch,  setScrapedSearch]  = useState('');
  const [leadTemplates,  setLeadTemplates]  = useState<LeadTemplate[]>([]);
  const [templateModal,  setTemplateModal]  = useState<Partial<LeadTemplate> | null>(null);
  const [sequences,      setSequences]      = useState<PMSequence[]>([]);
  const [sequenceModal,  setSequenceModal]  = useState<Partial<PMSequence> | null>(null);
  const [enrollModal,    setEnrollModal]    = useState<PMSequence | null>(null);
  const [sendingDue,     setSendingDue]     = useState<string | null>(null);
  const [dueResult,      setDueResult]      = useState<{ sent: number } | null>(null);
  const [seqSetupCopied, setSeqSetupCopied] = useState(false);
  const [autoSending,    setAutoSending]    = useState(false);
  const [autoSendResult, setAutoSendResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchCampaigns(),
      fetchCleaningLeads().catch(() => [] as CleaningLead[]),
      fetch('/api/send-newsletter?action=lead-sequences').then(r => r.json()).catch(() => ({ sequences: [] })),
      fetch('/api/send-newsletter?action=lead-templates').then(r => r.json()).catch(() => ({ templates: [] })),
    ]).then(([camps, cls, seqData, tplData]) => {
      setCampaigns(camps);
      setScrapedLeads(cls.filter((l: CleaningLead) => l.source === 'Scraped List'));
      setSequences(seqData.sequences ?? []);
      setLeadTemplates(tplData.templates ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
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
    const sentScrapedSet = new Set(detailCampaign.sentScrapedLeadIds ?? []);

    const pendingLeads = detailCampaign.leadIds
      .map(id => leads.find(l => l.id === id))
      .filter((l): l is Lead => !!l && !!l.email && !sentLeadSet.has(l.id));

    const pendingContacts = detailCampaign.contactIds
      .map(id => contacts.find(c => c.id === id))
      .filter((c): c is Contact => !!c && !!c.email && !sentContactSet.has(c.id));

    const pendingScraped = (detailCampaign.scrapedLeadIds ?? [])
      .map(id => scrapedLeads.find(l => l.id === id))
      .filter((l): l is CleaningLead => !!l && !!l.email && !sentScrapedSet.has(l.id));

    const allPending: Array<{ type: 'lead' | 'contact' | 'scraped'; item: Lead | Contact | CleaningLead }> = [
      ...pendingLeads.map(l => ({ type: 'lead' as const, item: l })),
      ...pendingContacts.map(c => ({ type: 'contact' as const, item: c })),
      ...pendingScraped.map(l => ({ type: 'scraped' as const, item: l })),
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
        ...batch.map(({ type, item }) => {
          const r = type === 'scraped'
            ? { name: item.name, email: item.email, company: (item as CleaningLead).company }
            : { name: item.name, email: item.email, propertyAddress: (item as Lead).propertyAddress };
          return {
            to:            item.email,
            subject:       replaceTokens(detailCampaign.subject, r),
            html:          buildEmailHtml(replaceTokens(detailCampaign.body, r), detailCampaign.fromName),
            recipientName: item.name,
            leadId:        item.id,
          };
        }),
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

      const newSentLeadIds      = [...detailCampaign.sentLeadIds,    ...batch.filter(b => b.type === 'lead').map(b => b.item.id)];
      const newSentContactIds   = [...detailCampaign.sentContactIds, ...batch.filter(b => b.type === 'contact').map(b => b.item.id)];
      const newSentScrapedIds   = [...(detailCampaign.sentScrapedLeadIds ?? []), ...batch.filter(b => b.type === 'scraped').map(b => b.item.id)];
      const totalSent  = newSentLeadIds.length + newSentContactIds.length + newSentScrapedIds.length;
      const totalAll   = detailCampaign.leadIds.length + detailCampaign.contactIds.length + (detailCampaign.scrapedLeadIds?.length ?? 0);
      const allDone    = totalSent >= totalAll;
      const newStatus: Campaign['status'] = allDone ? 'completed' : (detailCampaign.status === 'draft' ? 'active' : detailCampaign.status);

      let updated: Campaign = {
        ...detailCampaign,
        sentLeadIds:        newSentLeadIds,
        sentContactIds:     newSentContactIds,
        sentScrapedLeadIds: newSentScrapedIds,
        status:             newStatus,
        updatedAt:          new Date().toISOString(),
      };
      await upsertCampaign(updated);
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));

      const sentCount = result.sent ?? batch.length;

      // Auto-enroll in follow-up sequence if steps defined
      if (detailCampaign.followUpSteps.length > 0) {
        try {
          const seqRes = await fetch('/api/send-newsletter', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upsert-lead-sequence',
              id: updated.linkedSequenceId || undefined,
              name: `${detailCampaign.name} — Follow-Ups`,
              steps: detailCampaign.followUpSteps,
            }),
          });
          const seqData = await seqRes.json();
          const seqId: string = seqData.id;
          if (seqId && !updated.linkedSequenceId) {
            updated = { ...updated, linkedSequenceId: seqId };
            await upsertCampaign(updated);
            setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
          }
          const justSent = batch
            .filter(b => b.type !== 'scraped' ? true : true)
            .map(b => ({ email: b.item.email, name: b.item.name }));
          await fetch('/api/send-newsletter', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'enroll-lead-sequence',
              sequenceId: seqId,
              campaignId: detailCampaign.id,
              fromName: detailCampaign.fromName,
              replyTo: detailCampaign.replyTo,
              recipients: justSent,
            }),
          });
          await reloadSequences();
        } catch { /* non-fatal */ }
      }

      setSendMsg(`✓ Sent to ${sentCount} recipient${sentCount !== 1 ? 's' : ''}${warmupBatch.length ? ` + ${warmupBatch.length} warmup` : ''}${detailCampaign.followUpSteps.length > 0 ? ' · enrolled in follow-up sequence' : ''}.${allDone ? ' Campaign complete!' : ''}`);
    } catch {
      setSendMsg('Send failed. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function resetSent() {
    if (!detailCampaign) return;
    if (!confirm('Reset sent list? All recipients will appear as pending again.')) return;
    const updated: Campaign = { ...detailCampaign, sentLeadIds: [], sentContactIds: [], sentScrapedLeadIds: [], status: 'draft', updatedAt: new Date().toISOString() };
    try {
      await upsertCampaign(updated);
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSendMsg(null);
    } catch (err) {
      alert(`Failed to reset campaign: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async function runAutoSend() {
    setAutoSending(true);
    setAutoSendResult(null);
    try {
      const r = await fetch('/api/send-newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto-send-campaigns' }),
      });
      const d = await r.json();
      if (!r.ok) { setAutoSendResult(`Error: ${d.error ?? 'Unknown'}`); return; }
      const sent = (d.results ?? []).reduce((s: number, x: { sent?: number }) => s + (x.sent ?? 0), 0);
      const active = (d.results ?? []).filter((x: { sent?: number }) => (x.sent ?? 0) > 0).length;
      setAutoSendResult(sent > 0
        ? `✓ Sent ${sent} emails across ${active} campaign${active !== 1 ? 's' : ''}${d.seqSent > 0 ? ` + ${d.seqSent} follow-ups` : ''}`
        : 'No pending recipients in any active campaign.');
      const camps = await fetchCampaigns();
      setCampaigns(camps);
    } catch (e) {
      setAutoSendResult(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setAutoSending(false);
    }
  }

  async function reloadSequences() {
    const r = await fetch('/api/send-newsletter?action=lead-sequences');
    const d = await r.json();
    setSequences(d.sequences ?? []);
  }

  async function handleSaveTemplate(t: { id?: string; name: string; subject: string; body: string }) {
    const r = await fetch('/api/send-newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert-lead-template', ...t }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Save failed.');
    const r2 = await fetch('/api/send-newsletter?action=lead-templates');
    const d2 = await r2.json();
    setLeadTemplates(d2.templates ?? []);
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch('/api/send-newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-lead-template', id }),
    });
    setLeadTemplates(prev => prev.filter(t => t.id !== id));
  }

  async function handleSaveSequence(s: { id?: string; name: string; steps: PMSequenceStep[] }) {
    const r = await fetch('/api/send-newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert-lead-sequence', ...s }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Save failed.');
    await reloadSequences();
  }

  async function handleDeleteSequence(id: string) {
    if (!confirm('Delete this sequence and all enrollments?')) return;
    await fetch('/api/send-newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-lead-sequence', id }),
    });
    setSequences(prev => prev.filter(s => s.id !== id));
  }

  async function handleEnrollSequence(sequenceId: string, campaignId: string) {
    const camp = campaigns.find(c => c.id === campaignId);
    if (!camp) throw new Error('Campaign not found.');
    const recipients: Array<{ email: string; name: string }> = [];
    for (const id of camp.sentLeadIds) {
      const l = leads.find(l => l.id === id);
      if (l?.email) recipients.push({ email: l.email, name: l.name });
    }
    for (const id of camp.sentContactIds) {
      const c = contacts.find(c => c.id === id);
      if (c?.email) recipients.push({ email: c.email, name: c.name });
    }
    for (const id of (camp.sentScrapedLeadIds ?? [])) {
      const l = scrapedLeads.find(l => l.id === id);
      if (l?.email) recipients.push({ email: l.email, name: l.name });
    }
    if (!recipients.length) throw new Error('No sent recipients found in this campaign.');
    const r = await fetch('/api/send-newsletter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'enroll-lead-sequence', sequenceId, campaignId, fromName: camp.fromName, replyTo: camp.replyTo, recipients }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Enrollment failed.');
    await reloadSequences();
    return { enrolled: d.enrolled ?? 0, skipped: d.skipped ?? 0 };
  }

  async function handleSendDue(sequenceId?: string) {
    const key = sequenceId ?? '__all__';
    setSendingDue(key);
    setDueResult(null);
    try {
      const r = await fetch('/api/send-newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-due-lead-sequences', sequenceId: sequenceId ?? null, batchSize: 50 }),
      });
      const d = await r.json();
      setDueResult({ sent: d.sent ?? 0 });
      await reloadSequences();
    } finally { setSendingDue(null); }
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

          {/* Template picker */}
          {leadTemplates.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Use Template</label>
              <select
                className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                value=""
                onChange={e => {
                  const tpl = leadTemplates.find(t => t.id === e.target.value);
                  if (tpl) setForm(f => ({ ...f, subject: tpl.subject, body: tpl.body }));
                }}
              >
                <option value="">— Load a saved template —</option>
                {leadTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="text-xs text-[#3a5070] mt-1">Selecting a template fills in the subject and body below — you can still edit them after.</p>
            </div>
          )}

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

          {/* Follow-Up Steps */}
          <div className="bg-[#111d30] border border-[#243550] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Follow-Up Sequence</p>
                <p className="text-[10px] text-[#3a5070] mt-0.5">Recipients auto-enroll when you send — follow-ups go out X days after initial send</p>
              </div>
              {form.followUpSteps.length === 0 && (
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, followUpSteps: [{ step_number: 1, template_id: '', delay_days: 3 }] }))}
                  className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-[#6ab0f9] font-semibold transition-colors flex-shrink-0">
                  <Plus size={13} /> Add Follow-Up
                </button>
              )}
            </div>

            {form.followUpSteps.length > 0 && (
              <div className="space-y-2">
                {[...form.followUpSteps].sort((a, b) => a.delay_days - b.delay_days).map((step, i) => (
                  <div key={i} className="bg-[#1a2335] border border-[#243550] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#4a90d9]">Follow-Up {i + 1}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, followUpSteps: f.followUpSteps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 })) }))}
                        className="text-[#3a5070] hover:text-[#e05c5c] transition-colors"><X size={12} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[10px] text-[#3a5070] mb-1">Template</label>
                        <select className="w-full bg-[#111d30] border border-[#1e2d45] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4a90d9]"
                          value={step.template_id}
                          onChange={e => setForm(f => ({ ...f, followUpSteps: f.followUpSteps.map((s, idx) => idx === i ? { ...s, template_id: e.target.value } : s) }))}>
                          <option value="">— Pick template —</option>
                          {leadTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#3a5070] mb-1">Day</label>
                        <input type="number" min="1" max="365"
                          className="w-full bg-[#111d30] border border-[#1e2d45] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4a90d9]"
                          value={step.delay_days}
                          onChange={e => setForm(f => ({ ...f, followUpSteps: f.followUpSteps.map((s, idx) => idx === i ? { ...s, delay_days: Math.max(1, parseInt(e.target.value) || 1) } : s) }))} />
                      </div>
                    </div>
                    {step.template_id && (
                      <p className="text-[10px] text-[#3a5070]">
                        Sends <span className="text-[#d0954a] font-semibold">Day {step.delay_days}</span> after initial email ·{' '}
                        <span className="text-[#b8d4f0]">{leadTemplates.find(t => t.id === step.template_id)?.subject}</span>
                      </p>
                    )}
                  </div>
                ))}
                <button type="button"
                  onClick={() => {
                    const maxDelay = form.followUpSteps.length ? Math.max(...form.followUpSteps.map(s => s.delay_days)) : 0;
                    setForm(f => ({ ...f, followUpSteps: [...f.followUpSteps, { step_number: f.followUpSteps.length + 1, template_id: '', delay_days: maxDelay + 4 }] }));
                  }}
                  className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-[#6ab0f9] font-semibold transition-colors">
                  <Plus size={13} /> Add Another Follow-Up
                </button>
              </div>
            )}

            {leadTemplates.length === 0 && form.followUpSteps.length === 0 && (
              <p className="text-[10px] text-[#3a5070]">Create templates first in the Templates tab, then add them here as follow-up steps.</p>
            )}
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

            {/* Leads / Contacts / Scraped tabs */}
            <div className="flex gap-1 bg-[#111d30] p-1 rounded-lg mb-3">
              {([
                ['leads',    'Pipeline', form.leadIds.length,        'bg-[#4a90d9]'],
                ['contacts', 'Contacts', form.contactIds.length,     'bg-[#4ab57a]'],
                ['scraped',  'Scraped',  form.scrapedLeadIds.length, 'bg-[#d07af5]'],
              ] as const).map(([val, label, cnt, badgeColor]) => (
                <button
                  key={val}
                  onClick={() => setRecipTab(val as RecipTab)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                    recipTab === val ? 'bg-[#1e2d45] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'
                  }`}
                >
                  {label}
                  {cnt > 0 && <span className={`${badgeColor} text-white text-[9px] px-1.5 py-0.5 rounded-full ml-0.5`}>{cnt}</span>}
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

            {recipTab === 'scraped' && (() => {
              const filteredScraped = scrapedLeads.filter(l => {
                if (!l.email) return false;
                const q = scrapedSearch.toLowerCase();
                return !q || l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || (l.company ?? '').toLowerCase().includes(q);
              });
              const allScrapedSelected = filteredScraped.length > 0 && filteredScraped.every(l => form.scrapedLeadIds.includes(l.id));
              return (
                <>
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
                    <input
                      className="w-full bg-[#111d30] border border-[#243550] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                      placeholder="Search scraped leads..."
                      value={scrapedSearch}
                      onChange={e => setScrapedSearch(e.target.value)}
                    />
                  </div>
                  {filteredScraped.length > 0 && (
                    <button type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        scrapedLeadIds: allScrapedSelected
                          ? f.scrapedLeadIds.filter(id => !filteredScraped.find(l => l.id === id))
                          : [...new Set([...f.scrapedLeadIds, ...filteredScraped.map(l => l.id)])],
                      }))}
                      className="text-xs text-[#d07af5] hover:underline mb-2 block">
                      {allScrapedSelected ? `Deselect all ${filteredScraped.length}` : `Select all ${filteredScraped.length} filtered`}
                    </button>
                  )}
                  <div className="bg-[#111d30] border border-[#243550] rounded-lg divide-y divide-[#1e2d45]" style={{ maxHeight: 240, overflow: 'auto' }}>
                    {filteredScraped.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-[#3a5070]">
                        {scrapedLeads.length === 0 ? 'No scraped leads found in Cleaning CRM' : 'No scraped leads match filter'}
                      </div>
                    ) : filteredScraped.map(lead => {
                      const selected = form.scrapedLeadIds.includes(lead.id);
                      return (
                        <label key={lead.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#1a2335] cursor-pointer">
                          <input type="checkbox" className="accent-[#d07af5] flex-shrink-0" checked={selected}
                            onChange={() => setForm(f => ({
                              ...f,
                              scrapedLeadIds: selected ? f.scrapedLeadIds.filter(id => id !== lead.id) : [...f.scrapedLeadIds, lead.id],
                            }))} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white font-medium truncate">{lead.name}</div>
                            <div className="text-xs text-[#3a5070] truncate">{lead.email}{lead.company ? ` · ${lead.company}` : ''}</div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 bg-[#1a1535] text-[#d07af5]">{lead.category}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              );
            })()}
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
    const campScraped  = (c.scrapedLeadIds ?? []).map(id => scrapedLeads.find(l => l.id === id)).filter((l): l is CleaningLead => !!l);

    const pendingLeads    = campLeads.filter(l => l.email && !sentLeadSet.has(l.id));
    const pendingContacts = campContacts.filter(ct => ct.email && !sentContactSet.has(ct.id));
    const sentScrapedSet  = new Set(c.sentScrapedLeadIds ?? []);
    const pendingScraped  = campScraped.filter(l => l.email && !sentScrapedSet.has(l.id));
    const totalPending    = pendingLeads.length + pendingContacts.length + pendingScraped.length;
    const nextBatch       = [...pendingLeads, ...pendingContacts, ...pendingScraped].slice(0, c.dailyLimit);
    const effectiveWarmup = Math.min(warmupCopies, warmupAddrs.length);
    const totalAll        = c.leadIds.length + c.contactIds.length + (c.scrapedLeadIds?.length ?? 0);
    const totalSent       = c.sentLeadIds.length + c.sentContactIds.length + (c.sentScrapedLeadIds?.length ?? 0);

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

        {/* Follow-up status */}
        {c.linkedSequenceId && (() => {
          const linkedSeq = sequences.find(s => s.id === c.linkedSequenceId);
          if (!linkedSeq) return null;
          const sortedSteps = [...(linkedSeq.steps ?? [])].sort((a, b) => a.delay_days - b.delay_days);
          return (
            <div className="bg-[#1a2335] rounded-xl border border-[#243550] p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-[#4a90d9]" />
                <span className="text-sm font-semibold text-white">Follow-Up Sequence</span>
              </div>
              <div className="flex flex-wrap gap-4 mb-3">
                <span className="text-xs text-[#4a90d9]"><span className="font-bold text-white">{linkedSeq.active_count}</span> following up</span>
                {linkedSeq.due_count > 0 && <span className="text-xs text-[#d0954a] font-semibold"><span className="font-bold">{linkedSeq.due_count}</span> due now</span>}
                <span className="text-xs text-[#4ab57a]"><span className="font-bold text-white">{linkedSeq.completed_count}</span> completed</span>
              </div>
              {sortedSteps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {sortedSteps.map(s => (
                    <span key={s.step_number} className="text-[10px] bg-[#0d1e35] border border-[#1e3a5a] text-[#4a90d9] px-2 py-0.5 rounded-full">
                      Day {s.delay_days} · {leadTemplates.find(t => t.id === s.template_id)?.name ?? `Step ${s.step_number}`}
                    </span>
                  ))}
                </div>
              )}
              {linkedSeq.due_count > 0 && (
                <button onClick={() => handleSendDue(linkedSeq.id)} disabled={sendingDue !== null}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#d0954a] hover:bg-[#e0a55a] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                  <Send size={12} /> {sendingDue === linkedSeq.id ? 'Sending…' : `Send ${linkedSeq.due_count} Due Follow-Up${linkedSeq.due_count !== 1 ? 's' : ''}`}
                </button>
              )}
              {dueResult && sendingDue === null && <p className="text-xs text-[#4ab57a] mt-1">✓ Sent {dueResult.sent} follow-up{dueResult.sent !== 1 ? 's' : ''}</p>}
            </div>
          );
        })()}

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

        {campScraped.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-2">Scraped Leads ({campScraped.length})</h3>
            <div className="bg-[#1a2335] rounded-xl border border-[#243550] divide-y divide-[#243550]">
              {campScraped.map(l => {
                const sent = sentScrapedSet.has(l.id);
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                    {sent ? <CheckCircle2 size={14} className="text-[#4ab57a] flex-shrink-0" /> : <Clock size={14} className="text-[#3a5070] flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium">{l.name}</div>
                      <div className="text-xs text-[#3a5070] truncate">{l.email}{l.company ? ` · ${l.company}` : ''}</div>
                    </div>
                    <span className={`text-[10px] font-semibold flex-shrink-0 ${sent ? 'text-[#4ab57a]' : 'text-[#3a5070]'}`}>{sent ? 'sent' : 'pending'}</span>
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
      {sequences.some(s => s.due_count > 0) && (
        <div className="bg-[#1a1000] border border-[#d0954a] rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Zap size={15} className="text-[#d0954a] flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#d0954a]">{sequences.reduce((n, s) => n + s.due_count, 0)} follow-up{sequences.reduce((n, s) => n + s.due_count, 0) !== 1 ? 's' : ''} ready</p>
              <p className="text-xs text-[#8a6030]">These leads have reached their scheduled follow-up day</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {dueResult && <span className="text-xs text-[#5ce0a0]">✓ Sent {dueResult.sent}</span>}
            <button onClick={() => handleSendDue()} disabled={sendingDue !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d0954a] hover:bg-[#e0a55a] text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              <Send size={13} /> {sendingDue === '__all__' ? 'Sending…' : 'Send All Due'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-[#111d30] p-1 rounded-xl mb-5 overflow-x-auto">
        {([
          ['campaigns', `Campaigns${campaigns.length > 0 ? ` (${campaigns.length})` : ''}`],
          ['sequences', `Sequences${sequences.length > 0 ? ` (${sequences.length})` : ''}${sequences.reduce((n,s)=>n+s.due_count,0)>0?` ·${sequences.reduce((n,s)=>n+s.due_count,0)}due`:''}`],
          ['templates', `Templates${leadTemplates.length > 0 ? ` (${leadTemplates.length})` : ''}`],
          ['contacts',  `Contacts${contacts.length > 0 ? ` (${contacts.length})` : ''}`],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTopTab(t)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              topTab === t ? 'bg-[#1e2d45] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'
            }`}
          >
            {label}
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
            <div className="flex items-center gap-2">
              <button
                onClick={runAutoSend}
                disabled={autoSending}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-[#1a2335] border border-[#243550] text-[#b8d4f0] hover:bg-[#1e2d45] transition-colors disabled:opacity-50"
                title="Send today's batch for all active campaigns"
              >
                <Send size={14} className={autoSending ? 'animate-pulse' : ''} />
                {autoSending ? 'Sending…' : 'Send All Batches'}
              </button>
              <button
                onClick={() => openCompose()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] transition-colors"
              >
                <Plus size={15} /> New Campaign
              </button>
            </div>
          </div>

          {autoSendResult && (
            <div className={`mb-4 p-3 rounded-xl text-xs font-medium ${autoSendResult.startsWith('Error') ? 'bg-[#2a0e0e] border border-[#5a1a1a] text-[#e05c5c]' : 'bg-[#0a2518] border border-[#1e4530] text-[#4ab57a]'}`}>
              {autoSendResult}
            </div>
          )}

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
                const totalAll  = c.leadIds.length + c.contactIds.length + (c.scrapedLeadIds?.length ?? 0);
                const totalSent = c.sentLeadIds.length + c.sentContactIds.length + (c.sentScrapedLeadIds?.length ?? 0);
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
                          {c.followUpSteps?.length > 0 && <span className="text-xs text-[#4a90d9]"><strong>{c.followUpSteps.length}</strong> follow-up{c.followUpSteps.length !== 1 ? 's' : ''}</span>}
                          {c.linkedSequenceId && (() => { const seq = sequences.find(s => s.id === c.linkedSequenceId); return seq?.due_count ? <span className="text-xs text-[#d0954a] font-semibold"><strong>{seq.due_count}</strong> due</span> : null; })()}
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

      {/* ── SEQUENCES ──────────────────────────────────────────── */}
      {topTab === 'sequences' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setSequenceModal({})}
              className="flex items-center gap-2 text-sm text-[#4a90d9] hover:text-[#6ab0f9] font-semibold transition-colors">
              <Plus size={15} /> New Sequence
            </button>
            <p className="text-xs text-[#3a5070]">Follow-ups send X days after enrollment</p>
          </div>

          {sequences.length === 0 ? (
            <div className="text-center py-12 text-[#3a5070]">
              <Clock size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-white mb-1">No sequences yet</p>
              <p className="text-xs">Create a sequence with steps, then enroll a campaign's sent recipients.</p>
            </div>
          ) : sequences.map(seq => {
            const sortedSteps = [...(seq.steps ?? [])].sort((a, b) => a.delay_days - b.delay_days);
            return (
              <div key={seq.id} className="bg-[#1a2335] border border-[#243550] rounded-2xl overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{seq.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {sortedSteps.map(s => (
                          <span key={s.step_number} className="text-[10px] bg-[#0d1e35] border border-[#1e3a5a] text-[#4a90d9] px-2 py-0.5 rounded-full">
                            Day {s.delay_days} · {leadTemplates.find(t => t.id === s.template_id)?.name ?? `Step ${s.step_number}`}
                          </span>
                        ))}
                        {sortedSteps.length === 0 && <span className="text-xs text-[#3a5070]">No steps configured</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setSequenceModal(seq)} className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#4a90d9] hover:bg-[#1e2d45] transition-colors"><Edit2 size={13} /></button>
                      <button onClick={() => handleDeleteSequence(seq.id)} className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1e2d45]">
                    <div className="flex items-center gap-3 text-xs flex-1">
                      <span className="flex items-center gap-1 text-[#4a90d9]"><Users size={11} /> {seq.active_count} active</span>
                      {seq.due_count > 0 && <span className="flex items-center gap-1 text-[#d0954a] font-semibold"><Zap size={11} /> {seq.due_count} due</span>}
                      <span className="flex items-center gap-1 text-[#4ab57a]"><CheckCircle size={11} /> {seq.completed_count} done</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setEnrollModal(seq)}
                        className="text-xs px-2.5 py-1.5 bg-[#1e2d45] border border-[#243550] text-[#b8d4f0] rounded-lg hover:border-[#4a90d9] hover:text-[#4a90d9] transition-colors font-semibold">
                        + Enroll Campaign
                      </button>
                      {seq.due_count > 0 && (
                        <button onClick={() => handleSendDue(seq.id)} disabled={sendingDue !== null}
                          className="text-xs px-2.5 py-1.5 bg-[#d0954a] text-white rounded-lg hover:bg-[#e0a55a] transition-colors font-semibold disabled:opacity-50 flex items-center gap-1">
                          <Send size={11} /> {sendingDue === seq.id ? 'Sending…' : `Send ${seq.due_count} Due`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-[#0d1e35] border border-[#1e3a5a] rounded-xl px-4 py-3 mt-2">
            <p className="text-xs font-semibold text-[#4a90d9] mb-1">First-time setup</p>
            <p className="text-xs text-[#3a5070] mb-2">Run this SQL in Supabase SQL Editor:</p>
            <pre className="bg-[#060f1a] rounded-lg p-3 text-[10px] text-[#b8d4a0] overflow-x-auto whitespace-pre leading-relaxed">{`CREATE TABLE IF NOT EXISTS lead_campaign_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
ALTER TABLE lead_campaign_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON lead_campaign_templates FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS lead_campaign_sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
ALTER TABLE lead_campaign_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON lead_campaign_sequences FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS lead_campaign_sequence_enrollments (
  id TEXT PRIMARY KEY,
  sequence_id TEXT NOT NULL,
  source_campaign_id TEXT,
  email TEXT NOT NULL,
  lead_name TEXT,
  from_name TEXT,
  reply_to TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_step INT NOT NULL DEFAULT 1,
  next_send_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE(sequence_id, email)
);
ALTER TABLE lead_campaign_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON lead_campaign_sequence_enrollments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE lead_campaigns ADD COLUMN IF NOT EXISTS scraped_lead_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE lead_campaigns ADD COLUMN IF NOT EXISTS sent_scraped_lead_ids TEXT[] NOT NULL DEFAULT '{}';`}</pre>
            <button onClick={async () => {
              const sql = document.querySelector('pre.overflow-x-auto')?.textContent ?? '';
              await navigator.clipboard?.writeText(sql);
              setSeqSetupCopied(true);
            }} className="text-xs text-[#4a90d9] hover:underline mt-2">{seqSetupCopied ? '✓ Copied' : 'Copy SQL'}</button>
          </div>
        </div>
      )}

      {/* ── TEMPLATES ──────────────────────────────────────────── */}
      {topTab === 'templates' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Email Templates</h1>
            <button onClick={() => setTemplateModal({})}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] transition-colors">
              <Plus size={15} /> New Template
            </button>
          </div>
          <p className="text-sm text-[#3a5070] -mt-2">Reusable subject + body pairs for campaigns and sequences</p>

          {leadTemplates.length === 0 ? (
            <div className="bg-[#1a2335] border border-[#243550] rounded-2xl px-6 py-16 text-center">
              <Mail size={36} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">No templates yet</p>
              <p className="text-sm text-[#3a5070] mb-5">Save a template to reuse across campaigns and sequences.</p>
              <button onClick={() => setTemplateModal({})} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] transition-colors">
                <Plus size={15} /> New Template
              </button>
            </div>
          ) : leadTemplates.map(t => (
            <div key={t.id} className="bg-[#1a2335] border border-[#243550] rounded-xl px-4 py-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <p className="text-xs text-[#4a90d9] mt-0.5 font-mono truncate">{t.subject}</p>
                <p className="text-xs text-[#3a5070] mt-1 line-clamp-2 leading-relaxed">{t.body.slice(0, 120)}…</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setTemplateModal(t)} className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#4a90d9] hover:bg-[#1e2d45] transition-colors"><Edit2 size={13} /></button>
                <button onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
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
      {templateModal !== null && (
        <LeadTemplateModal template={templateModal} onClose={() => setTemplateModal(null)} onSave={handleSaveTemplate} />
      )}
      {sequenceModal !== null && (
        <LeadSequenceModal sequence={sequenceModal} templates={leadTemplates} onClose={() => setSequenceModal(null)} onSave={handleSaveSequence} />
      )}
      {enrollModal !== null && (
        <LeadEnrollModal sequence={enrollModal} campaigns={campaigns} onClose={() => setEnrollModal(null)} onEnroll={handleEnrollSequence} />
      )}
    </div>
  );
}

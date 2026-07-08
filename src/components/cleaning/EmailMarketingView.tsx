import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Send, Mail, TrendingUp, Phone, Target,
  ChevronDown, ChevronUp, AlertCircle, MousePointer, X,
} from 'lucide-react';
import { fetchCleaningLeads } from '../../services/cleaningDb';
import type { CleaningLead } from '../../services/cleaningDb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

interface EmailCampaign {
  id: string;
  name: string;
  template_id: string | null;
  subject: string;
  body_html: string;
  lead_category: string;
  status: 'draft' | 'sending' | 'sent';
  sent_count: number;
  open_count: number;
  click_count: number;
  calls_set: number;
  closes: number;
  created_at: string;
  sent_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className={`${bg} border border-[#1e2d45] rounded-2xl p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#3a5070] font-medium">{label}</span>
        <Icon size={16} className={color} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-[#3a5070]">{sub}</p>}
    </div>
  );
}

const VARIABLES = ['{First Name}', '{name}', '{company}', '{city}'];

function insertVar(setter: (v: string) => void, current: string, v: string) {
  setter(current + v);
}

// ─── Template Modal ───────────────────────────────────────────────────────────

function TemplateModal({ template, onClose, onSave }: {
  template: Partial<EmailTemplate>;
  onClose: () => void;
  onSave: (t: { id?: string; name: string; subject: string; body_html: string }) => Promise<void>;
}) {
  const [name, setName] = useState(template.name ?? '');
  const [subject, setSubject] = useState(template.subject ?? '');
  const [body, setBody] = useState(template.body_html ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  async function handleSave() {
    if (!name.trim() || !subject.trim() || !body.trim()) return;
    setSaving(true); setError(null);
    try {
      await onSave({ id: template.id, name: name.trim(), subject: subject.trim(), body_html: body.trim() });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally { setSaving(false); }
  }

  const preview = body
    .replace(/\{First Name\}/g, 'Jane')
    .replace(/\{name\}/gi, 'Jane Smith')
    .replace(/\{company\}/gi, 'Sunrise Property Management')
    .replace(/\{city\}/gi, 'Miami');

  const hasUnsubscribe = /unsubscribe|opt.?out/i.test(body);
  const hasBusinessName = /e&j|retreats|cleaning/i.test(body);
  const hasAddress = /\d{1,5}\s\w+.*fl|florida|miami/i.test(body);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] flex-shrink-0">
          <h2 className="font-bold text-white">{template.id ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Template Name</label>
            <input className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={name} onChange={e => setName(e.target.value)} placeholder="PM Intro Email" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Subject Line</label>
            <input className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={subject} onChange={e => setSubject(e.target.value)} placeholder="Professional Cleaning Partnership for {company}" />
          </div>

          {/* Variable chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#3a5070]">Insert variable:</span>
            {VARIABLES.map(v => (
              <button key={v} type="button"
                onClick={() => insertVar(setBody, body, v)}
                className="text-xs bg-[#0d1e35] border border-[#1e3a5a] text-[#4a90d9] px-2 py-0.5 rounded-full hover:bg-[#1e3a5a] transition-colors font-mono">
                {v}
              </button>
            ))}
          </div>

          {/* Edit / Preview tabs */}
          <div className="flex gap-1 bg-[#0f1923] border border-[#1e2d45] rounded-xl p-1 w-fit">
            {(['edit', 'preview'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors capitalize ${tab === t ? 'bg-[#1e2d45] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'edit' ? (
            <textarea rows={12}
              className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none font-mono leading-relaxed"
              value={body} onChange={e => setBody(e.target.value)}
              placeholder={`Hi {name},\n\nI'm reaching out from E&J Retreats Cleaning — we specialize in professional turnover cleaning for short-term rentals and property managers in Miami.\n\nUnlike individual cleaners, we operate with:\n• A vetted team + backup cleaners so you're never left scrambling\n• Documented SOPs and photo-verified completions on every clean\n• iCal integration for automated scheduling\n\nWould love to connect and see if we'd be a good fit for {company}. Are you available for a quick call this week?\n\nBest,\n[Your Name]\nE&J Retreats Cleaning\n[Phone]\n\nTo unsubscribe, reply with "unsubscribe" or click here: {unsubscribe_link}\n123 Main St, Miami, FL 33101`}
            />
          ) : (
            <div className="bg-white rounded-lg p-5 min-h-[200px]">
              <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Subject: {subject.replace(/\{company\}/gi, 'Sunrise PM').replace(/\{name\}/gi, 'Jane').replace(/\{city\}/gi, 'Miami')}</p>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
            </div>
          )}

          {/* CAN-SPAM checklist */}
          <div className="bg-[#1a1000] border border-[#3a3200] rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs font-bold text-[#d0954a] mb-1">CAN-SPAM Compliance Checklist</p>
            {[
              { label: 'Business name (E&J Retreats) in email', check: hasBusinessName },
              { label: 'Unsubscribe mechanism included', check: hasUnsubscribe },
              { label: 'Physical address included', check: hasAddress },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center ${item.check ? 'bg-[#1e4030]' : 'bg-[#3a2000]'}`}>
                  <span className={`text-[9px] font-bold ${item.check ? 'text-[#5ce0a0]' : 'text-[#d0954a]'}`}>{item.check ? '✓' : '!'}</span>
                </div>
                <span className={`text-xs ${item.check ? 'text-[#5ce0a0]' : 'text-[#d0954a]'}`}>{item.label}</span>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-[#e05c5c]">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !subject.trim() || !body.trim()}
            className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Send Campaign Modal ──────────────────────────────────────────────────────

const CATEGORIES = ['Property Management', 'Realtor / Real Estate Team', 'Short-Term Rental', 'Real Estate Investor', 'Strategic Partner', 'Residential'];

function SendCampaignModal({ templates, leads, onClose, onSend }: {
  templates: EmailTemplate[];
  leads: CleaningLead[];
  onClose: () => void;
  onSend: (p: { campaignName: string; templateId?: string; subject: string; bodyHtml: string; leads: CleaningLead[]; leadCategory: string; batchSize: number }) => Promise<void>;
}) {
  const [campaignName, setCampaignName] = useState(`Email Campaign ${new Date().toLocaleDateString()}`);
  const [templateId, setTemplateId] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [category, setCategory] = useState('All Categories');
  const [audience, setAudience] = useState<'all' | 'outreach' | 'scraped'>('all');
  const [batchSize, setBatchSize] = useState(50);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tpl = templates.find(t => t.id === templateId);
  const subject = tpl?.subject ?? customSubject;
  const body = tpl?.body_html ?? customBody;

  const audienceFiltered = leads.filter(l => {
    if (audience === 'scraped') return l.source === 'Scraped List';
    if (audience === 'outreach') return l.source !== 'Scraped List';
    return true;
  });
  const categoryFiltered = category === 'All Categories'
    ? audienceFiltered
    : audienceFiltered.filter(l => l.category === category);
  const targets = categoryFiltered.filter(l => l.email?.trim());
  const skipped = categoryFiltered.filter(l => !l.email?.trim()).length;

  async function handleSend() {
    if (!subject.trim() || !body.trim() || targets.length === 0) return;
    setSending(true); setError(null);
    try {
      await onSend({ campaignName, templateId: templateId || undefined, subject, bodyHtml: body, leads: targets, leadCategory: category, batchSize });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed.');
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] flex-shrink-0">
          <h2 className="font-bold text-white">Send Email Campaign</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Campaign Name</label>
            <input className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={campaignName} onChange={e => setCampaignName(e.target.value)} />
          </div>

          {/* Audience: which section of leads to target */}
          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Audience</label>
            <div className="flex bg-[#0f1923] border border-[#1e2d45] rounded-lg p-0.5 gap-0.5">
              {([['all', 'All Leads'], ['outreach', 'Outreach'], ['scraped', 'Scraped']] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setAudience(val)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${audience === val ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Lead Category</label>
            <select className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
              value={category} onChange={e => setCategory(e.target.value)}>
              <option value="All Categories">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-xs text-[#3a5070] mt-1">
              {targets.length} lead{targets.length !== 1 ? 's' : ''} with emails
              {skipped > 0 && <span className="text-[#d0954a] ml-1">· {skipped} missing email skipped</span>}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Template</label>
            <select className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
              value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">— Write one-off subject + body —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {!templateId && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Subject</label>
                <input className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={customSubject} onChange={e => setCustomSubject(e.target.value)} placeholder="Professional Cleaning for {company}" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Body</label>
                <textarea rows={6} className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none"
                  value={customBody} onChange={e => setCustomBody(e.target.value)} placeholder="Hi {name}, …" />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Batch Size (emails per send)</label>
            <select className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
              value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}>
              <option value={25}>25 — cautious warmup</option>
              <option value={50}>50 — standard</option>
              <option value={100}>100 — higher volume</option>
              <option value={250}>250 — max recommended</option>
            </select>
            <p className="text-xs text-[#3a5070] mt-1">Sending all {targets.length} in {Math.ceil(targets.length / batchSize)} batch{Math.ceil(targets.length / batchSize) !== 1 ? 'es' : ''} of {batchSize}</p>
          </div>

          {!subject.includes('unsubscribe') && !body.toLowerCase().includes('unsubscribe') && (body || subject) && (
            <div className="flex items-start gap-2.5 bg-[#1a1000] border border-[#5a3000] rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-[#d0954a] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#d0954a]">Email body missing unsubscribe link — required by CAN-SPAM.</p>
            </div>
          )}

          {targets.length > 0 && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 flex-shrink-0" />
              <span className="text-xs text-[#3a5070]">I confirm these are legitimate B2B prospects, every email includes an unsubscribe link and physical address, and I will honor unsubscribe requests within 10 business days (CAN-SPAM).</span>
            </label>
          )}

          {error && <p className="text-xs text-[#e05c5c] bg-[#1a0e0e] border border-[#5a1a1a] rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex-shrink-0">
          <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim() || targets.length === 0 || !confirmed}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors">
            <Send size={14} />
            {sending ? 'Sending…' : `Send to ${targets.length} lead${targets.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onUpdateStats, onDelete }: {
  campaign: EmailCampaign;
  onUpdateStats: (id: string, callsSet: number, closes: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [callsSet, setCallsSet] = useState(campaign.calls_set);
  const [closes, setCloses] = useState(campaign.closes);
  const [saving, setSaving] = useState(false);

  const openRate = campaign.sent_count > 0 ? Math.round((campaign.open_count / campaign.sent_count) * 100) : 0;
  const clickRate = campaign.sent_count > 0 ? Math.round((campaign.click_count / campaign.sent_count) * 100) : 0;
  const date = campaign.sent_at ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  async function save() {
    setSaving(true);
    try { await onUpdateStats(campaign.id, callsSet, closes); } finally { setSaving(false); }
  }

  return (
    <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#1e2a40] transition-colors" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{campaign.name}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${campaign.status === 'sent' ? 'bg-[#0a2518] text-[#5ce0a0]' : 'bg-[#0d1e35] text-[#4a90d9]'}`}>{campaign.status}</span>
          </div>
          <p className="text-xs text-[#3a5070] mt-0.5 truncate">{campaign.lead_category} · {date} · <span className="font-mono">{campaign.subject}</span></p>
        </div>
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
          {[
            { v: campaign.sent_count, l: 'Sent', c: 'text-white' },
            { v: `${openRate}%`, l: 'Opens', c: openRate > 20 ? 'text-[#5ce0a0]' : openRate > 0 ? 'text-[#d0954a]' : 'text-[#3a5070]' },
            { v: `${clickRate}%`, l: 'Clicks', c: 'text-[#4a90d9]' },
            { v: campaign.closes, l: 'Closes', c: 'text-[#d07af5]' },
          ].map(s => (
            <div key={s.l} className="text-center">
              <p className={`text-sm font-bold ${s.c}`}>{s.v}</p>
              <p className="text-[10px] text-[#3a5070]">{s.l}</p>
            </div>
          ))}
        </div>
        {expanded ? <ChevronUp size={16} className="text-[#3a5070] flex-shrink-0" /> : <ChevronDown size={16} className="text-[#3a5070] flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-[#1e2d45] px-4 py-4 space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: 'Sent', v: campaign.sent_count, c: 'text-white' },
              { l: 'Opened', v: `${campaign.open_count} (${openRate}%)`, c: 'text-[#5ce0a0]' },
              { l: 'Clicked', v: `${campaign.click_count} (${clickRate}%)`, c: 'text-[#4a90d9]' },
              { l: 'Closes', v: campaign.closes, c: 'text-[#d07af5]' },
            ].map(s => (
              <div key={s.l} className="bg-[#0f1923] rounded-xl p-2.5 text-center">
                <p className={`text-base font-bold ${s.c}`}>{s.v}</p>
                <p className="text-[10px] text-[#3a5070]">{s.l}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[11px] text-[#3a5070] font-semibold uppercase tracking-wide mb-1.5">Subject</p>
            <p className="text-sm text-white bg-[#0f1923] rounded-lg px-3 py-2">{campaign.subject}</p>
          </div>

          <div className="bg-[#162035] border border-[#1e3a5a] rounded-xl p-3.5 space-y-3">
            <p className="text-xs font-semibold text-[#4a90d9]">Manual Tracking</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#3a5070] mb-1">Calls Set</label>
                <input type="number" min="0" className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                  value={callsSet} onChange={e => setCallsSet(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label className="block text-xs text-[#3a5070] mb-1">Closes</label>
                <input type="number" min="0" className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                  value={closes} onChange={e => setCloses(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <button onClick={save} disabled={saving}
              className="w-full py-2 bg-[#4a90d9] text-white text-xs font-semibold rounded-lg hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Update Stats'}
            </button>
          </div>

          <div className="flex justify-end">
            <button onClick={() => { if (confirm('Delete campaign?')) onDelete(campaign.id); }}
              className="flex items-center gap-1.5 text-xs text-[#3a5070] hover:text-[#e05c5c] transition-colors">
              <Trash2 size={13} /> Delete campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function EmailMarketingView() {
  const [leads, setLeads] = useState<CleaningLead[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState<Partial<EmailTemplate> | null>(null);
  const [sendModal, setSendModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [setupCopied, setSetupCopied] = useState(false);
  const [twilioMissing, setTwilioMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tRes, cRes, ls] = await Promise.all([
        fetch('/api/documents?flow=email-mkt&action=templates'),
        fetch('/api/documents?flow=email-mkt&action=campaigns'),
        fetchCleaningLeads().catch(() => [] as CleaningLead[]),
      ]);
      const [tData, cData] = await Promise.all([tRes.json(), cRes.json()]);
      if (!tRes.ok) throw new Error(tData.error ?? 'Failed to load templates');
      if (!cRes.ok) throw new Error(cData.error ?? 'Failed to load campaigns');
      setTemplates(tData.templates ?? []);
      setCampaigns(cData.campaigns ?? []);
      setLeads(ls);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSaveTemplate(t: { id?: string; name: string; subject: string; body_html: string }) {
    const r = await fetch('/api/documents?flow=email-mkt&action=upsert-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert-template', ...t }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Save failed.');
    await load();
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch('/api/documents?flow=email-mkt&action=delete-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-template', id }),
    });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  async function handleSendCampaign(p: { campaignName: string; templateId?: string; subject: string; bodyHtml: string; leads: CleaningLead[]; leadCategory: string; batchSize: number }) {
    const r = await fetch('/api/documents?flow=email-mkt&action=send-campaign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send-campaign', ...p }),
    });
    const d = await r.json();
    if (!r.ok) {
      if (/resend|api.key/i.test(d.error ?? '')) setTwilioMissing(true);
      throw new Error(d.error ?? 'Send failed.');
    }
    await load();
  }

  async function handleUpdateStats(id: string, callsSet: number, closes: number) {
    await fetch('/api/documents?flow=email-mkt&action=update-campaign-stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-campaign-stats', campaignId: id, callsSet, closes }),
    });
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, calls_set: callsSet, closes } : c));
  }

  async function handleDeleteCampaign(id: string) {
    await fetch('/api/documents?flow=email-mkt&action=delete-campaign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-campaign', id }),
    });
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  const totalSent = campaigns.reduce((s, c) => s + c.sent_count, 0);
  const totalOpens = campaigns.reduce((s, c) => s + c.open_count, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.click_count, 0);
  const totalCalls = campaigns.reduce((s, c) => s + c.calls_set, 0);
  const totalCloses = campaigns.reduce((s, c) => s + c.closes, 0);
  const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;

  const SQL = `-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_mkt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_mkt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON email_mkt_templates FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS email_mkt_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES email_mkt_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  lead_category TEXT NOT NULL DEFAULT 'Property Management',
  status TEXT NOT NULL DEFAULT 'sent',
  sent_count INT NOT NULL DEFAULT 0,
  open_count INT NOT NULL DEFAULT 0,
  click_count INT NOT NULL DEFAULT 0,
  calls_set INT NOT NULL DEFAULT 0,
  closes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
ALTER TABLE email_mkt_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON email_mkt_campaigns FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS email_mkt_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES email_mkt_campaigns(id) ON DELETE CASCADE,
  lead_id TEXT,
  lead_name TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  resend_email_id TEXT,
  error_msg TEXT
);
ALTER TABLE email_mkt_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON email_mkt_recipients FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS email_mkt_unsubscribes (
  email TEXT PRIMARY KEY,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_mkt_unsubscribes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON email_mkt_unsubscribes FOR ALL USING (true) WITH CHECK (true);`;

  if (loading) return <div className="flex items-center justify-center h-40"><p className="text-sm text-[#3a5070]">Loading…</p></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Email Marketing</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">{leads.length} leads · {templates.length} templates · {campaigns.length} campaigns</p>
        </div>
        <button onClick={() => setSendModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors">
          <Send size={14} /> New Campaign
        </button>
      </div>

      {/* DB setup banner */}
      {error && (
        <div className="bg-[#1a1000] border border-[#3a3200] rounded-2xl p-5 space-y-3">
          {error.includes('relation') || error.includes('does not exist') ? (
            <>
              <p className="text-sm font-bold text-[#d0954a]">Database tables needed</p>
              <p className="text-xs text-[#8a6030]">Run this SQL in Supabase → SQL Editor, then click Retry.</p>
              <pre className="bg-[#0f1200] rounded-lg p-3 text-xs text-[#b8d4a0] overflow-x-auto whitespace-pre-wrap leading-relaxed">{SQL}</pre>
              <div className="flex gap-3">
                <button onClick={async () => { await navigator.clipboard?.writeText(SQL); setSetupCopied(true); }}
                  className="text-xs text-[#4a90d9] hover:underline">{setupCopied ? '✓ Copied' : 'Copy SQL'}</button>
                <button onClick={load} className="text-xs text-[#5ce0a0] hover:underline">Retry</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-[#d0954a]">Error loading</p>
              <p className="text-xs text-[#8a6030] font-mono">{error}</p>
              <button onClick={load} className="text-xs text-[#4a90d9] hover:underline">Retry</button>
            </>
          )}
        </div>
      )}

      {/* Resend not configured */}
      {twilioMissing && (
        <div className="bg-[#0d1e35] border border-[#1e3a5a] rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={15} className="text-[#4a90d9] flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-[#b8d4f0]">Resend API key not set</p>
            <p className="text-[#3a5070]">Add <code className="bg-[#0f1923] px-1 rounded text-[#5ce0a0]">RESEND_API_KEY</code> to Vercel Environment Variables and redeploy. Resend is already installed — just needs the key.</p>
          </div>
          <button onClick={() => setTwilioMissing(false)}><X size={14} className="text-[#3a5070]" /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Emails Sent" value={totalSent} icon={Mail} color="text-[#4a90d9]" bg="bg-[#0d1e35]" />
        <StatTile label="Open Rate" value={`${openRate}%`} sub={`${totalOpens} opens`} icon={TrendingUp} color="text-[#5ce0a0]" bg="bg-[#0a2518]" />
        <StatTile label="Clicks" value={totalClicks} icon={MousePointer} color="text-[#d0954a]" bg="bg-[#1a1000]" />
        <StatTile label="Calls Set" value={totalCalls} icon={Phone} color="text-[#d07af5]" bg="bg-[#1a0a2e]" />
        <StatTile label="Closes" value={totalCloses} icon={Target} color="text-[#4aedd9]" bg="bg-[#0a1e1e]" />
      </div>

      {/* CAN-SPAM notice */}
      <div className="bg-[#0d1e35] border border-[#1e3a5a] rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertCircle size={15} className="text-[#4a90d9] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#3a5070] space-y-0.5">
          <p className="font-semibold text-[#b8d4f0]">CAN-SPAM compliance (B2B email is legal, just follow these)</p>
          <p>• Every email must include your <strong>physical mailing address</strong> and an <strong>unsubscribe link</strong></p>
          <p>• Subject line must not be deceptive — no "Re:" tricks</p>
          <p>• Honor unsubscribe requests within <strong>10 business days</strong> — our system tracks these automatically</p>
          <p>• Open tracking is handled by Resend — enable it in your Resend dashboard under Settings → Tracking</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0f1923] border border-[#1e2d45] rounded-xl p-1 w-fit">
        {(['campaigns', 'templates'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors capitalize ${activeTab === tab ? 'bg-[#1e2d45] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
            {tab === 'campaigns' ? `Campaigns (${campaigns.length})` : `Templates (${templates.length})`}
          </button>
        ))}
      </div>

      {/* Campaign list */}
      {activeTab === 'campaigns' && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="text-center py-12 text-[#3a5070]">
              <Mail size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No campaigns yet — click "New Campaign" to send your first batch.</p>
            </div>
          ) : campaigns.map(c => (
            <CampaignCard key={c.id} campaign={c} onUpdateStats={handleUpdateStats} onDelete={handleDeleteCampaign} />
          ))}
        </div>
      )}

      {/* Template list */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <button onClick={() => setTemplateModal({})}
            className="flex items-center gap-2 text-sm text-[#4a90d9] hover:text-[#6ab0f9] font-semibold transition-colors">
            <Plus size={15} /> New Template
          </button>
          {templates.length === 0 ? (
            <div className="text-center py-10 text-[#3a5070]">
              <p className="text-sm">No templates — create one to reuse across campaigns.</p>
            </div>
          ) : templates.map(t => (
            <div key={t.id} className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl px-4 py-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <p className="text-xs text-[#4a90d9] mt-0.5 font-mono truncate">{t.subject}</p>
                <p className="text-xs text-[#3a5070] mt-1 line-clamp-2 leading-relaxed">{t.body_html.slice(0, 120)}…</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setTemplateModal(t)} className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#4a90d9] hover:bg-[#1e2d45] transition-colors"><Edit2 size={13} /></button>
                <button onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {templateModal !== null && (
        <TemplateModal template={templateModal} onClose={() => setTemplateModal(null)} onSave={handleSaveTemplate} />
      )}
      {sendModal && (
        <SendCampaignModal templates={templates} leads={leads} onClose={() => setSendModal(false)} onSend={handleSendCampaign} />
      )}
    </div>
  );
}

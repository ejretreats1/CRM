import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Send, MessageSquare, TrendingUp, Phone, Target, ChevronDown, ChevronUp, AlertCircle, Users, X } from 'lucide-react';
import type { CleaningLead } from '../../services/cleaningDb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface SmsCampaign {
  id: string;
  name: string;
  template_id: string | null;
  template_body: string;
  status: 'draft' | 'sending' | 'sent';
  lead_category: string;
  sent_count: number;
  response_count: number;
  calls_set: number;
  closes: number;
  created_at: string;
  sent_at: string | null;
}

interface Props {
  leads: CleaningLead[];
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

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

// ─── Template editor modal ────────────────────────────────────────────────────

function TemplateModal({ template, onClose, onSave }: {
  template: Partial<SmsTemplate> | null;
  onClose: () => void;
  onSave: (t: { id?: string; name: string; body: string }) => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ id: template?.id, name: name.trim(), body: body.trim() });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const charCount = body.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
          <h2 className="font-bold text-white">{template?.id ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Template Name</label>
            <input
              className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. PM Intro Outreach"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#3a5070]">Message</label>
              <span className="text-[10px] text-[#3a5070]">{charCount} chars · {smsCount} SMS segment{smsCount > 1 ? 's' : ''}</span>
            </div>
            <textarea
              rows={6}
              className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none leading-relaxed"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`Hi {name}, this is [Your Name] from E&J Retreats Cleaning. We specialize in short-term rental turnover cleaning for property managers in Miami. Would love to connect — do you have 10 minutes this week? Reply STOP to opt out.`}
            />
            <p className="text-[11px] text-[#3a5070] mt-1">
              Use <code className="bg-[#0f1923] px-1 rounded text-[#4a90d9]">{'{name}'}</code> and <code className="bg-[#0f1923] px-1 rounded text-[#4a90d9]">{'{company}'}</code> for personalization. <strong className="text-[#d0954a]">Always include "Reply STOP to opt out"</strong> for TCPA compliance.
            </p>
          </div>

          {/* Compliance checklist */}
          <div className="bg-[#1a1000] border border-[#3a3200] rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs font-bold text-[#d0954a] mb-1">Legal Compliance Checklist</p>
            {[
              { label: 'Business name included', check: /e&j|retreats|cleaning/i.test(body) },
              { label: '"Reply STOP" opt-out included', check: /stop/i.test(body) },
              { label: 'Under 1 SMS segment (160 chars)', check: charCount <= 160 },
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

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || !body.trim()}
              className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Send campaign modal ──────────────────────────────────────────────────────

function SendCampaignModal({ templates, leads, onClose, onSend }: {
  templates: SmsTemplate[];
  leads: CleaningLead[];
  onClose: () => void;
  onSend: (payload: { campaignName: string; templateId?: string; templateBody: string; leads: CleaningLead[]; leadCategory: string }) => Promise<void>;
}) {
  const [campaignName, setCampaignName] = useState(`PM Campaign ${new Date().toLocaleDateString()}`);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customBody, setCustomBody] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Property Management');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const messageBody = selectedTemplate?.body ?? customBody;

  const targetLeads = leads.filter(l => {
    if (l.category !== selectedCategory) return false;
    if (!l.phone?.trim()) return false;
    return true;
  });

  async function handleSend() {
    if (!messageBody.trim() || targetLeads.length === 0) return;
    setSending(true);
    setError(null);
    try {
      await onSend({
        campaignName,
        templateId: selectedTemplateId || undefined,
        templateBody: messageBody,
        leads: targetLeads,
        leadCategory: selectedCategory,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  const CATEGORIES = ['Property Management', 'Realtor / Real Estate Team', 'Short-Term Rental', 'Real Estate Investor', 'Strategic Partner', 'Residential'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] flex-shrink-0">
          <h2 className="font-bold text-white">Send SMS Campaign</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Campaign Name</label>
            <input
              className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Lead Category</label>
            <select
              className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="text-xs text-[#3a5070] mt-1">
              {targetLeads.length} lead{targetLeads.length !== 1 ? 's' : ''} with phone numbers in this category
              {leads.filter(l => l.category === selectedCategory && !l.phone?.trim()).length > 0 && (
                <span className="text-[#d0954a] ml-1">
                  · {leads.filter(l => l.category === selectedCategory && !l.phone?.trim()).length} missing phone skipped
                </span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Template</label>
            <select
              className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
            >
              <option value="">— Write a custom message —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {!selectedTemplateId && (
            <div>
              <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Custom Message</label>
              <textarea
                rows={5}
                className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none"
                value={customBody}
                onChange={e => setCustomBody(e.target.value)}
                placeholder="Your message here… include Reply STOP to opt out."
              />
            </div>
          )}

          {/* Message preview */}
          {messageBody && (
            <div className="bg-[#0f1923] border border-[#1e2d45] rounded-xl p-4">
              <p className="text-[11px] text-[#3a5070] font-semibold uppercase tracking-wide mb-2">Preview</p>
              <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
                {messageBody.replace(/\{name\}/gi, targetLeads[0]?.name ?? 'Jane').replace(/\{company\}/gi, targetLeads[0]?.company ?? 'Acme PM')}
              </p>
            </div>
          )}

          {/* Compliance warning */}
          {messageBody && !/stop/i.test(messageBody) && (
            <div className="flex items-start gap-2.5 bg-[#1a1000] border border-[#5a3000] rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-[#d0954a] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#d0954a]">Message missing "Reply STOP to opt out" — required for TCPA compliance.</p>
            </div>
          )}

          {/* Confirmation checkbox */}
          {targetLeads.length > 0 && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-xs text-[#3a5070]">
                I confirm these leads are B2B prospects I have a legitimate business reason to contact, and every message includes a STOP opt-out.
              </span>
            </label>
          )}

          {error && <p className="text-xs text-[#e05c5c] bg-[#1a0e0e] border border-[#5a1a1a] rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex-shrink-0">
          <button
            onClick={handleSend}
            disabled={sending || !messageBody.trim() || targetLeads.length === 0 || !confirmed}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors"
          >
            <Send size={14} />
            {sending ? 'Sending…' : `Send to ${targetLeads.length} lead${targetLeads.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onUpdateStats, onDelete }: {
  campaign: SmsCampaign;
  onUpdateStats: (id: string, callsSet: number, closes: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [callsSet, setCallsSet] = useState(campaign.calls_set);
  const [closes, setCloses] = useState(campaign.closes);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const responseRate = campaign.sent_count > 0
    ? Math.round((campaign.response_count / campaign.sent_count) * 100)
    : 0;

  async function handleSaveStats() {
    setSaving(true);
    try { await onUpdateStats(campaign.id, callsSet, closes); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm('Delete this campaign and all its data?')) return;
    setDeleting(true);
    try { await onDelete(campaign.id); } finally { setDeleting(false); }
  }

  const date = campaign.sent_at
    ? new Date(campaign.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#1e2a40] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{campaign.name}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              campaign.status === 'sent' ? 'bg-[#0a2518] text-[#5ce0a0]' :
              campaign.status === 'sending' ? 'bg-[#0d1e35] text-[#4a90d9]' :
              'bg-[#1e2d45] text-[#3a5070]'
            }`}>{campaign.status}</span>
          </div>
          <p className="text-xs text-[#3a5070] mt-0.5">{campaign.lead_category} · {date}</p>
        </div>

        {/* Quick stats */}
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
          <div className="text-center">
            <p className="text-sm font-bold text-white">{campaign.sent_count}</p>
            <p className="text-[10px] text-[#3a5070]">Sent</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#4a90d9]">{responseRate}%</p>
            <p className="text-[10px] text-[#3a5070]">Response</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#5ce0a0]">{campaign.calls_set}</p>
            <p className="text-[10px] text-[#3a5070]">Calls</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#d07af5]">{campaign.closes}</p>
            <p className="text-[10px] text-[#3a5070]">Closes</p>
          </div>
        </div>

        {expanded ? <ChevronUp size={16} className="text-[#3a5070] flex-shrink-0" /> : <ChevronDown size={16} className="text-[#3a5070] flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-[#1e2d45] px-4 py-4 space-y-4">
          {/* Message preview */}
          <div>
            <p className="text-[11px] text-[#3a5070] font-semibold uppercase tracking-wide mb-1.5">Message</p>
            <p className="text-sm text-[#b8d4f0] leading-relaxed whitespace-pre-wrap bg-[#0f1923] rounded-lg px-3 py-2.5">{campaign.template_body}</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Texts Sent', value: campaign.sent_count, color: 'text-white' },
              { label: 'Responses', value: campaign.response_count, color: 'text-[#4a90d9]' },
              { label: 'Response Rate', value: `${responseRate}%`, color: responseRate > 5 ? 'text-[#5ce0a0]' : responseRate > 0 ? 'text-[#d0954a]' : 'text-[#3a5070]' },
              { label: 'Closes', value: campaign.closes, color: 'text-[#d07af5]' },
            ].map(s => (
              <div key={s.label} className="bg-[#0f1923] rounded-xl p-2.5 text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[#3a5070]">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Manual stat editors */}
          <div className="bg-[#162035] border border-[#1e3a5a] rounded-xl p-3.5 space-y-3">
            <p className="text-xs font-semibold text-[#4a90d9]">Manual Tracking (update when you set calls / close deals)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#3a5070] mb-1">Calls Set</label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                  value={callsSet}
                  onChange={e => setCallsSet(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-xs text-[#3a5070] mb-1">Closes</label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                  value={closes}
                  onChange={e => setCloses(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            <button
              onClick={handleSaveStats}
              disabled={saving}
              className="w-full py-2 bg-[#4a90d9] text-white text-xs font-semibold rounded-lg hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Update Stats'}
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 text-xs text-[#3a5070] hover:text-[#e05c5c] transition-colors"
            >
              <Trash2 size={13} />
              {deleting ? 'Deleting…' : 'Delete campaign'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main SmsView ─────────────────────────────────────────────────────────────

export default function SmsView({ leads }: Props) {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templateModal, setTemplateModal] = useState<Partial<SmsTemplate> | null | 'new'>(null);
  const [sendModal, setSendModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [setupCopied, setSetupCopied] = useState(false);
  const [twilioMissing, setTwilioMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, cRes] = await Promise.all([
        fetch('/api/documents?flow=sms&action=templates'),
        fetch('/api/documents?flow=sms&action=campaigns'),
      ]);
      if (!tRes.ok || !cRes.ok) throw new Error('Failed to load SMS data');
      const [tData, cData] = await Promise.all([tRes.json(), cRes.json()]);
      setTemplates(tData.templates ?? []);
      setCampaigns(cData.campaigns ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Load failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSaveTemplate(t: { id?: string; name: string; body: string }) {
    const r = await fetch('/api/documents?flow=sms&action=upsert-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert-template', ...t }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Save failed.');
    await load();
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    const r = await fetch('/api/documents?flow=sms&action=delete-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-template', id }),
    });
    if (!r.ok) { const d = await r.json(); alert(d.error ?? 'Delete failed.'); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  async function handleSendCampaign(payload: { campaignName: string; templateId?: string; templateBody: string; leads: CleaningLead[]; leadCategory: string }) {
    const r = await fetch('/api/documents?flow=sms&action=send-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send-campaign', ...payload }),
    });
    const d = await r.json();
    if (!r.ok) {
      if (d.error?.includes('TWILIO') || d.error?.includes('twilio') || d.error?.includes('credentials')) {
        setTwilioMissing(true);
      }
      throw new Error(d.error ?? 'Send failed.');
    }
    await load();
  }

  async function handleUpdateStats(id: string, callsSet: number, closes: number) {
    const r = await fetch('/api/documents?flow=sms&action=update-campaign-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-campaign-stats', campaignId: id, callsSet, closes }),
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Update failed.'); }
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, calls_set: callsSet, closes } : c));
  }

  async function handleDeleteCampaign(id: string) {
    const r = await fetch('/api/documents?flow=sms&action=delete-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-campaign', id }),
    });
    if (!r.ok) { const d = await r.json(); alert(d.error ?? 'Delete failed.'); return; }
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  // Aggregate stats across all campaigns
  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0);
  const totalResponses = campaigns.reduce((s, c) => s + (c.response_count ?? 0), 0);
  const totalCalls = campaigns.reduce((s, c) => s + (c.calls_set ?? 0), 0);
  const totalCloses = campaigns.reduce((s, c) => s + (c.closes ?? 0), 0);
  const overallResponseRate = totalSent > 0 ? Math.round((totalResponses / totalSent) * 100) : 0;
  const pmLeadCount = leads.filter(l => l.category === 'Property Management').length;

  const SQL = `-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS sms_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON sms_templates FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES sms_templates(id) ON DELETE SET NULL,
  template_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  lead_category TEXT NOT NULL DEFAULT 'Property Management',
  sent_count INT NOT NULL DEFAULT 0,
  response_count INT NOT NULL DEFAULT 0,
  calls_set INT NOT NULL DEFAULT 0,
  closes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON sms_campaigns FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  lead_id TEXT,
  lead_name TEXT,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  twilio_message_sid TEXT,
  error_msg TEXT
);
ALTER TABLE sms_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON sms_campaign_recipients FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sms_inbound_messages (
  id TEXT PRIMARY KEY,
  from_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  twilio_sid TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sms_inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all" ON sms_inbound_messages FOR ALL USING (true) WITH CHECK (true);`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-[#3a5070]">Loading SMS data…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">SMS Campaigns</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">{pmLeadCount} Property Management leads · {templates.length} templates · {campaigns.length} campaigns</p>
        </div>
        <button
          onClick={() => setSendModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors"
        >
          <Send size={14} />
          New Campaign
        </button>
      </div>

      {/* Database setup banner */}
      {error && error.includes('relation') && (
        <div className="bg-[#1a1000] border border-[#3a3200] rounded-2xl p-5">
          <p className="text-sm font-bold text-[#d0954a] mb-1">Database tables needed</p>
          <p className="text-xs text-[#8a6030] mb-3">Run this SQL in your Supabase dashboard under SQL Editor to create the SMS tables.</p>
          <pre className="bg-[#0f1200] rounded-lg p-3 text-xs text-[#b8d4a0] overflow-x-auto whitespace-pre-wrap leading-relaxed">{SQL}</pre>
          <button onClick={async () => { await navigator.clipboard?.writeText(SQL); setSetupCopied(true); }} className="mt-2 text-xs text-[#4a90d9] hover:underline">
            {setupCopied ? '✓ Copied' : 'Copy SQL'}
          </button>
        </div>
      )}

      {/* Twilio setup banner */}
      {twilioMissing && (
        <div className="bg-[#0d1e35] border border-[#1e3a5a] rounded-2xl p-5 space-y-2">
          <p className="text-sm font-bold text-[#4a90d9]">Twilio not connected yet</p>
          <p className="text-xs text-[#3a5070]">Add these three environment variables to your Vercel project settings (Settings → Environment Variables), then redeploy:</p>
          <div className="bg-[#0f1923] rounded-lg p-3 font-mono text-xs text-[#5ce0a0] space-y-1">
            <p>TWILIO_ACCOUNT_SID = AC…</p>
            <p>TWILIO_AUTH_TOKEN = …</p>
            <p>TWILIO_PHONE_NUMBER = +1xxxxxxxxxx</p>
          </div>
          <p className="text-xs text-[#3a5070]">Get these from <strong className="text-white">console.twilio.com</strong> → Account → API keys, and buy a phone number there. You'll also need to register 10DLC for your brand (see Messaging → Regulatory Compliance).</p>
          <button onClick={() => setTwilioMissing(false)} className="text-xs text-[#3a5070] hover:text-white"><X size={12} className="inline mr-1" />Dismiss</button>
        </div>
      )}

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="PM Leads" value={pmLeadCount} icon={Users} color="text-[#4a90d9]" bg="bg-[#0d1e35]" />
        <StatTile label="Texts Sent" value={totalSent} icon={MessageSquare} color="text-[#5ce0a0]" bg="bg-[#0a2518]" />
        <StatTile label="Response Rate" value={`${overallResponseRate}%`} sub={`${totalResponses} replies`} icon={TrendingUp} color="text-[#d0954a]" bg="bg-[#1a1000]" />
        <StatTile label="Calls Set" value={totalCalls} icon={Phone} color="text-[#d07af5]" bg="bg-[#1a0a2e]" />
        <StatTile label="Closes" value={totalCloses} icon={Target} color="text-[#4aedd9]" bg="bg-[#0a1e1e]" />
      </div>

      {/* Legal compliance banner */}
      <div className="bg-[#0d1e35] border border-[#1e3a5a] rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertCircle size={15} className="text-[#4a90d9] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#3a5070] space-y-0.5">
          <p className="font-semibold text-[#b8d4f0]">Compliance reminders</p>
          <p>• Every message must include your business name and <strong>"Reply STOP to opt out"</strong> (TCPA/CTIA requirement)</p>
          <p>• Register your brand for <strong>10DLC</strong> in the Twilio console (Messaging → Regulatory Compliance) — required for all US business SMS since 2023</p>
          <p>• Only text business prospects during business hours (8am–9pm recipient's time)</p>
          <p>• Honor STOP replies immediately — our system handles this automatically via the Twilio webhook</p>
          <p>• Set your Twilio inbound webhook to: <code className="bg-[#0f1923] px-1 rounded text-[#5ce0a0]">{window?.location?.origin}/api/documents?flow=sms&action=inbound</code></p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0f1923] border border-[#1e2d45] rounded-xl p-1 w-fit">
        {(['campaigns', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === tab ? 'bg-[#1e2d45] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
          >
            {tab === 'campaigns' ? `Campaigns (${campaigns.length})` : `Templates (${templates.length})`}
          </button>
        ))}
      </div>

      {/* Campaigns list */}
      {activeTab === 'campaigns' && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="text-center py-12 text-[#3a5070]">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No campaigns yet — click "New Campaign" to send your first batch.</p>
            </div>
          ) : (
            campaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onUpdateStats={handleUpdateStats}
                onDelete={handleDeleteCampaign}
              />
            ))
          )}
        </div>
      )}

      {/* Templates list */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <button
            onClick={() => setTemplateModal('new')}
            className="flex items-center gap-2 text-sm text-[#4a90d9] hover:text-[#6ab0f9] font-semibold transition-colors"
          >
            <Plus size={15} />
            New Template
          </button>
          {templates.length === 0 ? (
            <div className="text-center py-10 text-[#3a5070]">
              <p className="text-sm">No templates yet — create one to reuse across campaigns.</p>
            </div>
          ) : (
            templates.map(t => (
              <div key={t.id} className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl px-4 py-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-[#3a5070] mt-1 line-clamp-2 leading-relaxed">{t.body}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setTemplateModal(t)}
                    className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#4a90d9] hover:bg-[#1e2d45] transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(t.id)}
                    className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {templateModal !== null && (
        <TemplateModal
          template={templateModal === 'new' ? {} : templateModal}
          onClose={() => setTemplateModal(null)}
          onSave={handleSaveTemplate}
        />
      )}

      {sendModal && (
        <SendCampaignModal
          templates={templates}
          leads={leads}
          onClose={() => setSendModal(false)}
          onSend={handleSendCampaign}
        />
      )}
    </div>
  );
}

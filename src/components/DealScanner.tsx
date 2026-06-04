import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Sparkles, Loader, Edit2, Trash2, ExternalLink,
  X, ChevronDown, MapPin, AlertTriangle, CheckCircle2,
  Building2, Info, ScanSearch, Home, Settings, ToggleLeft, ToggleRight, Save,
} from 'lucide-react';
import type { Deal, DealStage, StrRegStatus } from '../types';
import { fetchDeals, upsertDeal, deleteDeal } from '../services/deals';
import { fetchScanConfig, saveScanConfig, DEFAULT_SCAN_CONFIG } from '../services/db';
import type { ScanConfig } from '../services/db';

// ── Constants ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<DealStage, string> = {
  new: 'New Deal',
  analyzing: 'Analyzing',
  sent_to_client: 'Sent to Client',
  client_interested: 'Client Interested',
  offer_submitted: 'Offer Submitted',
  under_contract: 'Under Contract',
  closed: 'Closed',
  passed: 'Passed',
};

const STAGE_COLORS: Record<DealStage, string> = {
  new: 'bg-slate-100 text-slate-600',
  analyzing: 'bg-blue-100 text-blue-700',
  sent_to_client: 'bg-purple-100 text-purple-700',
  client_interested: 'bg-teal-100 text-teal-700',
  offer_submitted: 'bg-amber-100 text-amber-700',
  under_contract: 'bg-orange-100 text-orange-700',
  closed: 'bg-green-100 text-green-700',
  passed: 'bg-rose-100 text-rose-600',
};

const PIPELINE_STAGES: DealStage[] = [
  'new', 'analyzing', 'sent_to_client', 'client_interested',
  'offer_submitted', 'under_contract', 'closed', 'passed',
];

const STR_STATUS_LABELS: Record<StrRegStatus, string> = {
  allowed: 'STR Allowed',
  permit_required: 'Permit Required',
  restricted: 'Restricted',
  prohibited: 'Prohibited',
  unknown: 'Status Unknown',
};

const STR_STATUS_COLORS: Record<StrRegStatus, string> = {
  allowed: 'bg-green-100 text-green-700',
  permit_required: 'bg-amber-100 text-amber-700',
  restricted: 'bg-orange-100 text-orange-700',
  prohibited: 'bg-red-100 text-red-700',
  unknown: 'bg-slate-100 text-slate-500',
};

const SCORE_COLOR = (score: number | null) => {
  if (!score) return 'bg-slate-100 text-slate-500';
  if (score >= 9) return 'bg-green-500 text-white';
  if (score >= 7) return 'bg-teal-500 text-white';
  if (score >= 5) return 'bg-amber-500 text-white';
  return 'bg-rose-500 text-white';
};

const SCORE_EMOJI = (score: number | null) => {
  if (!score) return '';
  if (score >= 9) return '🔥';
  if (score >= 7) return '✅';
  if (score >= 5) return '👀';
  return '⚠️';
};

const YIELD_COLOR = (y: number | null) => {
  if (!y) return 'text-slate-400';
  if (y >= 12) return 'text-green-600 font-bold';
  if (y >= 9) return 'text-teal-600 font-semibold';
  if (y >= 7) return 'text-amber-600 font-semibold';
  return 'text-rose-500';
};

// ── Markets (localStorage) ─────────────────────────────────────────────────

interface Market {
  id: string;
  name: string;
  state: string;
  strStatus: StrRegStatus;
  strNote: string;
}

const MARKETS_KEY = 'ej_deal_markets';

function loadMarkets(): Market[] {
  try { return JSON.parse(localStorage.getItem(MARKETS_KEY) ?? '[]'); }
  catch { return []; }
}
function saveMarkets(m: Market[]) {
  localStorage.setItem(MARKETS_KEY, JSON.stringify(m));
}

// ── Deal form defaults ────────────────────────────────────────────────────

const emptyForm = (): Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> => ({
  address: '',
  city: '',
  state: '',
  market: '',
  listingPrice: 0,
  bedrooms: null,
  bathrooms: null,
  propertyType: 'House',
  zillowUrl: '',
  zillowDescription: '',
  projectedAnnualRevenue: null,
  grossYield: null,
  opportunityScore: null,
  aiScoreReasoning: '',
  aiKeyStrengths: [],
  aiKeyConcerns: [],
  aiRecommendation: '',
  strStatus: 'unknown',
  strNote: '',
  stage: 'new',
  notes: '',
  linkedReportId: undefined,
});

// ── AI score result ───────────────────────────────────────────────────────

interface ScoreResult {
  projectedAnnualRevenue: number | null;
  projectedGrossYield: number | null;
  opportunityScore: number;
  reasoning: string;
  strRegulatoryNote: string | null;
  recommendation: string;
  keyStrengths: string[];
  keyConcerns: string[];
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────

function DealModal({
  deal,
  markets,
  onSave,
  onClose,
}: {
  deal: (Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) | null;
  markets: Market[];
  onSave: (d: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>(
    deal ?? emptyForm()
  );
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(
    deal?.opportunityScore != null ? {
      projectedAnnualRevenue: deal.projectedAnnualRevenue,
      projectedGrossYield: deal.grossYield,
      opportunityScore: deal.opportunityScore,
      reasoning: deal.aiScoreReasoning ?? '',
      strRegulatoryNote: deal.strNote ?? null,
      recommendation: deal.aiRecommendation ?? '',
      keyStrengths: deal.aiKeyStrengths ?? [],
      keyConcerns: deal.aiKeyConcerns ?? [],
    } : null
  );
  const [scoreError, setScoreError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  async function getAiScore() {
    if (!form.address || !form.listingPrice) {
      setScoreError('Enter property address and listing price first.');
      return;
    }
    setScoreError('');
    setScoring(true);
    try {
      const res = await fetch('/api/generate-revenue-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: `${form.address}, ${form.city}, ${form.state}`.replace(/(^,\s*|,\s*$)/g, ''),
          reportType: 'score',
          listingPrice: form.listingPrice,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          propertyType: form.propertyType,
          zillowDescription: form.zillowDescription,
          additionalContext: form.market ? `Market: ${form.market}` : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ScoreResult = await res.json();
      setScoreResult(data);
      setForm(f => ({
        ...f,
        projectedAnnualRevenue: data.projectedAnnualRevenue,
        grossYield: data.projectedGrossYield,
        opportunityScore: data.opportunityScore,
        aiScoreReasoning: data.reasoning,
        aiKeyStrengths: data.keyStrengths,
        aiKeyConcerns: data.keyConcerns,
        aiRecommendation: data.recommendation,
        strNote: data.strRegulatoryNote ?? f.strNote,
      }));
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : 'AI scoring failed');
    } finally {
      setScoring(false);
    }
  }

  async function handleSave() {
    if (!form.address.trim()) return;
    setSaving(true);
    try { onSave(form); }
    finally { setSaving(false); }
  }

  const selectedMarket = markets.find(m => m.name === form.market);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-bold text-slate-900">{form.id ? 'Edit Deal' : 'Add Deal'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Property info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Property</p>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="Property address *"
              value={form.address}
              onChange={e => set('address', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="City"
                value={form.city}
                onChange={e => set('city', e.target.value)}
              />
              <input
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="State (e.g. FL)"
                value={form.state}
                onChange={e => set('state', e.target.value.toUpperCase())}
                maxLength={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Market</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.market}
                  onChange={e => {
                    const mkt = markets.find(m => m.name === e.target.value);
                    set('market', e.target.value);
                    if (mkt) set('strStatus', mkt.strStatus);
                  }}
                >
                  <option value="">Select market...</option>
                  {markets.map(m => (
                    <option key={m.id} value={m.name}>{m.name}, {m.state}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Property Type</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.propertyType}
                  onChange={e => set('propertyType', e.target.value)}
                >
                  {['House', 'Condo', 'Townhouse', 'Multi-family', 'Cabin', 'Cottage', 'Other'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Asking Price ($)</label>
                <input
                  type="number"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="0"
                  value={form.listingPrice || ''}
                  onChange={e => set('listingPrice', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Beds</label>
                <input
                  type="number"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="—"
                  value={form.bedrooms ?? ''}
                  onChange={e => set('bedrooms', e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Baths</label>
                <input
                  type="number"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="—"
                  value={form.bathrooms ?? ''}
                  onChange={e => set('bathrooms', e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Zillow URL (optional)</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="https://zillow.com/..."
                value={form.zillowUrl ?? ''}
                onChange={e => set('zillowUrl', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Zillow Description (paste listing text for better AI scoring)</label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                placeholder="Paste the full Zillow listing description..."
                rows={3}
                value={form.zillowDescription ?? ''}
                onChange={e => set('zillowDescription', e.target.value)}
              />
            </div>
          </div>

          {/* STR Status */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">STR Regulation</p>
            {selectedMarket && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                <Info size={12} />
                Market default: <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STR_STATUS_COLORS[selectedMarket.strStatus]}`}>{STR_STATUS_LABELS[selectedMarket.strStatus]}</span>
              </div>
            )}
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.strStatus}
              onChange={e => set('strStatus', e.target.value as StrRegStatus)}
            >
              {(Object.keys(STR_STATUS_LABELS) as StrRegStatus[]).map(k => (
                <option key={k} value={k}>{STR_STATUS_LABELS[k]}</option>
              ))}
            </select>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="STR regulation note (optional)"
              value={form.strNote ?? ''}
              onChange={e => set('strNote', e.target.value)}
            />
          </div>

          {/* Stage & notes */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pipeline</p>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.stage}
              onChange={e => set('stage', e.target.value as DealStage)}
            >
              {PIPELINE_STAGES.map(s => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              placeholder="Internal notes about this deal..."
              rows={2}
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {/* AI Score */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AI Score</p>
              <button
                onClick={getAiScore}
                disabled={scoring || !form.address || !form.listingPrice}
                className="flex items-center gap-1.5 text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scoring ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {scoring ? 'Scoring...' : 'Get AI Score'}
              </button>
            </div>
            {scoreError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{scoreError}</p>}
            {scoreResult && (
              <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${SCORE_COLOR(scoreResult.opportunityScore)}`}>
                    {scoreResult.opportunityScore}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {SCORE_EMOJI(scoreResult.opportunityScore)} Opportunity Score {scoreResult.opportunityScore}/10
                    </div>
                    <div className="text-xs text-slate-500 capitalize">{scoreResult.recommendation?.replace('-', ' ')}</div>
                  </div>
                  <div className="ml-auto text-right">
                    {scoreResult.projectedAnnualRevenue && (
                      <div className="text-sm font-bold text-slate-800">${scoreResult.projectedAnnualRevenue.toLocaleString()}/yr</div>
                    )}
                    {scoreResult.projectedGrossYield && (
                      <div className={`text-xs ${YIELD_COLOR(scoreResult.projectedGrossYield)}`}>{scoreResult.projectedGrossYield.toFixed(1)}% yield</div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{scoreResult.reasoning}</p>
                {scoreResult.strRegulatoryNote && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    {scoreResult.strRegulatoryNote}
                  </p>
                )}
                {scoreResult.keyStrengths.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Strengths</p>
                    <ul className="space-y-0.5">
                      {scoreResult.keyStrengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <CheckCircle2 size={11} className="text-green-500 flex-shrink-0 mt-0.5" /> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {scoreResult.keyConcerns.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Concerns</p>
                    <ul className="space-y-0.5">
                      {scoreResult.keyConcerns.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <AlertTriangle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" /> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl py-2.5 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.address.trim()}
            className="flex-1 bg-teal-600 text-white text-sm font-medium rounded-xl py-2.5 hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Add Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deal Card ─────────────────────────────────────────────────────────────

function DealCard({
  deal,
  onEdit,
  onDelete,
  onStageChange,
}: {
  deal: Deal;
  onEdit: () => void;
  onDelete: () => void;
  onStageChange: (stage: DealStage) => void;
}) {
  const [stageOpen, setStageOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow relative">
      {/* Score badge */}
      {deal.opportunityScore != null && (
        <div className={`absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${SCORE_COLOR(deal.opportunityScore)}`}>
          {deal.opportunityScore}
        </div>
      )}

      {/* Address */}
      <div className="pr-10">
        <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{deal.address}</p>
        <p className="text-xs text-slate-400 mt-0.5">{[deal.city, deal.state].filter(Boolean).join(', ')}</p>
      </div>

      {/* Key metrics */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-xs text-slate-400">Price</p>
          <p className="text-sm font-bold text-slate-800">${deal.listingPrice.toLocaleString()}</p>
        </div>
        {deal.projectedAnnualRevenue != null && (
          <div>
            <p className="text-xs text-slate-400">Proj. Rev.</p>
            <p className="text-sm font-semibold text-slate-700">${deal.projectedAnnualRevenue.toLocaleString()}</p>
          </div>
        )}
        {deal.grossYield != null && (
          <div>
            <p className="text-xs text-slate-400">Yield</p>
            <p className={`text-sm ${YIELD_COLOR(deal.grossYield)}`}>{deal.grossYield.toFixed(1)}%</p>
          </div>
        )}
        {deal.bedrooms != null && (
          <div>
            <p className="text-xs text-slate-400">Beds</p>
            <p className="text-sm font-medium text-slate-700">{deal.bedrooms}</p>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[deal.stage]}`}>
          {STAGE_LABELS[deal.stage]}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STR_STATUS_COLORS[deal.strStatus]}`}>
          {STR_STATUS_LABELS[deal.strStatus]}
        </span>
        {deal.market && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
            {deal.market}
          </span>
        )}
      </div>

      {/* Notes preview */}
      {deal.notes && (
        <p className="mt-2 text-xs text-slate-400 line-clamp-1">{deal.notes}</p>
      )}

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
            title="Edit"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
          {deal.zillowUrl && (
            <a
              href={deal.zillowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="View on Zillow"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>

        {/* Quick stage change */}
        <div className="relative">
          <button
            onClick={() => setStageOpen(o => !o)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            Move to <ChevronDown size={11} />
          </button>
          {stageOpen && (
            <div className="absolute right-0 bottom-7 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
              {PIPELINE_STAGES.filter(s => s !== deal.stage).map(s => (
                <button
                  key={s}
                  onClick={() => { onStageChange(s); setStageOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Market Modal ──────────────────────────────────────────────────────────

function MarketModal({
  market,
  onSave,
  onClose,
}: {
  market?: Market;
  onSave: (m: Market) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Market>(market ?? {
    id: `mkt_${Date.now()}`,
    name: '',
    state: '',
    strStatus: 'unknown',
    strNote: '',
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">{market ? 'Edit Market' : 'Add Market'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Market name (e.g. Smoky Mountains)"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="State (e.g. TN)"
            value={form.state}
            maxLength={2}
            onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
          />
          <select
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            value={form.strStatus}
            onChange={e => setForm(f => ({ ...f, strStatus: e.target.value as StrRegStatus }))}
          >
            {(Object.keys(STR_STATUS_LABELS) as StrRegStatus[]).map(k => (
              <option key={k} value={k}>{STR_STATUS_LABELS[k]}</option>
            ))}
          </select>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            placeholder="Notes on regulations, permit process, etc."
            rows={3}
            value={form.strNote}
            onChange={e => setForm(f => ({ ...f, strNote: e.target.value }))}
          />
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 text-sm rounded-xl py-2.5 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => { if (form.name.trim()) onSave(form); }}
            disabled={!form.name.trim()}
            className="flex-1 bg-teal-600 text-white text-sm rounded-xl py-2.5 hover:bg-teal-700 disabled:opacity-50"
          >
            Save Market
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Scan result type ──────────────────────────────────────────────────────

interface ScanResult {
  zpid: string;
  address: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  homeType: string;
  imgSrc: string | null;
  zillowUrl: string;
  zestimate: number | null;
  rentZestimate: number | null;
  daysOnZillow: number | null;
  listingType: string;
}

// ── Main Component ────────────────────────────────────────────────────────

export default function DealScanner() {
  const [tab, setTab] = useState<'scan' | 'deals' | 'pipeline' | 'markets' | 'settings'>('scan');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markets, setMarkets] = useState<Market[]>(loadMarkets);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState<DealStage | ''>('');
  const [filterStr, setFilterStr] = useState<StrRegStatus | ''>('');
  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<(Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) | null>(null);
  const [showMarketModal, setShowMarketModal] = useState(false);
  const [editingMarket, setEditingMarket] = useState<Market | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Scan state
  const [scanLocation, setScanLocation] = useState('');
  const [scanMinPrice, setScanMinPrice] = useState('');
  const [scanMaxPrice, setScanMaxPrice] = useState('');
  const [scanMinBeds, setScanMinBeds] = useState('2');
  const [scanPropertyTypes, setScanPropertyTypes] = useState<string[]>([]);
  const [scanResults, setScanResults] = useState<ScanResult[]>(() => {
    try { return JSON.parse(localStorage.getItem(LAST_SCAN_KEY) ?? 'null')?.results ?? []; } catch { return []; }
  });
  const [scanning, setScanning] = useState(false);
  const [rentcastKey, setRentcastKey] = useState(() => localStorage.getItem('ej_rentcast_key') ?? '');
  const [rentcastInput, setRentcastInput] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanTotal, setScanTotal] = useState<number | null>(() => {
    try { return JSON.parse(localStorage.getItem(LAST_SCAN_KEY) ?? 'null')?.total ?? null; } catch { return null; }
  });

  const rentcastMonthKey = (() => {
    const d = new Date();
    return `ej_rentcast_count_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const RENTCAST_LIMIT = 50;
  const RENTCAST_WARN  = 40;
  const [rentcastMonthlyCount, setRentcastMonthlyCount] = useState(() =>
    parseInt(localStorage.getItem(rentcastMonthKey) ?? '0')
  );

  const LAST_SCAN_KEY = 'ej_last_scan';
  type LastScan = { results: ScanResult[]; total: number | null; location: string; date: string };
  const [lastScan, setLastScan] = useState<LastScan | null>(() => {
    try { return JSON.parse(localStorage.getItem(LAST_SCAN_KEY) ?? 'null'); } catch { return null; }
  });
  const [scanConfig, setScanConfig] = useState<ScanConfig>({ ...DEFAULT_SCAN_CONFIG });
  const [scanConfigSaving, setScanConfigSaving] = useState(false);
  const [scanConfigSaved, setScanConfigSaved] = useState(false);
  const [scanConfigError, setScanConfigError] = useState('');
  const [newMarketInput, setNewMarketInput] = useState('');

  useEffect(() => {
    fetchDeals()
      .then(setDeals)
      .catch(e => setError(e.message ?? 'Failed to load deals. Make sure the deals table exists in Supabase.'))
      .finally(() => setLoading(false));
    fetchScanConfig().then(setScanConfig).catch(() => {});
  }, []);

  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      if (search && !d.address.toLowerCase().includes(search.toLowerCase()) &&
        !d.city.toLowerCase().includes(search.toLowerCase()) &&
        !d.market.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStage && d.stage !== filterStage) return false;
      if (filterStr && d.strStatus !== filterStr) return false;
      return true;
    });
  }, [deals, search, filterStage, filterStr]);

  async function handleSaveDeal(form: Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const saved = await upsertDeal(form);
    setDeals(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setShowDealModal(false);
    setEditingDeal(null);
  }

  async function handleDeleteDeal(id: string) {
    await deleteDeal(id);
    setDeals(prev => prev.filter(d => d.id !== id));
    setConfirmDelete(null);
  }

  async function handleStageChange(deal: Deal, stage: DealStage) {
    const updated = await upsertDeal({ ...deal, stage });
    setDeals(prev => prev.map(d => d.id === updated.id ? updated : d));
  }

  function handleSaveMarket(m: Market) {
    const next = markets.find(x => x.id === m.id)
      ? markets.map(x => x.id === m.id ? m : x)
      : [...markets, m];
    setMarkets(next);
    saveMarkets(next);
    setShowMarketModal(false);
    setEditingMarket(undefined);
  }

  function handleDeleteMarket(id: string) {
    const next = markets.filter(m => m.id !== id);
    setMarkets(next);
    saveMarkets(next);
  }

  async function runScan() {
    if (!scanLocation.trim()) return;
    if (!rentcastKey) { setScanError('Enter your Rentcast API key to scan.'); return; }
    if (rentcastMonthlyCount >= RENTCAST_LIMIT) {
      setScanError(`Monthly Rentcast limit reached (${RENTCAST_LIMIT} searches/month). Resets on the 1st.`);
      return;
    }
    setScanning(true);
    setScanError('');
    setScanResults([]);
    setScanTotal(null);
    try {
      const params = new URLSearchParams({ service: 'rentcast-scan', location: scanLocation.trim() });
      if (scanMinBeds)                    params.set('bedsMin', scanMinBeds);
      if (scanMinPrice)                   params.set('priceMin', scanMinPrice.replace(/,/g, ''));
      if (scanMaxPrice)                   params.set('priceMax', scanMaxPrice.replace(/,/g, ''));
      if (scanPropertyTypes.length > 0)   params.set('propertyTypes', scanPropertyTypes.join(','));
      const r = await fetch(`/api/uplisting-proxy?${params}`, {
        headers: { 'x-rentcast-key': rentcastKey },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Scan failed');
      const listings: ScanResult[] = data.listings ?? [];
      const total: number | null = data.total ?? null;
      const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const saved: LastScan = { results: listings, total, location: scanLocation.trim(), date: dateLabel };
      setScanResults(listings);
      setScanTotal(total);
      setLastScan(saved);
      localStorage.setItem(LAST_SCAN_KEY, JSON.stringify(saved));
      // Track usage
      const newCount = rentcastMonthlyCount + 1;
      setRentcastMonthlyCount(newCount);
      localStorage.setItem(rentcastMonthKey, String(newCount));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  function prefillFromScan(result: ScanResult): Omit<Deal, 'id' | 'createdAt' | 'updatedAt'> {
    const parts = result.address.split(', ');
    const stateMatch = result.address.match(/,\s*([A-Z]{2})(?:\s+\d{5})?(?:\s*,\s*USA)?$/);
    const state = stateMatch ? stateMatch[1] : '';
    const city = parts.length >= 2 ? parts[parts.length - 2].replace(/\s+\d{5}.*$/, '').trim() : '';
    const mkt = markets.find(m => state && m.state === state);
    return {
      address: result.address,
      city,
      state,
      market: mkt?.name ?? '',
      listingPrice: result.price,
      bedrooms: result.bedrooms,
      bathrooms: result.bathrooms,
      propertyType: result.homeType || 'House',
      zillowUrl: result.zillowUrl,
      zillowDescription: '',
      projectedAnnualRevenue: null,
      grossYield: null,
      opportunityScore: null,
      strStatus: mkt?.strStatus ?? 'unknown',
      strNote: mkt?.strNote ?? '',
      stage: 'new',
      notes: '',
    };
  }

  const hotDeals = useMemo(() =>
    deals.filter(d => d.opportunityScore != null && d.opportunityScore >= 8)
      .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
      .slice(0, 3),
    [deals]
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deal Scanner</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track, score, and pipeline STR investment deals</p>
        </div>
        <button
          onClick={() => { setEditingDeal(null); setShowDealModal(true); }}
          className="flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-teal-700 transition-colors"
        >
          <Plus size={15} /> Add Deal
        </button>
      </div>

      {/* Hot deals banner */}
      {hotDeals.length > 0 && (
        <div className="mb-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">🔥 Hot Deals (Score 8+)</p>
          <div className="flex flex-wrap gap-2">
            {hotDeals.map(d => (
              <button
                key={d.id}
                onClick={() => { setEditingDeal(d); setShowDealModal(true); }}
                className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-xs hover:border-amber-400 transition-colors"
              >
                <span className={`w-5 h-5 rounded text-white text-xs flex items-center justify-center font-bold flex-shrink-0 ${SCORE_COLOR(d.opportunityScore)}`}>
                  {d.opportunityScore}
                </span>
                <span className="text-slate-700 font-medium truncate max-w-[180px]">{d.address}</span>
                {d.grossYield != null && <span className={`flex-shrink-0 ${YIELD_COLOR(d.grossYield)}`}>{d.grossYield.toFixed(1)}%</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5 overflow-x-auto">
        {(['scan', 'deals', 'pipeline', 'markets', 'settings'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'scan' && <><ScanSearch size={13} /> Scan</>}
            {t === 'deals' && `Deals (${deals.length})`}
            {t === 'pipeline' && 'Pipeline'}
            {t === 'markets' && `Markets (${markets.length})`}
            {t === 'settings' && <><Settings size={13} /> Morning Scan</>}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">Setup required</p>
          <p className="text-xs">{error}</p>
          <p className="text-xs mt-1">Run the Supabase SQL from the setup guide to create the deals table.</p>
        </div>
      )}

      {/* ── Scan Tab ── */}
      {tab === 'scan' && (
        <div>
          {/* Rentcast key setup */}
          {!rentcastKey ? (
            <div className="mb-5 bg-teal-50 border border-teal-200 rounded-xl px-4 py-4 text-sm">
              <p className="font-semibold text-teal-800 mb-1">Connect Rentcast to start scanning</p>
              <p className="text-teal-700 text-xs leading-relaxed mb-3">
                Rentcast is <strong>free</strong> — sign up with just your email at{' '}
                <a href="https://rentcast.io" target="_blank" rel="noopener noreferrer" className="underline font-medium">rentcast.io</a>,
                grab your API key from the dashboard, and paste it below. Free tier: 50 searches/month.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={rentcastInput}
                  onChange={e => setRentcastInput(e.target.value)}
                  placeholder="Paste your Rentcast API key…"
                  className="flex-1 border border-teal-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
                <button
                  onClick={() => {
                    const k = rentcastInput.trim();
                    if (!k) return;
                    localStorage.setItem('ej_rentcast_key', k);
                    setRentcastKey(k);
                    setRentcastInput('');
                  }}
                  disabled={!rentcastInput.trim()}
                  className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Save Key
                </button>
              </div>
            </div>
          ) : (
            <div className={`mb-5 border rounded-xl px-4 py-2.5 ${
              rentcastMonthlyCount >= RENTCAST_LIMIT
                ? 'bg-red-50 border-red-200'
                : rentcastMonthlyCount >= RENTCAST_WARN
                ? 'bg-amber-50 border-amber-200'
                : 'bg-teal-50 border-teal-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium flex items-center gap-1.5 ${
                  rentcastMonthlyCount >= RENTCAST_LIMIT ? 'text-red-700'
                  : rentcastMonthlyCount >= RENTCAST_WARN ? 'text-amber-700'
                  : 'text-teal-700'
                }`}>
                  <CheckCircle2 size={13} className={
                    rentcastMonthlyCount >= RENTCAST_LIMIT ? 'text-red-500'
                    : rentcastMonthlyCount >= RENTCAST_WARN ? 'text-amber-500'
                    : 'text-teal-500'
                  } />
                  Rentcast connected
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    rentcastMonthlyCount >= RENTCAST_LIMIT
                      ? 'bg-red-100 text-red-700'
                      : rentcastMonthlyCount >= RENTCAST_WARN
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-teal-100 text-teal-700'
                  }`}>
                    {rentcastMonthlyCount}/{RENTCAST_LIMIT} this month
                  </span>
                </span>
                <button
                  onClick={() => { localStorage.removeItem('ej_rentcast_key'); setRentcastKey(''); }}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  Disconnect
                </button>
              </div>
              {rentcastMonthlyCount >= RENTCAST_LIMIT && (
                <p className="text-xs text-red-600 mt-1">Monthly limit reached — scanning disabled until the 1st. Upgrade to $9/mo at rentcast.io for 500 calls/month.</p>
              )}
              {rentcastMonthlyCount >= RENTCAST_WARN && rentcastMonthlyCount < RENTCAST_LIMIT && (
                <p className="text-xs text-amber-600 mt-1">Approaching monthly limit — {RENTCAST_LIMIT - rentcastMonthlyCount} searches remaining.</p>
              )}
            </div>
          )}

          {/* Scan filters */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Search Criteria</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-slate-500 mb-1 block">Location (zip or "City, State")</label>
                <div className="relative">
                  <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="e.g. 33304 or Scottsdale, AZ"
                    value={scanLocation}
                    onChange={e => setScanLocation(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runScan()}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Min Price ($)</label>
                <input
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="e.g. 100000"
                  value={scanMinPrice}
                  onChange={e => setScanMinPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Max Price ($)</label>
                <input
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="e.g. 800000"
                  value={scanMaxPrice}
                  onChange={e => setScanMaxPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Min Beds</label>
                <select
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={scanMinBeds}
                  onChange={e => setScanMinBeds(e.target.value)}
                >
                  {['1','2','3','4','5'].map(n => <option key={n} value={n}>{n}+</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={runScan}
                  disabled={scanning || !scanLocation.trim() || !rentcastKey || rentcastMonthlyCount >= RENTCAST_LIMIT}
                  className="flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-5 py-2 rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scanning ? <Loader size={14} className="animate-spin" /> : <ScanSearch size={14} />}
                  {scanning ? 'Scanning...' : 'Scan'}
                </button>
              </div>
            </div>
            {/* Property type filter */}
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Property Type <span className="font-normal">(leave blank for all)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Single Family', value: 'Single Family' },
                  { label: 'Multi-Family (Duplex/Triplex/Quad+)', value: 'Multi-Family' },
                  { label: 'Condo', value: 'Condo' },
                  { label: 'Townhouse', value: 'Townhouse' },
                ].map(({ label, value }) => {
                  const active = scanPropertyTypes.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => setScanPropertyTypes(prev =>
                        active ? prev.filter(t => t !== value) : [...prev, value]
                      )}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        active
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {scanError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{scanError}</div>
          )}

          {/* Results */}
          {scanResults.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-xs text-slate-500">
                  {scanResults.length} listing{scanResults.length !== 1 ? 's' : ''}
                  {scanTotal != null ? ` of ${scanTotal.toLocaleString()} total` : ''}
                  {lastScan && <span className="text-slate-400"> · Last scan: {lastScan.location} on {lastScan.date}</span>}
                </p>
                <button
                  onClick={() => { setScanResults([]); setScanTotal(null); setLastScan(null); localStorage.removeItem(LAST_SCAN_KEY); }}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {scanResults.map(r => (
                  <div key={r.zpid} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                    {r.imgSrc && (
                      <img src={r.imgSrc} alt={r.address} className="w-full h-36 object-cover" />
                    )}
                    {!r.imgSrc && (
                      <div className="w-full h-24 bg-slate-100 flex items-center justify-center">
                        <Home size={28} className="text-slate-300" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{r.address}</p>
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <span className="text-base font-bold text-slate-800">${r.price.toLocaleString()}</span>
                        {r.bedrooms != null && (
                          <span className="text-xs text-slate-500">{r.bedrooms}bd{r.bathrooms != null ? ` / ${r.bathrooms}ba` : ''}</span>
                        )}
                        {r.homeType && (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{r.homeType}</span>
                        )}
                      </div>
                      {r.daysOnZillow != null && (
                        <p className="text-xs text-slate-400 mt-1">{r.daysOnZillow === 0 ? 'Listed today' : `${r.daysOnZillow}d on Zillow`}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingDeal(prefillFromScan(r));
                            setShowDealModal(true);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-teal-700 transition-colors"
                        >
                          <Plus size={12} /> Add to Pipeline
                        </button>
                        {r.zillowUrl && (
                          <a
                            href={r.zillowUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
                            title="View on Zillow"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!scanning && scanResults.length === 0 && !scanError && (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <ScanSearch size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">Enter a location to scan</p>
              <p className="text-slate-400 text-sm mt-1">Try a zip code like "33304" or "Scottsdale, AZ"</p>
            </div>
          )}
        </div>
      )}

      {/* ── Deals Tab ── */}
      {tab === 'deals' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex-1 min-w-[180px] relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="Search deals..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={filterStage}
              onChange={e => setFilterStage(e.target.value as DealStage | '')}
            >
              <option value="">All stages</option>
              {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <select
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={filterStr}
              onChange={e => setFilterStr(e.target.value as StrRegStatus | '')}
            >
              <option value="">All STR status</option>
              {(Object.keys(STR_STATUS_LABELS) as StrRegStatus[]).map(k => (
                <option key={k} value={k}>{STR_STATUS_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader size={22} className="animate-spin text-slate-300" /></div>
          ) : filteredDeals.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Building2 size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No deals yet</p>
              <p className="text-slate-400 text-sm mt-1">Add a deal and run an AI score to get started.</p>
              <button
                onClick={() => { setEditingDeal(null); setShowDealModal(true); }}
                className="mt-4 flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-teal-700 transition-colors mx-auto"
              >
                <Plus size={14} /> Add First Deal
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDeals.map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onEdit={() => { setEditingDeal(deal); setShowDealModal(true); }}
                  onDelete={() => setConfirmDelete(deal.id)}
                  onStageChange={s => handleStageChange(deal, s)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Pipeline Tab ── */}
      {tab === 'pipeline' && (
        <div className="space-y-3">
          {PIPELINE_STAGES.map(stage => {
            const stageDeals = deals.filter(d => d.stage === stage);
            if (stageDeals.length === 0 && stage !== 'new') return null;
            return (
              <div key={stage} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[stage]}`}>
                      {STAGE_LABELS[stage]}
                    </span>
                    <span className="text-xs text-slate-400">{stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}</span>
                  </div>
                  {stage === 'new' && (
                    <button
                      onClick={() => { setEditingDeal(null); setShowDealModal(true); }}
                      className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                    >
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>
                {stageDeals.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400 italic">No deals in this stage</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {stageDeals.map(deal => (
                      <div key={deal.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                        {deal.opportunityScore != null && (
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${SCORE_COLOR(deal.opportunityScore)}`}>
                            {deal.opportunityScore}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{deal.address}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-400">${deal.listingPrice.toLocaleString()}</p>
                            {deal.grossYield != null && (
                              <span className={`text-xs ${YIELD_COLOR(deal.grossYield)}`}>{deal.grossYield.toFixed(1)}% yield</span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded-full text-xs ${STR_STATUS_COLORS[deal.strStatus]}`}>
                              {STR_STATUS_LABELS[deal.strStatus]}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setEditingDeal(deal); setShowDealModal(true); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(deal.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Markets Tab ── */}
      {tab === 'markets' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-600">Track STR regulations for your target markets.</p>
            <button
              onClick={() => { setEditingMarket(undefined); setShowMarketModal(true); }}
              className="flex items-center gap-1.5 text-sm bg-teal-600 text-white px-3 py-2 rounded-xl hover:bg-teal-700 transition-colors"
            >
              <Plus size={14} /> Add Market
            </button>
          </div>

          {markets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <MapPin size={24} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No markets tracked yet</p>
              <p className="text-slate-400 text-sm mt-1">Add markets to track STR regulations per area.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {markets.map(m => {
                const dealCount = deals.filter(d => d.market === m.name).length;
                return (
                  <div key={m.id} className="bg-white rounded-xl border border-slate-200 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900">{m.name}{m.state ? `, ${m.state}` : ''}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STR_STATUS_COLORS[m.strStatus]}`}>
                            {STR_STATUS_LABELS[m.strStatus]}
                          </span>
                          {dealCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                              {dealCount} deal{dealCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {m.strNote && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.strNote}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingMarket(m); setShowMarketModal(true); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteMarket(m.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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

          {/* STR status legend */}
          <div className="mt-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-3">STR Status Guide</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(STR_STATUS_LABELS) as StrRegStatus[]).map(k => (
                <div key={k} className="flex items-start gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STR_STATUS_COLORS[k]}`}>{STR_STATUS_LABELS[k]}</span>
                  <span className="text-xs text-slate-500 leading-tight">
                    {k === 'allowed' && 'No restrictions, can list immediately.'}
                    {k === 'permit_required' && 'STR permit required before listing.'}
                    {k === 'restricted' && 'Significant limits, e.g. owner-occupied only.'}
                    {k === 'prohibited' && 'STR not permitted in this area.'}
                    {k === 'unknown' && 'Regulation status not yet confirmed.'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Morning Scan Settings Tab ── */}
      {tab === 'settings' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Morning Scan Settings</p>
              <p className="text-xs text-slate-500 mt-0.5">Runs daily at 8am EST. Changes take effect on the next run.</p>
            </div>
            <button
              onClick={() => {
                setScanConfig(c => ({ ...c, enabled: !c.enabled }));
              }}
              className="flex items-center gap-2 text-sm font-medium"
            >
              {scanConfig.enabled
                ? <><ToggleRight size={24} className="text-teal-500" /><span className="text-teal-700">Enabled</span></>
                : <><ToggleLeft size={24} className="text-slate-400" /><span className="text-slate-500">Disabled</span></>
              }
            </button>
          </div>

          {/* Markets */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Markets to Scan</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {scanConfig.markets.map((m, i) => (
                <span key={i} className="flex items-center gap-1 bg-teal-50 text-teal-800 text-xs font-medium px-2.5 py-1 rounded-full border border-teal-200">
                  {m}
                  <button
                    onClick={() => setScanConfig(c => ({ ...c, markets: c.markets.filter((_, j) => j !== i) }))}
                    className="ml-0.5 text-teal-400 hover:text-red-500 transition-colors"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {scanConfig.markets.length === 0 && (
                <p className="text-xs text-slate-400 italic">No markets added yet.</p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMarketInput}
                onChange={e => setNewMarketInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newMarketInput.trim()) {
                    setScanConfig(c => ({ ...c, markets: [...c.markets, newMarketInput.trim()] }));
                    setNewMarketInput('');
                  }
                }}
                placeholder='e.g. Gatlinburg TN'
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <button
                onClick={() => {
                  if (!newMarketInput.trim()) return;
                  setScanConfig(c => ({ ...c, markets: [...c.markets, newMarketInput.trim()] }));
                  setNewMarketInput('');
                }}
                disabled={!newMarketInput.trim()}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">Format: <code className="bg-slate-100 px-1 rounded">City ST</code> — e.g. <em>Gatlinburg TN</em>, <em>Blue Ridge GA</em>. Each market = 1 Rentcast call per day.</p>
          </div>

          {/* Criteria */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Scan Criteria</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Min Beds</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={10}
                    value={scanConfig.minBeds}
                    onChange={e => setScanConfig(c => ({ ...c, minBeds: parseInt(e.target.value) || 2 }))}
                    className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <span className="text-xs text-slate-400">+</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Min Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="text"
                    value={scanConfig.minPrice > 0 ? scanConfig.minPrice.toLocaleString() : ''}
                    placeholder="0"
                    onChange={e => {
                      const v = parseInt(e.target.value.replace(/,/g, ''));
                      setScanConfig(c => ({ ...c, minPrice: isNaN(v) ? 0 : v }));
                    }}
                    className="w-full border border-slate-200 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Max Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="text"
                    value={scanConfig.maxPrice.toLocaleString()}
                    onChange={e => {
                      const v = parseInt(e.target.value.replace(/,/g, ''));
                      if (!isNaN(v)) setScanConfig(c => ({ ...c, maxPrice: v }));
                    }}
                    className="w-full border border-slate-200 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Min AI Score</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={10}
                    value={scanConfig.minScore}
                    onChange={e => setScanConfig(c => ({ ...c, minScore: parseInt(e.target.value) || 6 }))}
                    className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <span className="text-xs text-slate-400">/ 10</span>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Property Types <span className="font-normal">(leave blank for all)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Single Family', value: 'Single Family' },
                  { label: 'Multi-Family (Duplex/Triplex/Quad+)', value: 'Multi-Family' },
                  { label: 'Condo', value: 'Condo' },
                  { label: 'Townhouse', value: 'Townhouse' },
                ].map(({ label, value }) => {
                  const active = scanConfig.propertyTypes.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => setScanConfig(c => ({
                        ...c,
                        propertyTypes: active
                          ? c.propertyTypes.filter(t => t !== value)
                          : [...c.propertyTypes, value],
                      }))}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        active
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rentcast budget */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Rentcast Monthly Budget</p>
            <p className="text-xs text-slate-400 mb-3">Max automated scan calls per month. Free tier = 50 total. Leave room for manual scans.</p>
            <div className="flex items-center gap-3">
              <input
                type="number" min={1} max={50}
                value={scanConfig.rentcastMonthlyLimit}
                onChange={e => setScanConfig(c => ({ ...c, rentcastMonthlyLimit: parseInt(e.target.value) || 40 }))}
                className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <span className="text-xs text-slate-500">/ 50 automated calls per month</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Tip: with {scanConfig.markets.length || 1} market{scanConfig.markets.length !== 1 ? 's' : ''}, daily scanning uses ~{(scanConfig.markets.length || 1) * 30} calls/month.
              {(scanConfig.markets.length || 1) * 30 > scanConfig.rentcastMonthlyLimit && (
                <span className="text-amber-600 font-medium"> Reduce markets or increase the budget.</span>
              )}
            </p>
          </div>

          {/* Save */}
          {scanConfigError && <p className="text-xs text-red-600">{scanConfigError}</p>}
          <button
            onClick={async () => {
              setScanConfigSaving(true);
              setScanConfigError('');
              setScanConfigSaved(false);
              try {
                await saveScanConfig(scanConfig);
                setScanConfigSaved(true);
                setTimeout(() => setScanConfigSaved(false), 3000);
              } catch (err) {
                setScanConfigError(err instanceof Error ? err.message : 'Save failed. Make sure the scan_config table exists in Supabase.');
              } finally {
                setScanConfigSaving(false);
              }
            }}
            disabled={scanConfigSaving}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            {scanConfigSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            {scanConfigSaved ? 'Saved!' : scanConfigSaving ? 'Saving…' : 'Save Settings'}
          </button>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-600 mb-2">One-time Supabase setup</p>
            <p className="text-xs text-slate-500 mb-2">Run this SQL once in your Supabase SQL editor to create the settings table:</p>
            <pre className="text-[10px] bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto text-slate-700 leading-relaxed">{`create table if not exists scan_config (
  id integer primary key default 1,
  markets text not null default '',
  min_beds integer not null default 2,
  min_price integer not null default 0,
  max_price integer not null default 600000,
  min_score integer not null default 6,
  property_types text not null default '',
  rentcast_monthly_limit integer not null default 40,
  enabled boolean not null default true,
  updated_at timestamptz default now()
);
insert into scan_config (id) values (1) on conflict do nothing;
alter table scan_config enable row level security;
create policy "anon read" on scan_config for select to anon using (true);
create policy "anon write" on scan_config for all to anon using (true);

-- If you already ran the old SQL, add the new columns:
alter table scan_config add column if not exists min_price integer not null default 0;
alter table scan_config add column if not exists property_types text not null default '';`}</pre>
          </div>
        </div>
      )}

      {/* Modals */}
      {showDealModal && (
        <DealModal
          deal={editingDeal ? { ...editingDeal } : null}
          markets={markets}
          onSave={handleSaveDeal}
          onClose={() => { setShowDealModal(false); setEditingDeal(null); }}
        />
      )}

      {showMarketModal && (
        <MarketModal
          market={editingMarket}
          onSave={handleSaveMarket}
          onClose={() => { setShowMarketModal(false); setEditingMarket(undefined); }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <p className="font-semibold text-slate-900 mb-1">Delete deal?</p>
            <p className="text-sm text-slate-500 mb-4">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-slate-200 text-slate-600 text-sm rounded-xl py-2.5 hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleDeleteDeal(confirmDelete)} className="flex-1 bg-red-500 text-white text-sm rounded-xl py-2.5 hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

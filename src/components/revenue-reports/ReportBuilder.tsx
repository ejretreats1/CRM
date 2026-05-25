import { useState, useRef } from 'react';
import { Upload, FileText, X, Loader, ChevronRight, DollarSign, AlertCircle, Plus, Trash2 } from 'lucide-react';
import type { Lead, Owner } from '../../types';

interface GeneratedReport {
  reportType: 'str' | 'mtr' | 'deal';
  // STR fields
  extracted?: {
    projectedAnnualRevenue: number | null;
    occupancyRate: number | null;
    adr: number | null;
    revpar: number | null;
  };
  // MTR fields
  strExtracted?: {
    projectedAnnualRevenue: number | null;
    occupancyRate: number | null;
    adr: number | null;
  };
  mtrProjected?: {
    monthlyRent: number;
    annualRevenue: number;
    occupancyRate: number;
    recommendedLeaseLength: string;
    targetTenantProfile: string;
  };
  strVsMtr?: {
    recommendation: 'str' | 'mtr' | 'hybrid';
    strAnnualEstimate: number | null;
    mtrAnnualEstimate: number;
    reasoning: string;
  };
  recommendedPlatforms?: string[];
  // Deal fields
  recommendation?: 'strong-buy' | 'buy' | 'neutral' | 'pass' | 'strong-pass';
  recommendationReason?: string;
  listingPrice?: number;
  units?: Array<{
    unitLabel: string;
    bedrooms: number | null;
    bathrooms: number | null;
    projectedAnnualRevenue: number | null;
    occupancyRate: number | null;
    adr: number | null;
  }>;
  combinedAnnualRevenue?: number;
  combinedOccupancyRate?: number | null;
  grossYield?: number;
  propertyHighlights?: string[];
  concerns?: string[];
  // Shared
  reportTitle: string;
  executiveSummary: string;
  marketOpportunity: string;
  performanceGap?: string | null;
  recommendations: { title: string; description: string }[];
  revenueProjections?: { conservative: number; realistic: number; optimistic: number };
  keyFindings: string[];
  opportunityScore: number;
}

interface DealUnit {
  label: string;
  bedrooms: string;
  bathrooms: string;
  file: File | null;
}

interface ReportBuilderProps {
  leads: Lead[];
  owners: Owner[];
  onReportGenerated: (address: string, data: GeneratedReport, ownerActualRevenue?: number, ownerNotes?: string, leadId?: string, ownerId?: string, additionalContext?: string) => void;
  onCancel: () => void;
}

const UNIT_LABELS: Record<number, string[]> = {
  1: ['Main Unit'],
  2: ['Unit A', 'Unit B'],
  3: ['Unit A', 'Unit B', 'Unit C'],
  4: ['Unit A', 'Unit B', 'Unit C', 'Unit D'],
};

function makeUnits(count: number): DealUnit[] {
  return (UNIT_LABELS[count] ?? UNIT_LABELS[1]).map(label => ({ label, bedrooms: '', bathrooms: '', file: null }));
}

export default function ReportBuilder({ leads, owners, onReportGenerated, onCancel }: ReportBuilderProps) {
  const [reportType, setReportType] = useState<'str' | 'mtr' | 'deal'>('str');
  const [address, setAddress] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  // STR/MTR state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ownerRevenue, setOwnerRevenue] = useState('');
  const [ownerNotes, setOwnerNotes] = useState('');
  // Deal state
  const [listingPrice, setListingPrice] = useState('');
  const [unitCount, setUnitCount] = useState(1);
  const [dealUnits, setDealUnits] = useState<DealUnit[]>(makeUnits(1));
  const [zillowDescription, setZillowDescription] = useState('');
  const [dealDragOver, setDealDragOver] = useState<number | null>(null);
  // Shared
  const [additionalContext, setAdditionalContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const dealFileRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleLeadSelect(leadId: string) {
    setSelectedLeadId(leadId);
    setSelectedOwnerId('');
    if (leadId) {
      const lead = leads.find(l => l.id === leadId);
      if (lead?.propertyAddress) setAddress(lead.propertyAddress);
    }
  }

  function handleOwnerSelect(ownerId: string) {
    setSelectedOwnerId(ownerId);
    setSelectedLeadId('');
    if (ownerId) {
      const owner = owners.find(o => o.id === ownerId);
      const firstAddress = owner?.properties?.[0]?.address;
      if (firstAddress) setAddress(firstAddress);
    }
  }

  function acceptFile(f: File) {
    if (f.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setPdfFile(f);
    setError('');
  }

  function acceptDealFile(index: number, f: File) {
    if (f.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    setDealUnits(prev => prev.map((u, i) => i === index ? { ...u, file: f } : u));
    setError('');
  }

  function handleUnitCountChange(count: number) {
    setUnitCount(count);
    setDealUnits(makeUnits(count));
  }

  function updateUnit(index: number, field: keyof DealUnit, value: string) {
    setDealUnits(prev => prev.map((u, i) => i === index ? { ...u, [field]: value } : u));
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) { setError('Property address is required.'); return; }
    if (!pdfFile) { setError('Please upload the AirDNA PDF report.'); return; }

    setGenerating(true);
    setError('');

    try {
      const pdfBase64 = await fileToBase64(pdfFile);
      const ownerActualRevenue = ownerRevenue ? parseFloat(ownerRevenue.replace(/[^0-9.]/g, '')) : undefined;

      const res = await fetch('/api/generate-revenue-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim(),
          pdfBase64,
          reportType,
          ownerActualRevenue: ownerActualRevenue || undefined,
          ownerNotes: ownerNotes.trim() || undefined,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.status === 504 ? 'Report generation timed out — try a smaller PDF or try again.' : text || `Server error ${res.status}`);
      }
      if (data.error) throw new Error(data.error);

      onReportGenerated(address.trim(), data, ownerActualRevenue, ownerNotes.trim() || undefined, selectedLeadId || undefined, selectedOwnerId || undefined, additionalContext.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) { setError('Property address is required.'); return; }
    const priceNum = parseFloat(listingPrice.replace(/[^0-9.]/g, ''));
    if (!priceNum) { setError('Listing price is required.'); return; }
    const missingIdx = dealUnits.findIndex(u => !u.file);
    if (missingIdx >= 0) {
      setError(`Please upload an AirDNA PDF for ${dealUnits[missingIdx].label}.`);
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const pdfFiles = await Promise.all(dealUnits.map(async u => ({
        base64: await fileToBase64(u.file!),
        unitLabel: u.label,
        bedrooms: u.bedrooms ? parseInt(u.bedrooms) : undefined,
        bathrooms: u.bathrooms ? parseFloat(u.bathrooms) : undefined,
      })));

      const res = await fetch('/api/generate-revenue-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address.trim(),
          reportType: 'deal',
          pdfFiles,
          listingPrice: priceNum,
          zillowDescription: zillowDescription.trim() || undefined,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.status === 504 ? 'Deal analysis timed out — try again.' : text || `Server error ${res.status}`);
      }
      if (data.error) throw new Error(data.error);

      onReportGenerated(address.trim(), data, undefined, undefined, selectedLeadId || undefined, selectedOwnerId || undefined, additionalContext.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze deal. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={onCancel} className="text-sm text-slate-500 hover:text-teal-600 mb-5 flex items-center gap-1 transition-colors">
        ← Back to Reports
      </button>

      <h2 className="text-xl font-bold text-slate-900 mb-1">New Revenue Report</h2>
      <p className="text-sm text-slate-500 mb-5">Upload an AirDNA Rentalizer PDF and Claude will generate a full analysis.</p>

      {/* Report type tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        {(['str', 'mtr', 'deal'] as const).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => setReportType(type)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              reportType === type
                ? type === 'deal' ? 'bg-white text-amber-700 shadow-sm' : 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {type === 'str' ? '🏠 Short-Term Rental' : type === 'mtr' ? '📅 Mid-Term Rental' : '🔍 Deal Analyzer'}
          </button>
        ))}
      </div>

      {reportType === 'mtr' && (
        <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          <p className="font-semibold mb-0.5">Mid-Term Rental Analysis</p>
          <p className="text-xs text-blue-600">Upload the same AirDNA PDF — Claude will extract the STR market data and project what this property could earn as a furnished 30+ day rental, then compare both strategies.</p>
        </div>
      )}

      {reportType === 'deal' && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-0.5">Deal Analyzer — Investment Analysis</p>
          <p className="text-xs text-amber-700">Analyze a property for sale as an STR acquisition. Upload one AirDNA PDF per unit, paste the Zillow description, and Claude will project revenue, calculate ROI, and give a buy/pass recommendation.</p>
        </div>
      )}

      {/* ── STR / MTR form ── */}
      {reportType !== 'deal' && (
        <form onSubmit={handleGenerate} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            {leads.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Link to lead (optional)</label>
                <select
                  value={selectedLeadId}
                  onChange={e => handleLeadSelect(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">— Select a lead —</option>
                  {leads.filter(l => l.propertyAddress).map(l => (
                    <option key={l.id} value={l.id}>{l.name} — {l.propertyAddress}</option>
                  ))}
                </select>
              </div>
            )}
            {owners.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Link to client (optional)</label>
                <select
                  value={selectedOwnerId}
                  onChange={e => handleOwnerSelect(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">— Select a client —</option>
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Property Address *</label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="123 Ocean Ave, Rehoboth Beach, DE 19971"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">AirDNA Rentalizer PDF *</label>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); e.target.value = ''; }} />
            <div
              onClick={() => !pdfFile && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) acceptFile(f); }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                pdfFile ? 'border-teal-300 bg-teal-50 cursor-default' :
                dragOver ? 'border-teal-400 bg-teal-50 cursor-pointer' :
                'border-slate-200 hover:border-teal-300 hover:bg-slate-100 cursor-pointer'
              }`}
            >
              {pdfFile ? (
                <div className="flex items-center justify-center gap-2 text-teal-700">
                  <FileText size={18} />
                  <span className="text-sm font-medium">{pdfFile.name}</span>
                  <button type="button" onClick={e => { e.stopPropagation(); setPdfFile(null); }} className="ml-1 text-slate-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={24} className={`mx-auto mb-2 ${dragOver ? 'text-teal-500' : 'text-slate-300'}`} />
                  <p className="text-sm text-slate-600 font-medium">{dragOver ? 'Drop PDF here' : 'Drag & drop or click to upload'}</p>
                  <p className="text-xs text-slate-400 mt-1">AirDNA Rentalizer PDF export</p>
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Owner Comparison (Optional)</p>
            <p className="text-xs text-slate-400">If the owner told you their actual revenue, add it here for a gap analysis.</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Actual Last 12 Months Revenue</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={ownerRevenue}
                  onChange={e => setOwnerRevenue(e.target.value)}
                  placeholder="48,000"
                  className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Owner Notes</label>
              <textarea
                value={ownerNotes}
                onChange={e => setOwnerNotes(e.target.value)}
                rows={2}
                placeholder="e.g. only rented 8 months last year, had maintenance issues..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Tell the AI anything else it should know</p>
            <p className="text-xs text-amber-600">Existing amenities, property quirks, recent renovations, owner goals, local market context.</p>
            <textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              rows={4}
              placeholder="e.g. Property has a private pool and hot tub. Owner recently renovated the kitchen. Located 5 min from the beach..."
              className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating}
              className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Loader size={14} className="animate-spin" /> Analyzing PDF...</>
              ) : (
                <>Generate {reportType.toUpperCase()} Report <ChevronRight size={14} /></>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ── Deal Analyzer form ── */}
      {reportType === 'deal' && (
        <form onSubmit={handleGenerateDeal} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            {leads.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Link to lead (optional)</label>
                <select
                  value={selectedLeadId}
                  onChange={e => handleLeadSelect(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">— Select a lead —</option>
                  {leads.filter(l => l.propertyAddress).map(l => (
                    <option key={l.id} value={l.id}>{l.name} — {l.propertyAddress}</option>
                  ))}
                </select>
              </div>
            )}
            {owners.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Link to client (optional)</label>
                <select
                  value={selectedOwnerId}
                  onChange={e => handleOwnerSelect(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">— Select a client —</option>
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Property Address *</label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="123 Oak Street, Nashville, TN 37201"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Listing Price *</label>
            <div className="relative">
              <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={listingPrice}
                onChange={e => setListingPrice(e.target.value)}
                placeholder="450,000"
                className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Property Type</label>
            <div className="flex gap-2">
              {[
                { value: 1, label: 'Single Family' },
                { value: 2, label: 'Duplex' },
                { value: 3, label: 'Triplex' },
                { value: 4, label: 'Quadplex' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleUnitCountChange(value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    unitCount === value
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-unit rows */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {unitCount === 1 ? 'AirDNA Report' : `AirDNA Reports — one per unit (${unitCount} total)`}
            </p>
            {dealUnits.map((unit, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{unit.label}</span>
                  <div className="flex items-center gap-2">
                    <input
                      value={unit.bedrooms}
                      onChange={e => updateUnit(idx, 'bedrooms', e.target.value)}
                      placeholder="Beds"
                      type="number"
                      min="0"
                      className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <span className="text-xs text-slate-400">bd</span>
                    <input
                      value={unit.bathrooms}
                      onChange={e => updateUnit(idx, 'bathrooms', e.target.value)}
                      placeholder="Baths"
                      type="number"
                      min="0"
                      step="0.5"
                      className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <span className="text-xs text-slate-400">ba</span>
                  </div>
                </div>

                <input
                  ref={el => { dealFileRefs.current[idx] = el; }}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) acceptDealFile(idx, f); e.target.value = ''; }}
                />
                <div
                  onClick={() => !unit.file && dealFileRefs.current[idx]?.click()}
                  onDragOver={e => { e.preventDefault(); setDealDragOver(idx); }}
                  onDragLeave={() => setDealDragOver(null)}
                  onDrop={e => { e.preventDefault(); setDealDragOver(null); const f = e.dataTransfer.files[0]; if (f) acceptDealFile(idx, f); }}
                  className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors ${
                    unit.file ? 'border-amber-300 bg-amber-50 cursor-default' :
                    dealDragOver === idx ? 'border-amber-400 bg-amber-50 cursor-pointer' :
                    'border-slate-200 hover:border-amber-300 hover:bg-slate-100 cursor-pointer'
                  }`}
                >
                  {unit.file ? (
                    <div className="flex items-center justify-center gap-2 text-amber-700">
                      <FileText size={14} />
                      <span className="text-xs font-medium truncate max-w-xs">{unit.file.name}</span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setDealUnits(prev => prev.map((u, i) => i === idx ? { ...u, file: null } : u)); }}
                        className="ml-1 text-slate-400 hover:text-red-500 flex-shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Upload size={14} className={dealDragOver === idx ? 'text-amber-400' : ''} />
                      <span className="text-xs">{dealDragOver === idx ? 'Drop PDF here' : 'Upload AirDNA PDF for this unit'}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Zillow Listing Description (optional but recommended)</label>
            <textarea
              value={zillowDescription}
              onChange={e => setZillowDescription(e.target.value)}
              rows={6}
              placeholder="Paste the full Zillow listing description here — Claude will use it to understand the property's features, amenities, condition, and highlights..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Additional Context (optional)</p>
            <p className="text-xs text-amber-600">Anything else Claude should know — local market notes, planned renovations, deal terms, competition in the area, etc.</p>
            <textarea
              value={additionalContext}
              onChange={e => setAdditionalContext(e.target.value)}
              rows={3}
              placeholder="e.g. Property is in a high-demand vacation market, 10 min from beach. Seller motivated. Needs cosmetic updates..."
              className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Loader size={14} className="animate-spin" /> Analyzing Deal...</>
              ) : (
                <><Plus size={14} /> Analyze Deal <ChevronRight size={14} /></>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

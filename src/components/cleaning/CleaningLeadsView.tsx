import { useState, useRef } from 'react';
import { Plus, Phone, Mail, Trash2, X, ChevronDown, Search, UserPlus, Upload, FileText, CheckCircle } from 'lucide-react';
import type {
  CleaningLead, CleaningLeadCategory, CleaningLeadSource,
  CleaningLeadOpportunityStatus, CleaningLeadOutreachStatus, CleaningLeadPriority, CleaningLeadMultiProp,
} from '../../services/cleaningDb';
import { CLEANING_LEAD_CATEGORIES, CLEANING_LEAD_SOURCES } from '../../services/cleaningDb';

// ─── Constants ────────────────────────────────────────────────────────────────

const OPP_STAGES: { id: CleaningLeadOpportunityStatus; short: string; color: string; bg: string }[] = [
  { id: 'New',                short: 'New',        color: '#4a90d9', bg: '#0e1e3a' },
  { id: 'Qualified',          short: 'Qualified',  color: '#9b7ae8', bg: '#1a0e3a' },
  { id: 'Quote Requested',    short: 'Quote Req.', color: '#d0954a', bg: '#2a1a05' },
  { id: 'Booked',             short: 'Booked',     color: '#4ab57a', bg: '#0a2518' },
  { id: 'Lost',               short: 'Lost',       color: '#6b7280', bg: '#1e2d45' },
  { id: 'Future Opportunity', short: 'Future Opp.',color: '#22d3ee', bg: '#0a2030' },
];

const OUTREACH_STATUSES: { id: CleaningLeadOutreachStatus; color: string }[] = [
  { id: 'Not Contacted',      color: '#6b7280' },
  { id: 'Contacted',          color: '#4a90d9' },
  { id: 'Follow-Up Required', color: '#d0954a' },
  { id: 'Responded',          color: '#22d3ee' },
  { id: 'Interested',         color: '#4ab57a' },
  { id: 'Not Interested',     color: '#e05c5c' },
];

const PRIORITIES: { id: CleaningLeadPriority; color: string; bg: string }[] = [
  { id: 'High',   color: '#e05c5c', bg: '#2a0e0e' },
  { id: 'Medium', color: '#d0954a', bg: '#2a1a05' },
  { id: 'Low',    color: '#6b7280', bg: '#1e2d45' },
];

const MULTI_PROP_OPTIONS: { id: CleaningLeadMultiProp; color: string; bg: string }[] = [
  { id: 'Yes',     color: '#4ab57a', bg: '#0a2518' },
  { id: 'No',      color: '#e05c5c', bg: '#2a0e0e' },
  { id: 'Unknown', color: '#6b7280', bg: '#1e2d45' },
];

const CATEGORY_COLORS: Record<CleaningLeadCategory, string> = {
  'Property Management':        'bg-[#1a0e3a] text-[#9b7ae8]',
  'Realtor / Real Estate Team': 'bg-[#0e1e3a] text-[#4a90d9]',
  'Short-Term Rental':          'bg-[#0a2518] text-[#4ab57a]',
  'Real Estate Investor':       'bg-[#2a1a05] text-[#d0954a]',
  'Strategic Partner':          'bg-[#2a0e2a] text-[#d07af5]',
  'Residential':                'bg-[#1e2d45] text-[#b8d4f0]',
};

const SOURCE_COLORS: Record<CleaningLeadSource, string> = {
  'Scraped List':         'bg-[#0e1e3a] text-[#4a90d9]',
  'Google':               'bg-[#1a0e0e] text-[#ef4444]',
  'LinkedIn':             'bg-[#0a1a2e] text-[#60a5fa]',
  'Facebook Group':       'bg-[#0e1a2a] text-[#38bdf8]',
  'Facebook Marketplace': 'bg-[#0e1a2a] text-[#22d3ee]',
  'Website':              'bg-[#1a1a0e] text-[#d4c060]',
  'Referral':             'bg-[#0a2010] text-[#3dd68c]',
  'Other':                'bg-[#1e2d45] text-[#b8d4f0]',
};

function oppStyle(id: CleaningLeadOpportunityStatus) {
  return OPP_STAGES.find(s => s.id === id) ?? OPP_STAGES[0];
}
function outreachStyle(id: CleaningLeadOutreachStatus) {
  return OUTREACH_STATUSES.find(s => s.id === id) ?? OUTREACH_STATUSES[0];
}
function priorityStyle(id: CleaningLeadPriority | undefined) {
  return PRIORITIES.find(p => p.id === id);
}

function blankLead(): CleaningLead {
  const now = new Date().toISOString();
  return {
    id: `cl_${Date.now()}`,
    name: '', email: '', phone: '', company: '',
    category: 'Property Management',
    source: 'Other',
    outreachStatus: 'Not Contacted',
    opportunityStatus: 'New',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── CSV utilities ────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const row: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

function coerceCategory(raw: string): CleaningLeadCategory {
  const s = raw.toLowerCase().trim();
  if (s.includes('property management') || s === 'pm') return 'Property Management';
  if (s.includes('realtor') || s.includes('real estate team') || s.includes('real estate agent')) return 'Realtor / Real Estate Team';
  if (s.includes('short-term') || s.includes('short term') || s === 'str') return 'Short-Term Rental';
  if (s.includes('investor')) return 'Real Estate Investor';
  if (s.includes('strategic') || s.includes('partner')) return 'Strategic Partner';
  if (s.includes('residential')) return 'Residential';
  return 'Property Management';
}

function coerceSource(raw: string): CleaningLeadSource {
  const s = raw.toLowerCase().trim();
  if (s.includes('scraped') || s === 'scrape') return 'Scraped List';
  if (s.includes('google')) return 'Google';
  if (s.includes('linkedin')) return 'LinkedIn';
  if (s.includes('facebook group') || s === 'fb group') return 'Facebook Group';
  if (s.includes('facebook marketplace') || s.includes('fb marketplace')) return 'Facebook Marketplace';
  if (s.includes('website') || s === 'web') return 'Website';
  if (s.includes('referral')) return 'Referral';
  if (s.includes('other')) return 'Other';
  return 'Scraped List';
}

type ImportField = 'skip' | 'name' | 'email' | 'phone' | 'company' | 'category' | 'source' | 'notes';

const IMPORT_FIELDS: { id: ImportField; label: string }[] = [
  { id: 'skip',     label: '— Skip column —' },
  { id: 'name',     label: 'Name' },
  { id: 'email',    label: 'Email' },
  { id: 'phone',    label: 'Phone' },
  { id: 'company',  label: 'Company' },
  { id: 'category', label: 'Category' },
  { id: 'source',   label: 'Source' },
  { id: 'notes',    label: 'Notes' },
];

function autoDetect(headers: string[]): Record<string, ImportField> {
  const map: Record<string, ImportField> = {};
  for (const h of headers) {
    const lower = h.toLowerCase().replace(/[\s_\-]/g, '');
    if (['name', 'fullname', 'contactname', 'firstname'].some(k => lower.includes(k))) map[h] = 'name';
    else if (['email', 'emailaddress', 'mail', 'emailid'].some(k => lower.includes(k))) map[h] = 'email';
    else if (['phone', 'phonenumber', 'mobile', 'cell', 'tel'].some(k => lower.includes(k))) map[h] = 'phone';
    else if (['company', 'companyname', 'organization', 'firm', 'business', 'brokerage'].some(k => lower.includes(k))) map[h] = 'company';
    else if (['category', 'leadtype', 'type', 'leadcategory'].some(k => lower.includes(k))) map[h] = 'category';
    else if (['source', 'leadsource', 'origin'].some(k => lower.includes(k))) map[h] = 'source';
    else if (['notes', 'note', 'comments', 'comment', 'description'].some(k => lower.includes(k))) map[h] = 'notes';
    else map[h] = 'skip';
  }
  return map;
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

interface CsvImportModalProps {
  existingLeads: CleaningLead[];
  onImport: (leads: CleaningLead[]) => Promise<void>;
  onClose: () => void;
}

function CsvImportModal({ existingLeads, onImport, onClose }: CsvImportModalProps) {
  const [stage, setStage] = useState<'upload' | 'map' | 'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState({ imported: 0, skipped: 0 });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingEmails = new Set(
    existingLeads.map(l => l.email.toLowerCase().trim()).filter(Boolean)
  );

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) return;
      const hdrs = rows[0];
      const data = rows.slice(1).filter(r => r.some(c => c));
      setHeaders(hdrs);
      setDataRows(data);
      setMapping(autoDetect(hdrs));
      setStage('map');
    };
    reader.readAsText(file);
  }

  function getCol(field: ImportField, row: string[]): string {
    const idx = headers.findIndex(h => mapping[h] === field);
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  }

  const resolvedLeads: CleaningLead[] = dataRows.map(row => {
    const now = new Date().toISOString();
    const rawCat = getCol('category', row);
    const rawSrc = getCol('source', row);
    return {
      id: `cl_${crypto.randomUUID()}`,
      name:             getCol('name', row),
      email:            getCol('email', row),
      phone:            getCol('phone', row),
      company:          getCol('company', row),
      category:         rawCat ? coerceCategory(rawCat) : 'Property Management',
      source:           rawSrc ? coerceSource(rawSrc) : 'Scraped List',
      outreachStatus:   'Not Contacted',
      opportunityStatus:'New',
      notes:            getCol('notes', row),
      createdAt:        now,
      updatedAt:        now,
    };
  });

  const noNameCount = resolvedLeads.filter(l => !l.name.trim()).length;
  const valid = resolvedLeads.filter(l => l.name.trim());

  // track dups within the CSV itself too
  const seenInCsv = new Set<string>();
  const toImport = valid.filter(l => {
    const key = l.email.toLowerCase().trim();
    if (key && (existingEmails.has(key) || seenInCsv.has(key))) return false;
    if (key) seenInCsv.add(key);
    return true;
  });
  const dupCount = valid.length - toImport.length;

  async function runImport() {
    setImporting(true);
    try {
      await onImport(toImport);
      setResult({ imported: toImport.length, skipped: dupCount + noNameCount });
      setStage('done');
    } finally {
      setImporting(false);
    }
  }

  const selectCls = 'appearance-none bg-[#162035] border border-[#1e2d45] rounded-lg px-2 py-1 pr-6 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#4a90d9]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#4a90d9]" />
            <h2 className="font-bold text-white text-lg">Import CSV</h2>
          </div>
          <button onClick={onClose} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors"><X size={20} /></button>
        </div>

        {/* Upload stage */}
        {stage === 'upload' && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${dragOver ? 'border-[#4a90d9] bg-[#0e1e3a]' : 'border-[#1e2d45] hover:border-[#1e3a5a]'}`}
            >
              <Upload size={36} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-[#b8d4f0] font-medium">Drag & drop a CSV file here</p>
              <p className="text-xs text-[#3a5070] mt-1">or click to browse</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div className="mt-4 bg-[#162035] rounded-xl p-4">
              <p className="text-xs text-[#3a5070] font-semibold mb-1">Recognized column names (any order, extras ignored):</p>
              <p className="text-xs text-[#b8d4f0] font-mono">name, email, phone, company, category, source, notes</p>
              <p className="text-[10px] text-[#3a5070] mt-2">Rows with duplicate emails are skipped automatically. Category and source values are mapped automatically if unrecognized.</p>
            </div>
          </>
        )}

        {/* Map + Preview stage */}
        {stage === 'map' && (
          <>
            <div className="mb-4">
              <p className="text-xs text-[#b8d4f0] font-semibold mb-2">Map CSV columns → lead fields</p>
              <div className="grid grid-cols-2 gap-2">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-2 bg-[#162035] rounded-lg px-3 py-2">
                    <span className="text-xs text-[#3a5070] truncate flex-1 min-w-0" title={h}>{h}</span>
                    <span className="text-[10px] text-[#1e2d45] font-bold">→</span>
                    <div className="relative flex-shrink-0">
                      <select value={mapping[h] ?? 'skip'}
                        onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value as ImportField }))}
                        className={selectCls}>
                        {IMPORT_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs text-[#b8d4f0] font-semibold mb-2">Preview (first 5 rows)</p>
              <div className="overflow-x-auto rounded-xl border border-[#1e2d45]">
                <table className="w-full text-xs min-w-[480px]">
                  <thead>
                    <tr className="bg-[#162035]">
                      {(['name', 'email', 'phone', 'company', 'category', 'source'] as const).map(f => (
                        <th key={f} className="text-left px-3 py-2 text-[#3a5070] font-medium capitalize whitespace-nowrap">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedLeads.slice(0, 5).map((l, i) => (
                      <tr key={i} className="border-t border-[#1e2d45]">
                        <td className="px-3 py-2 text-white truncate max-w-[100px]">{l.name || <span className="text-[#e05c5c]">—</span>}</td>
                        <td className="px-3 py-2 text-[#b8d4f0] truncate max-w-[140px]">{l.email || '—'}</td>
                        <td className="px-3 py-2 text-[#b8d4f0] whitespace-nowrap">{l.phone || '—'}</td>
                        <td className="px-3 py-2 text-[#b8d4f0] truncate max-w-[100px]">{l.company || '—'}</td>
                        <td className="px-3 py-2 text-[#9b7ae8] truncate max-w-[120px] whitespace-nowrap">{l.category}</td>
                        <td className="px-3 py-2 text-[#4a90d9] whitespace-nowrap">{l.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 mb-5">
              {[
                { label: 'Total rows',    value: dataRows.length,   color: 'text-white' },
                { label: 'Will import',   value: toImport.length,   color: 'text-[#3dd68c]' },
                { label: 'Duplicates',    value: dupCount,           color: 'text-[#d0954a]' },
                { label: 'Missing name',  value: noNameCount,        color: 'text-[#e05c5c]' },
              ].map(s => (
                <div key={s.label} className="flex-1 bg-[#162035] rounded-xl p-3 text-center">
                  <div className={`font-bold text-lg ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-[#3a5070] mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStage('upload')}
                className="flex-1 py-2.5 rounded-xl border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium hover:bg-[#162035] transition-colors">
                ← Back
              </button>
              <button onClick={runImport} disabled={importing || toImport.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-[#4a90d9] hover:bg-[#3a7bc0] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors">
                {importing ? 'Importing…' : `Import ${toImport.length} lead${toImport.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {/* Done stage */}
        {stage === 'done' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-[#0a2518] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-[#3dd68c]" />
            </div>
            <h3 className="text-white font-bold text-lg mb-1">Import complete!</h3>
            <p className="text-[#b8d4f0] text-sm mb-5">
              <span className="text-[#3dd68c] font-semibold">{result.imported} lead{result.imported !== 1 ? 's' : ''}</span> imported
              {result.skipped > 0 && <>, <span className="text-[#d0954a]">{result.skipped}</span> skipped</>}
            </p>
            <button onClick={onClose}
              className="px-8 py-2.5 rounded-xl bg-[#3dd68c] hover:bg-[#2dba7a] text-[#0f2018] font-semibold text-sm transition-colors">
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Lead modal ───────────────────────────────────────────────────────────────

interface ModalProps {
  lead: CleaningLead;
  onSave: (lead: CleaningLead) => void;
  onClose: () => void;
}

function LeadModal({ lead: initial, onSave, onClose }: ModalProps) {
  const [lead, setLead] = useState<CleaningLead>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CleaningLead>(k: K, v: CleaningLead[K]) {
    setLead(prev => ({ ...prev, [k]: v, updatedAt: new Date().toISOString() }));
  }

  async function save() {
    if (!lead.name.trim()) return;
    setSaving(true);
    try { await onSave(lead); } finally { setSaving(false); }
  }

  const isNew = !initial.name;
  const inputCls = 'w-full bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]';
  const selectCls = 'w-full appearance-none bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-white text-lg">{isNew ? 'Add Lead' : 'Edit Lead'}</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors"><X size={20} /></button>
        </div>

        <div className="space-y-3.5">
          {/* Name + Company */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Name <span className="text-[#ef4444]">*</span></label>
              <input value={lead.name} onChange={e => set('name', e.target.value)} placeholder="Full name" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Company</label>
              <input value={lead.company} onChange={e => set('company', e.target.value)} placeholder="Company name" className={inputCls} />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Phone</label>
              <input value={lead.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" type="tel" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Email</label>
              <input value={lead.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" type="email" className={inputCls} />
            </div>
          </div>

          {/* Category + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Lead Category</label>
              <div className="relative">
                <select value={lead.category} onChange={e => set('category', e.target.value as CleaningLeadCategory)} className={selectCls}>
                  {CLEANING_LEAD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">Lead Source</label>
              <div className="relative">
                <select value={lead.source} onChange={e => set('source', e.target.value as CleaningLeadSource)} className={selectCls}>
                  {CLEANING_LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Priority</label>
            <div className="flex gap-1.5">
              {PRIORITIES.map(p => (
                <button key={p.id} type="button" onClick={() => set('priority', p.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={lead.priority === p.id
                    ? { background: p.bg, color: p.color, borderColor: p.color + '80' }
                    : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                  {p.id}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Property Potential */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Multi-Property Potential</label>
            <div className="flex gap-1.5">
              {MULTI_PROP_OPTIONS.map(p => (
                <button key={p.id} type="button" onClick={() => set('multiProp', p.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={lead.multiProp === p.id
                    ? { background: p.bg, color: p.color, borderColor: p.color + '80' }
                    : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                  {p.id}
                </button>
              ))}
            </div>
          </div>

          {/* Outreach Status */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Outreach Status</label>
            <div className="relative">
              <select value={lead.outreachStatus} onChange={e => set('outreachStatus', e.target.value as CleaningLeadOutreachStatus)} className={selectCls}>
                {OUTREACH_STATUSES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
            </div>
          </div>

          {/* Opportunity Status */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Opportunity Status</label>
            <div className="flex gap-1.5 flex-wrap">
              {OPP_STAGES.map(s => (
                <button key={s.id} type="button" onClick={() => set('opportunityStatus', s.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={lead.opportunityStatus === s.id
                    ? { background: s.bg, color: s.color, borderColor: s.color + '80' }
                    : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                  {s.short}
                </button>
              ))}
            </div>
          </div>

          {/* Handoff Needed */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={!!lead.handoffNeeded}
              onChange={e => set('handoffNeeded', e.target.checked)}
              className="w-4 h-4 rounded accent-[#4a90d9]" />
            <span className="text-xs text-[#b8d4f0]">Handoff Needed</span>
          </label>

          {/* Notes */}
          <div>
            <label className="text-xs text-[#b8d4f0] block mb-1">Notes</label>
            <textarea value={lead.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Property count, follow-up notes, context…"
              rows={3}
              className="w-full bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] resize-none" />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium hover:bg-[#162035] transition-colors">Cancel</button>
          <button onClick={save} disabled={saving || !lead.name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#3dd68c] hover:bg-[#2dba7a] disabled:opacity-40 disabled:cursor-not-allowed text-[#0f2018] font-semibold text-sm transition-colors">
            {saving ? 'Saving…' : isNew ? 'Add Lead' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface Props {
  leads: CleaningLead[];
  onSave: (lead: CleaningLead) => Promise<void>;
  onBulkSave?: (leads: CleaningLead[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function CleaningLeadsView({ leads, onSave, onBulkSave, onDelete }: Props) {
  const [modal, setModal] = useState<CleaningLead | null>(null);
  const [csvImport, setCsvImport] = useState(false);
  const [section, setSection] = useState<'outreach' | 'scraped'>('outreach');
  const [oppFilter, setOppFilter] = useState<CleaningLeadOpportunityStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<CleaningLeadCategory | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<CleaningLeadPriority | 'all'>('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sectionLeads = leads.filter(l =>
    section === 'scraped' ? l.source === 'Scraped List' : l.source !== 'Scraped List'
  );

  const filtered = sectionLeads.filter(l => {
    if (oppFilter !== 'all' && l.opportunityStatus !== oppFilter) return false;
    if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
    if (priorityFilter !== 'all' && l.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.company.toLowerCase().includes(q) &&
          !l.email.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
    }
    return true;
  });

  const oppCounts: Record<string, number> = { all: sectionLeads.length };
  for (const s of OPP_STAGES) oppCounts[s.id] = sectionLeads.filter(l => l.opportunityStatus === s.id).length;

  const outreachCount = leads.filter(l => l.source !== 'Scraped List').length;
  const scrapedCount  = leads.filter(l => l.source === 'Scraped List').length;

  async function handleDelete(id: string) {
    await onDelete(id);
    setConfirmDelete(null);
  }

  async function quickOppStatus(lead: CleaningLead, opportunityStatus: CleaningLeadOpportunityStatus) {
    await onSave({ ...lead, opportunityStatus, updatedAt: new Date().toISOString() });
  }

  async function quickOutreach(lead: CleaningLead, outreachStatus: CleaningLeadOutreachStatus) {
    await onSave({ ...lead, outreachStatus, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Cleaning Leads</h1>
          <p className="text-xs text-[#3a5070] mt-0.5">
            {outreachCount} outreach · {scrapedCount} scraped
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onBulkSave && (
            <button onClick={() => setCsvImport(true)}
              className="flex items-center gap-1.5 border border-[#1e2d45] hover:border-[#1e3a5a] text-[#b8d4f0] hover:text-white text-sm px-3 py-2.5 rounded-xl transition-colors">
              <Upload size={14} /> Import CSV
            </button>
          )}
          <button onClick={() => setModal(blankLead())}
            className="flex items-center gap-2 bg-[#3dd68c] hover:bg-[#2dba7a] text-[#0f2018] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={15} /> Add Lead
          </button>
        </div>
      </div>

      {/* Section toggle: Outreach Leads / Scraped Leads */}
      <div className="flex bg-[#0f1923] border border-[#1e2d45] rounded-xl p-1 gap-1 w-fit mb-5">
        <button
          onClick={() => { setSection('outreach'); setOppFilter('all'); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${section === 'outreach' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
          Outreach Leads <span className="ml-1.5 text-xs opacity-70">({outreachCount})</span>
        </button>
        <button
          onClick={() => { setSection('scraped'); setOppFilter('all'); }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${section === 'scraped' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
          Scraped Leads <span className="ml-1.5 text-xs opacity-70">({scrapedCount})</span>
        </button>
      </div>

      {/* Opportunity Status pipeline tabs */}
      <div className="flex gap-1 mb-4 bg-[#162035] p-1 rounded-xl w-fit flex-wrap">
        <button onClick={() => setOppFilter('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${oppFilter === 'all' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}>
          All ({oppCounts.all})
        </button>
        {OPP_STAGES.map(s => (
          <button key={s.id} onClick={() => setOppFilter(s.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${oppFilter === s.id ? 'bg-[#1a2335] shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
            style={oppFilter === s.id ? { color: s.color } : {}}>
            {s.short} ({oppCounts[s.id] ?? 0})
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a5070]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, company, email, phone…"
            className="w-full pl-8 pr-3 py-2 text-xs bg-[#162035] border border-[#1e2d45] rounded-lg text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
        </div>
        <div className="relative">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as CleaningLeadCategory | 'all')}
            className="appearance-none bg-[#162035] border border-[#1e2d45] rounded-lg pl-3 pr-7 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
            <option value="all">All Categories</option>
            {CLEANING_LEAD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
        </div>
        <div className="relative">
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as CleaningLeadPriority | 'all')}
            className="appearance-none bg-[#162035] border border-[#1e2d45] rounded-lg pl-3 pr-7 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]">
            <option value="all">All Priorities</option>
            {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.id} Priority</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-[#1e2d45] rounded-2xl">
          <UserPlus size={36} className="text-[#3a5070] mx-auto mb-3" />
          <p className="text-[#b8d4f0] font-medium">
            {sectionLeads.length === 0
              ? section === 'scraped' ? 'No scraped leads yet' : 'No outreach leads yet'
              : 'No leads match your filters'}
          </p>
          <p className="text-xs text-[#3a5070] mt-1 mb-4">
            {sectionLeads.length === 0
              ? section === 'scraped'
                ? 'Use the Lead Scraper to find and import companies'
                : 'Add leads manually or import a CSV'
              : 'Try adjusting your search or filters'}
          </p>
          {sectionLeads.length === 0 && section === 'outreach' && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setModal(blankLead())}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3dd68c] border border-[#0a2518] hover:bg-[#0a2518] px-4 py-2 rounded-lg transition-colors">
                <Plus size={14} /> Add Lead
              </button>
              {onBulkSave && (
                <button onClick={() => setCsvImport(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4a90d9] border border-[#0e1e3a] hover:bg-[#0e1e3a] px-4 py-2 rounded-lg transition-colors">
                  <Upload size={14} /> Import CSV
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lead cards */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(lead => {
            const opp = oppStyle(lead.opportunityStatus);
            const outreach = outreachStyle(lead.outreachStatus);
            const pri = priorityStyle(lead.priority);
            return (
              <div key={lead.id}
                className="bg-[#1a2335] border border-[#1e2d45] rounded-xl px-4 py-3.5 hover:border-[#1e3a5a] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Name + company + priority badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setModal(lead)} className="font-semibold text-white hover:text-[#4a90d9] transition-colors text-sm">
                        {lead.name}
                      </button>
                      {lead.company && <span className="text-xs text-[#3a5070]">· {lead.company}</span>}
                      {pri && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ color: pri.color, background: pri.bg }}>
                          {pri.id}
                        </span>
                      )}
                      {lead.handoffNeeded && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a0e3a] text-[#9b7ae8] font-semibold">Handoff</span>
                      )}
                    </div>

                    {/* Category + Source + Outreach quick selector */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[lead.category] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                        {lead.category}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[lead.source] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                        {lead.source}
                      </span>
                      {lead.multiProp && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#1e2d45] text-[#b8d4f0]">
                          Multi: {lead.multiProp}
                        </span>
                      )}
                      {/* Outreach quick selector */}
                      <div className="relative group">
                        <button className="flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
                          style={{ color: outreach.color, borderColor: outreach.color + '50', background: outreach.color + '18' }}>
                          {lead.outreachStatus === 'Follow-Up Required' ? 'Follow-Up' : lead.outreachStatus}
                          <ChevronDown size={8} />
                        </button>
                        <div className="absolute left-0 top-full mt-1 bg-[#1a2335] border border-[#1e2d45] rounded-xl shadow-xl z-20 overflow-hidden hidden group-hover:block min-w-40">
                          {OUTREACH_STATUSES.map(s => (
                            <button key={s.id} onClick={() => quickOutreach(lead, s.id)}
                              className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[#162035]"
                              style={{ color: lead.outreachStatus === s.id ? s.color : '#b8d4f0' }}>
                              {s.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#4a90d9] transition-colors">
                          <Phone size={11} /> {lead.phone}
                        </a>
                      )}
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#4a90d9] transition-colors">
                          <Mail size={11} /> {lead.email}
                        </a>
                      )}
                      {lead.notes && (
                        <span className="text-xs text-[#3a5070] truncate max-w-xs hidden sm:inline" title={lead.notes}>{lead.notes}</span>
                      )}
                    </div>
                  </div>

                  {/* Opportunity status + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="relative group">
                      <button className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors"
                        style={{ background: opp.bg, color: opp.color, borderColor: opp.color + '60' }}>
                        {opp.short} <ChevronDown size={10} />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-[#1a2335] border border-[#1e2d45] rounded-xl shadow-xl z-20 overflow-hidden hidden group-hover:block min-w-40">
                        {OPP_STAGES.map(s => (
                          <button key={s.id} onClick={() => quickOppStatus(lead, s.id)}
                            className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-[#162035]"
                            style={{ color: lead.opportunityStatus === s.id ? s.color : '#b8d4f0' }}>
                            {s.id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setModal(lead)}
                      className="text-xs text-[#3a5070] hover:text-[#b8d4f0] border border-[#1e2d45] hover:border-[#1e3a5a] px-2.5 py-1.5 rounded-lg transition-colors">
                      Edit
                    </button>
                    <button onClick={() => setConfirmDelete(lead.id)}
                      className="text-[#3a5070] hover:text-[#e05c5c] p-1.5 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CSV Import Modal */}
      {csvImport && onBulkSave && (
        <CsvImportModal
          existingLeads={leads}
          onImport={async imported => { await onBulkSave(imported); }}
          onClose={() => setCsvImport(false)}
        />
      )}

      {/* Lead modal */}
      {modal && (
        <LeadModal
          lead={modal}
          onSave={async lead => { await onSave(lead); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-[#1a2335] rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-white mb-2">Delete lead?</h3>
            <p className="text-sm text-[#b8d4f0] mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium hover:bg-[#162035] transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2.5 rounded-xl bg-[#e05c5c] hover:bg-[#c04040] text-white font-semibold text-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
import { X, Upload, CheckCircle2, ChevronRight } from 'lucide-react';
import type { Lead, LeadSource, LeadStage, Contact, ContactCategory } from '../../types';

interface ParsedRow {
  name: string;
  email: string;
  phone: string;
  hasEmail: boolean;
  isDupe: boolean;
}

interface Props {
  mode?: 'leads' | 'contacts';
  existingEmails: Set<string>;
  onImportLeads?: (leads: Lead[]) => Promise<void>;
  onImportContacts?: (contacts: Contact[]) => Promise<void>;
  onClose: () => void;
}

function splitCsvLine(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t').map(f => f.trim().replace(/^"|"$/g, ''));
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === delim && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseText(text: string, existingEmails: Set<string>): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  const tabs   = (lines[0].match(/\t/g)  ?? []).length;
  const commas = (lines[0].match(/,/g)   ?? []).length;
  const delim  = tabs >= commas ? '\t' : ',';

  const rows = lines.map(l => splitCsvLine(l, delim));
  if (!rows.length) return [];

  let nameCol = -1, emailCol = -1, phoneCol = -1;
  const firstLower = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const isHeader   = firstLower.some(h => ['name','email','phone','first','last','mail'].some(k => h.includes(k)));

  if (isHeader) {
    nameCol  = firstLower.findIndex(h => h.includes('name') || h.includes('first'));
    emailCol = firstLower.findIndex(h => h.includes('email') || h.includes('mail'));
    phoneCol = firstLower.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('cell') || h.includes('tel'));
  } else {
    for (let i = 0; i < rows[0].length; i++) {
      const v = rows[0][i].trim();
      if (emailCol === -1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { emailCol = i; continue; }
      if (phoneCol === -1 && /^[\d\s\-().+]{7,}$/.test(v))          { phoneCol = i; continue; }
      if (nameCol  === -1 && /^[a-z\s\-'.]{2,}$/i.test(v))           { nameCol  = i; continue; }
    }
    if (rows[0].length >= 2) {
      if (nameCol  === -1) nameCol  = 0;
      if (emailCol === -1) emailCol = 1;
      if (phoneCol === -1 && rows[0].length >= 3) phoneCol = 2;
    }
  }

  const dataRows = isHeader ? rows.slice(1) : rows;
  return dataRows
    .filter(r => r.some(f => f.trim()))
    .map(row => {
      const email = emailCol >= 0 ? (row[emailCol] ?? '').toLowerCase().trim() : '';
      return {
        name:     (nameCol  >= 0 ? row[nameCol]  ?? '' : '').trim(),
        email,
        phone:    (phoneCol >= 0 ? row[phoneCol] ?? '' : '').trim(),
        hasEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        isDupe:   !!email && existingEmails.has(email),
      };
    })
    .filter(r => r.name || r.email);
}

const LEAD_SOURCE_OPTS: { value: LeadSource; label: string }[] = [
  { value: 'cold_outreach',    label: 'Cold Outreach'     },
  { value: 'airbnb_outreach',  label: 'Airbnb Outreach'   },
  { value: 'facebook_outreach',label: 'Facebook Outreach' },
  { value: 'meta_ads',         label: 'Meta Ads'          },
  { value: 'social',           label: 'Social'            },
  { value: 'other',            label: 'Other'             },
];

const CATEGORY_OPTS: { value: ContactCategory; label: string }[] = [
  { value: 'real_estate_agent', label: 'Real Estate Agent'  },
  { value: 'referral_partner',  label: 'Referral Partner'   },
  { value: 'investor',          label: 'Investor'           },
  { value: 'vendor',            label: 'Vendor'             },
  { value: 'other',             label: 'Other'              },
];

export default function LeadImportModal({ mode = 'leads', existingEmails, onImportLeads, onImportContacts, onClose }: Props) {
  const [tab,       setTab]      = useState<'paste' | 'csv'>('paste');
  const [rawText,   setRawText]  = useState('');
  const [parsed,    setParsed]   = useState<ParsedRow[] | null>(null);
  const [stage,     setStage]    = useState<LeadStage>('new');
  const [source,    setSource]   = useState<LeadSource>('cold_outreach');
  const [category,  setCategory] = useState<ContactCategory>('real_estate_agent');
  const [importing, setImporting]= useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doParse = useCallback((text: string) => {
    setParsed(parseText(text, existingEmails));
  }, [existingEmails]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) ?? '';
      setRawText(text);
      doParse(text);
    };
    reader.readAsText(file);
  }, [doParse]);

  const validRows = parsed?.filter(r => r.hasEmail && !r.isDupe) ?? [];
  const dupeCount = parsed?.filter(r => r.isDupe).length ?? 0;
  const badCount  = parsed?.filter(r => !r.hasEmail && !!r.email).length ?? 0;

  async function handleImport() {
    if (!validRows.length) return;
    setImporting(true);
    const now = new Date().toISOString();
    try {
      if (mode === 'contacts') {
        const contacts: Contact[] = validRows.map(r => ({
          id:        `contact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name:      r.name || r.email.split('@')[0],
          email:     r.email,
          phone:     r.phone,
          category,
          notes:     '',
          createdAt: now,
        }));
        await onImportContacts?.(contacts);
      } else {
        const leads: Lead[] = validRows.map(r => ({
          id:               `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name:             r.name || r.email.split('@')[0],
          email:            r.email,
          phone:            r.phone,
          propertyAddress:  '',
          propertyType:     '',
          bedrooms:         0,
          estimatedRevenue: 0,
          stage,
          notes:            '',
          source,
          createdAt:        now,
          updatedAt:        now,
        }));
        await onImportLeads?.(leads);
      }
      onClose();
    } finally {
      setImporting(false);
    }
  }

  const isContacts = mode === 'contacts';
  const title      = isContacts ? 'Import Contacts' : 'Import Leads';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#1a2335] border border-[#243550] rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550] flex-shrink-0">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!parsed ? (
            <>
              <div className="flex gap-1 bg-[#111d30] p-1 rounded-lg">
                {(['paste', 'csv'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors ${
                      tab === t ? 'bg-[#1e2d45] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'
                    }`}
                  >
                    {t === 'paste' ? 'Paste Text' : 'Upload CSV'}
                  </button>
                ))}
              </div>

              {tab === 'paste' ? (
                <div>
                  <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Paste your data</label>
                  <textarea
                    className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] resize-none font-mono"
                    rows={9}
                    placeholder={"Name\tEmail\tPhone\nJohn Smith\tjohn@email.com\t555-1234"}
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                  />
                  <p className="text-xs text-[#3a5070] mt-1 leading-relaxed">
                    Paste from a spreadsheet (tab-separated) or CSV. Columns auto-detected from headers or content.
                  </p>
                  <button
                    onClick={() => doParse(rawText)}
                    disabled={!rawText.trim()}
                    className="mt-3 w-full py-2.5 rounded-lg text-sm font-semibold bg-[#4a90d9] text-white hover:bg-[#3a7bc8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    Preview <ChevronRight size={15} />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt,.tsv"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-[#243550] rounded-xl py-12 flex flex-col items-center gap-3 hover:border-[#4a90d9] hover:bg-[#111d30] transition-colors cursor-pointer"
                  >
                    <Upload size={30} className="text-[#3a5070]" />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-white">Click to upload</p>
                      <p className="text-xs text-[#3a5070] mt-0.5">.csv · .txt · .tsv</p>
                    </div>
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Ready',    value: validRows.length, color: 'text-[#4ab57a]'  },
                  { label: 'Dupes',    value: dupeCount,        color: dupeCount > 0 ? 'text-[#f0a940]' : 'text-[#3a5070]' },
                  { label: 'Bad email',value: badCount,         color: badCount  > 0 ? 'text-[#e05c5c]' : 'text-[#3a5070]' },
                ].map(s => (
                  <div key={s.label} className="bg-[#111d30] rounded-xl p-3 text-center border border-[#243550]">
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-[#3a5070] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Settings */}
              {isContacts ? (
                <div>
                  <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Contact Category</label>
                  <select
                    className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                    value={category}
                    onChange={e => setCategory(e.target.value as ContactCategory)}
                  >
                    {CATEGORY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Stage</label>
                    <select
                      className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                      value={stage}
                      onChange={e => setStage(e.target.value as LeadStage)}
                    >
                      <option value="new">New Lead</option>
                      <option value="contacted">Contacted</option>
                      <option value="cold">Cold</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-1.5 block">Source</label>
                    <select
                      className="w-full bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                      value={source}
                      onChange={e => setSource(e.target.value as LeadSource)}
                    >
                      {LEAD_SOURCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">
                    Preview {parsed.length > 10 ? `(10 of ${parsed.length})` : `(${parsed.length})`}
                  </span>
                  <button onClick={() => setParsed(null)} className="text-xs text-[#3a5070] hover:text-[#b8d4f0]">← Back</button>
                </div>
                <div className="bg-[#111d30] border border-[#243550] rounded-xl overflow-auto" style={{ maxHeight: 190 }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#243550]">
                        <th className="px-3 py-2 text-left text-[#3a5070] font-semibold">Name</th>
                        <th className="px-3 py-2 text-left text-[#3a5070] font-semibold">Email</th>
                        <th className="px-3 py-2 text-left text-[#3a5070] font-semibold">Phone</th>
                        <th className="px-3 py-2 w-14" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2d45]">
                      {parsed.slice(0, 10).map((row, i) => (
                        <tr key={i} className={row.isDupe || !row.hasEmail ? 'opacity-40' : ''}>
                          <td className="px-3 py-2 text-white truncate max-w-[90px]">{row.name || '—'}</td>
                          <td className="px-3 py-2 text-[#b8d4f0] truncate max-w-[130px]">{row.email || '—'}</td>
                          <td className="px-3 py-2 text-[#3a5070]">{row.phone || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            {row.isDupe    ? <span className="text-[#f0a940]">dupe</span>
                           : !row.hasEmail ? <span className="text-[#e05c5c]">bad</span>
                           : <CheckCircle2 size={12} className="text-[#4ab57a] mx-auto" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 10 && (
                    <div className="px-3 py-2 text-xs text-[#3a5070] border-t border-[#1e2d45]">+{parsed.length - 10} more</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {parsed && (
          <div className="px-5 py-4 border-t border-[#243550] flex-shrink-0">
            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-[#4ab57a] text-white hover:bg-[#3aa56a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? 'Importing…' : `Import ${validRows.length} ${isContacts ? 'Contact' : 'Lead'}${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

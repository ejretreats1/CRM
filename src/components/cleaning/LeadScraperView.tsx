import { useState } from 'react';
import { Search, Globe, Mail, Phone, CheckSquare, Square, Download, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { bulkUpsertCleaningLeads } from '../../services/cleaningDb';
import type { CleaningLead, CleaningLeadCategory } from '../../services/cleaningDb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoundSite {
  name: string;
  url: string;
  description: string;
  selected: boolean;
}

interface ScrapedResult {
  url: string;
  businessName: string;
  emails: string[];
  phones: string[];
  found: boolean;
  error?: string;
  selected: boolean;
}

const BUSINESS_TYPES = [
  { id: 'property management', label: 'Property Management', category: 'Property Management' as CleaningLeadCategory },
  { id: 'realtor',             label: 'Realtor / Real Estate', category: 'Realtor / Real Estate Team' as CleaningLeadCategory },
  { id: 'short term rental',   label: 'Short-Term Rental', category: 'Short-Term Rental' as CleaningLeadCategory },
  { id: 'investor',            label: 'Real Estate Investor', category: 'Real Estate Investor' as CleaningLeadCategory },
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeadScraperView() {
  // Search form
  const [businessType, setBusinessType] = useState('property management');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('FL');
  const [count, setCount] = useState('30');

  // Step states
  const [step, setStep] = useState<'search' | 'sites' | 'scraping' | 'review' | 'done'>('search');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Found sites
  const [sites, setSites] = useState<FoundSite[]>([]);

  // Scraping
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [scrapeTotal, setScrapeTotal] = useState(0);
  const [scraped, setScraped] = useState<ScrapedResult[]>([]);
  const [scrapeErrors, setScrapeErrors] = useState<string[]>([]);

  // Import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  // ── Step 1: Find websites ──────────────────────────────────────────────────

  async function handleSearch() {
    if (!city.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const params = new URLSearchParams({ businessType, city: city.trim(), state: stateCode, count });
      const r = await fetch(`/api/documents?flow=scraper&action=find-urls&${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Search failed');
      if (!d.results?.length) {
        const first = d.diagnostics?.[0];
        const snippet = first?.bing?.htmlSnippet ?? first?.ddg?.htmlSnippet ?? '';
        const diag = (d.diagnostics ?? []).map((x: any) =>
          `"${x.q}": DDG ${x.ddg?.status ?? '?'} (${x.ddg?.htmlLen ?? 0}b, ${x.ddg?.anchorCount ?? 0} h2s)` +
          (x.bing ? ` | Bing ${x.bing.status} (${x.bing.htmlLen}b, ${x.bing.anchorCount} h2s)` : '')
        ).join('\n') + (snippet ? `\n\nBing HTML preview:\n${snippet.slice(0, 400)}` : '');
        throw new Error(`No results found. Try a different city or business type.\n\n${diag}`);
      }
      setSites(d.results.map((s: { name: string; url: string; description: string }) => ({ ...s, selected: true })));
      setStep('sites');
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  // ── Step 2: Scrape emails from selected sites ──────────────────────────────

  async function handleScrape() {
    const urls = sites.filter(s => s.selected).map(s => s.url);
    if (!urls.length) return;
    setStep('scraping');
    setScrapeProgress(0);
    setScrapeTotal(urls.length);
    setScrapeErrors([]);

    const allResults: ScrapedResult[] = [];
    const batchSize = 10; // scrape 10 in parallel per call

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      try {
        const r = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flow: 'scraper', action: 'scrape-emails', urls: batch }),
        });
        const d = await r.json();
        if (r.ok && d.results) {
          allResults.push(...(d.results as ScrapedResult[]).map(r => ({
            ...r,
            selected: r.emails.length > 0,
          })));
        }
      } catch {}
      setScrapeProgress(Math.min(i + batchSize, urls.length));
    }

    setScraped(allResults);
    setStep('review');
  }

  // ── Step 3: Import selected results to Cleaning Leads ─────────────────────

  async function handleImport() {
    const toImport = scraped.filter(s => s.selected && s.emails.length > 0);
    if (!toImport.length) return;
    setImporting(true);
    try {
      const category = BUSINESS_TYPES.find(t => t.id === businessType)?.category ?? 'Property Management';
      const now = new Date().toISOString();
      const leads: CleaningLead[] = toImport.map(s => ({
        id: `cl_${crypto.randomUUID()}`,
        name:             s.businessName,
        email:            s.emails[0] ?? '',
        phone:            s.phones[0] ?? '',
        company:          s.businessName,
        category,
        source:           'Scraped List' as const,
        outreachStatus:   'Not Contacted' as const,
        opportunityStatus:'New' as const,
        notes:            [
          s.emails.length > 1 ? `Extra emails: ${s.emails.slice(1).join(', ')}` : '',
          s.url,
        ].filter(Boolean).join(' · '),
        createdAt: now,
        updatedAt: now,
      }));
      await bulkUpsertCleaningLeads(leads);
      setImportResult({ imported: leads.length, skipped: toImport.length - leads.length });
      setStep('done');
    } finally {
      setImporting(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toggleSite(i: number) { setSites(p => p.map((s, idx) => idx === i ? { ...s, selected: !s.selected } : s)); }
  function toggleAll(val: boolean) { setSites(p => p.map(s => ({ ...s, selected: val }))); }
  function toggleResult(i: number) { setScraped(p => p.map((s, idx) => idx === i ? { ...s, selected: !s.selected } : s)); }
  function toggleAllResults(val: boolean) { setScraped(p => p.map(s => ({ ...s, selected: val && s.emails.length > 0 }))); }

  const selectedSiteCount = sites.filter(s => s.selected).length;
  const foundCount = scraped.filter(s => s.emails.length > 0).length;
  const selectedResultCount = scraped.filter(s => s.selected).length;

  const inputCls = 'bg-[#162035] border border-[#1e2d45] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]';
  const selectCls = 'appearance-none bg-[#162035] border border-[#1e2d45] rounded-xl px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9]';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Lead Scraper</h1>
          <p className="text-xs text-[#3a5070] mt-0.5">Find business websites → extract emails → import to leads</p>
        </div>
        {step !== 'search' && (
          <button onClick={() => { setStep('search'); setSites([]); setScraped([]); setImportResult(null); }}
            className="text-xs text-[#3a5070] hover:text-[#b8d4f0] border border-[#1e2d45] px-3 py-1.5 rounded-lg transition-colors">
            ← New Search
          </button>
        )}
      </div>

      {/* ── Step 1: Search form ── */}
      {step === 'search' && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Search Parameters</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs text-[#b8d4f0] block mb-1">Business Type</label>
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_TYPES.map(t => (
                  <button key={t.id} onClick={() => setBusinessType(t.id)}
                    className="py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left"
                    style={businessType === t.id
                      ? { background: '#0e1e3a', color: '#4a90d9', borderColor: '#4a90d980' }
                      : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Tampa"
                onKeyDown={e => e.key === 'Enter' && !searching && city.trim() && handleSearch()}
                className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="text-xs text-[#b8d4f0] block mb-1">State</label>
              <select value={stateCode} onChange={e => setStateCode(e.target.value)} className={`${selectCls} w-full`}>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#b8d4f0] block mb-1">Max results</label>
              <div className="flex gap-2">
                {['10', '20', '30', '50'].map(n => (
                  <button key={n} onClick={() => setCount(n)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium border transition-all"
                    style={count === n
                      ? { background: '#0e1e3a', color: '#4a90d9', borderColor: '#4a90d980' }
                      : { background: 'transparent', color: '#3a5070', borderColor: '#1e2d45' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {searchError && (
            <div className="text-[#e05c5c] text-sm bg-[#2a0e0e] border border-[#5a1a1a] rounded-xl px-4 py-3 mb-3">
              <div className="flex items-center gap-2 font-medium"><AlertCircle size={15} /> {searchError.split('\n')[0]}</div>
              {searchError.includes('\n') && (
                <pre className="mt-2 text-xs text-[#c07070] whitespace-pre-wrap font-mono">{searchError.split('\n').slice(2).join('\n')}</pre>
              )}
            </div>
          )}

          <button onClick={handleSearch} disabled={searching || !city.trim()}
            className="w-full py-3 rounded-xl bg-[#4a90d9] hover:bg-[#3a7bc0] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            {searching ? <><RefreshCw size={15} className="animate-spin" /> Searching DuckDuckGo…</> : <><Search size={15} /> Find {count} Websites</>}
          </button>

          <p className="text-[10px] text-[#2a4060] text-center mt-3">
            Searches DuckDuckGo for real business websites · Free · No API key required
          </p>
        </div>
      )}

      {/* ── Step 2: Select sites ── */}
      {step === 'sites' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#b8d4f0]">
                <span className="font-semibold text-white">{sites.length}</span> websites found
              </span>
              <span className="text-xs text-[#3a5070]">·</span>
              <span className="text-sm text-[#b8d4f0]">
                <span className="font-semibold text-white">{selectedSiteCount}</span> selected
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleAll(true)} className="text-xs text-[#4a90d9] hover:text-[#7ab0e9] transition-colors">Select all</button>
              <span className="text-[#1e2d45]">·</span>
              <button onClick={() => toggleAll(false)} className="text-xs text-[#3a5070] hover:text-[#b8d4f0] transition-colors">Deselect all</button>
            </div>
          </div>

          <div className="space-y-1.5 mb-4">
            {sites.map((s, i) => (
              <div key={s.url} onClick={() => toggleSite(i)}
                className="flex items-start gap-3 bg-[#1a2335] border border-[#1e2d45] hover:border-[#1e3a5a] rounded-xl px-4 py-3 cursor-pointer transition-colors">
                <div className="mt-0.5 flex-shrink-0">
                  {s.selected
                    ? <CheckSquare size={16} className="text-[#4a90d9]" />
                    : <Square size={16} className="text-[#1e2d45]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{s.name}</span>
                    <span className="text-[10px] text-[#3a5070] flex items-center gap-1 truncate">
                      <Globe size={9} /> {new URL(s.url).hostname.replace(/^www\./, '')}
                    </span>
                  </div>
                  {s.description && <p className="text-xs text-[#3a5070] mt-0.5 line-clamp-1">{s.description}</p>}
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleScrape} disabled={selectedSiteCount === 0}
            className="w-full py-3 rounded-xl bg-[#3dd68c] hover:bg-[#2dba7a] disabled:opacity-40 disabled:cursor-not-allowed text-[#0f2018] font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <Mail size={15} /> Scrape Emails from {selectedSiteCount} Sites
          </button>
        </>
      )}

      {/* ── Step 3: Scraping progress ── */}
      {step === 'scraping' && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-8 text-center">
          <RefreshCw size={32} className="text-[#4a90d9] mx-auto mb-4 animate-spin" />
          <h3 className="text-white font-semibold mb-2">Scraping websites for emails…</h3>
          <p className="text-xs text-[#3a5070] mb-4">Checking homepage, contact, and about pages</p>
          <div className="bg-[#162035] rounded-full h-2 overflow-hidden mb-2">
            <div className="h-full bg-[#4a90d9] transition-all duration-300 rounded-full"
              style={{ width: scrapeTotal ? `${(scrapeProgress / scrapeTotal) * 100}%` : '0%' }} />
          </div>
          <p className="text-xs text-[#3a5070]">{scrapeProgress} / {scrapeTotal} sites checked</p>
        </div>
      )}

      {/* ── Step 4: Review results ── */}
      {step === 'review' && (
        <>
          {/* Stats */}
          <div className="flex gap-3 mb-4">
            {[
              { label: 'Sites checked',   value: scraped.length,        color: 'text-white' },
              { label: 'Emails found',    value: foundCount,            color: 'text-[#3dd68c]' },
              { label: 'No email',        value: scraped.length - foundCount, color: 'text-[#d0954a]' },
              { label: 'Selected',        value: selectedResultCount,   color: 'text-[#4a90d9]' },
            ].map(s => (
              <div key={s.label} className="flex-1 bg-[#1a2335] border border-[#1e2d45] rounded-xl p-3 text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-[#3a5070] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#3a5070]">Only rows with emails are importable</span>
            <div className="flex gap-2">
              <button onClick={() => toggleAllResults(true)} className="text-xs text-[#4a90d9] hover:text-[#7ab0e9] transition-colors">Select all with emails</button>
              <span className="text-[#1e2d45]">·</span>
              <button onClick={() => toggleAllResults(false)} className="text-xs text-[#3a5070] hover:text-[#b8d4f0] transition-colors">Deselect all</button>
            </div>
          </div>

          <div className="space-y-1.5 mb-4 max-h-[50vh] overflow-y-auto pr-1">
            {scraped.map((s, i) => (
              <div key={s.url}
                onClick={() => s.emails.length > 0 && toggleResult(i)}
                className={`flex items-start gap-3 border rounded-xl px-4 py-3 transition-colors ${
                  s.emails.length > 0
                    ? 'bg-[#1a2335] border-[#1e2d45] hover:border-[#1e3a5a] cursor-pointer'
                    : 'bg-[#141c2a] border-[#171f2e] opacity-50 cursor-default'
                }`}>
                <div className="mt-0.5 flex-shrink-0">
                  {s.emails.length === 0
                    ? <Square size={16} className="text-[#1e2d45]" />
                    : s.selected
                      ? <CheckSquare size={16} className="text-[#4a90d9]" />
                      : <Square size={16} className="text-[#1e2d45]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{s.businessName}</span>
                    <span className="text-[10px] text-[#3a5070] truncate">{new URL(s.url).hostname.replace(/^www\./, '')}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {s.emails.map(e => (
                      <span key={e} className="flex items-center gap-1 text-xs text-[#3dd68c]">
                        <Mail size={10} /> {e}
                      </span>
                    ))}
                    {s.phones.map(p => (
                      <span key={p} className="flex items-center gap-1 text-xs text-[#4a90d9]">
                        <Phone size={10} /> {p}
                      </span>
                    ))}
                    {s.emails.length === 0 && (
                      <span className="text-xs text-[#3a5070] italic">No email found</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleImport} disabled={importing || selectedResultCount === 0}
            className="w-full py-3 rounded-xl bg-[#3dd68c] hover:bg-[#2dba7a] disabled:opacity-40 disabled:cursor-not-allowed text-[#0f2018] font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            {importing
              ? <><RefreshCw size={15} className="animate-spin" /> Importing…</>
              : <><Download size={15} /> Import {selectedResultCount} Lead{selectedResultCount !== 1 ? 's' : ''} to Cleaning Leads</>}
          </button>

          {scrapeErrors.length > 0 && (
            <div className="mt-3 text-xs text-[#3a5070]">
              {scrapeErrors.length} site{scrapeErrors.length !== 1 ? 's' : ''} failed to load
            </div>
          )}
        </>
      )}

      {/* ── Step 5: Done ── */}
      {step === 'done' && importResult && (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-[#0a2518] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-[#3dd68c]" />
          </div>
          <h3 className="text-white font-bold text-lg mb-1">Import complete!</h3>
          <p className="text-[#b8d4f0] text-sm mb-6">
            <span className="text-[#3dd68c] font-semibold">{importResult.imported} lead{importResult.imported !== 1 ? 's' : ''}</span> added to Cleaning Leads
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setStep('search'); setSites([]); setScraped([]); setImportResult(null); setCity(''); }}
              className="px-6 py-2.5 rounded-xl border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium hover:bg-[#162035] transition-colors">
              New Search
            </button>
            <button onClick={() => { setStep('search'); setSites([]); setScraped([]); setImportResult(null); }}
              className="px-6 py-2.5 rounded-xl bg-[#4a90d9] hover:bg-[#3a7bc0] text-white text-sm font-semibold transition-colors">
              Search Again Same City
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

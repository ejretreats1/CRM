import { useState, useMemo, useCallback } from 'react';
import { BarChart3, Send, Eye, X, Loader, CheckCircle, ChevronDown, StickyNote } from 'lucide-react';
import type { Owner } from '../types';
import type { UplistingReservation } from '../services/uplisting';

interface QuarterlyReportsProps {
  owners: Owner[];
  reservations: UplistingReservation[];
}

interface OwnerMetrics {
  totalRevenue: number;
  totalBookings: number;
  cancelledWithPayout: number;
  occupancyRate: number;
  avgNightlyRate: number;
  avgLos: number;
}

// Returns YYYY-MM-DD strings so all date comparisons are timezone-safe string ops
function getQuarterBounds(quarter: number, year: number): [string, string] {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonthNum = quarter * 3;
  const lastDay = new Date(year, endMonthNum, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [`${year}-${pad(startMonth)}-01`, `${year}-${pad(endMonthNum)}-${pad(lastDay)}`];
}

function computeMetrics(owner: Owner, reservations: UplistingReservation[], qStart: string, qEnd: string): OwnerMetrics {
  const uplistingIds = owner.properties.flatMap(p => {
    const parts = p.id.split('_');
    return parts[0] === 'p' && parts.length >= 3 ? [parts.slice(2).join('_')] : [];
  });

  // Filter by checkout date: a stay "belongs" to the period in which it completes.
  // This is correct for invoicing (revenue earned when stay is done) and avoids the
  // timezone bug where new Date("2025-04-01") parses as UTC midnight = previous day local.
  const qRes = reservations.filter(r => {
    const cout = r.check_out.slice(0, 10);
    return (
      uplistingIds.includes(r.listing_id) &&
      (r.status !== 'cancelled' || (r.total_price ?? 0) > 0) &&
      cout > qStart &&   // checked out after period start (exclusive: 0-night checkout on day 1 doesn't count)
      cout <= qEnd       // checked out on or before period end
    );
  });

  const totalRevenue = Math.round(qRes.reduce((s, r) => s + (r.total_price ?? 0), 0));
  const totalBookings = qRes.length;
  const cancelledWithPayout = qRes.filter(r => r.status === 'cancelled').length;

  // Occupancy uses only nights actually stayed (excludes cancelled)
  const totalNights = qRes.filter(r => r.status !== 'cancelled').reduce((s, r) => {
    const nights = r.nights ?? Math.round(
      (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86400000
    );
    return s + nights;
  }, 0);
  // Use noon to avoid DST edge cases when computing quarter length
  const totalDays = Math.round((new Date(`${qEnd}T12:00:00`).getTime() - new Date(`${qStart}T12:00:00`).getTime()) / 86400000) + 1;
  const propCount = Math.max(uplistingIds.length, 1);
  const occupancyRate = totalDays > 0 ? Math.min(100, Math.round((totalNights / (totalDays * propCount)) * 100)) : 0;
  const avgNightlyRate = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;
  const avgLos = totalBookings > 0 ? Math.round((totalNights / totalBookings) * 10) / 10 : 0;

  return { totalRevenue, totalBookings, cancelledWithPayout, occupancyRate, avgNightlyRate, avgLos };
}

interface PreviewState {
  owner: Owner;
  html: string;
  subject: string;
  sent: boolean;
  sending: boolean;
  error: string;
}

export default function QuarterlyReports({ owners, reservations }: QuarterlyReportsProps) {
  const now = new Date();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);

  const [quarter, setQuarter] = useState(currentQuarter === 1 ? 4 : currentQuarter - 1);
  const [year, setYear] = useState(currentQuarter === 1 ? now.getFullYear() - 1 : now.getFullYear());
  const [generating, setGenerating] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [sendAllStatus, setSendAllStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [sendAllResults, setSendAllResults] = useState<{ name: string; ok: boolean }[]>([]);
  const [globalContext, setGlobalContext] = useState('');
  const [ownerNotes, setOwnerNotes] = useState<Record<string, string>>({});

  const setOwnerNote = useCallback((id: string, value: string) => {
    setOwnerNotes(prev => ({ ...prev, [id]: value }));
  }, []);

  const [qStart, qEnd] = useMemo(() => getQuarterBounds(quarter, year), [quarter, year]);

  const ownersWithEmail = useMemo(
    () => owners.filter(o => o.email?.trim()),
    [owners]
  );

  const metricsMap = useMemo(() => {
    const map = new Map<string, OwnerMetrics>();
    for (const o of ownersWithEmail) {
      map.set(o.id, computeMetrics(o, reservations, qStart, qEnd));
    }
    return map;
  }, [ownersWithEmail, reservations, qStart, qEnd]);

  const qLabel = `Q${quarter} ${year}`;

  async function generateReport(owner: Owner, sendNow = false): Promise<{ html: string; subject: string } | null> {
    const metrics = metricsMap.get(owner.id)!;
    const props = owner.properties.map(p => ({ address: p.address, city: p.city, state: p.state }));

    const res = await fetch('/api/send-newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'quarterly',
        ownerName: owner.name,
        ownerEmail: owner.email,
        quarter,
        year,
        properties: props,
        metrics,
        context: globalContext.trim(),
        ownerNotes: (ownerNotes[owner.id] ?? '').trim(),
        send: sendNow,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to generate report');
    return { html: data.html, subject: data.subject };
  }

  async function handleGenerate(owner: Owner) {
    setGenerating(owner.id);
    try {
      const result = await generateReport(owner);
      if (result) {
        setPreview({ owner, html: result.html, subject: result.subject, sent: false, sending: false, error: '' });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(null);
    }
  }

  async function handleSendPreview() {
    if (!preview) return;
    setPreview(p => p ? { ...p, sending: true, error: '' } : p);
    try {
      await generateReport(preview.owner, true);
      setPreview(p => p ? { ...p, sending: false, sent: true } : p);
    } catch (err) {
      setPreview(p => p ? { ...p, sending: false, error: err instanceof Error ? err.message : 'Send failed' } : p);
    }
  }

  async function handleSendAll() {
    setSendAllStatus('running');
    setSendAllResults([]);
    const results: { name: string; ok: boolean }[] = [];
    for (const owner of ownersWithEmail) {
      try {
        await generateReport(owner, true);
        results.push({ name: owner.name, ok: true });
      } catch {
        results.push({ name: owner.name, ok: false });
      }
      setSendAllResults([...results]);
    }
    setSendAllStatus('done');
  }

  const years = [now.getFullYear() - 1, now.getFullYear()];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#4a90d9] flex items-center justify-center">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">Quarterly Reports</h1>
            <p className="text-xs text-[#3a5070]">Generate and send AI-written performance reports to all clients</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quarter selector */}
          <div className="relative">
            <select
              value={quarter}
              onChange={e => setQuarter(Number(e.target.value))}
              className="appearance-none border border-[#1e2d45] rounded-lg px-3 py-2 pr-7 text-sm font-medium text-[#b8d4f0] bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            >
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
          </div>

          {/* Year selector */}
          <div className="relative">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="appearance-none border border-[#1e2d45] rounded-lg px-3 py-2 pr-7 text-sm font-medium text-[#b8d4f0] bg-[#1a2335] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3a5070] pointer-events-none" />
          </div>

          {sendAllStatus === 'idle' && ownersWithEmail.length > 0 && (
            <button
              onClick={handleSendAll}
              className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Send size={14} />
              Send All ({ownersWithEmail.length})
            </button>
          )}
          {sendAllStatus === 'running' && (
            <div className="flex items-center gap-2 text-sm text-[#b8d4f0]">
              <Loader size={14} className="animate-spin" />
              Sending {sendAllResults.length}/{ownersWithEmail.length}…
            </div>
          )}
          {sendAllStatus === 'done' && (
            <div className="flex items-center gap-2 text-sm text-[#5ce0a0]">
              <CheckCircle size={14} />
              Sent {sendAllResults.filter(r => r.ok).length}/{ownersWithEmail.length}
              <button onClick={() => { setSendAllStatus('idle'); setSendAllResults([]); }} className="text-[#3a5070] hover:text-[#b8d4f0] ml-1">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global context */}
      <div className="mb-4 bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <StickyNote size={13} className="text-[#3a5070]" />
          <label className="text-xs font-semibold text-[#b8d4f0]">Context for Claude (applies to all reports)</label>
        </div>
        <textarea
          value={globalContext}
          onChange={e => setGlobalContext(e.target.value)}
          rows={2}
          placeholder="e.g. Q1 had a major snowstorm in January that impacted bookings. We raised nightly rates by 15% in February. The market is seeing increased competition from new listings."
          className="w-full text-sm text-[#b8d4f0] placeholder:text-[#3a5070] border border-[#1e2d45] rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        />
      </div>

      {/* Send-all results */}
      {sendAllResults.length > 0 && sendAllStatus !== 'idle' && (
        <div className="mb-4 bg-[#1e2d45] border border-[#1e2d45] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#b8d4f0] mb-2">Send All Progress</p>
          <div className="flex flex-wrap gap-2">
            {sendAllResults.map(r => (
              <span key={r.name} className={`text-xs px-2 py-1 rounded-full font-medium ${r.ok ? 'bg-[#0a2518] text-[#4ab57a]' : 'bg-[#2a0e0e] text-[#e05c5c]'}`}>
                {r.ok ? '✓' : '✗'} {r.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Owner table */}
      {ownersWithEmail.length === 0 ? (
        <div className="text-center py-16 text-[#3a5070] text-sm">
          No clients with email addresses found.
        </div>
      ) : (
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2d45] bg-[#1e2d45]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Client</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Bookings</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Occupancy</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">Avg/Night</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ownersWithEmail.map(owner => {
                const m = metricsMap.get(owner.id)!;
                const isGenerating = generating === owner.id;
                return (
                  <tr key={owner.id} className="hover:bg-[#1e2d45] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{owner.name}</p>
                      <p className="text-xs text-[#3a5070] mb-1.5">{owner.email}</p>
                      <textarea
                        value={ownerNotes[owner.id] ?? ''}
                        onChange={e => setOwnerNote(owner.id, e.target.value)}
                        rows={1}
                        placeholder="Notes for Claude (optional)"
                        className="w-full text-xs text-[#b8d4f0] placeholder:text-[#3a5070] border border-[#1e2d45] rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-[#4a90d9] focus:rows-3 transition-all"
                        onFocus={e => e.currentTarget.rows = 3}
                        onBlur={e => { if (!e.currentTarget.value) e.currentTarget.rows = 1; }}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[#b8d4f0]">{m.totalBookings}</span>
                      {m.cancelledWithPayout > 0 && (
                        <span className="block text-xs text-[#e05c5c]">{m.cancelledWithPayout} cancelled w/ payout</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[#b8d4f0]">${m.totalRevenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        m.occupancyRate >= 70 ? 'bg-[#0a2518] text-[#4ab57a]' :
                        m.occupancyRate >= 50 ? 'bg-[#2a1a0a] text-[#d0954a]' :
                        'bg-[#1e2d45] text-[#b8d4f0]'
                      }`}>
                        {m.occupancyRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#b8d4f0]">${m.avgNightlyRate}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleGenerate(owner)}
                        disabled={isGenerating || generating !== null}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#162035] text-[#4a90d9] hover:bg-[#162035] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
                      >
                        {isGenerating ? <Loader size={12} className="animate-spin" /> : <Eye size={12} />}
                        {isGenerating ? 'Generating…' : 'Preview'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] flex-shrink-0">
              <div>
                <p className="font-bold text-white text-sm">{qLabel} Report — {preview.owner.name}</p>
                <p className="text-xs text-[#3a5070] mt-0.5">{preview.subject}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Email preview */}
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={preview.html}
                title="Report preview"
                className="w-full h-full border-0"
                style={{ minHeight: '400px' }}
              />
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-[#1e2d45] flex items-center justify-between flex-shrink-0">
              {preview.error && (
                <p className="text-xs text-[#e05c5c]">{preview.error}</p>
              )}
              {preview.sent && (
                <div className="flex items-center gap-1.5 text-sm text-[#5ce0a0]">
                  <CheckCircle size={14} />
                  Sent to {preview.owner.email}
                </div>
              )}
              {!preview.sent && !preview.error && <div />}

              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => setPreview(null)}
                  className="border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#1e2d45] transition-colors"
                >
                  Close
                </button>
                {!preview.sent && (
                  <button
                    onClick={handleSendPreview}
                    disabled={preview.sending}
                    className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {preview.sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                    {preview.sending ? 'Sending…' : `Send to ${preview.owner.name}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

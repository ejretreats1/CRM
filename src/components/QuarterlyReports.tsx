import { useState, useMemo } from 'react';
import { BarChart3, Send, Eye, X, Loader, CheckCircle, ChevronDown } from 'lucide-react';
import type { Owner } from '../types';
import type { UplistingReservation } from '../services/uplisting';

interface QuarterlyReportsProps {
  owners: Owner[];
  reservations: UplistingReservation[];
}

interface OwnerMetrics {
  totalRevenue: number;
  totalBookings: number;
  occupancyRate: number;
  avgNightlyRate: number;
  avgLos: number;
}

function getQuarterBounds(quarter: number, year: number): [Date, Date] {
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 0, 23, 59, 59);
  return [start, end];
}

function computeMetrics(owner: Owner, reservations: UplistingReservation[], qStart: Date, qEnd: Date): OwnerMetrics {
  const uplistingIds = owner.properties.flatMap(p => {
    const parts = p.id.split('_');
    return parts[0] === 'p' && parts.length >= 3 ? [parts.slice(2).join('_')] : [];
  });

  const qRes = reservations.filter(r =>
    uplistingIds.includes(r.listing_id) &&
    r.status !== 'cancelled' &&
    new Date(r.check_in) >= qStart &&
    new Date(r.check_in) <= qEnd
  );

  const totalRevenue = Math.round(qRes.reduce((s, r) => s + (r.total_price ?? 0), 0));
  const totalBookings = qRes.length;
  const totalNights = qRes.reduce((s, r) => {
    const nights = r.nights ?? Math.round(
      (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86400000
    );
    return s + nights;
  }, 0);
  const totalDays = Math.round((qEnd.getTime() - qStart.getTime()) / 86400000) + 1;
  const propCount = Math.max(uplistingIds.length, 1);
  const occupancyRate = totalDays > 0 ? Math.min(100, Math.round((totalNights / (totalDays * propCount)) * 100)) : 0;
  const avgNightlyRate = totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0;
  const avgLos = totalBookings > 0 ? Math.round((totalNights / totalBookings) * 10) / 10 : 0;

  return { totalRevenue, totalBookings, occupancyRate, avgNightlyRate, avgLos };
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center">
            <BarChart3 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg leading-tight">Quarterly Reports</h1>
            <p className="text-xs text-slate-400">Generate and send AI-written performance reports to all clients</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quarter selector */}
          <div className="relative">
            <select
              value={quarter}
              onChange={e => setQuarter(Number(e.target.value))}
              className="appearance-none border border-slate-200 rounded-lg px-3 py-2 pr-7 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Year selector */}
          <div className="relative">
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="appearance-none border border-slate-200 rounded-lg px-3 py-2 pr-7 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {sendAllStatus === 'idle' && ownersWithEmail.length > 0 && (
            <button
              onClick={handleSendAll}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Send size={14} />
              Send All ({ownersWithEmail.length})
            </button>
          )}
          {sendAllStatus === 'running' && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader size={14} className="animate-spin" />
              Sending {sendAllResults.length}/{ownersWithEmail.length}…
            </div>
          )}
          {sendAllStatus === 'done' && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle size={14} />
              Sent {sendAllResults.filter(r => r.ok).length}/{ownersWithEmail.length}
              <button onClick={() => { setSendAllStatus('idle'); setSendAllResults([]); }} className="text-slate-400 hover:text-slate-600 ml-1">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Send-all results */}
      {sendAllResults.length > 0 && sendAllStatus !== 'idle' && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-600 mb-2">Send All Progress</p>
          <div className="flex flex-wrap gap-2">
            {sendAllResults.map(r => (
              <span key={r.name} className={`text-xs px-2 py-1 rounded-full font-medium ${r.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {r.ok ? '✓' : '✗'} {r.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Owner table */}
      {ownersWithEmail.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          No clients with email addresses found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bookings</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Revenue</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Occupancy</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg/Night</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ownersWithEmail.map(owner => {
                const m = metricsMap.get(owner.id)!;
                const isGenerating = generating === owner.id;
                return (
                  <tr key={owner.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{owner.name}</p>
                      <p className="text-xs text-slate-400">{owner.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{m.totalBookings}</td>
                    <td className="px-4 py-3 text-right text-slate-700">${m.totalRevenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        m.occupancyRate >= 70 ? 'bg-emerald-100 text-emerald-700' :
                        m.occupancyRate >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {m.occupancyRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">${m.avgNightlyRate}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleGenerate(owner)}
                        disabled={isGenerating || generating !== null}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <div>
                <p className="font-bold text-slate-900 text-sm">{qLabel} Report — {preview.owner.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{preview.subject}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
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
            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
              {preview.error && (
                <p className="text-xs text-red-600">{preview.error}</p>
              )}
              {preview.sent && (
                <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle size={14} />
                  Sent to {preview.owner.email}
                </div>
              )}
              {!preview.sent && !preview.error && <div />}

              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => setPreview(null)}
                  className="border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
                {!preview.sent && (
                  <button
                    onClick={handleSendPreview}
                    disabled={preview.sending}
                    className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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

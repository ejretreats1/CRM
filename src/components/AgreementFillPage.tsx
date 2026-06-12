import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import SignatureCanvas from 'react-signature-canvas';
import { ChevronLeft, ChevronRight, CheckCircle, Pen, X, Play } from 'lucide-react';
import type { AgreementField, AgreementSubmission, AgreementTemplate } from '../services/rentalAgreements';
import { fetchSubmissionByToken } from '../services/rentalAgreements';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const FIELD_COLORS: Record<string, string> = {
  signature:   '#0d9488',
  text:        '#3b82f6',
  date:        '#8b5cf6',
  initials:    '#f59e0b',
  credit_card: '#ef4444',
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  signature:   'Signature',
  text:        'Text',
  date:        'Date',
  initials:    'Initials',
  credit_card: 'Credit Card',
};

// ─── Signature full-screen modal ───────────────────────────────────────────────

interface SigModalProps {
  field: AgreementField;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

function SigModal({ field, onSave, onClose }: SigModalProps) {
  const padRef = useRef<SignatureCanvas | null>(null);

  function save() {
    if (padRef.current && !padRef.current.isEmpty()) {
      onSave(padRef.current.getTrimmedCanvas().toDataURL('image/png'));
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col" style={{ touchAction: 'none' }}>
      <div className="bg-[#1a2335] border-b border-[#1e2d45] px-4 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-semibold text-white">{field.label}</h3>
          <p className="text-xs text-[#b8d4f0] mt-0.5">Draw with your finger or mouse in the white area</p>
        </div>
        <button onClick={onClose} className="text-[#3a5070] hover:text-white p-2 transition-colors">
          <X size={22} />
        </button>
      </div>
      <div
        className="bg-white mx-4 mt-4 rounded-2xl overflow-hidden flex-shrink-0"
        style={{ height: '55vh', touchAction: 'none' }}
      >
        <SignatureCanvas
          ref={padRef}
          canvasProps={{ style: { width: '100%', height: '100%', display: 'block' } }}
          penColor="#1a2335"
          backgroundColor="rgba(255,255,255,1)"
        />
      </div>
      <div className="flex-1" />
      <div className="px-4 pb-10 pt-4 flex gap-3 flex-shrink-0">
        <button
          onClick={() => padRef.current?.clear()}
          className="flex-1 py-3.5 rounded-xl border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium hover:bg-[#1a2335] transition-colors"
        >
          Clear
        </button>
        <button
          onClick={save}
          className="flex-1 py-3.5 rounded-xl bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-semibold transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Field input panel (step-by-step) ─────────────────────────────────────────

interface FieldPanelInputProps {
  field: AgreementField;
  value: string;
  onChange: (val: string) => void;
  onSign: () => void;
  onNext: () => void;
}

function FieldPanelInput({ field, value, onChange, onSign, onNext }: FieldPanelInputProps) {
  const color = FIELD_COLORS[field.type] ?? '#0d9488';

  if (field.type === 'signature' || field.type === 'initials') {
    return value ? (
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-white rounded-xl overflow-hidden border border-[#243050] flex items-center justify-center" style={{ height: 64 }}>
          <img src={value} className="max-h-full max-w-full object-contain" alt="signature" />
        </div>
        <button onClick={onSign} className="text-sm text-[#4a90d9] hover:text-[#3a80c9] font-medium transition-colors whitespace-nowrap">
          Redo
        </button>
      </div>
    ) : (
      <button
        onClick={onSign}
        className="w-full flex items-center justify-center gap-2.5 rounded-xl py-5 border-2 border-dashed hover:opacity-80 transition-opacity"
        style={{ borderColor: color }}
      >
        <Pen size={18} style={{ color }} />
        <span className="text-base font-medium" style={{ color }}>
          {field.type === 'initials' ? 'Draw your initials' : 'Draw your signature'}
        </span>
      </button>
    );
  }

  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={value}
        autoFocus
        onChange={e => {
          onChange(e.target.value);
          if (e.target.value) setTimeout(onNext, 350);
        }}
        className="w-full bg-[#0f1923] border border-[#243050] rounded-xl px-4 py-3.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent"
        style={{ colorScheme: 'dark' }}
      />
    );
  }

  if (field.type === 'credit_card') {
    return (
      <input
        type="text"
        inputMode="numeric"
        maxLength={19}
        placeholder="•••• •••• •••• ••••"
        value={value}
        autoFocus
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits.replace(/(.{4})/g, '$1 ').trim());
        }}
        onKeyDown={e => { if (e.key === 'Enter') onNext(); }}
        className="w-full bg-[#0f1923] border border-[#243050] rounded-xl px-4 py-3.5 text-base text-white font-mono placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#ef4444] focus:border-transparent"
      />
    );
  }

  return (
    <input
      type="text"
      placeholder={`Enter ${field.label.toLowerCase()}…`}
      value={value}
      autoFocus
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onNext(); }}
      className="w-full bg-[#0f1923] border border-[#243050] rounded-xl px-4 py-3.5 text-base text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent"
    />
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

interface Props { token: string; }

export default function AgreementFillPage({ token }: Props) {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [submission, setSubmission]   = useState<AgreementSubmission | null>(null);
  const [template, setTemplate]       = useState<AgreementTemplate | null>(null);
  const [pdfDoc, setPdfDoc]           = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount]     = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [values, setValues]           = useState<Record<string, string>>({});
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [sigField, setSigField]       = useState<AgreementField | null>(null);
  // Step-by-step signing flow
  const [signing, setSigning]         = useState(false);
  const [fieldIdx, setFieldIdx]       = useState(0);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    fetchSubmissionByToken(token)
      .then(result => {
        if (!result) { setError('Invalid or expired link.'); return; }
        if (result.submission.status === 'completed') { setError('This agreement has already been completed.'); return; }
        if (result.submission.status === 'expired' || new Date(result.submission.expiresAt) < new Date()) {
          setError('This link has expired.'); return;
        }
        setSubmission(result.submission);
        setTemplate(result.template);
        return pdfjsLib.getDocument(result.template.documentUrl).promise;
      })
      .then(doc => { if (doc) { setPdfDoc(doc); setPageCount(doc.numPages); } })
      .catch(() => setError('Failed to load agreement.'))
      .finally(() => setLoading(false));
  }, [token]);

  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageIdx: number) => {
    if (!canvasRef.current) return;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
    const page   = await doc.getPage(pageIdx + 1);
    const canvas = canvasRef.current;
    const w      = Math.min(canvas.parentElement?.clientWidth ?? 700, 900);
    const vp     = page.getViewport({ scale: 1 });
    const scaled = page.getViewport({ scale: w / vp.width });
    canvas.width  = scaled.width;
    canvas.height = scaled.height;
    canvas.style.width  = `${scaled.width}px`;
    canvas.style.height = `${scaled.height}px`;
    const ctx = canvas.getContext('2d')!;
    renderTaskRef.current = page.render({ canvas, canvasContext: ctx, viewport: scaled });
    try { await renderTaskRef.current.promise; } catch {}
  }, []);

  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, currentPage); }, [pdfDoc, currentPage, renderPage]);

  const allFields  = template?.fields ?? [];
  const fieldOrder = useMemo(
    () => [...(template?.fields ?? [])].sort((a, b) =>
      a.page !== b.page ? a.page - b.page : a.y !== b.y ? a.y - b.y : a.x - b.x
    ),
    [template],
  );

  const currentField  = signing && fieldIdx < fieldOrder.length ? fieldOrder[fieldIdx] : null;
  const isAllDone     = signing && fieldIdx >= fieldOrder.length;
  const filledCount   = allFields.filter(f => !!values[f.id]?.trim()).length;
  const totalFields   = allFields.length;
  const progressPct   = totalFields > 0 ? Math.round(filledCount / totalFields * 100) : 0;

  // Auto-switch page when current field changes
  useEffect(() => {
    if (!currentField) return;
    if (currentField.page !== currentPage) setCurrentPage(currentField.page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldIdx, signing]);

  // Auto-scroll to highlight current field
  useEffect(() => {
    if (!currentField || !canvasRef.current) return;
    const canvas  = canvasRef.current;
    const panelH  = 260;
    const fieldY  = currentField.y * canvas.clientHeight;
    const canvasT = canvas.getBoundingClientRect().top + window.scrollY;
    const target  = canvasT + fieldY - (window.innerHeight - panelH) * 0.35;
    setTimeout(() => window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' }), 150);
  }, [fieldIdx, currentPage, signing, currentField]);

  const setValue = (id: string, val: string) => setValues(prev => ({ ...prev, [id]: val }));

  function goNext() {
    setFieldIdx(i => i + 1);
  }
  function goPrev() {
    setFieldIdx(i => Math.max(0, i - 1));
  }

  async function handleSubmit() {
    if (!template || !submission) return;
    const missing = template.fields.filter(f => f.required && !values[f.id]?.trim());
    if (missing.length > 0) {
      alert(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'agreement', action: 'complete', token, fieldValues: values }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1923]">
      <p className="text-[#b8d4f0]">Loading agreement…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1923] px-4">
      <div className="text-center max-w-sm">
        <p className="text-xl font-bold text-white mb-2">Unable to load agreement</p>
        <p className="text-[#b8d4f0]">{error}</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1923] px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-[#0a2518] rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-[#5ce0a0]" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Agreement Completed!</h1>
        <p className="text-[#b8d4f0]">
          Thank you, {submission?.guestName}. Your completed agreement has been sent to E&amp;J Retreats.
        </p>
      </div>
    </div>
  );

  // Panel height: ~260px when filling, ~130px for start/submit
  const panelH = !signing || isAllDone ? 130 : 260;

  return (
    <div className="min-h-screen bg-[#0f1923]" style={{ paddingBottom: panelH + 16 }}>
      {/* Sticky header */}
      <div className="bg-[#1a2335] border-b border-[#1e2d45] px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h1 className="font-bold text-white text-sm leading-tight">{template?.name}</h1>
              <p className="text-xs text-[#b8d4f0] mt-0.5">Hi {submission?.guestName}</p>
            </div>
            <img
              src="/logo.png" alt="E&J Retreats" className="h-7 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#1e2d45] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4a90d9] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-[#b8d4f0] whitespace-nowrap">{filledCount} / {totalFields} filled</span>
          </div>
        </div>
      </div>

      {/* PDF viewer */}
      <div className="max-w-2xl mx-auto px-4 py-5">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 py-2.5 bg-[#1a2335]">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-1.5 text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-[#b8d4f0]">Page {currentPage + 1} of {pageCount}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage === pageCount - 1}
                className="p-1.5 text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <div className="relative">
            <canvas ref={canvasRef} className="block w-full" />
            {/* Visual-only field markers — pointer-events:none keeps scroll working */}
            <div className="absolute inset-0 pointer-events-none">
              {(template?.fields ?? []).filter(f => f.page === currentPage).map(field => {
                const isCurrent = currentField?.id === field.id;
                const filled    = !!values[field.id]?.trim();
                const color     = FIELD_COLORS[field.type] ?? '#0d9488';
                return (
                  <div
                    key={field.id}
                    style={{
                      position:   'absolute',
                      left:       `${field.x * 100}%`,
                      top:        `${field.y * 100}%`,
                      width:      `${field.w * 100}%`,
                      height:     `${field.h * 100}%`,
                      border:     `2px solid ${filled ? '#22c55e' : isCurrent ? color : `${color}88`}`,
                      borderRadius: 3,
                      background: isCurrent
                        ? `${color}35`
                        : filled
                          ? 'rgba(34,197,94,0.12)'
                          : `${color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                      boxShadow: isCurrent ? `0 0 0 3px ${color}50` : undefined,
                      transition: 'all 0.2s',
                    }}
                  >
                    {filled && (field.type === 'signature' || field.type === 'initials') && (
                      <img src={values[field.id]} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" />
                    )}
                    {filled && field.type !== 'signature' && field.type !== 'initials' && (
                      <span style={{ fontSize: 9, color: '#166534', fontWeight: 600, padding: '0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                        {values[field.id]}
                      </span>
                    )}
                    {!filled && (
                      <span style={{ fontSize: 8, color: isCurrent ? color : `${color}99`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {field.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom panel */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#1a2335]/98 border-t border-[#1e2d45] shadow-2xl">
        <div className="max-w-2xl mx-auto px-4">

          {/* ── Pre-signing: Start button ── */}
          {!signing && (
            <div className="py-4">
              <p className="text-xs text-[#b8d4f0] text-center mb-3">
                Read through the document above, then start filling in your information
              </p>
              <button
                onClick={() => { setSigning(true); setFieldIdx(0); }}
                className="w-full flex items-center justify-center gap-2.5 bg-[#4a90d9] hover:bg-[#3a80c9] text-white font-semibold py-4 rounded-xl transition-colors text-base"
              >
                <Play size={18} /> Start Signing
              </button>
            </div>
          )}

          {/* ── All fields complete: Submit ── */}
          {isAllDone && (
            <div className="py-4">
              <p className="text-xs text-[#22c55e] text-center mb-3 font-medium">
                ✓ All fields complete — ready to submit
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-base"
              >
                {submitting ? 'Submitting…' : 'Submit Agreement'}
              </button>
            </div>
          )}

          {/* ── Active field step ── */}
          {signing && !isAllDone && currentField && (
            <div className="pt-3 pb-5">
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: FIELD_COLORS[currentField.type] ?? '#0d9488' }}>
                  {fieldIdx + 1}
                </div>
                <span className="text-xs text-[#b8d4f0]">of {fieldOrder.length}</span>
                <div className="flex-1 mx-1">
                  <div className="h-1 bg-[#1e2d45] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${((fieldIdx + 1) / fieldOrder.length) * 100}%`,
                        background: FIELD_COLORS[currentField.type] ?? '#0d9488',
                      }}
                    />
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ color: FIELD_COLORS[currentField.type], background: `${FIELD_COLORS[currentField.type]}20` }}
                >
                  {FIELD_TYPE_LABELS[currentField.type]}
                </span>
                {currentField.required && (
                  <span className="text-[10px] text-[#ef4444] font-medium">required</span>
                )}
              </div>

              {/* Field label */}
              <p className="text-base font-semibold text-white mb-2.5">{currentField.label}</p>

              {/* Input — remounts on each field via key */}
              <FieldPanelInput
                key={currentField.id}
                field={currentField}
                value={values[currentField.id] ?? ''}
                onChange={val => setValue(currentField.id, val)}
                onSign={() => setSigField(currentField)}
                onNext={goNext}
              />

              {/* Back / Next */}
              <div className="flex gap-2.5 mt-3">
                {fieldIdx > 0 && (
                  <button
                    onClick={goPrev}
                    className="flex items-center gap-1 text-sm text-[#b8d4f0] hover:text-white px-3.5 py-2.5 rounded-xl border border-[#1e2d45] hover:bg-[#243050] transition-colors"
                  >
                    <ChevronLeft size={15} /> Back
                  </button>
                )}
                <button
                  onClick={goNext}
                  className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2.5 rounded-xl transition-colors text-white"
                  style={{ background: FIELD_COLORS[currentField.type] ?? '#4a90d9' }}
                >
                  {fieldIdx === fieldOrder.length - 1 ? 'Finish' : 'Next'}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Signature modal */}
      {sigField && (
        <SigModal
          key={sigField.id}
          field={sigField}
          onSave={data => {
            setValue(sigField.id, data);
            if (signing) setTimeout(goNext, 400);
          }}
          onClose={() => setSigField(null)}
        />
      )}
    </div>
  );
}

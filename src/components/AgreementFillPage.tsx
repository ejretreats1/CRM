import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import SignatureCanvas from 'react-signature-canvas';
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import type { AgreementField, AgreementSubmission, AgreementTemplate } from '../services/rentalAgreements';
import { fetchSubmissionByToken } from '../services/rentalAgreements';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

interface Props {
  token: string;
}

const FIELD_COLORS: Record<string, string> = {
  signature:   '#0d9488',
  text:        '#3b82f6',
  date:        '#8b5cf6',
  initials:    '#f59e0b',
  credit_card: '#ef4444',
};

export default function AgreementFillPage({ token }: Props) {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [submission, setSubmission] = useState<AgreementSubmission | null>(null);
  const [template, setTemplate]     = useState<AgreementTemplate | null>(null);
  const [pdfDoc, setPdfDoc]         = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount]   = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [values, setValues]         = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);
  const sigRefs     = useRef<Record<string, SignatureCanvas | null>>({});
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
      .then(doc => {
        if (doc) { setPdfDoc(doc); setPageCount(doc.numPages); }
      })
      .catch(() => setError('Failed to load agreement.'))
      .finally(() => setLoading(false));
  }, [token]);

  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageIndex: number) => {
    if (!canvasRef.current) return;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }
    const page = await doc.getPage(pageIndex + 1);
    const canvas = canvasRef.current;
    const containerWidth = Math.min(canvas.parentElement?.clientWidth ?? 700, 900);
    const viewport = page.getViewport({ scale: 1 });
    const scale = containerWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    canvas.width  = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.width  = `${scaledViewport.width}px`;
    canvas.style.height = `${scaledViewport.height}px`;
    const ctx = canvas.getContext('2d')!;
    renderTaskRef.current = page.render({ canvas, canvasContext: ctx, viewport: scaledViewport });
    try { await renderTaskRef.current.promise; } catch {}
  }, []);

  useEffect(() => {
    if (pdfDoc) renderPage(pdfDoc, currentPage);
  }, [pdfDoc, currentPage, renderPage]);

  function setValue(id: string, val: string) {
    setValues(prev => ({ ...prev, [id]: val }));
  }

  async function handleSubmit() {
    if (!template || !submission) return;

    // Collect signature data URLs
    const finalValues = { ...values };
    for (const field of template.fields) {
      if (field.type === 'signature' || field.type === 'initials') {
        const sigRef = sigRefs.current[field.id];
        if (sigRef && !sigRef.isEmpty()) {
          finalValues[field.id] = sigRef.getTrimmedCanvas().toDataURL('image/png');
        }
      }
    }

    // Validate required fields
    const missing = template.fields.filter(f => f.required && !finalValues[f.id]?.trim());
    if (missing.length > 0) {
      alert(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'agreement', action: 'complete', token, fieldValues: finalValues }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDone(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const pageFields = (template?.fields ?? []).filter(f => f.page === currentPage);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e2d45]">
        <p className="text-[#b8d4f0]">Loading agreement…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e2d45] px-4">
        <div className="text-center max-w-sm">
          <p className="text-xl font-bold text-white mb-2">Unable to load agreement</p>
          <p className="text-[#b8d4f0]">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e2d45] px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-[#0a2518] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-[#5ce0a0]" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Agreement Completed!</h1>
          <p className="text-[#b8d4f0]">Thank you, {submission?.guestName}. Your completed agreement has been sent to E&J Retreats.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e2d45]">
      {/* Header */}
      <div className="bg-[#1a2335] border-b border-[#1e2d45] px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-white">{template?.name}</h1>
            <p className="text-sm text-[#b8d4f0] mt-0.5">Hi {submission?.guestName} — please fill in all required fields</p>
          </div>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="E&J Retreats" className="h-8 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* PDF + overlay */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 bg-[#1a2335] border border-[#1e2d45] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-[#b8d4f0]">Page {currentPage + 1} of {pageCount}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage === pageCount - 1}
              className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 bg-[#1a2335] border border-[#1e2d45] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        <div className="bg-[#1a2335] shadow-lg rounded-xl overflow-hidden mb-6">
          <div className="relative" ref={overlayRef}>
            <canvas ref={canvasRef} className="block w-full" />

            {/* Field overlays */}
            {pageFields.map(field => (
              <FieldInput
                key={field.id}
                field={field}
                value={values[field.id] ?? ''}
                onChange={val => setValue(field.id, val)}
                sigRef={(ref: SignatureCanvas | null) => { sigRefs.current[field.id] = ref; }}
              />
            ))}
          </div>
        </div>

        {/* Non-current-page fields reminder */}
        {template && template.fields.some(f => f.page !== currentPage) && (
          <div className="mb-4 p-3 bg-[#2a1a0a] border border-[#5a3010] rounded-lg">
            <p className="text-xs text-[#d0954a]">
              This document has fields on multiple pages. Navigate between pages to fill all fields.
            </p>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
        >
          {submitting ? 'Submitting…' : 'Submit Agreement'}
        </button>
      </div>
    </div>
  );
}

interface FieldInputProps {
  field: AgreementField;
  value: string;
  onChange: (val: string) => void;
  sigRef: (ref: SignatureCanvas | null) => void;
}

function FieldInput({ field, value, onChange, sigRef }: FieldInputProps) {
  const color = FIELD_COLORS[field.type] ?? '#0d9488';
  const style: React.CSSProperties = {
    position: 'absolute',
    left:   `${field.x * 100}%`,
    top:    `${field.y * 100}%`,
    width:  `${field.w * 100}%`,
    height: `${field.h * 100}%`,
    boxSizing: 'border-box',
  };

  if (field.type === 'signature' || field.type === 'initials') {
    return (
      <div style={{ ...style, border: `2px solid ${color}`, borderRadius: 3, overflow: 'hidden', background: 'white' }}>
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{ style: { width: '100%', height: '100%', display: 'block' } }}
          penColor="#1e293b"
          backgroundColor="rgba(255,255,255,1)"
        />
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <div style={style}>
        <input
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', height: '100%', border: `2px solid ${color}`, borderRadius: 3, padding: '2px 4px', fontSize: 11, boxSizing: 'border-box', background: 'white', outline: 'none' }}
        />
      </div>
    );
  }

  if (field.type === 'credit_card') {
    return (
      <div style={style}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={19}
          placeholder="•••• •••• •••• ••••"
          value={value}
          onChange={e => {
            const digits = e.target.value.replace(/\D/g, '');
            const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
            onChange(formatted);
          }}
          style={{ width: '100%', height: '100%', border: `2px solid ${color}`, borderRadius: 3, padding: '2px 6px', fontSize: 11, boxSizing: 'border-box', background: 'white', outline: 'none', fontFamily: 'monospace' }}
        />
      </div>
    );
  }

  // text
  return (
    <div style={style}>
      <input
        type="text"
        placeholder={field.label}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', height: '100%', border: `2px solid ${color}`, borderRadius: 3, padding: '2px 6px', fontSize: 11, boxSizing: 'border-box', background: 'white', outline: 'none' }}
      />
    </div>
  );
}

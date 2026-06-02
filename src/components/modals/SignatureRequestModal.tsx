import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Upload, FileText, Send, X, ArrowRight, ArrowLeft, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from './Modal';
import { uploadDocument } from '../../services/signatures';
import type { Owner } from '../../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

interface SignatureRequestModalProps {
  owner: Owner;
  onSent: () => void;
  onClose: () => void;
  prefillDocUrl?: string;
  prefillDocName?: string;
}

interface FieldPos {
  x: number; // 0–1 fraction of page width
  y: number; // 0–1 fraction of page height
}

type Step = 'form' | 'placement' | 'sending' | 'done' | 'error';

export default function SignatureRequestModal({ owner, onSent, onClose, prefillDocUrl, prefillDocName }: SignatureRequestModalProps) {
  const [file, setFile]               = useState<File | null>(null);
  const [documentName, setDocumentName] = useState(prefillDocName ?? 'Management Agreement');
  const [email, setEmail]             = useState(owner.email);
  const [step, setStep]               = useState<Step>(prefillDocUrl ? 'placement' : 'form');
  const [errorMsg, setErrorMsg]       = useState('');
  const [sentToken, setSentToken]     = useState('');
  const [copied, setCopied]           = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl]   = useState('');
  const [dragOver, setDragOver]       = useState(false);

  // PDF.js state
  const [pdfDoc, setPdfDoc]       = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0); // 0-indexed
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Drag positions (fraction 0–1 from top-left of page)
  const [sigPos, setSigPos]   = useState<FieldPos>({ x: 0.08, y: 0.78 });
  const [datePos, setDatePos] = useState<FieldPos>({ x: 0.55, y: 0.78 });

  const fileRef    = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragging   = useRef<'sig' | 'date' | null>(null);

  // ── Create blob URL when file changes ─────────────────────────────────────

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPdfBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Load PDF with pdfjs ───────────────────────────────────────────────────

  useEffect(() => {
    const src = prefillDocUrl || pdfBlobUrl;
    if (!src) return;

    let cancelled = false;
    pdfjsLib.getDocument(src).promise
      .then(doc => {
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(doc.numPages - 1); // default to last page — where sigs go
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [prefillDocUrl, pdfBlobUrl]);

  // ── Render current page onto canvas ──────────────────────────────────────

  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageIdx: number) => {
    if (!canvasRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
      renderTaskRef.current = null;
    }

    const page      = await doc.getPage(pageIdx + 1);
    const canvas    = canvasRef.current;
    const container = canvas.parentElement;
    const containerWidth = container?.clientWidth ?? 400;

    const baseVP     = page.getViewport({ scale: 1 });
    const scale      = containerWidth / baseVP.width;
    const scaledVP   = page.getViewport({ scale });

    canvas.width  = scaledVP.width;
    canvas.height = scaledVP.height;

    const ctx = canvas.getContext('2d')!;
    renderTaskRef.current = page.render({ canvas, canvasContext: ctx, viewport: scaledVP });
    try { await renderTaskRef.current.promise; } catch {}
  }, []);

  useEffect(() => {
    if (pdfDoc) renderPage(pdfDoc, currentPage);
  }, [pdfDoc, currentPage, renderPage]);

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  function acceptFile(f: File) {
    if (f.type !== 'application/pdf') { setErrorMsg('Please upload a PDF file.'); return; }
    setFile(f);
    setErrorMsg('');
    if (!documentName || documentName === 'Management Agreement') {
      setDocumentName(f.name.replace('.pdf', ''));
    }
  }

  const handleNextToPlacement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErrorMsg('Please select a PDF to send.'); return; }
    if (!email) { setErrorMsg('Owner email is required.'); return; }
    setErrorMsg('');
    setStep('placement');
  };

  // ── Drag logic ────────────────────────────────────────────────────────────

  const getRelativePos = useCallback((e: MouseEvent): FieldPos | null => {
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: Math.max(0.01, Math.min(0.95, (e.clientX - rect.left)  / rect.width)),
      y: Math.max(0.01, Math.min(0.97, (e.clientY - rect.top)   / rect.height)),
    };
  }, []);

  const startDrag = useCallback((type: 'sig' | 'date') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = type;

    const onMove = (ev: MouseEvent) => {
      const pos = getRelativePos(ev);
      if (!pos) return;
      if (dragging.current === 'sig') setSigPos(pos);
      else setDatePos(pos);
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [getRelativePos]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!prefillDocUrl && !file) return;
    try {
      setStep('sending');
      const documentUrl = prefillDocUrl ?? await uploadDocument(owner.id, file!);

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          ownerId:      owner.id,
          ownerName:    owner.name,
          documentUrl,
          documentName,
          sentToEmail:  email,
          appUrl:       window.location.origin,
          sigX:  sigPos.x,
          sigY:  sigPos.y,
          dateX: datePos.x,
          dateY: datePos.y,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to send.');
      }

      const data = await res.json();
      setSentToken(data.token ?? '');
      setStep('done');
      onSent();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStep('error');
    }
  };

  // ── Done ──────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <Modal title="Send Document for Signature" onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Send size={20} className="text-emerald-600" />
          </div>
          <p className="font-semibold text-slate-900">Sent successfully!</p>
          <p className="text-sm text-slate-500 text-center">Email sent to {email}. You can also share the link directly:</p>
          {sentToken && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/sign/${sentToken}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy Signing Link'}
            </button>
          )}
          <button onClick={onClose} className="text-sm text-teal-600 hover:text-teal-700 font-medium mt-1">Done</button>
        </div>
      </Modal>
    );
  }

  // ── Placement ─────────────────────────────────────────────────────────────

  if (step === 'placement' || step === 'sending' || step === 'error') {
    return (
      <Modal title="Place Signature Fields" onClose={onClose} size="lg">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Drag the <span className="font-medium text-teal-700">✍ Signature</span> and <span className="font-medium text-blue-600">📅 Date</span> boxes to their exact positions on the page. Navigate pages with the arrows below if needed.
          </p>

          {/* PDF canvas + drag overlay */}
          <div className="flex justify-center">
            <div className="relative border border-slate-200 shadow-md bg-white w-full" style={{ maxWidth: 400 }}>
              {/* Rendered PDF page */}
              <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />

              {/* Field drag layer — sits exactly on top of the canvas */}
              <div
                ref={overlayRef}
                className="absolute inset-0 cursor-crosshair"
                onDragStart={e => e.preventDefault()}
              >
                <DragBox label="✍ Signature" color="teal" pos={sigPos} onMouseDown={startDrag('sig')} />
                <DragBox label="📅 Date"      color="blue" pos={datePos} onMouseDown={startDrag('date')} />
              </div>
            </div>
          </div>

          {/* Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium">Page {currentPage + 1} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === 'error' && errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { if (prefillDocUrl) onClose(); else { setStep('form'); setErrorMsg(''); } }}
              className="flex items-center gap-1.5 border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft size={14} /> {prefillDocUrl ? 'Cancel' : 'Back'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={step === 'sending'}
              className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Send size={14} />
              {step === 'sending' ? 'Uploading & Sending...' : 'Send for Signature'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <Modal title="Send Document for Signature" onClose={onClose}>
      <form onSubmit={handleNextToPlacement} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Document (PDF) *</label>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) acceptFile(f);
            }}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-teal-400 hover:bg-teal-50'
            }`}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2 text-teal-700">
                <FileText size={18} />
                <span className="text-sm font-medium">{file.name}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="ml-1 text-slate-400 hover:text-red-500"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="text-slate-400">
                <Upload size={24} className={`mx-auto mb-2 ${dragOver ? 'text-teal-500' : ''}`} />
                <p className="text-sm">{dragOver ? 'Drop PDF here' : 'Drag & drop or click to upload PDF'}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Document Name</label>
          <input
            value={documentName}
            onChange={e => setDocumentName(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Management Agreement"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Send to Email *</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="owner@email.com"
          />
        </div>

        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Next: Place Fields <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DragBox({
  label, color, pos, onMouseDown,
}: {
  label: string;
  color: 'teal' | 'blue';
  pos: FieldPos;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const cls = color === 'teal'
    ? 'bg-teal-500/90 border-teal-600 text-white'
    : 'bg-blue-500/90 border-blue-600 text-white';

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position:  'absolute',
        left:      `${pos.x * 100}%`,
        top:       `${pos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        cursor:    'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
      className={`${cls} border text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg whitespace-nowrap`}
    >
      {label}
    </div>
  );
}

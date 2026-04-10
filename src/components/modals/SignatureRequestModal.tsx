import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileText, Send, X, ArrowRight, ArrowLeft } from 'lucide-react';
import Modal from './Modal';
import { uploadDocument } from '../../services/signatures';
import type { Owner } from '../../types';

interface SignatureRequestModalProps {
  owner: Owner;
  onSent: () => void;
  onClose: () => void;
}

interface FieldPos {
  x: number; // 0–1 fraction of page width from left
  y: number; // 0–1 fraction of page height from top
}

type Step = 'form' | 'placement' | 'sending' | 'done' | 'error';

export default function SignatureRequestModal({ owner, onSent, onClose }: SignatureRequestModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('Management Agreement');
  const [email, setEmail] = useState(owner.email);
  const [step, setStep] = useState<Step>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');

  // Drag positions (fraction 0–1 from top-left of page)
  const [sigPos, setSigPos] = useState<FieldPos>({ x: 0.08, y: 0.78 });
  const [datePos, setDatePos] = useState<FieldPos>({ x: 0.55, y: 0.78 });

  const fileRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'sig' | 'date' | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPdfBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { setErrorMsg('Please upload a PDF file.'); return; }
    setFile(f);
    setErrorMsg('');
    if (!documentName || documentName === 'Management Agreement') {
      setDocumentName(f.name.replace('.pdf', ''));
    }
  };

  const handleNextToPlacement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErrorMsg('Please select a PDF to send.'); return; }
    if (!email) { setErrorMsg('Owner email is required.'); return; }
    setErrorMsg('');
    setStep('placement');
  };

  const getRelativePos = useCallback((e: MouseEvent): FieldPos | null => {
    if (!pageRef.current) return null;
    const rect = pageRef.current.getBoundingClientRect();
    return {
      x: Math.max(0.01, Math.min(0.95, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0.01, Math.min(0.97, (e.clientY - rect.top) / rect.height)),
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

  const handleSubmit = async () => {
    if (!file) return;
    try {
      setStep('sending');
      const documentUrl = await uploadDocument(owner.id, file);

      const res = await fetch('/api/send-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: owner.id,
          ownerName: owner.name,
          documentUrl,
          documentName,
          sentToEmail: email,
          appUrl: window.location.origin,
          sigX: sigPos.x,
          sigY: sigPos.y,
          dateX: datePos.x,
          dateY: datePos.y,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to send.');
      }

      setStep('done');
      setTimeout(() => { onSent(); onClose(); }, 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStep('error');
    }
  };

  // ── Done ────────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <Modal title="Send Document for Signature" onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Send size={20} className="text-emerald-600" />
          </div>
          <p className="font-semibold text-slate-800">Sent successfully!</p>
          <p className="text-sm text-slate-500">Signing link sent to {email}</p>
        </div>
      </Modal>
    );
  }

  // ── Placement step ───────────────────────────────────────────────────────────
  if (step === 'placement' || step === 'sending' || step === 'error') {
    return (
      <Modal title="Place Signature Fields" onClose={onClose} size="lg">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Drag the <span className="font-medium text-teal-700">Signature</span> and{' '}
            <span className="font-medium text-blue-600">Date</span> boxes to where you want
            them on the <strong>last page</strong> of the document.
          </p>

          {/* Page preview: PDF iframe behind + drag overlay in front */}
          <div className="flex justify-center">
            <div
              className="relative border border-slate-300 shadow-lg bg-white overflow-hidden"
              style={{ width: '100%', maxWidth: 400, aspectRatio: '8.5 / 11' }}
            >
              {pdfBlobUrl && (
                <iframe
                  src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="absolute inset-0 w-full h-full border-none"
                  style={{ pointerEvents: 'none' }}
                  title="PDF preview"
                />
              )}

              {/* Drag capture layer */}
              <div
                ref={pageRef}
                className="absolute inset-0"
                onDragStart={e => e.preventDefault()}
              >
                <DragBox label="✍ Signature" color="teal" pos={sigPos} onMouseDown={startDrag('sig')} />
                <DragBox label="📅 Date"      color="blue" pos={datePos} onMouseDown={startDrag('date')} />
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center">
            The preview shows the first page — placement applies to the last page.
          </p>

          {(step === 'error' && errorMsg) && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setStep('form'); setErrorMsg(''); }}
              className="flex items-center gap-1.5 border border-slate-200 text-slate-600 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft size={14} /> Back
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

  // ── Form step ────────────────────────────────────────────────────────────────
  return (
    <Modal title="Send Document for Signature" onClose={onClose}>
      <form onSubmit={handleNextToPlacement} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Document (PDF) *</label>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
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
                <Upload size={24} className="mx-auto mb-2" />
                <p className="text-sm">Click to upload PDF</p>
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
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
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
        position: 'absolute',
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
      className={`${cls} border text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg whitespace-nowrap`}
    >
      {label}
    </div>
  );
}

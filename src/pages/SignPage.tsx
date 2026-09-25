import { useState, useRef, useEffect } from 'react';
// Legacy build: signers open this page in whatever browser they have, and the
// modern pdf.js build relies on very recent JS features (e.g. Map.getOrInsertComputed).
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import SignatureCanvas from 'react-signature-canvas';
import { fetchSignatureRequestByToken } from '../services/signatures';
import type { SignatureRequest } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

interface SignPageProps {
  token: string;
}

type Status = 'loading' | 'ready' | 'not_found' | 'expired' | 'already_signed' | 'submitting' | 'done' | 'error';

export default function SignPage({ token }: SignPageProps) {
  const [sigReq, setSigReq] = useState<SignatureRequest | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [signedUrl, setSignedUrl] = useState('');
  const sigCanvasRef = useRef<SignatureCanvas>(null);
  const signatureSectionRef = useRef<HTMLDivElement>(null);

  // The global CSS sets overflow-x:hidden / max-width on html+body (and
  // overscroll-behavior-y:none on body) for the CRM dashboard. On public pages
  // with no Layout wrapper that combination blocks normal page scrolling on
  // some devices — override it for the lifetime of this page.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflowX = 'visible';
    html.style.maxWidth = '';
    body.style.overflowX = 'visible';
    body.style.maxWidth = '';
    body.style.overscrollBehaviorY = 'auto';
    return () => {
      html.style.overflowX = '';
      html.style.maxWidth = '';
      body.style.overflowX = '';
      body.style.maxWidth = '';
      body.style.overscrollBehaviorY = '';
    };
  }, []);

  useEffect(() => {
    fetchSignatureRequestByToken(token).then(req => {
      if (!req) { setStatus('not_found'); return; }
      if (req.status === 'signed') { setStatus('already_signed'); setSigReq(req); return; }
      if (req.status === 'expired' || new Date(req.expiresAt) < new Date()) {
        setStatus('expired'); return;
      }
      setSigReq(req);
      setStatus('ready');
    });
  }, [token]);

  const handleSubmit = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setErrorMsg('Please draw your signature before submitting.');
      return;
    }
    const dataUrl = sigCanvasRef.current.toDataURL('image/png');

    try {
      setStatus('submitting');
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', token, signatureDataUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit signature.');
      setSignedUrl(data.signedDocumentUrl);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  };

  const handleClear = () => {
    sigCanvasRef.current?.clear();
    setErrorMsg('');
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#1e2d45] flex items-center justify-center">
        <p className="text-[#b8d4f0] text-sm">Loading document...</p>
      </div>
    );
  }

  // ── Error states ─────────────────────────────────────────────────────────────
  if (status === 'not_found') {
    return <StatusScreen icon="🔍" title="Link Not Found" message="This signing link is invalid or has been removed." />;
  }
  if (status === 'expired') {
    return <StatusScreen icon="⏰" title="Link Expired" message="This signing link has expired. Please contact E&J Retreats for a new link." />;
  }
  if (status === 'already_signed') {
    return (
      <StatusScreen icon="✅" title="Already Signed" message={`This document was signed on ${sigReq?.signedAt ? new Date(sigReq.signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'a previous date'}.`}>
        {sigReq?.signedDocumentUrl && (
          <a
            href={sigReq.signedDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block bg-[#4a90d9] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#3a80c9] transition-colors"
          >
            Download Signed Document
          </a>
        )}
      </StatusScreen>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  if (status === 'done') {
    return (
      <StatusScreen icon="🎉" title="Document Signed!" message="Your signature has been applied and the document has been saved.">
        {signedUrl && (
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block bg-[#4a90d9] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#3a80c9] transition-colors"
          >
            Download Signed Document
          </a>
        )}
      </StatusScreen>
    );
  }

  // ── Ready / Submitting ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#1e2d45] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#162035] mb-3">
            <span className="text-2xl">📄</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Sign Document</h1>
          <p className="text-[#b8d4f0] text-sm mt-1">E&amp;J Retreats — {sigReq?.documentName}</p>
          <button
            type="button"
            onClick={() => signatureSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="mt-3 text-xs text-[#4a90d9] hover:underline"
          >
            Skip to signature ↓
          </button>
        </div>

        {/* PDF Preview */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1e2d45] flex items-center justify-between">
            <span className="text-sm font-medium text-[#b8d4f0]">{sigReq?.documentName}</span>
            <a
              href={sigReq?.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#4a90d9] hover:underline"
            >
              Open in new tab
            </a>
          </div>
          {/* Rendered inline (not in an iframe) so the browser's PDF viewer
              can't capture wheel / trackpad / touch scrolling from the page. */}
          {sigReq?.documentUrl && <InlinePdf url={sigReq.documentUrl} />}
        </div>

        {/* Signature pad */}
        <div ref={signatureSectionRef} className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 scroll-mt-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-[#b8d4f0]">Your Signature *</label>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-[#3a5070] hover:text-[#e05c5c] transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="border-2 border-dashed border-[#1e2d45] rounded-lg overflow-hidden bg-[#1e2d45]">
            <SignatureCanvas
              ref={sigCanvasRef}
              penColor="#1e293b"
              canvasProps={{
                className: 'w-full',
                style: { height: '160px', display: 'block', width: '100%' },
              }}
            />
          </div>
          <p className="text-xs text-[#3a5070] mt-2">Draw your signature above using your mouse or finger.</p>
          {errorMsg && (
            <p className="text-xs text-[#e05c5c] bg-[#2a0e0e] px-3 py-2 rounded-lg mt-3">{errorMsg}</p>
          )}
        </div>

        {/* Consent + Submit */}
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
          <p className="text-xs text-[#b8d4f0] leading-relaxed">
            By clicking "Sign Document", I agree that my electronic signature is the legal equivalent of my manual signature and that I have reviewed the document above.
          </p>
          <button
            onClick={handleSubmit}
            disabled={status === 'submitting'}
            className="w-full bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {status === 'submitting' ? 'Submitting...' : 'Sign Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders every page of a PDF as stacked canvases in normal page flow, so
 * wheel / trackpad / touch scrolling always moves the page itself.
 * Falls back to an <iframe> if pdf.js can't load the document.
 */
function InlinePdf({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    const task = pdfjsLib.getDocument(url);
    task.promise
      .then(d => { if (cancelled) d.destroy(); else setDoc(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      task.destroy().catch(() => { /* ignore */ });
    };
  }, [url]);

  // Render all pages into the canvases; re-render on resize.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let tasks: pdfjsLib.RenderTask[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const renderAll = async () => {
      const container = containerRef.current;
      if (!container) return;
      tasks.forEach(t => { try { t.cancel(); } catch { /* ignore */ } });
      tasks = [];
      const cssWidth = Math.min(container.clientWidth || 700, 900);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvases = Array.from(container.querySelectorAll<HTMLCanvasElement>('canvas'));
      for (let i = 0; i < doc.numPages && !cancelled; i++) {
        const canvas = canvases[i];
        if (!canvas) continue;
        const page = await doc.getPage(i + 1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (cssWidth / base.width) * dpr });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
        tasks.push(task);
        try { await task.promise; } catch { /* cancelled */ }
      }
    };

    renderAll();
    const onResize = () => { clearTimeout(timer); timer = setTimeout(renderAll, 150); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      tasks.forEach(t => { try { t.cancel(); } catch { /* ignore */ } });
    };
  }, [doc]);

  if (failed) {
    return (
      <iframe
        src={url}
        className="w-full h-[45vh] sm:h-[55vh] max-h-[500px]"
        title="Document to sign"
      />
    );
  }

  return (
    <div ref={containerRef} className="bg-[#0f1623] p-3 sm:p-4 space-y-3">
      {!doc && <p className="text-center text-xs text-[#3a5070] py-10">Loading document...</p>}
      {doc && Array.from({ length: doc.numPages }, (_, i) => (
        <canvas
          key={i}
          className="block mx-auto max-w-full bg-white rounded shadow-md"
          aria-label={`Page ${i + 1} of ${doc.numPages}`}
        />
      ))}
    </div>
  );
}

function StatusScreen({
  icon, title, message, children,
}: { icon: string; title: string; message: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#1e2d45] flex items-center justify-center px-4">
      <div className="bg-[#1a2335] rounded-2xl border border-[#1e2d45] p-10 text-center max-w-md w-full">
        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-[#b8d4f0]">{message}</p>
        {children}
      </div>
    </div>
  );
}

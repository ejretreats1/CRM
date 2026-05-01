import { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { fetchSignatureRequestByToken } from '../services/signatures';
import type { SignatureRequest } from '../types';

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
      const res = await fetch('/api/signing', {
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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading document...</p>
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
            className="mt-4 inline-block bg-teal-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-teal-700 transition-colors"
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
            className="mt-4 inline-block bg-teal-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-teal-700 transition-colors"
          >
            Download Signed Document
          </a>
        )}
      </StatusScreen>
    );
  }

  // ── Ready / Submitting ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 mb-3">
            <span className="text-2xl">📄</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign Document</h1>
          <p className="text-slate-500 text-sm mt-1">E&amp;J Retreats — {sigReq?.documentName}</p>
        </div>

        {/* PDF Preview */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{sigReq?.documentName}</span>
            <a
              href={sigReq?.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-teal-600 hover:underline"
            >
              Open in new tab
            </a>
          </div>
          <iframe
            src={sigReq?.documentUrl}
            className="w-full"
            style={{ height: '500px' }}
            title="Document to sign"
          />
        </div>

        {/* Signature pad */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-700">Your Signature *</label>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="border-2 border-dashed border-slate-200 rounded-lg overflow-hidden bg-slate-100">
            <SignatureCanvas
              ref={sigCanvasRef}
              penColor="#1e293b"
              canvasProps={{
                className: 'w-full',
                style: { height: '160px', display: 'block', width: '100%' },
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">Draw your signature above using your mouse or finger.</p>
          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{errorMsg}</p>
          )}
        </div>

        {/* Consent + Submit */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            By clicking "Sign Document", I agree that my electronic signature is the legal equivalent of my manual signature and that I have reviewed the document above.
          </p>
          <button
            onClick={handleSubmit}
            disabled={status === 'submitting'}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {status === 'submitting' ? 'Submitting...' : 'Sign Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusScreen({
  icon, title, message, children,
}: { icon: string; title: string; message: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-md w-full">
        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-500">{message}</p>
        {children}
      </div>
    </div>
  );
}

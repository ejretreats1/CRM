import { useState, useRef } from 'react';
import { Upload, FileText, Send, X } from 'lucide-react';
import Modal from './Modal';
import { uploadDocument } from '../../services/signatures';
import type { Owner } from '../../types';

interface SignatureRequestModalProps {
  owner: Owner;
  onSent: () => void;
  onClose: () => void;
}

export default function SignatureRequestModal({ owner, onSent, onClose }: SignatureRequestModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('Management Agreement');
  const [email, setEmail] = useState(owner.email);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setErrorMsg('Please upload a PDF file.');
      return;
    }
    setFile(f);
    setErrorMsg('');
    if (!documentName || documentName === 'Management Agreement') {
      setDocumentName(f.name.replace('.pdf', ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setErrorMsg('Please select a PDF to send.'); return; }
    if (!email) { setErrorMsg('Owner email is required.'); return; }

    try {
      setStatus('uploading');
      const documentUrl = await uploadDocument(owner.id, file);

      setStatus('sending');
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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to send.');
      }

      setStatus('done');
      setTimeout(() => { onSent(); onClose(); }, 1500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  };

  return (
    <Modal title="Send Document for Signature" onClose={onClose}>
      {status === 'done' ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Send size={20} className="text-emerald-600" />
          </div>
          <p className="font-semibold text-slate-800">Sent successfully!</p>
          <p className="text-sm text-slate-500">Signing link sent to {email}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PDF Upload */}
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
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
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
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
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

          {(status === 'error' || errorMsg) && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === 'uploading' || status === 'sending'}
              className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Send size={14} />
              {status === 'uploading' ? 'Uploading...' : status === 'sending' ? 'Sending...' : 'Send for Signature'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

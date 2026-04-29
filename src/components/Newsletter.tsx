import { useState, useMemo, useRef } from 'react';
import { Mail, Users, Send, CheckCircle, AlertCircle, Loader, Eye, EyeOff, ImagePlus, X } from 'lucide-react';
import type { Lead, Owner } from '../types';

interface NewsletterProps {
  leads: Lead[];
  owners: Owner[];
}

interface Recipient {
  email: string;
  name: string;
  type: 'lead' | 'owner';
}

type SendState = 'idle' | 'sending' | 'done' | 'error';

export default function Newsletter({ leads, owners }: NewsletterProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [includeLeads, setIncludeLeads] = useState(true);
  const [includeOwners, setIncludeOwners] = useState(true);
  const [sendState, setSendState] = useState<SendState>('idle');
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  const recipients = useMemo<Recipient[]>(() => {
    const seen = new Set<string>();
    const list: Recipient[] = [];

    if (includeOwners) {
      for (const o of owners) {
        if (o.email && !seen.has(o.email.toLowerCase())) {
          seen.add(o.email.toLowerCase());
          list.push({ email: o.email, name: o.name, type: 'owner' });
        }
      }
    }

    if (includeLeads) {
      for (const l of leads) {
        if (l.email && !seen.has(l.email.toLowerCase())) {
          seen.add(l.email.toLowerCase());
          list.push({ email: l.email, name: l.name, type: 'lead' });
        }
      }
    }

    return list;
  }, [leads, owners, includeLeads, includeOwners]);

  const ownerCount = useMemo(() => {
    const seen = new Set<string>();
    owners.forEach(o => o.email && seen.add(o.email.toLowerCase()));
    return seen.size;
  }, [owners]);

  const leadCount = useMemo(() => {
    const ownerEmails = new Set(owners.map(o => o.email?.toLowerCase()).filter(Boolean));
    const seen = new Set<string>();
    leads.forEach(l => {
      if (l.email && !ownerEmails.has(l.email.toLowerCase())) seen.add(l.email.toLowerCase());
    });
    return seen.size;
  }, [leads, owners]);

  function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setHeaderImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function applyImageUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    setHeaderImage(url);
    setImageUrlInput('');
    setShowUrlInput(false);
  }

  function buildHtml() {
    const escaped = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('\n')
      .map(line => line.trim() === '' ? '<br/>' : `<p style="margin:0 0 12px 0;line-height:1.6">${line}</p>`)
      .join('');

    const imageBlock = headerImage
      ? `<img src="${headerImage}" alt="Newsletter image" style="width:100%;display:block;margin-bottom:24px;border-radius:6px;"/>`
      : '';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:32px 16px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0f766e;padding:32px;text-align:center">
      <div style="color:#fff;font-size:22px;font-weight:700">E&amp;J Retreats</div>
      <div style="color:#99f6e4;font-size:13px;margin-top:4px">Property Management Newsletter</div>
    </div>
    <div style="padding:32px">
      ${imageBlock}
      <h2 style="margin:0 0 20px 0;font-size:20px;color:#0f172a">${subject}</h2>
      ${escaped}
    </div>
    <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center">
      E&amp;J Retreats · You're receiving this because you're a valued client or contact.<br/>
    </div>
  </div>
</body>
</html>`;
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim() || recipients.length === 0) return;
    setConfirming(false);
    setSendState('sending');
    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), html: buildHtml(), recipients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setResult(data);
      setSendState('done');
    } catch {
      setSendState('error');
    }
  }

  function reset() {
    setSubject('');
    setBody('');
    setHeaderImage(null);
    setImageUrlInput('');
    setShowUrlInput(false);
    setSendState('idle');
    setResult(null);
    setConfirming(false);
  }

  if (sendState === 'done') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle size={32} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-xl font-bold text-slate-900">Newsletter Sent!</p>
          <p className="text-slate-500 text-sm mt-1">{result?.sent} emails delivered{result?.failed ? `, ${result.failed} failed` : ''}.</p>
        </div>
        <button onClick={reset} className="mt-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
          Send Another
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Mail size={22} className="text-teal-600" /> Newsletter
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Send monthly updates to your clients and leads</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Recipients */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users size={15} className="text-teal-600" /> Recipients
            </h3>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={includeOwners} onChange={e => setIncludeOwners(e.target.checked)} className="accent-teal-600 w-4 h-4" />
                <span className="text-sm text-slate-700">Clients <span className="text-slate-400">({ownerCount})</span></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={includeLeads} onChange={e => setIncludeLeads(e.target.checked)} className="accent-teal-600 w-4 h-4" />
                <span className="text-sm text-slate-700">Leads <span className="text-slate-400">({leadCount})</span></span>
              </label>
            </div>
            <div className={`flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg ${recipients.length > 0 ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-400'}`}>
              <Mail size={14} />
              {recipients.length > 0 ? `${recipients.length} recipients selected` : 'No recipients — select at least one group'}
            </div>
          </div>

          {/* Compose */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Compose</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Subject Line</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="E&J Retreats — April 2026 Update"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Image */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Header Image (optional)</label>
              <input
                ref={imageFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }}
              />
              {headerImage ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200">
                  <img src={headerImage} alt="Header" className="w-full object-cover max-h-48" />
                  <button
                    onClick={() => setHeaderImage(null)}
                    className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1 shadow text-slate-500 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    onClick={() => imageFileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f); }}
                    className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center cursor-pointer hover:border-teal-300 hover:bg-teal-50 transition-colors"
                  >
                    <ImagePlus size={20} className="mx-auto mb-1.5 text-slate-300" />
                    <p className="text-sm text-slate-500 font-medium">Upload image</p>
                    <p className="text-xs text-slate-400">or drag & drop · JPG, PNG, WebP</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-xs text-slate-400">or</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  {showUrlInput ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={imageUrlInput}
                        onChange={e => setImageUrlInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyImageUrl(); if (e.key === 'Escape') setShowUrlInput(false); }}
                        placeholder="https://example.com/image.jpg"
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button onClick={applyImageUrl} className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors">Add</button>
                      <button onClick={() => setShowUrlInput(false)} className="px-3 py-1.5 text-slate-500 text-sm rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowUrlInput(true)} className="w-full text-sm text-teal-600 hover:text-teal-700 font-medium py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
                      Paste image URL
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-600">Message</label>
                <button
                  type="button"
                  onClick={() => setPreview(p => !p)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-600 transition-colors"
                >
                  {preview ? <EyeOff size={12} /> : <Eye size={12} />}
                  {preview ? 'Edit' : 'Preview email'}
                </button>
              </div>

              {preview ? (
                <div
                  className="border border-slate-200 rounded-lg overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: buildHtml() }}
                  style={{ minHeight: 300 }}
                />
              ) : (
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={12}
                  placeholder={`Hey everyone,\n\nHere's what we've been up to this month at E&J Retreats...\n\nNew this month:\n- We added AI revenue projection reports\n- New listing optimizer tool\n\nThanks for being part of the E&J Retreats family!\n\n— Ethan & Jordan`}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none font-mono"
                />
              )}
              <p className="text-xs text-slate-400 mt-1">Plain text — blank lines become spacing.</p>
            </div>
          </div>

          {sendState === 'error' && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              Failed to send. Check that RESEND_API_KEY and NEWSLETTER_FROM_EMAIL are set in Vercel.
            </div>
          )}

          {/* Send / Confirm */}
          {confirming ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-800">Send to {recipients.length} people?</p>
              <p className="text-xs text-amber-700">Subject: <span className="font-medium">{subject}</span></p>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSend} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Send size={13} /> Yes, Send Now
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={!subject.trim() || !body.trim() || recipients.length === 0 || sendState === 'sending'}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {sendState === 'sending' ? (
                <><Loader size={14} className="animate-spin" /> Sending...</>
              ) : (
                <><Send size={14} /> Send Newsletter to {recipients.length} People</>
              )}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

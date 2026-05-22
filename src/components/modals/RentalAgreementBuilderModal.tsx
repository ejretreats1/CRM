import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X, Upload, Plus, Trash2, Send, FileText, ChevronLeft, ChevronRight,
  Type, PenLine, CreditCard, Calendar, Pen, ZoomIn, ZoomOut, Copy, Check,
} from 'lucide-react';
import type { AgreementField, AgreementTemplate, AgreementSubmission, FieldType } from '../../services/rentalAgreements';
import {
  fetchTemplates, saveTemplate, deleteTemplate, uploadAgreementPdf, fetchSubmissions,
} from '../../services/rentalAgreements';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

interface Props {
  propertyId: string;
  ownerId: string;
  onClose: () => void;
}

const FIELD_COLORS: Record<FieldType, string> = {
  signature:   '#0d9488',
  text:        '#3b82f6',
  date:        '#8b5cf6',
  initials:    '#f59e0b',
  credit_card: '#ef4444',
};

const FIELD_ICONS: Record<FieldType, React.ReactNode> = {
  signature:   <PenLine size={10} />,
  text:        <Type size={10} />,
  date:        <Calendar size={10} />,
  initials:    <Pen size={10} />,
  credit_card: <CreditCard size={10} />,
};

const FIELD_DEFAULTS: Record<FieldType, { w: number; h: number }> = {
  signature:   { w: 0.25, h: 0.05 },
  text:        { w: 0.3,  h: 0.03 },
  date:        { w: 0.18, h: 0.03 },
  initials:    { w: 0.1,  h: 0.04 },
  credit_card: { w: 0.25, h: 0.03 },
};

type Screen = 'list' | 'build' | 'send';

export default function RentalAgreementBuilderModal({ propertyId, ownerId, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>('list');
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, AgreementSubmission[]>>({});
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Builder state
  const [editingTemplate, setEditingTemplate] = useState<AgreementTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [fields, setFields] = useState<AgreementField[]>([]);
  const [selectedFieldType, setSelectedFieldType] = useState<FieldType>('signature');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Send state
  const [sendTemplate, setSendTemplate] = useState<AgreementTemplate | null>(null);
  const [sendGuestName, setSendGuestName] = useState('');
  const [sendGuestEmail, setSendGuestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendDone, setSendDone] = useState(false);
  const [sentToken, setSentToken] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchTemplates(propertyId)
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [propertyId]);

  async function loadSubmissionsForTemplate(templateId: string) {
    if (submissions[templateId]) return;
    try {
      const subs = await fetchSubmissions(templateId);
      setSubmissions(prev => ({ ...prev, [templateId]: subs }));
    } catch {}
  }

  // Render a PDF page onto the canvas
  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageIndex: number, z: number) => {
    if (!canvasRef.current) return;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }

    const page = await doc.getPage(pageIndex + 1);
    const canvas = canvasRef.current;
    const containerWidth = canvas.parentElement?.clientWidth ?? 700;
    const viewport = page.getViewport({ scale: 1 });
    const baseScale = containerWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale: baseScale * z });

    canvas.width  = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.width  = `${scaledViewport.width}px`;
    canvas.style.height = `${scaledViewport.height}px`;

    const ctx = canvas.getContext('2d')!;
    renderTaskRef.current = page.render({ canvas, canvasContext: ctx, viewport: scaledViewport });
    try { await renderTaskRef.current.promise; } catch {}
  }, []);

  useEffect(() => {
    if (pdfDoc) renderPage(pdfDoc, currentPage, zoom);
  }, [pdfDoc, currentPage, zoom, renderPage]);

  async function handleFileUpload(file: File) {
    if (file.type !== 'application/pdf') return;
    setPdfFile(file);
    setUploading(false);
    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    setPdfDoc(doc);
    setPageCount(doc.numPages);
    setCurrentPage(0);
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!overlayRef.current || !canvasRef.current) return;
    // Don't place field if we clicked on an existing field
    if ((e.target as HTMLElement).closest('[data-field]')) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const defaults = FIELD_DEFAULTS[selectedFieldType];

    const field: AgreementField = {
      id:       `field_${Date.now()}`,
      type:     selectedFieldType,
      label:    labelForType(selectedFieldType),
      page:     currentPage,
      x:        Math.max(0, Math.min(1 - defaults.w, x - defaults.w / 2)),
      y:        Math.max(0, Math.min(1 - defaults.h, y - defaults.h / 2)),
      w:        defaults.w,
      h:        defaults.h,
      required: true,
    };
    setFields(prev => [...prev, field]);
    setSelectedFieldId(field.id);
  }

  function labelForType(type: FieldType): string {
    switch (type) {
      case 'signature':   return 'Signature';
      case 'text':        return 'Full Name';
      case 'date':        return 'Date';
      case 'initials':    return 'Initials';
      case 'credit_card': return 'Credit Card Number';
    }
  }

  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  }

  function updateFieldLabel(id: string, label: string) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, label } : f));
  }

  // Drag to move field
  function startDrag(e: React.MouseEvent, fieldId: string) {
    e.preventDefault();
    e.stopPropagation();
    const overlay = overlayRef.current;
    if (!overlay) return;
    setSelectedFieldId(fieldId);

    const rect = overlay.getBoundingClientRect();
    const field = fields.find(f => f.id === fieldId)!;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX  = field.x;
    const origY  = field.y;

    function onMove(ev: MouseEvent) {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      setFields(prev => prev.map(f => f.id === fieldId ? {
        ...f,
        x: Math.max(0, Math.min(1 - f.w, origX + dx)),
        y: Math.max(0, Math.min(1 - f.h, origY + dy)),
      } : f));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    if (!pdfUrl && !pdfFile) return;
    setSaving(true);
    try {
      let docUrl = pdfUrl;
      if (pdfFile && !pdfUrl) {
        setUploading(true);
        docUrl = await uploadAgreementPdf(pdfFile, propertyId);
        setPdfUrl(docUrl);
        setUploading(false);
      }

      const id = editingTemplate?.id ?? `rat_${Date.now()}`;
      const saved = await saveTemplate({
        id, propertyId, ownerId,
        name: templateName.trim(),
        documentUrl: docUrl,
        fields,
      });
      setTemplates(prev => {
        const exists = prev.find(t => t.id === saved.id);
        return exists ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev];
      });
      setScreen('list');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    await deleteTemplate(id).catch(() => {});
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function openBuilder(template?: AgreementTemplate) {
    setZoom(1);
    if (template) {
      setEditingTemplate(template);
      setTemplateName(template.name);
      setPdfUrl(template.documentUrl);
      setFields(template.fields);
      setPdfFile(null);
      // Load the PDF from URL
      pdfjsLib.getDocument(template.documentUrl).promise.then(doc => {
        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setCurrentPage(0);
      }).catch(() => {});
    } else {
      setEditingTemplate(null);
      setTemplateName('');
      setPdfUrl('');
      setPdfFile(null);
      setPdfDoc(null);
      setPageCount(0);
      setCurrentPage(0);
      setFields([]);
    }
    setSelectedFieldId(null);
    setScreen('build');
  }

  function openSend(template: AgreementTemplate) {
    setSendTemplate(template);
    setSendGuestName('');
    setSendGuestEmail('');
    setSendDone(false);
    setScreen('send');
  }

  async function handleSend() {
    if (!sendTemplate || !sendGuestName.trim() || !sendGuestEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow:       'agreement',
          action:     'send',
          templateId: sendTemplate.id,
          propertyId,
          ownerId,
          guestName:  sendGuestName.trim(),
          guestEmail: sendGuestEmail.trim(),
          appUrl:     window.location.origin,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSentToken(data.token ?? '');
      setSendDone(true);
      // Refresh submissions
      setSubmissions(prev => ({ ...prev, [sendTemplate.id]: [] }));
      await fetchSubmissions(sendTemplate.id)
        .then(subs => setSubmissions(prev => ({ ...prev, [sendTemplate!.id]: subs })))
        .catch(() => {});
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send.');
    } finally {
      setSending(false);
    }
  }

  const pageFields = fields.filter(f => f.page === currentPage);

  // ── LIST SCREEN ──────────────────────────────────────────────────────────────
  if (screen === 'list') {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-10 px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-teal-600" />
              <h2 className="font-bold text-slate-900">Rental Agreements</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
              <button
                onClick={() => openBuilder()}
                className="flex items-center gap-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={14} /> New Template
              </button>
            </div>

            {loadingTemplates ? (
              <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <FileText size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No templates yet</p>
                <p className="text-sm text-slate-400 mt-1">Upload a PDF and add signature/text fields</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map(t => {
                  const subs = submissions[t.id];
                  const pending   = subs?.filter(s => s.status === 'pending').length ?? 0;
                  const completed = subs?.filter(s => s.status === 'completed').length ?? 0;
                  return (
                    <div
                      key={t.id}
                      className="border border-slate-200 rounded-xl p-4 hover:border-teal-200 transition-colors"
                      onMouseEnter={() => loadSubmissionsForTemplate(t.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{t.fields.length} field{t.fields.length !== 1 ? 's' : ''}</p>
                          {subs && (
                            <div className="flex gap-3 mt-1.5">
                              {pending > 0 && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pending} pending</span>
                              )}
                              {completed > 0 && (
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{completed} completed</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => openSend(t)}
                            className="flex items-center gap-1 text-xs font-medium text-teal-600 border border-teal-200 hover:bg-teal-50 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            <Send size={11} /> Send
                          </button>
                          <button
                            onClick={() => openBuilder(t)}
                            className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="text-slate-300 hover:text-red-400 transition-colors p-1.5"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Submission list */}
                      {subs && subs.length > 0 && (
                        <div className="mt-3 border-t border-slate-100 pt-3 space-y-1.5">
                          {subs.slice(0, 3).map(s => (
                            <div key={s.id} className="flex items-center justify-between text-xs">
                              <span className="text-slate-600 truncate">{s.guestName} <span className="text-slate-400">({s.guestEmail})</span></span>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                                  s.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                                  : s.status === 'expired'  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-amber-100 text-amber-700'
                                }`}>{s.status}</span>
                                {s.status === 'pending' && (
                                  <button
                                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/fill/${s.token}`)}
                                    className="text-slate-400 hover:text-teal-600 transition-colors"
                                    title="Copy guest link"
                                  >
                                    <Copy size={11} />
                                  </button>
                                )}
                                {s.filledDocumentUrl && (
                                  <a href={s.filledDocumentUrl} target="_blank" rel="noreferrer"
                                    className="text-teal-600 hover:underline">Download</a>
                                )}
                              </div>
                            </div>
                          ))}
                          {subs.length > 3 && (
                            <p className="text-xs text-slate-400">+{subs.length - 3} more</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── SEND SCREEN ──────────────────────────────────────────────────────────────
  if (screen === 'send') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setScreen('list')} className="text-slate-400 hover:text-slate-600">
              <ChevronLeft size={20} />
            </button>
            <h2 className="font-bold text-slate-900">Send Agreement</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
          </div>

          {sendDone ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send size={24} className="text-emerald-600" />
              </div>
              <p className="font-semibold text-slate-900">Agreement Sent!</p>
              <p className="text-sm text-slate-500 mt-1 mb-5">
                Email sent to {sendGuestEmail}. You can also copy the link to share directly:
              </p>
              {sentToken && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/fill/${sentToken}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-2 mx-auto bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy Guest Link'}
                </button>
              )}
              <button
                onClick={() => setScreen('list')}
                className="mt-5 text-sm font-medium text-teal-600 hover:text-teal-700 block mx-auto"
              >
                Back to templates
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-4">
                Sending: <strong>{sendTemplate?.name}</strong>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Guest name</label>
                  <input
                    type="text"
                    value={sendGuestName}
                    onChange={e => setSendGuestName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Guest email</label>
                  <input
                    type="email"
                    value={sendGuestEmail}
                    onChange={e => setSendGuestEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <button
                onClick={handleSend}
                disabled={sending || !sendGuestName.trim() || !sendGuestEmail.trim()}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
              >
                {sending ? 'Sending…' : <><Send size={14} /> Send Agreement</>}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── BUILD SCREEN ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shadow-sm flex-shrink-0">
        <button onClick={() => setScreen('list')} className="text-slate-400 hover:text-slate-600 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <input
          type="text"
          value={templateName}
          onChange={e => setTemplateName(e.target.value)}
          placeholder="Template name…"
          className="flex-1 text-sm font-semibold text-slate-900 border-none outline-none bg-transparent placeholder-slate-400"
        />
        <button
          onClick={handleSaveTemplate}
          disabled={saving || uploading || !templateName.trim() || (!pdfUrl && !pdfFile)}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : uploading ? 'Uploading…' : 'Save Template'}
        </button>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors ml-1">
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — field palette */}
        <div className="w-52 border-r border-slate-200 bg-slate-50 overflow-y-auto flex-shrink-0 p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Add Field</p>
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">Choose a type, then click on the PDF to place it.</p>
          <div className="space-y-1.5">
            {(['signature', 'text', 'date', 'initials', 'credit_card'] as FieldType[]).map(type => (
              <button
                key={type}
                onClick={() => setSelectedFieldType(type)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  selectedFieldType === type
                    ? 'bg-white shadow-sm border border-slate-200 text-slate-900'
                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                }`}
              >
                <span style={{ color: FIELD_COLORS[type] }}>{FIELD_ICONS[type]}</span>
                {type === 'credit_card' ? 'Credit Card' : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {fields.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-5 mb-3">
                Fields ({fields.length})
              </p>
              <div className="space-y-1">
                {fields.map(f => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      selectedFieldId === f.id ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-white'
                    }`}
                    onClick={() => setSelectedFieldId(f.id)}
                  >
                    <span style={{ color: FIELD_COLORS[f.type] }} className="flex-shrink-0">{FIELD_ICONS[f.type]}</span>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={f.label}
                        onChange={e => { e.stopPropagation(); updateFieldLabel(f.id, e.target.value); }}
                        onClick={e => e.stopPropagation()}
                        className="w-full text-xs text-slate-700 bg-transparent border-none outline-none truncate"
                      />
                      <p className="text-[10px] text-slate-400">p.{f.page + 1}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeField(f.id); }}
                      className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Main area — PDF viewer + overlay */}
        <div className="flex-1 overflow-auto bg-slate-200 p-4">
          {!pdfDoc ? (
            <label className="flex flex-col items-center justify-center h-full min-h-64 border-2 border-dashed border-slate-400 rounded-xl cursor-pointer hover:border-teal-500 hover:bg-slate-100 transition-colors">
              <Upload size={32} className="text-slate-400 mb-3" />
              <p className="text-slate-600 font-medium">Upload PDF Agreement</p>
              <p className="text-sm text-slate-400 mt-1">Click or drag a PDF file here</p>
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              />
            </label>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {/* Page navigation + zoom controls */}
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm">
                {pageCount > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm text-slate-600">Page {currentPage + 1} of {pageCount}</span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
                      disabled={currentPage === pageCount - 1}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1" />
                  </>
                )}
                <button
                  onClick={() => setZoom(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}
                  disabled={zoom <= 0.5}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors p-0.5"
                  title="Zoom out"
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="text-xs text-slate-500 hover:text-teal-600 font-medium w-10 text-center transition-colors"
                  title="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => setZoom(z => Math.min(3, parseFloat((z + 0.25).toFixed(2))))}
                  disabled={zoom >= 3}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors p-0.5"
                  title="Zoom in"
                >
                  <ZoomIn size={15} />
                </button>
              </div>

              {/* PDF canvas + field overlay */}
              <div className="relative shadow-xl rounded-sm overflow-hidden" style={{ maxWidth: '100%' }}>
                <canvas ref={canvasRef} className="block" />

                {/* Clickable overlay for placing fields */}
                <div
                  ref={overlayRef}
                  className="absolute inset-0 cursor-crosshair"
                  onClick={handleOverlayClick}
                >
                  {pageFields.map(f => (
                    <div
                      key={f.id}
                      data-field={f.id}
                      style={{
                        position: 'absolute',
                        left:   `${f.x * 100}%`,
                        top:    `${f.y * 100}%`,
                        width:  `${f.w * 100}%`,
                        height: `${f.h * 100}%`,
                        border: `2px solid ${selectedFieldId === f.id ? FIELD_COLORS[f.type] : FIELD_COLORS[f.type] + '88'}`,
                        background: FIELD_COLORS[f.type] + '22',
                        borderRadius: 3,
                        cursor: 'move',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingLeft: 4,
                        gap: 3,
                        boxSizing: 'border-box',
                        userSelect: 'none',
                      }}
                      onMouseDown={e => startDrag(e, f.id)}
                      onClick={e => { e.stopPropagation(); setSelectedFieldId(f.id); }}
                    >
                      <span style={{ color: FIELD_COLORS[f.type], fontSize: 9, flexShrink: 0 }}>
                        {FIELD_ICONS[f.type]}
                      </span>
                      <span style={{ fontSize: 9, color: FIELD_COLORS[f.type], fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {f.label}
                      </span>
                      <button
                        style={{ marginLeft: 'auto', marginRight: 2, flexShrink: 0, lineHeight: 1 }}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); removeField(f.id); }}
                      >
                        <X size={8} color={FIELD_COLORS[f.type]} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-slate-400">Click on the PDF to place a field · Drag fields to reposition</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

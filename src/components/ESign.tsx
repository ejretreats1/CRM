import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Plus, Trash2, Send, FileText, ChevronLeft, ChevronRight,
  Type, PenLine, CreditCard, Calendar, Pen, ZoomIn, ZoomOut,
  Copy, Check, Upload, X, FileSignature, Clock, Filter,
} from 'lucide-react';
import type { AgreementField, AgreementTemplate, AgreementSubmission, FieldType } from '../services/rentalAgreements';
import {
  fetchAllTemplates, saveTemplate, deleteTemplate, uploadAgreementPdf,
  fetchSubmissions, fetchAllSubmissions,
} from '../services/rentalAgreements';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const DOCUMENT_CATEGORIES = ['Rental Agreement', 'VA Contract', 'Client Contract', 'NDA', 'Other'];

const CATEGORY_COLORS: Record<string, string> = {
  'Rental Agreement': 'bg-[#0a2518] text-[#4ab57a]',
  'VA Contract':      'bg-[#0e1e3a] text-[#4a90d9]',
  'Client Contract':  'bg-[#1a0e3a] text-[#9b7ae8]',
  'NDA':              'bg-[#2a1a05] text-[#d0954a]',
  'Other':            'bg-[#1e2d45] text-[#b8d4f0]',
};

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

function labelForType(type: FieldType): string {
  switch (type) {
    case 'signature':   return 'Signature';
    case 'text':        return 'Full Name';
    case 'date':        return 'Date';
    case 'initials':    return 'Initials';
    case 'credit_card': return 'Credit Card Number';
  }
}

interface Props {
  userId: string;
}

export default function ESign({ userId }: Props) {
  // ── Hub state ────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<AgreementSubmission[]>([]);
  const [templateSubmissions, setTemplateSubmissions] = useState<Record<string, AgreementSubmission[]>>({});
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [hubTab, setHubTab] = useState<'templates' | 'sent'>('templates');

  // ── Builder overlay state ─────────────────────────────────────────────────
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AgreementTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState('VA Contract');
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
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Send modal state ──────────────────────────────────────────────────────
  const [sendTemplate, setSendTemplate] = useState<AgreementTemplate | null>(null);
  const [sendName, setSendName] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendDone, setSendDone] = useState(false);
  const [sentToken, setSentToken] = useState('');
  const [sentViaEmail, setSentViaEmail] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([fetchAllTemplates(), fetchAllSubmissions()])
      .then(([tmpl, subs]) => {
        setTemplates(tmpl);
        setAllSubmissions(subs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadTemplateSubmissions(templateId: string) {
    if (templateSubmissions[templateId] !== undefined) return;
    try {
      const subs = await fetchSubmissions(templateId);
      setTemplateSubmissions(prev => ({ ...prev, [templateId]: subs }));
    } catch {}
  }

  // ── PDF rendering ────────────────────────────────────────────────────────
  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, pageIndex: number, z: number) => {
    if (!canvasRef.current) return;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }
    const page = await doc.getPage(pageIndex + 1);
    const canvas = canvasRef.current;
    // Use the stable scroll container width so zoom doesn't change the base scale
    const rawWidth = scrollContainerRef.current?.clientWidth ?? canvas.parentElement?.clientWidth ?? 700;
    const containerWidth = Math.max(200, rawWidth - 32); // subtract p-4 padding (16px × 2)
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
    if (pdfDoc && showBuilder) renderPage(pdfDoc, currentPage, zoom);
  }, [pdfDoc, currentPage, zoom, renderPage, showBuilder]);

  async function handleFileUpload(file: File) {
    if (file.type !== 'application/pdf') return;
    setPdfFile(file);
    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    setPdfDoc(doc);
    setPageCount(doc.numPages);
    setCurrentPage(0);
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!overlayRef.current || !canvasRef.current) return;
    if ((e.target as HTMLElement).closest('[data-field]')) return;
    // Use canvas rect so fractions are relative to the full canvas at any zoom level
    const rect = canvasRef.current.getBoundingClientRect();
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

  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  }

  function updateFieldLabel(id: string, label: string) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, label } : f));
  }

  function startDrag(e: React.MouseEvent, fieldId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!overlayRef.current || !canvasRef.current) return;
    setSelectedFieldId(fieldId);
    // Use canvas rect so drag deltas map to document fractions correctly at any zoom
    const rect = canvasRef.current.getBoundingClientRect();
    const field = fields.find(f => f.id === fieldId)!;
    const startX = e.clientX, startY = e.clientY;
    const origX = field.x, origY = field.y;
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

  function openBuilder(template?: AgreementTemplate) {
    setZoom(1);
    if (template) {
      setEditingTemplate(template);
      setTemplateName(template.name);
      setTemplateCategory(template.category);
      setPdfUrl(template.documentUrl);
      setFields(template.fields);
      setPdfFile(null);
      pdfjsLib.getDocument(template.documentUrl).promise.then(doc => {
        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setCurrentPage(0);
      }).catch(() => {});
    } else {
      setEditingTemplate(null);
      setTemplateName('');
      setTemplateCategory('VA Contract');
      setPdfUrl('');
      setPdfFile(null);
      setPdfDoc(null);
      setPageCount(0);
      setCurrentPage(0);
      setFields([]);
    }
    setSelectedFieldId(null);
    setShowBuilder(true);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim() || (!pdfUrl && !pdfFile)) return;
    setSaving(true);
    try {
      let docUrl = pdfUrl;
      if (pdfFile && !pdfUrl) {
        setUploading(true);
        docUrl = await uploadAgreementPdf(pdfFile, 'global');
        setPdfUrl(docUrl);
        setUploading(false);
      }
      const id = editingTemplate?.id ?? `doc_${Date.now()}`;
      const saved = await saveTemplate({
        id,
        propertyId: 'global',
        ownerId:    userId,
        name:       templateName.trim(),
        category:   templateCategory,
        documentUrl: docUrl,
        fields,
      });
      setTemplates(prev => {
        const exists = prev.find(t => t.id === saved.id);
        return exists ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev];
      });
      setShowBuilder(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    await deleteTemplate(id).catch(() => {});
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function openSend(template: AgreementTemplate) {
    setSendTemplate(template);
    setSendName('');
    setSendEmail('');
    setSendDone(false);
    setSentToken('');
    setSentViaEmail(false);
    setCopied(false);
  }

  async function handleSend(skipEmail: boolean) {
    if (!sendTemplate || !sendName.trim() || !sendEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow:       'agreement',
          action:     'send',
          templateId: sendTemplate.id,
          propertyId: sendTemplate.propertyId,
          ownerId:    userId,
          guestName:  sendName.trim(),
          guestEmail: sendEmail.trim(),
          appUrl:     window.location.origin,
          skipEmail,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const token = data.token ?? '';
      setSentToken(token);
      setSentViaEmail(!skipEmail);
      setSendDone(true);
      if (skipEmail && token) {
        navigator.clipboard.writeText(`${window.location.origin}/fill/${token}`);
        setCopied(true);
      }
      fetchAllSubmissions().then(setAllSubmissions).catch(() => {});
      setTemplateSubmissions(prev => {
        const next = { ...prev };
        delete next[sendTemplate.id];
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send.');
    } finally {
      setSending(false);
    }
  }

  const pageFields = fields.filter(f => f.page === currentPage);
  const filteredTemplates = categoryFilter === 'All'
    ? templates
    : templates.filter(t => t.category === categoryFilter);

  // ── BUILDER OVERLAY ──────────────────────────────────────────────────────────
  if (showBuilder) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#1a2335]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2d45] flex-shrink-0">
          <button onClick={() => setShowBuilder(false)} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Document name (required)…"
              className={`w-full text-sm font-semibold text-white bg-transparent outline-none border-b pb-0.5 transition-colors ${
                !templateName.trim()
                  ? 'border-orange-500/60 placeholder-orange-400/70'
                  : 'border-transparent placeholder-slate-400'
              }`}
            />
          </div>
          <select
            value={templateCategory}
            onChange={e => setTemplateCategory(e.target.value)}
            className="text-xs bg-[#162035] border border-[#1e2d45] text-[#b8d4f0] rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            {DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={handleSaveTemplate}
            disabled={saving || uploading || !templateName.trim() || (!pdfUrl && !pdfFile)}
            title={
              !templateName.trim() ? 'Enter a document name first'
              : (!pdfUrl && !pdfFile) ? 'Upload a PDF first'
              : ''
            }
            className="flex items-center gap-1.5 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : uploading ? 'Uploading…' : 'Save Template'}
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — field palette */}
          <div className="w-52 border-r border-[#1e2d45] bg-[#1e2d45] overflow-y-auto flex-shrink-0 p-3">
            <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mb-3">Add Field</p>
            <p className="text-xs text-[#3a5070] mb-3 leading-relaxed">Choose a type, then click on the PDF to place it.</p>
            <div className="space-y-1.5">
              {(['signature', 'text', 'date', 'initials', 'credit_card'] as FieldType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setSelectedFieldType(type)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${
                    selectedFieldType === type
                      ? 'bg-[#1a2335] shadow-sm border border-[#1e2d45] text-white'
                      : 'text-[#b8d4f0] hover:bg-[#1a2335]'
                  }`}
                >
                  <span style={{ color: FIELD_COLORS[type] }}>{FIELD_ICONS[type]}</span>
                  {type === 'credit_card' ? 'Credit Card' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {fields.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide mt-5 mb-3">
                  Fields ({fields.length})
                </p>
                <div className="space-y-1">
                  {fields.map(f => (
                    <div
                      key={f.id}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        selectedFieldId === f.id ? 'bg-[#1a2335] shadow-sm border border-[#1e2d45]' : 'hover:bg-[#1a2335]'
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
                          className="w-full text-xs text-[#b8d4f0] bg-transparent border-none outline-none truncate"
                        />
                        <p className="text-[10px] text-[#3a5070]">p.{f.page + 1}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); removeField(f.id); }}
                        className="text-[#3a5070] hover:text-[#e05c5c] transition-colors flex-shrink-0"
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
          <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-[#1e2d45] p-4">
            {!pdfDoc ? (
              <div
                className={`flex flex-col items-center justify-center h-full min-h-64 border-2 border-dashed rounded-xl transition-colors ${
                  isDragging
                    ? 'border-teal-400 bg-teal-900/20'
                    : 'border-slate-400 hover:border-teal-500'
                }`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file);
                }}
              >
                <Upload size={32} className={`mb-3 ${isDragging ? 'text-teal-400' : 'text-[#3a5070]'}`} />
                <p className="text-[#b8d4f0] font-medium">
                  {isDragging ? 'Drop PDF here' : 'Upload PDF Document'}
                </p>
                <p className="text-sm text-[#3a5070] mt-1">Drag a file here, or click to browse</p>
                <label className="mt-3 text-xs text-[#4a90d9] hover:underline cursor-pointer">
                  Browse file
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {/* Page navigation + zoom */}
                <div className="flex items-center gap-2 bg-[#1a2335] rounded-lg px-3 py-2 shadow-sm">
                  {pageCount > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-sm text-[#b8d4f0]">Page {currentPage + 1} of {pageCount}</span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(pageCount - 1, p + 1))}
                        disabled={currentPage === pageCount - 1}
                        className="text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <div className="w-px h-4 bg-[#1e2d45] mx-1" />
                    </>
                  )}
                  <button
                    onClick={() => setZoom(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}
                    disabled={zoom <= 0.5}
                    className="text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 transition-colors p-0.5"
                  >
                    <ZoomOut size={15} />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="text-xs text-[#b8d4f0] hover:text-[#4a90d9] font-medium w-10 text-center transition-colors"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => setZoom(z => Math.min(3, parseFloat((z + 0.25).toFixed(2))))}
                    disabled={zoom >= 3}
                    className="text-[#3a5070] hover:text-[#b8d4f0] disabled:opacity-30 transition-colors p-0.5"
                  >
                    <ZoomIn size={15} />
                  </button>
                </div>

                {/* PDF canvas + field overlay */}
                <div className="relative shadow-xl rounded-sm" style={{ display: 'inline-block' }}>
                  <canvas ref={canvasRef} className="block" />
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
                          position:   'absolute',
                          left:       `${f.x * 100}%`,
                          top:        `${f.y * 100}%`,
                          width:      `${f.w * 100}%`,
                          height:     `${f.h * 100}%`,
                          border:     `2px solid ${selectedFieldId === f.id ? FIELD_COLORS[f.type] : FIELD_COLORS[f.type] + '88'}`,
                          background: FIELD_COLORS[f.type] + '22',
                          borderRadius: 3,
                          cursor:     'move',
                          display:    'flex',
                          alignItems: 'center',
                          paddingLeft: 4,
                          gap: 3,
                          boxSizing:  'border-box',
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

                <p className="text-xs text-[#3a5070]">Click on the PDF to place a field · Drag fields to reposition</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── SEND MODAL ───────────────────────────────────────────────────────────────
  if (sendTemplate) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setSendTemplate(null)} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors">
              <ChevronLeft size={20} />
            </button>
            <h2 className="font-bold text-white">Send for Signature</h2>
            <button onClick={() => setSendTemplate(null)} className="text-[#3a5070] hover:text-[#b8d4f0] transition-colors">
              <X size={20} />
            </button>
          </div>

          {sendDone ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-[#0a2518] rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSignature size={24} className="text-[#5ce0a0]" />
              </div>
              <p className="font-semibold text-white text-lg">
                {sentViaEmail ? 'Email Sent!' : 'Link Ready!'}
              </p>
              <p className="text-sm text-[#b8d4f0] mt-1 mb-6">
                {sentViaEmail
                  ? <>Email sent to <strong>{sendEmail}</strong>. You can also share the direct link:</>
                  : <>Link copied to clipboard. Share it with <strong>{sendName}</strong>:</>
                }
              </p>
              {sentToken && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/fill/${sentToken}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-2 mx-auto bg-[#1e2d45] hover:bg-[#162035] text-[#b8d4f0] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  {copied ? <Check size={14} className="text-[#5ce0a0]" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy Signing Link'}
                </button>
              )}
              <button onClick={() => setSendTemplate(null)} className="mt-5 text-sm font-medium text-[#4a90d9] block mx-auto">
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <p className="text-sm text-[#b8d4f0]">
                  Sending: <strong className="text-white">{sendTemplate.name}</strong>
                </p>
                <span className={`mt-1.5 inline-block text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[sendTemplate.category] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                  {sendTemplate.category}
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#b8d4f0] block mb-1">Recipient name</label>
                  <input
                    type="text"
                    value={sendName}
                    onChange={e => setSendName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#b8d4f0] block mb-1">Recipient email</label>
                  <input
                    type="email"
                    value={sendEmail}
                    onChange={e => setSendEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full bg-[#162035] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => handleSend(false)}
                  disabled={sending || !sendName.trim() || !sendEmail.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
                >
                  {sending ? 'Sending…' : <><Send size={14} /> Send Email</>}
                </button>
                <button
                  onClick={() => handleSend(true)}
                  disabled={sending || !sendName.trim() || !sendEmail.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#1e2d45] hover:bg-[#162035] disabled:opacity-50 text-[#b8d4f0] font-medium text-sm py-2.5 rounded-lg border border-[#1e2d45] transition-colors"
                >
                  {sending ? '…' : <><Copy size={14} /> Copy Link</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── HUB ──────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">E-Sign Documents</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">Create, send, and track all signed documents</p>
        </div>
        <button
          onClick={() => openBuilder()}
          className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={15} /> New Template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#162035] p-1 rounded-xl w-fit">
        <button
          onClick={() => setHubTab('templates')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${hubTab === 'templates' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
        >
          Templates ({templates.length})
        </button>
        <button
          onClick={() => setHubTab('sent')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${hubTab === 'sent' ? 'bg-[#1a2335] text-white shadow-sm' : 'text-[#3a5070] hover:text-[#b8d4f0]'}`}
        >
          All Sent ({allSubmissions.length})
        </button>
      </div>

      {/* ── TEMPLATES TAB ── */}
      {hubTab === 'templates' && (
        <>
          {/* Category filter */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <Filter size={13} className="text-[#3a5070] flex-shrink-0" />
            {['All', ...DOCUMENT_CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  categoryFilter === cat
                    ? 'bg-[#4a90d9] text-white'
                    : 'bg-[#1e2d45] text-[#b8d4f0] hover:bg-[#1e3a5a]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-[#3a5070] text-center py-16">Loading…</p>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-[#1e2d45] rounded-xl">
              <FileSignature size={36} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-[#b8d4f0] font-medium">
                {categoryFilter === 'All' ? 'No templates yet' : `No ${categoryFilter} templates`}
              </p>
              <p className="text-sm text-[#3a5070] mt-1 mb-4">
                Upload any PDF, place signature fields, and save as a reusable template
              </p>
              <button
                onClick={() => openBuilder()}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4a90d9] border border-[#1e3a5a] hover:bg-[#1e2d45] px-4 py-2 rounded-lg transition-colors"
              >
                <Plus size={14} /> Create Template
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTemplates.map(t => {
                const subs = templateSubmissions[t.id];
                const pending   = subs?.filter(s => s.status === 'pending').length ?? 0;
                const completed = subs?.filter(s => s.status === 'completed').length ?? 0;
                return (
                  <div
                    key={t.id}
                    className="bg-[#1a2335] border border-[#1e2d45] rounded-xl p-4 hover:border-[#1e3a5a] transition-colors"
                    onMouseEnter={() => loadTemplateSubmissions(t.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white">{t.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[t.category] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                            {t.category}
                          </span>
                        </div>
                        <p className="text-xs text-[#3a5070] mt-0.5">
                          {t.fields.length} field{t.fields.length !== 1 ? 's' : ''}
                        </p>
                        {subs && (
                          <div className="flex gap-2 mt-1.5 flex-wrap">
                            {pending > 0 && (
                              <span className="text-xs bg-[#2a1a0a] text-[#d0954a] px-2 py-0.5 rounded-full">
                                {pending} pending
                              </span>
                            )}
                            {completed > 0 && (
                              <span className="text-xs bg-[#0a2518] text-[#4ab57a] px-2 py-0.5 rounded-full">
                                {completed} completed
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => openSend(t)}
                          className="flex items-center gap-1 text-xs font-medium text-[#4a90d9] border border-[#1e3a5a] hover:bg-[#162035] px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <Send size={11} /> Send
                        </button>
                        <button
                          onClick={() => openBuilder(t)}
                          className="text-xs text-[#3a5070] hover:text-[#b8d4f0] border border-[#1e2d45] hover:border-[#1e3a5a] px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-[#3a5070] hover:text-[#e05c5c] transition-colors p-1.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Inline submissions */}
                    {subs && subs.length > 0 && (
                      <div className="mt-3 border-t border-[#1e2d45] pt-3 space-y-1.5">
                        {subs.slice(0, 5).map(s => (
                          <div key={s.id} className="flex items-center justify-between text-xs">
                            <span className="text-[#b8d4f0] truncate">
                              {s.guestName}
                              <span className="text-[#3a5070] ml-1">({s.guestEmail})</span>
                              <span className="text-[#3a5070] ml-1">· {new Date(s.sentAt).toLocaleDateString()}</span>
                            </span>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className={`px-1.5 py-0.5 rounded-full font-medium ${
                                s.status === 'completed' ? 'bg-[#0a2518] text-[#4ab57a]'
                                : s.status === 'expired'  ? 'bg-[#1e2d45] text-[#b8d4f0]'
                                : 'bg-[#2a1a0a] text-[#d0954a]'
                              }`}>{s.status}</span>
                              {s.status === 'pending' && (
                                <button
                                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/fill/${s.token}`)}
                                  className="text-[#3a5070] hover:text-[#4a90d9] transition-colors"
                                  title="Copy signing link"
                                >
                                  <Copy size={11} />
                                </button>
                              )}
                              {s.filledDocumentUrl && (
                                <a
                                  href={s.filledDocumentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#4a90d9] hover:underline"
                                >
                                  Download
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                        {subs.length > 5 && (
                          <p className="text-xs text-[#3a5070]">+{subs.length - 5} more</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── ALL SENT TAB ── */}
      {hubTab === 'sent' && (
        <>
          {allSubmissions.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-[#1e2d45] rounded-xl">
              <Clock size={36} className="text-[#3a5070] mx-auto mb-3" />
              <p className="text-[#b8d4f0] font-medium">No documents sent yet</p>
              <p className="text-sm text-[#3a5070] mt-1">Send a document for signature and it will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allSubmissions.map(s => {
                const tmpl = templates.find(t => t.id === s.templateId);
                return (
                  <div
                    key={s.id}
                    className="bg-[#1a2335] border border-[#1e2d45] rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-[#1e3a5a] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText size={13} className="text-[#3a5070] flex-shrink-0" />
                        <p className="text-sm font-medium text-white truncate">
                          {tmpl?.name ?? 'Unknown Document'}
                        </p>
                        {tmpl && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[tmpl.category] ?? 'bg-[#1e2d45] text-[#b8d4f0]'}`}>
                            {tmpl.category}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#3a5070] mt-0.5 ml-[21px]">
                        {s.guestName} · {s.guestEmail} · {new Date(s.sentAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        s.status === 'completed' ? 'bg-[#0a2518] text-[#4ab57a]'
                        : s.status === 'expired'  ? 'bg-[#1e2d45] text-[#b8d4f0]'
                        : 'bg-[#2a1a0a] text-[#d0954a]'
                      }`}>{s.status}</span>
                      {s.status === 'pending' && (
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/fill/${s.token}`)}
                          className="text-[#3a5070] hover:text-[#4a90d9] transition-colors"
                          title="Copy signing link"
                        >
                          <Copy size={13} />
                        </button>
                      )}
                      {s.filledDocumentUrl && (
                        <a
                          href={s.filledDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#4a90d9] hover:underline"
                        >
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

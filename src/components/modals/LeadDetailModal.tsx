import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import type { Lead, RevenueReport } from '../../types';
import { MapPin, Phone, Mail, DollarSign, Clock, Video, FileText, Home, UploadCloud, File, Loader, Trash2, ExternalLink, FileBarChart2, TrendingUp } from 'lucide-react';
import { fetchLeadDocuments, uploadLeadDocument, deleteLeadDocument } from '../../services/leadDocuments';
import type { LeadDocument } from '../../services/leadDocuments';
import { fetchRevenueReportsByLead } from '../../services/revenueReports';
import ReportViewerModal from './ReportViewerModal';

const STAGE_LABELS: Record<string, string> = {
  new:       'New Lead',
  contacted: 'Contacted',
  cold:      'Old / Cold Lead',
  won:       'Won',
};

const SOURCE_LABELS: Record<string, string> = {
  referral:      'Referral',
  website:       'Website',
  social:        'Social Media',
  cold_outreach:    'Cold Outreach',
  facebook_outreach: 'Facebook Outreach',
  airbnb_outreach:   'Airbnb Outreach',
  event:            'Event',
  other:         'Other',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface LeadDetailModalProps {
  lead: Lead;
  onEdit: () => void;
  onClose: () => void;
}

export default function LeadDetailModal({ lead, onEdit, onClose }: LeadDetailModalProps) {
  const hasUpcomingCall = lead.scheduledCallAt && new Date(lead.scheduledCallAt) >= new Date();

  const [docs, setDocs] = useState<LeadDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [reports, setReports] = useState<RevenueReport[]>([]);
  const [previewReport, setPreviewReport] = useState<RevenueReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLeadDocuments(lead.id).then(setDocs).catch(() => {});
    fetchRevenueReportsByLead(lead.id).then(setReports).catch(() => {});
  }, [lead.id]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError('');
    try {
      const doc = await uploadLeadDocument(lead.id, file);
      setDocs(prev => [doc, ...prev]);
    } catch {
      setUploadError('Upload failed. Check file size and try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: LeadDocument) {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    await deleteLeadDocument(doc);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  }

  return (
    <>
    <Modal title={lead.name} onClose={onClose}>
      <div className="space-y-4">
        {/* Stage + source badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            lead.stage === 'won'  ? 'bg-[#0a2518] text-[#4ab57a]' :
            lead.stage === 'cold' ? 'bg-[#162035] text-[#6ab0f5]' :
                                    'bg-[#162035] text-[#4a90d9]'
          }`}>
            {STAGE_LABELS[lead.stage] ?? lead.stage}
          </span>
          {lead.source && (
            <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-[#1e2d45] text-[#b8d4f0]">
              {SOURCE_LABELS[lead.source] ?? lead.source}
            </span>
          )}
        </div>

        {/* Contact info */}
        <div className="bg-[#1e2d45] rounded-lg p-3.5 space-y-2">
          {lead.phone && (
            <div className="flex items-center gap-2">
              <Phone size={13} className="text-[#3a5070] flex-shrink-0" />
              <a href={`tel:${lead.phone}`} className="text-sm text-[#4a90d9] hover:underline">{lead.phone}</a>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2">
              <Mail size={13} className="text-[#3a5070] flex-shrink-0" />
              <a href={`mailto:${lead.email}`} className="text-sm text-[#4a90d9] hover:underline">{lead.email}</a>
            </div>
          )}
          {lead.propertyAddress && (
            <div className="flex items-center gap-2">
              <MapPin size={13} className="text-[#3a5070] flex-shrink-0" />
              <span className="text-sm text-[#b8d4f0]">{lead.propertyAddress}</span>
            </div>
          )}
        </div>

        {/* Property details */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-[#1e2d45] rounded-lg p-3 text-center">
            <Home size={14} className="text-[#3a5070] mx-auto mb-1" />
            <p className="text-xs text-[#b8d4f0]">Type</p>
            <p className="text-sm font-semibold text-white mt-0.5 truncate">{lead.propertyType || '—'}</p>
          </div>
          <div className="bg-[#1e2d45] rounded-lg p-3 text-center">
            <p className="text-xs text-[#b8d4f0] mb-1">Bedrooms</p>
            <p className="text-2xl font-bold text-white">{lead.bedrooms}</p>
          </div>
          <div className="bg-[#1e2d45] rounded-lg p-3 text-center">
            <p className="text-xs text-[#b8d4f0] mb-1">Bathrooms</p>
            <p className="text-2xl font-bold text-white">{lead.bathrooms ?? '—'}</p>
          </div>
          <div className="bg-[#1e2d45] rounded-lg p-3 text-center">
            <DollarSign size={14} className="text-[#4a90d9] mx-auto mb-1" />
            <p className="text-xs text-[#b8d4f0]">Est. Revenue</p>
            <p className="text-sm font-bold text-[#4a90d9] mt-0.5">
              ${lead.estimatedRevenue.toLocaleString()}/mo
            </p>
          </div>
        </div>

        {/* Scheduled call */}
        {lead.scheduledCallAt && (
          <div className={`rounded-lg p-3.5 space-y-1.5 ${
            hasUpcomingCall ? 'bg-[#162035] border border-[#1e3a5a]' : 'bg-[#1e2d45]'
          }`}>
            <div className="flex items-center gap-2">
              <Clock size={13} className={hasUpcomingCall ? 'text-[#4a90d9]' : 'text-[#3a5070]'} />
              <span className="text-xs font-medium text-[#b8d4f0]">Scheduled Call</span>
              {!hasUpcomingCall && <span className="text-xs text-[#3a5070]">(past)</span>}
            </div>
            <p className="text-sm font-medium text-white">{formatDateTime(lead.scheduledCallAt)}</p>
            {lead.scheduledCallLink && (
              <a
                href={lead.scheduledCallLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-[#6ab0f5] hover:underline font-medium"
              >
                <Video size={13} /> Join Meeting
              </a>
            )}
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText size={13} className="text-[#3a5070]" />
              <span className="text-xs font-medium text-[#b8d4f0]">Notes</span>
            </div>
            <p className="text-sm text-[#b8d4f0] bg-[#1e2d45] rounded-lg p-3.5 whitespace-pre-wrap leading-relaxed">
              {lead.notes}
            </p>
          </div>
        )}

        {/* Revenue Reports */}
        {reports.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileBarChart2 size={13} className="text-[#4a90d9]" />
              <span className="text-xs font-medium text-[#b8d4f0]">Revenue Reports</span>
              <span className="text-xs text-[#3a5070]">({reports.length})</span>
            </div>
            <div className="space-y-1.5">
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => setPreviewReport(r)}
                  className="w-full flex items-center gap-2 bg-[#162035] border border-teal-100 rounded-lg px-3 py-2 hover:bg-[#162035] hover:border-[#1e3a5a] transition-colors text-left"
                >
                  <FileBarChart2 size={13} className="text-[#6ab0f5] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#b8d4f0] truncate">{r.reportTitle ?? r.propertyAddress}</p>
                    <p className="text-xs text-[#3a5070]">
                      {r.reportType?.toUpperCase() ?? 'STR'} · {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {r.airdnaProjectedRevenue != null && (
                    <span className="flex items-center gap-0.5 text-xs font-semibold text-[#4a90d9] flex-shrink-0">
                      <TrendingUp size={11} /> ${Math.round(r.airdnaProjectedRevenue).toLocaleString()}/yr
                    </span>
                  )}
                  {r.opportunityScore != null && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      r.opportunityScore >= 7 ? 'bg-[#0a2518] text-[#4ab57a]' :
                      r.opportunityScore >= 4 ? 'bg-[#2a1a0a] text-[#d0954a]' :
                      'bg-[#1e2d45] text-[#b8d4f0]'
                    }`}>{r.opportunityScore}/10</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <UploadCloud size={13} className="text-[#3a5070]" />
              <span className="text-xs font-medium text-[#b8d4f0]">Documents</span>
              {docs.length > 0 && (
                <span className="text-xs text-[#3a5070]">({docs.length})</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium disabled:opacity-50"
            >
              + Upload file
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }}
          />

          {/* Drag-and-drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-[#4a90d9] bg-[#162035]'
                : 'border-[#1e2d45] hover:border-[#4a90d9] hover:bg-[#1e2d45]'
            }`}
          >
            {uploading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-[#b8d4f0]">
                <Loader size={14} className="animate-spin" /> Uploading...
              </div>
            ) : (
              <p className="text-xs text-[#3a5070]">
                Drag & drop a file here, or <span className="text-[#4a90d9] font-medium">browse</span>
              </p>
            )}
          </div>

          {uploadError && (
            <p className="text-xs text-[#e05c5c] mt-1">{uploadError}</p>
          )}

          {/* Document list */}
          {docs.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center gap-2 bg-[#1e2d45] rounded-lg px-3 py-2">
                  <File size={13} className="text-[#3a5070] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#b8d4f0] truncate">{doc.name}</p>
                    <p className="text-xs text-[#3a5070]">{formatFileSize(doc.fileSize)}</p>
                  </div>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4a90d9] hover:text-[#4a90d9] flex-shrink-0"
                    title="View"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    className="text-[#3a5070] hover:text-[#e05c5c] transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="flex gap-4 text-xs text-[#3a5070] pt-1 border-t border-[#1e2d45]">
          <span>Added {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>Updated {new Date(lead.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-[#1e2d45] text-[#b8d4f0] text-sm font-medium py-2.5 rounded-lg hover:bg-[#1e2d45] transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Edit Lead
          </button>
        </div>
      </div>
    </Modal>

    {previewReport && <ReportViewerModal report={previewReport} onClose={() => setPreviewReport(null)} />}
    </>
  );
}

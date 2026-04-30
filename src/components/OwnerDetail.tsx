import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Mail, Phone, Home, TrendingUp, Plus, Edit2, Trash2, Wifi,
  FileSignature, FileText, Download, Clock, CheckCircle2, XCircle, X,
  UploadCloud, File, Loader, ExternalLink, FileBarChart2,
} from 'lucide-react';
import type { Owner, Property, PropertyStatus, OutreachEntry, SignatureRequest, RevenueReport } from '../types';
import { fetchProperties } from '../services/uplisting';
import type { UplistingProperty } from '../services/uplisting';
import { fetchSignatureRequests, deleteSignatureRequest } from '../services/signatures';
import { fetchOwnerDocuments, uploadOwnerDocument, deleteOwnerDocument } from '../services/ownerDocuments';
import type { OwnerDocument } from '../services/ownerDocuments';
import { fetchOwnerDriveLinks, saveOwnerDriveLink, deleteOwnerDriveLink } from '../services/ownerDriveLinks';
import type { OwnerDriveLink } from '../services/ownerDriveLinks';
import { fetchRevenueReportsByOwner } from '../services/revenueReports';
import OwnerRevenueReport from './OwnerRevenueReport';
import SignatureRequestModal from './modals/SignatureRequestModal';
import DrivePickerModal from './modals/DrivePickerModal';
import type { PickedDriveFile } from './modals/DrivePickerModal';

interface OwnerDetailProps {
  owner: Owner;
  outreach: OutreachEntry[];
  onBack: () => void;
  onEdit: () => void;
  onAddProperty: () => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (propertyId: string) => void;
  onAddOutreach: () => void;
  uplistingApiKey?: string;
  onImportProperties: (properties: Property[]) => Promise<void>;
  reservations?: import('../services/uplisting').UplistingReservation[];
}

const CHANNEL_MAP: Record<string, string> = {
  airbnb: 'Airbnb', airbnb_official: 'Airbnb',
  booking_dot_com: 'Booking.com',
  homeaway: 'VRBO', vrbo: 'VRBO',
  uplisting: 'Direct',
};

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  active: { badge: 'bg-emerald-100 text-emerald-700', label: 'Active' },
  onboarding: { badge: 'bg-amber-100 text-amber-700', label: 'Onboarding' },
  inactive: { badge: 'bg-slate-100 text-slate-500', label: 'Inactive' },
};

const OUTREACH_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', text: '💬', meeting: '🤝', other: '📝',
};

const OUTCOME_STYLES: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-600',
  negative: 'bg-red-100 text-red-600',
  no_response: 'bg-slate-100 text-slate-400',
};

const SIG_STATUS: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  pending: { icon: <Clock size={12} />, label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  signed:  { icon: <CheckCircle2 size={12} />, label: 'Signed',   cls: 'bg-emerald-100 text-emerald-700' },
  expired: { icon: <XCircle size={12} />, label: 'Expired',  cls: 'bg-slate-100 text-slate-500' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OwnerDetail({
  owner, outreach, onBack, onEdit, onAddProperty, onEditProperty, onDeleteProperty, onAddOutreach,
  uplistingApiKey, onImportProperties, reservations = [],
}: OwnerDetailProps) {
  const [sigRequests, setSigRequests] = useState<SignatureRequest[]>([]);
  const [showSigModal, setShowSigModal] = useState(false);

  const [ownerDocs, setOwnerDocs] = useState<OwnerDocument[]>([]);
  const [driveLinks, setDriveLinks] = useState<OwnerDriveLink[]>([]);
  const [revenueReports, setRevenueReports] = useState<RevenueReport[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [uplistingProps, setUplistingProps] = useState<UplistingProperty[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const ownerOutreach = outreach.filter(e => e.ownerId === owner.id);
  const totalRevenue = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
  const activeProps = owner.properties.filter(p => p.status === 'active');
  const avgOccupancy = activeProps.length
    ? Math.round(activeProps.reduce((s, p) => s + p.occupancyRate, 0) / activeProps.length)
    : 0;

  useEffect(() => {
    fetchSignatureRequests(owner.id).then(setSigRequests).catch(() => {});
    fetchOwnerDocuments(owner.id).then(setOwnerDocs).catch(() => {});
    fetchOwnerDriveLinks(owner.id).then(setDriveLinks).catch(() => {});
    fetchRevenueReportsByOwner(owner.id).then(setRevenueReports).catch(() => {});
  }, [owner.id]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError('');
    try {
      const doc = await uploadOwnerDocument(owner.id, file);
      setOwnerDocs(prev => [doc, ...prev]);
      setShowUpload(false);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: OwnerDocument) {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      await deleteOwnerDocument(doc);
      setOwnerDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch {
      // silent — doc stays in list if delete fails
    }
  }

  async function handleDeleteSigRequest(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteSignatureRequest(id);
      setSigRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      // silent
    }
  }

  async function handleLinkDriveFiles(picked: PickedDriveFile[]) {
    setShowDrivePicker(false);
    const toAdd = picked.filter(p => !driveLinks.some(l => l.fileId === p.id));
    for (const file of toAdd) {
      const link: Omit<OwnerDriveLink, 'createdAt'> = {
        id: `dl_${Date.now()}_${file.id}`,
        ownerId: owner.id,
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
      };
      try {
        const saved = await saveOwnerDriveLink(link);
        setDriveLinks(prev => [saved, ...prev]);
      } catch {
        // silent — continue with remaining files
      }
    }
  }

  async function handleDeleteDriveLink(link: OwnerDriveLink) {
    if (!confirm(`Remove link to "${link.fileName}"?`)) return;
    try {
      await deleteOwnerDriveLink(link.id);
      setDriveLinks(prev => prev.filter(l => l.id !== link.id));
    } catch {
      // silent
    }
  }

  async function openImport() {
    if (!uplistingApiKey) return;
    setImportOpen(true);
    setImportLoading(true);
    setImportError('');
    try {
      const props = await fetchProperties(uplistingApiKey);
      setUplistingProps(props);
      setSelectedIds(new Set());
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to fetch Uplisting properties');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleImport() {
    const toImport = uplistingProps.filter(p => selectedIds.has(p.id));
    if (!toImport.length) return;
    const now = new Date().toISOString();
    const properties: Property[] = toImport.map(u => ({
      id: `p_${Date.now()}_${u.id}`,
      address: u.address || u.nickname || u.name,
      city: u.city ?? '',
      state: u.state ?? '',
      type: u.property_type || 'Cabin',
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      maxGuests: u.max_guests,
      monthlyRevenue: 0,
      occupancyRate: 0,
      platforms: [...new Set((u.channels ?? []).map(c => CHANNEL_MAP[c] ?? c))],
      status: 'active' as PropertyStatus,
      joinedAt: now,
    }));
    setImporting(true);
    try {
      await onImportProperties(properties);
      setImportOpen(false);
    } catch {
      setImportError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Clients
        </button>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xl">{owner.name.charAt(0)}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{owner.name}</h1>
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-600 border border-slate-200 px-2.5 py-1 rounded-lg hover:border-teal-300 transition-colors"
              >
                <Edit2 size={12} /> Edit
              </button>
            </div>
            <div className="flex flex-wrap gap-4 mt-1.5">
              {owner.email && (
                <a href={`mailto:${owner.email}`} className="flex items-center gap-1.5 text-sm text-teal-600 hover:underline">
                  <Mail size={14} /> {owner.email}
                </a>
              )}
              {owner.phone && (
                <a href={`tel:${owner.phone}`} className="flex items-center gap-1.5 text-sm text-teal-600 hover:underline">
                  <Phone size={14} /> {owner.phone}
                </a>
              )}
            </div>
            {owner.notes && (
              <p className="text-sm text-slate-500 mt-2 bg-slate-100 px-3 py-2 rounded-lg">{owner.notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Monthly Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-teal-600' },
          { label: 'Properties', value: owner.properties.length, icon: Home, color: 'text-indigo-500' },
          { label: 'Avg Occupancy', value: avgOccupancy ? `${avgOccupancy}%` : '—', icon: Wifi, color: 'text-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <s.icon size={18} className={`${s.color} mb-2`} />
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Properties */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Properties</h2>
          <div className="flex items-center gap-2">
            {uplistingApiKey && (
              <button
                onClick={openImport}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                <Download size={13} /> Import from Uplisting
              </button>
            )}
            <button
              onClick={onAddProperty}
              className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <Plus size={13} /> Add Property
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-200">
          {owner.properties.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No properties yet.</p>
          )}
          {owner.properties.map(property => {
            const style = STATUS_STYLES[property.status];
            return (
              <div key={property.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-slate-900">
                        {property.address}, {property.city}, {property.state}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-600">
                      <span>{property.type}</span>
                      <span>{property.bedrooms}bd / {property.bathrooms}ba</span>
                      <span>Max {property.maxGuests} guests</span>
                    </div>
                    {property.platforms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {property.platforms.map(p => (
                          <span key={p} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-teal-700">${property.monthlyRevenue.toLocaleString()}</div>
                    <div className="text-xs text-slate-400">/mo</div>
                    {property.occupancyRate > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">{property.occupancyRate}% occ.</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onEditProperty(property)}
                    className="text-xs text-slate-500 hover:text-teal-600 flex items-center gap-1"
                  >
                    <Edit2 size={11} /> Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Remove this property?')) onDeleteProperty(property.id);
                    }}
                    className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Revenue Reports */}
      {revenueReports.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200">
            <FileBarChart2 size={16} className="text-teal-600" />
            <h2 className="font-semibold text-slate-900">Revenue Reports</h2>
            <span className="text-xs text-slate-400 ml-1">({revenueReports.length})</span>
          </div>
          <div className="p-5 space-y-2">
            {revenueReports.map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-teal-50 border border-teal-100 rounded-lg px-4 py-3">
                <FileBarChart2 size={15} className="text-teal-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{r.reportTitle ?? r.propertyAddress}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {r.reportType?.toUpperCase() ?? 'STR'} · {r.propertyAddress} · {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {r.airdnaProjectedRevenue != null && (
                  <span className="text-sm font-bold text-teal-700 flex-shrink-0">
                    ${Math.round(r.airdnaProjectedRevenue).toLocaleString()}/yr
                  </span>
                )}
                {r.opportunityScore != null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    r.opportunityScore >= 7 ? 'bg-emerald-100 text-emerald-700' :
                    r.opportunityScore >= 4 ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>{r.opportunityScore}/10</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Report */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <OwnerRevenueReport owner={owner} reservations={reservations} />
      </div>

      {/* Documents / Signatures */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-200 flex-wrap">
          <h2 className="font-semibold text-slate-900">Documents</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setShowUpload(v => !v); setUploadError(''); setShowDrivePicker(false); }}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-200 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <UploadCloud size={13} /> Upload File
            </button>
            <button
              onClick={() => { setShowDrivePicker(true); setShowUpload(false); }}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-200 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <span className="text-xs">📁</span> Link from Drive
            </button>
            <button
              onClick={() => setShowSigModal(true)}
              className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <FileSignature size={13} /> Send for Signature
            </button>
          </div>
        </div>

        {/* Upload drop zone */}
        {showUpload && (
          <div className="px-5 py-4 border-b border-slate-200">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file);
              }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading
                  ? 'border-slate-200 bg-slate-100 cursor-default'
                  : dragOver
                    ? 'border-teal-400 bg-teal-50 cursor-pointer'
                    : 'border-slate-200 hover:border-teal-300 hover:bg-slate-100 cursor-pointer'
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader size={24} className="text-teal-500 animate-spin" />
                  <p className="text-sm text-slate-500">Uploading...</p>
                </div>
              ) : (
                <>
                  <UploadCloud size={28} className={`mx-auto mb-2 ${dragOver ? 'text-teal-500' : 'text-slate-300'}`} />
                  <p className="text-sm font-medium text-slate-600">
                    {dragOver ? 'Drop to upload' : 'Drag & drop a file here'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse · any file type</p>
                </>
              )}
            </div>
            {uploadError && (
              <p className="text-xs text-red-500 mt-2 text-center">{uploadError}</p>
            )}
          </div>
        )}

        <div className="divide-y divide-slate-200">
          {ownerDocs.length === 0 && driveLinks.length === 0 && sigRequests.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No documents yet.</p>
          )}

          {/* Manually uploaded documents */}
          {ownerDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <File size={16} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
                <p className="text-xs text-slate-400">
                  {formatBytes(doc.fileSize)} · {new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Download size={11} /> View
                </a>
                <button
                  onClick={() => handleDelete(doc)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          ))}

          {/* Drive linked files */}
          {driveLinks.map(link => (
            <div key={link.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 text-base">
                {link.mimeType.includes('spreadsheet') || link.mimeType.includes('excel') ? '📊'
                  : link.mimeType.includes('presentation') ? '📑'
                  : link.mimeType.includes('document') || link.mimeType.includes('word') ? '📝'
                  : link.mimeType.includes('pdf') ? '📄'
                  : link.mimeType.includes('image') ? '🖼️'
                  : '📄'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{link.fileName}</p>
                <p className="text-xs text-blue-500 flex items-center gap-1 mt-0.5">
                  <span>📁</span> Google Drive · {new Date(link.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={link.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <ExternalLink size={11} /> Open
                </a>
                <button
                  onClick={() => handleDeleteDriveLink(link)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            </div>
          ))}

          {/* Signature requests */}
          {sigRequests.map(req => {
            const s = SIG_STATUS[req.status];
            return (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{req.documentName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sent to {req.sentToEmail} · {new Date(req.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    {req.signedAt && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        Signed {new Date(req.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${s.cls}`}>
                    {s.icon} {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  {req.signedDocumentUrl && (
                    <>
                      <a
                        href={req.signedDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <FileText size={12} /> View Signed Document
                      </a>
                      <a
                        href={req.signedDocumentUrl}
                        download
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Download size={12} /> Download
                      </a>
                    </>
                  )}
                  <button
                    onClick={() => handleDeleteSigRequest(req.id, req.documentName)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outreach history */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Outreach History</h2>
          <button
            onClick={onAddOutreach}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Plus size={13} /> Log Outreach
          </button>
        </div>
        <div className="divide-y divide-slate-200">
          {ownerOutreach.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No outreach logged yet.</p>
          )}
          {[...ownerOutreach].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
            <div key={entry.id} className="flex items-start gap-3 px-5 py-4">
              <span className="text-lg mt-0.5">{OUTREACH_ICONS[entry.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-900">{entry.subject}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTCOME_STYLES[entry.outcome]}`}>
                    {entry.outcome.replace('_', ' ')}
                  </span>
                </div>
                {entry.notes && <p className="text-xs text-slate-500 mt-1">{entry.notes}</p>}
                {entry.followUpDate && (
                  <p className="text-xs text-amber-600 mt-1">
                    Follow-up: {new Date(entry.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="text-xs text-slate-400 flex-shrink-0">
                {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
    {showSigModal && (
      <SignatureRequestModal
        owner={owner}
        onSent={() => fetchSignatureRequests(owner.id).then(setSigRequests).catch(() => {})}
        onClose={() => setShowSigModal(false)}
      />
    )}
    {showDrivePicker && (
      <DrivePickerModal
        onSelect={handleLinkDriveFiles}
        onClose={() => setShowDrivePicker(false)}
      />
    )}

    {importOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Download size={15} className="text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">Import from Uplisting</h3>
            </div>
            <button onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {importLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={20} className="animate-spin text-indigo-500" />
              </div>
            ) : importError ? (
              <p className="text-sm text-red-500 text-center py-8">{importError}</p>
            ) : uplistingProps.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No properties found in Uplisting.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-3">
                  {uplistingProps.length} propert{uplistingProps.length === 1 ? 'y' : 'ies'} found — select to import:
                </p>
                {uplistingProps.map(p => (
                  <label key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-300 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={e => setSelectedIds(prev => {
                        const next = new Set(prev);
                        e.target.checked ? next.add(p.id) : next.delete(p.id);
                        return next;
                      })}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {p.nickname || p.name}
                      </div>
                      {p.nickname && p.name && p.nickname !== p.name && (
                        <div className="text-xs text-slate-400 truncate">{p.name}</div>
                      )}
                      {p.address && (
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {p.address}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}
                        </div>
                      )}
                      <div className="text-xs text-slate-400 mt-1">
                        {p.bedrooms}bd · {p.bathrooms}ba · max {p.max_guests}
                        {p.channels?.length ? ` · ${p.channels.map(c => CHANNEL_MAP[c] ?? c).join(', ')}` : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {!importLoading && !importError && uplistingProps.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-200 space-y-2">
              {importError && <p className="text-xs text-red-500">{importError}</p>}
              <button
                onClick={handleImport}
                disabled={selectedIds.size === 0 || importing}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
              >
                {importing
                  ? <><Loader size={13} className="animate-spin" /> Importing...</>
                  : `Import ${selectedIds.size} Propert${selectedIds.size === 1 ? 'y' : 'ies'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}

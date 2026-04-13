import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Mail, Phone, Home, TrendingUp, Plus, Edit2, Trash2, Wifi,
  FileSignature, FileText, Download, Clock, CheckCircle2, XCircle,
  UploadCloud, File, Loader,
} from 'lucide-react';
import type { Owner, Property, OutreachEntry, SignatureRequest } from '../types';
import { fetchSignatureRequests } from '../services/signatures';
import { fetchOwnerDocuments, uploadOwnerDocument, deleteOwnerDocument } from '../services/ownerDocuments';
import type { OwnerDocument } from '../services/ownerDocuments';
import SignatureRequestModal from './modals/SignatureRequestModal';

interface OwnerDetailProps {
  owner: Owner;
  outreach: OutreachEntry[];
  onBack: () => void;
  onEdit: () => void;
  onAddProperty: () => void;
  onEditProperty: (property: Property) => void;
  onDeleteProperty: (propertyId: string) => void;
  onAddOutreach: () => void;
}

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
}: OwnerDetailProps) {
  const [sigRequests, setSigRequests] = useState<SignatureRequest[]>([]);
  const [showSigModal, setShowSigModal] = useState(false);

  const [ownerDocs, setOwnerDocs] = useState<OwnerDocument[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ownerOutreach = outreach.filter(e => e.ownerId === owner.id);
  const totalRevenue = owner.properties.reduce((s, p) => s + p.monthlyRevenue, 0);
  const activeProps = owner.properties.filter(p => p.status === 'active');
  const avgOccupancy = activeProps.length
    ? Math.round(activeProps.reduce((s, p) => s + p.occupancyRate, 0) / activeProps.length)
    : 0;

  useEffect(() => {
    fetchSignatureRequests(owner.id).then(setSigRequests).catch(() => {});
    fetchOwnerDocuments(owner.id).then(setOwnerDocs).catch(() => {});
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

  return (
    <>
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Owners
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
              <p className="text-sm text-slate-500 mt-2 bg-slate-50 px-3 py-2 rounded-lg">{owner.notes}</p>
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Properties</h2>
          <button
            onClick={onAddProperty}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Plus size={13} /> Add Property
          </button>
        </div>
        <div className="divide-y divide-slate-100">
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
                      <h3 className="font-medium text-slate-800">
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

      {/* Documents / Signatures */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100 flex-wrap">
          <h2 className="font-semibold text-slate-800">Documents</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowUpload(v => !v); setUploadError(''); }}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <UploadCloud size={13} /> Add Document
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
          <div className="px-5 py-4 border-b border-slate-100">
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
                  ? 'border-slate-200 bg-slate-50 cursor-default'
                  : dragOver
                    ? 'border-teal-400 bg-teal-50 cursor-pointer'
                    : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50 cursor-pointer'
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

        <div className="divide-y divide-slate-100">
          {ownerDocs.length === 0 && sigRequests.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No documents yet.</p>
          )}

          {/* Manually uploaded documents */}
          {ownerDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <File size={16} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
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

          {/* Signature requests */}
          {sigRequests.map(req => {
            const s = SIG_STATUS[req.status];
            return (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{req.documentName}</p>
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
                {req.signedDocumentUrl && (
                  <div className="flex items-center gap-3 mt-2.5">
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
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Download size={12} /> Download
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Outreach history */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Outreach History</h2>
          <button
            onClick={onAddOutreach}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Plus size={13} /> Log Outreach
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {ownerOutreach.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No outreach logged yet.</p>
          )}
          {[...ownerOutreach].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
            <div key={entry.id} className="flex items-start gap-3 px-5 py-4">
              <span className="text-lg mt-0.5">{OUTREACH_ICONS[entry.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-800">{entry.subject}</p>
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
    </>
  );
}

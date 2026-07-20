import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Mail, Phone, Home, TrendingUp, Plus, Edit2, Trash2, Wifi,
  FileSignature, FileText, Download, Clock, CheckCircle2, XCircle, X,
  UploadCloud, File, Loader, ExternalLink, FileBarChart2, Link2,
  Copy, Check, ClipboardList,
} from 'lucide-react';
import type { Owner, Property, PropertyStatus, OutreachEntry, SignatureRequest, RevenueReport } from '../types';
import { supabase } from '../services/supabase';
import { fetchProperties } from '../services/uplisting';
import type { UplistingProperty, UplistingReservation } from '../services/uplisting';
import { fetchHostawayProperties } from '../services/hostaway';
import { fetchSignatureRequests, deleteSignatureRequest } from '../services/signatures';
import { fetchOwnerDocuments, uploadOwnerDocument, deleteOwnerDocument } from '../services/ownerDocuments';
import type { OwnerDocument } from '../services/ownerDocuments';
import { fetchOwnerDriveLinks, saveOwnerDriveLink, deleteOwnerDriveLink } from '../services/ownerDriveLinks';
import type { OwnerDriveLink } from '../services/ownerDriveLinks';
import { fetchRevenueReportsByOwner } from '../services/revenueReports';
import { generateOwnerPortalToken } from '../services/db';
import OwnerRevenueReport from './OwnerRevenueReport';
import ReportViewerModal from './modals/ReportViewerModal';
import SignatureRequestModal from './modals/SignatureRequestModal';
import DrivePickerModal from './modals/DrivePickerModal';
import type { PickedDriveFile } from './modals/DrivePickerModal';
import DocumentGeneratorModal from './modals/DocumentGeneratorModal';

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
  hostawayAccountId?: string;
  hostawaySecret?: string;
  onImportProperties: (properties: Property[]) => Promise<void>;
  reservations?: UplistingReservation[];
  onUpdateOwner: (owner: Owner) => Promise<void>;
  onNavigateToProperty?: (ownerId: string, propertyId: string) => void;
}

type OwnerTab = 'properties' | 'revenue' | 'documents' | 'vendors' | 'outreach' | 'onboarding';
type ImportSource = 'uplisting' | 'hostaway';

const VENDOR_ROLES = ['Cleaner', 'Handyman', 'Plumber', 'Electrician', 'Landscaper', 'HVAC', 'Pool Service', 'Pest Control', 'Other'];

const CHANNEL_MAP: Record<string, string> = {
  airbnb: 'Airbnb', airbnb_official: 'Airbnb',
  booking_dot_com: 'Booking.com',
  homeaway: 'VRBO', vrbo: 'VRBO',
  uplisting: 'Direct',
};

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  active:     { badge: 'bg-[#0a2518] text-[#4ab57a]', label: 'Active' },
  onboarding: { badge: 'bg-[#1a1505] text-[#f59e0b]',    label: 'Onboarding' },
  inactive:   { badge: 'bg-[#1e2d45] text-[#b8d4f0]',    label: 'Inactive' },
};

const OUTREACH_ICONS: Record<string, string> = {
  call: '📞', email: '✉️', text: '💬', meeting: '🤝', other: '📝',
};

const OUTCOME_STYLES: Record<string, string> = {
  positive:    'bg-[#0a2518] text-[#4ab57a]',
  neutral:     'bg-[#1e2d45] text-[#b8d4f0]',
  negative:    'bg-[#2a1515] text-[#e05c5c]',
  no_response: 'bg-[#1e2d45] text-[#3a5070]',
};

const SIG_STATUS: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  pending: { icon: <Clock size={12} />,        label: 'Pending', cls: 'bg-[#1a1505] text-[#f59e0b]' },
  signed:  { icon: <CheckCircle2 size={12} />, label: 'Signed',  cls: 'bg-[#0a2518] text-[#4ab57a]' },
  expired: { icon: <XCircle size={12} />,      label: 'Expired', cls: 'bg-[#1e2d45] text-[#b8d4f0]' },
};


function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Onboarding panel helpers ──────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className="ml-2 text-[#3a5070] hover:text-[#4a90d9] transition-colors flex-shrink-0">
      {copied ? <Check size={13} className="text-[#4ab57a]" /> : <Copy size={13} />}
    </button>
  );
}

function OField({ label, value, credential }: { label: string; value?: string | string[] | boolean | null; credential?: boolean }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value) ? value.join(', ') : value === true ? 'Yes' : value === false ? 'No' : String(value);
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[#1e2d45] last:border-0">
      <span className="text-xs text-[#3a5070] flex-shrink-0 w-36 pt-0.5">{label}</span>
      <div className="flex items-start flex-1 min-w-0">
        <span className={`text-sm break-all ${credential ? 'font-mono text-[#d0954a]' : 'text-white'}`}>{display}</span>
        {credential && <CopyButton value={display} />}
      </div>
    </div>
  );
}

function OSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a2335] rounded-xl border border-[#243550] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#243550] bg-[#141e2e]">
        <h3 className="text-xs font-semibold text-[#4a90d9] uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-4 py-1">
        {children}
      </div>
    </div>
  );
}

export default function OwnerDetail({
  owner, outreach, onBack, onEdit, onAddProperty, onEditProperty, onDeleteProperty, onAddOutreach, onUpdateOwner,
  uplistingApiKey, hostawayAccountId, hostawaySecret,
  onImportProperties, reservations = [], onNavigateToProperty,
}: OwnerDetailProps) {
  const [activeTab, setActiveTab] = useState<OwnerTab>('properties');
  const [portalCopied, setPortalCopied] = useState(false);
  const [portalGenerating, setPortalGenerating] = useState(false);
  const [notesValue, setNotesValue] = useState(owner.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [sigRequests, setSigRequests] = useState<SignatureRequest[]>([]);
  const [vendorForm, setVendorForm] = useState<{ name: string; role: string; phone: string; email: string; notes: string } | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const [showDocGenerator, setShowDocGenerator] = useState(false);
  const [prefillSigDoc, setPrefillSigDoc] = useState<{ fileUrl: string; fileName: string } | null>(null);

  const [ownerDocs, setOwnerDocs] = useState<OwnerDocument[]>([]);
  const [driveLinks, setDriveLinks] = useState<OwnerDriveLink[]>([]);
  const [revenueReports, setRevenueReports] = useState<RevenueReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<RevenueReport | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importSource, setImportSource] = useState<ImportSource>('uplisting');
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importProps, setImportProps] = useState<UplistingProperty[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [onboardingData, setOnboardingData] = useState<Record<string, any> | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [generatingOLink, setGeneratingOLink] = useState(false);
  const [oLink, setOLink] = useState<string | null>(null);
  const [oLinkCopied, setOLinkCopied] = useState(false);

  const ownerOutreach = outreach.filter(e => e.ownerId === owner.id);
  const { totalRevenue, avgOccupancy } = useMemo(() => {
    const activeProps = owner.properties.filter(p => p.status === 'active');
    const avgOccupancy = activeProps.length
      ? Math.round(activeProps.reduce((s, p) => s + p.occupancyRate, 0) / activeProps.length)
      : 0;
    const totalRevenue = owner.properties.reduce((s, p) => s + (p.monthlyRevenue ?? 0), 0);
    return { totalRevenue, avgOccupancy };
  }, [owner.properties]);

  async function generateOnboardingLink() {
    setGeneratingOLink(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'onboarding', action: 'create', ownerId: owner.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setOLink(data.url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not generate link.');
    } finally {
      setGeneratingOLink(false);
    }
  }

  function copyOLink() {
    if (!oLink) return;
    navigator.clipboard.writeText(oLink).then(() => {
      setOLinkCopied(true);
      setTimeout(() => setOLinkCopied(false), 2000);
    });
  }

  const loadOnboarding = useCallback(async () => {
    setOnboardingLoading(true);
    const { data } = await supabase
      .from('onboarding_requests')
      .select('form_data, submitted_at')
      .eq('owner_id', owner.id)
      .eq('status', 'completed')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setOnboardingData(data?.form_data ?? null);
    setOnboardingLoading(false);
  }, [owner.id]);

  useEffect(() => {
    fetchSignatureRequests(owner.id).then(setSigRequests).catch(() => {});
    fetchOwnerDocuments(owner.id).then(setOwnerDocs).catch(() => {});
    fetchOwnerDriveLinks(owner.id).then(setDriveLinks).catch(() => {});
    fetchRevenueReportsByOwner(owner.id).then(setRevenueReports).catch(() => {});
    loadOnboarding();
  }, [owner.id, loadOnboarding]);

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
    } catch { /* silent */ }
  }

  async function handleDeleteSigRequest(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteSignatureRequest(id);
      setSigRequests(prev => prev.filter(r => r.id !== id));
    } catch { /* silent */ }
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
      } catch { /* silent */ }
    }
  }

  async function handleDeleteDriveLink(link: OwnerDriveLink) {
    if (!confirm(`Remove link to "${link.fileName}"?`)) return;
    try {
      await deleteOwnerDriveLink(link.id);
      setDriveLinks(prev => prev.filter(l => l.id !== link.id));
    } catch { /* silent */ }
  }

  async function openImport(source: ImportSource) {
    if (source === 'uplisting' && !uplistingApiKey) return;
    if (source === 'hostaway' && (!hostawayAccountId || !hostawaySecret)) return;
    setImportSource(source);
    setImportOpen(true);
    setImportLoading(true);
    setImportError('');
    try {
      let props: UplistingProperty[];
      if (source === 'hostaway' && hostawayAccountId && hostawaySecret) {
        props = await fetchHostawayProperties(hostawayAccountId, hostawaySecret);
      } else {
        props = await fetchProperties(uplistingApiKey!);
      }
      setImportProps(props);
      setSelectedIds(new Set());
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to fetch properties');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleImport() {
    const toImport = importProps.filter(p => selectedIds.has(p.id));
    if (!toImport.length) return;
    const now = new Date().toISOString();
    const properties: Property[] = toImport.map(u => ({
      id: `p_${Date.now()}_${u.id}`,
      address: u.address || u.nickname || u.name,
      city:    u.city  ?? '',
      state:   u.state ?? '',
      type:    u.property_type || 'Cabin',
      bedrooms:     u.bedrooms,
      bathrooms:    u.bathrooms,
      maxGuests:    u.max_guests,
      monthlyRevenue: 0,
      occupancyRate:  0,
      platforms: [...new Set((u.channels ?? []).map(c => CHANNEL_MAP[c] ?? c))],
      status:   'active' as PropertyStatus,
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

  async function saveVendor() {
    if (!vendorForm || !vendorForm.name.trim()) return;
    const vendors = [...(owner.vendors ?? [])];
    if (editingVendorId) {
      const idx = vendors.findIndex(v => v.id === editingVendorId);
      if (idx !== -1) vendors[idx] = { id: editingVendorId, ...vendorForm };
    } else {
      vendors.push({ id: `vendor_${Date.now()}`, ...vendorForm });
    }
    await onUpdateOwner({ ...owner, vendors });
    setVendorForm(null);
    setEditingVendorId(null);
  }

  async function deleteVendor(id: string) {
    await onUpdateOwner({ ...owner, vendors: (owner.vendors ?? []).filter(v => v.id !== id) });
  }

  function startEditVendor(v: import('../types').Vendor) {
    setEditingVendorId(v.id);
    setVendorForm({ name: v.name, role: v.role, phone: v.phone ?? '', email: v.email ?? '', notes: v.notes ?? '' });
  }

  const importSourceLabel = importSource === 'hostaway' ? 'Hostaway' : 'Uplisting';

  return (
    <>
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Back + header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[#b8d4f0] hover:text-teal-600 mb-4 transition-colors">
          <ArrowLeft size={16} /> Back to Clients
        </button>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xl">{owner.name.charAt(0)}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{owner.name}</h1>
              <button onClick={onEdit} className="flex items-center gap-1.5 text-xs text-[#b8d4f0] hover:text-[#4a90d9] border border-[#243550] px-2.5 py-1 rounded-lg hover:border-[#4a90d9] transition-colors">
                <Edit2 size={12} /> Edit
              </button>
              <button
                onClick={async () => {
                  setPortalGenerating(true);
                  try {
                    let token = owner.portalToken;
                    if (!token) {
                      token = await generateOwnerPortalToken(owner.id);
                      await onUpdateOwner({ ...owner, portalToken: token });
                    }
                    const url = `${window.location.origin}/?owner-portal=${token}`;
                    await navigator.clipboard.writeText(url);
                    setPortalCopied(true);
                    setTimeout(() => setPortalCopied(false), 2500);
                  } catch { /* ignore */ }
                  finally { setPortalGenerating(false); }
                }}
                className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-white border border-[#4a90d9]/40 hover:border-[#4a90d9] hover:bg-[#4a90d9] px-2.5 py-1 rounded-lg transition-colors"
              >
                {portalGenerating ? <Loader size={12} className="animate-spin" /> : <Link2 size={12} />}
                {portalCopied ? 'Copied!' : owner.portalToken ? 'Copy Portal Link' : 'Generate Portal Link'}
              </button>
            </div>
            <div className="flex flex-wrap gap-4 mt-1.5">
              {owner.email && <a href={`mailto:${owner.email}`} className="flex items-center gap-1.5 text-sm text-teal-600 hover:underline"><Mail size={14} /> {owner.email}</a>}
              {owner.phone && <a href={`tel:${owner.phone}`}   className="flex items-center gap-1.5 text-sm text-teal-600 hover:underline"><Phone size={14} /> {owner.phone}</a>}
            </div>
            <div className="mt-2 relative">
              <textarea
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                onBlur={async () => {
                  if (notesValue === owner.notes) return;
                  setSavingNotes(true);
                  await onUpdateOwner({ ...owner, notes: notesValue });
                  setSavingNotes(false);
                }}
                rows={2}
                placeholder="Add notes…"
                className="w-full text-sm text-[#b8d4f0] bg-[#111d30] border border-[#243550] rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-[#1a2335] transition-colors"
              />
              {savingNotes && <span className="absolute right-2 bottom-2 text-xs text-[#3a5070]">Saving…</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Monthly Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-teal-600' },
          { label: 'Properties',      value: owner.properties.length,              icon: Home,       color: 'text-indigo-500' },
          { label: 'Avg Occupancy',   value: avgOccupancy ? `${avgOccupancy}%` : '—', icon: Wifi, color: 'text-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-[#1a2335] rounded-xl border border-[#243550] p-3 overflow-hidden">
            <s.icon size={16} className={`${s.color} mb-1.5`} />
            <div className="text-sm font-bold text-white truncate">{s.value}</div>
            <div className="text-xs text-[#b8d4f0] leading-tight mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#243550] overflow-x-auto">
        {([
          { id: 'properties', label: 'Properties' },
          { id: 'revenue',    label: 'Revenue' },
          { id: 'documents',  label: 'Documents' },
          { id: 'vendors',    label: 'Vendors' },
          { id: 'outreach',   label: 'Outreach' },
          { id: 'onboarding', label: 'Onboarding' },
        ] as { id: OwnerTab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-[#4a90d9] text-[#4a90d9]'
                : 'border-transparent text-[#b8d4f0] hover:text-white hover:border-[#3a5070]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Properties tab */}
      {activeTab === 'properties' && (
      <div className="bg-[#1a2335] rounded-xl border border-[#243550]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550] flex-wrap gap-2">
          <h2 className="font-semibold text-white">Properties</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {uplistingApiKey && (
              <button
                onClick={() => openImport('uplisting')}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                <Download size={13} /> Import from Uplisting
              </button>
            )}
            {hostawayAccountId && hostawaySecret && (
              <button
                onClick={() => openImport('hostaway')}
                className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 border border-violet-200 hover:border-violet-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                <Download size={13} /> Import from Hostaway
              </button>
            )}
            <button
              onClick={onAddProperty}
              className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-[#4ab57a] border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              <Plus size={13} /> Add Property
            </button>
          </div>
        </div>
        <div className="divide-y divide-[#243550]">
          {owner.properties.length === 0 && (
            <p className="text-sm text-[#3a5070] text-center py-8">No properties yet.</p>
          )}
          {owner.properties.map(property => {
            const style = STATUS_STYLES[property.status];
            return (
              <div
                key={property.id}
                className={`px-5 py-4 ${onNavigateToProperty ? 'cursor-pointer hover:bg-[#111d30] transition-colors' : ''}`}
                onClick={() => onNavigateToProperty?.(owner.id, property.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-white">{property.address}, {property.city}, {property.state}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>{style.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-[#b8d4f0]">
                      <span>{property.type}</span>
                      <span>{property.bedrooms}bd / {property.bathrooms}ba</span>
                      <span>Max {property.maxGuests} guests</span>
                    </div>
                    {property.platforms.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {property.platforms.map(p => (
                          <span key={p} className="text-xs bg-[#0d1f35] text-blue-600 px-2 py-0.5 rounded-full">{p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-[#4ab57a]">${(property.monthlyRevenue ?? 0).toLocaleString()}</div>
                    <div className="text-xs text-[#3a5070]">/mo</div>
                    {property.occupancyRate > 0 && <div className="text-xs text-[#b8d4f0] mt-0.5">{property.occupancyRate}% occ.</div>}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={e => { e.stopPropagation(); onEditProperty(property); }} className="text-xs text-[#b8d4f0] hover:text-teal-600 flex items-center gap-1"><Edit2 size={11} /> Edit</button>
                  <button onClick={e => { e.stopPropagation(); if (confirm('Remove this property?')) onDeleteProperty(property.id); }} className="text-xs text-[#3a5070] hover:text-red-500 flex items-center gap-1"><Trash2 size={11} /> Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Revenue tab */}
      {activeTab === 'revenue' && (
        <div className="bg-[#1a2335] rounded-xl border border-[#243550] p-5">
          <OwnerRevenueReport
            owner={owner}
            reservations={reservations}
            onDocumentSaved={() => fetchOwnerDocuments(owner.id).then(setOwnerDocs).catch(() => {})}
          />
        </div>
      )}

      {/* Documents tab */}
      {activeTab === 'documents' && (
      <div className="bg-[#1a2335] rounded-xl border border-[#243550]">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-[#243550] flex-wrap">
          <h2 className="font-semibold text-white">Documents</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { setShowUpload(v => !v); setUploadError(''); setShowDrivePicker(false); }} className="flex items-center gap-1.5 text-xs text-[#b8d4f0] hover:text-white border border-[#243550] px-3 py-1.5 rounded-lg transition-colors font-medium"><UploadCloud size={13} /> Upload File</button>
            <button onClick={() => { setShowDrivePicker(true); setShowUpload(false); }} className="flex items-center gap-1.5 text-xs text-[#b8d4f0] hover:text-white border border-[#243550] px-3 py-1.5 rounded-lg transition-colors font-medium"><span className="text-xs">📁</span> Link from Drive</button>
            <button onClick={() => setShowDocGenerator(true)} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors font-medium"><FileText size={13} /> Generate Contract</button>
            <button onClick={() => { setPrefillSigDoc(null); setShowSigModal(true); }} className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-[#4ab57a] border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"><FileSignature size={13} /> Send for Signature</button>
          </div>
        </div>

        {showUpload && (
          <div className="px-5 py-4 border-b border-[#243550]">
            <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleUpload(file); e.target.value = ''; }} />
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleUpload(file); }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading ? 'border-[#243550] bg-[#1e2d45] cursor-default'
                : dragOver ? 'border-teal-400 bg-[#0a2518] cursor-pointer'
                : 'border-[#243550] hover:border-teal-300 hover:bg-[#1e2d45] cursor-pointer'
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader size={24} className="text-teal-500 animate-spin" />
                  <p className="text-sm text-[#b8d4f0]">Uploading...</p>
                </div>
              ) : (
                <>
                  <UploadCloud size={28} className={`mx-auto mb-2 ${dragOver ? 'text-teal-500' : 'text-[#3a5070]'}`} />
                  <p className="text-sm font-medium text-[#b8d4f0]">{dragOver ? 'Drop to upload' : 'Drag & drop a file here'}</p>
                  <p className="text-xs text-[#3a5070] mt-1">or click to browse · any file type</p>
                </>
              )}
            </div>
            {uploadError && <p className="text-xs text-red-500 mt-2 text-center">{uploadError}</p>}
          </div>
        )}

        <div className="divide-y divide-[#243550]">
          {ownerDocs.length === 0 && driveLinks.length === 0 && sigRequests.length === 0 && revenueReports.length === 0 && (
            <p className="text-sm text-[#3a5070] text-center py-8">No documents yet.</p>
          )}
          {revenueReports.map(r => (
            <button key={r.id} onClick={() => setSelectedReport(r)} className="flex items-center gap-3 px-5 py-3.5 w-full text-left hover:bg-[#111d30] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-[#0a2518] flex items-center justify-center flex-shrink-0"><FileBarChart2 size={16} className="text-teal-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{r.reportTitle ?? r.propertyAddress}</p>
                <p className="text-xs text-[#3a5070] mt-0.5">{r.reportType?.toUpperCase() ?? 'STR'} · {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.airdnaProjectedRevenue != null && <span className="text-sm font-bold text-[#4ab57a]">${Math.round(r.airdnaProjectedRevenue).toLocaleString()}/yr</span>}
                {r.opportunityScore != null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    r.opportunityScore >= 7 ? 'bg-[#0a2518] text-[#4ab57a]' :
                    r.opportunityScore >= 4 ? 'bg-[#1a1505] text-[#f59e0b]' : 'bg-[#1e2d45] text-[#b8d4f0]'
                  }`}>{r.opportunityScore}/10</span>
                )}
              </div>
            </button>
          ))}
          {ownerDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-[#1e2d45] flex items-center justify-center flex-shrink-0"><File size={16} className="text-[#3a5070]" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{doc.name}</p>
                <p className="text-xs text-[#3a5070]">{formatBytes(doc.fileSize)} · {new Date(doc.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-teal-600 hover:text-[#4ab57a] border border-teal-200 hover:border-teal-400 px-2.5 py-1.5 rounded-lg transition-colors"><Download size={11} /> View</a>
                <button onClick={() => handleDelete(doc)} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-red-500 border border-[#243550] hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"><Trash2 size={11} /> Delete</button>
              </div>
            </div>
          ))}
          {driveLinks.map(link => (
            <div key={link.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-[#0d1f35] flex items-center justify-center flex-shrink-0 text-base">
                {link.mimeType.includes('spreadsheet') || link.mimeType.includes('excel') ? '📊'
                  : link.mimeType.includes('presentation') ? '📑'
                  : link.mimeType.includes('document') || link.mimeType.includes('word') ? '📝'
                  : link.mimeType.includes('pdf') ? '📄'
                  : link.mimeType.includes('image') ? '🖼️' : '📄'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{link.fileName}</p>
                <p className="text-xs text-[#6ab0f5] flex items-center gap-1 mt-0.5"><span>📁</span> Google Drive · {new Date(link.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href={link.webViewLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-teal-600 hover:text-[#4ab57a] border border-teal-200 hover:border-teal-400 px-2.5 py-1.5 rounded-lg transition-colors"><ExternalLink size={11} /> Open</a>
                <button onClick={() => handleDeleteDriveLink(link)} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-red-500 border border-[#243550] hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"><Trash2 size={11} /> Remove</button>
              </div>
            </div>
          ))}
          {sigRequests.map(req => {
            const s = SIG_STATUS[req.status];
            return (
              <div key={req.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{req.documentName}</p>
                    <p className="text-xs text-[#3a5070] mt-0.5">Sent to {req.sentToEmail} · {new Date(req.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    {req.signedAt && <p className="text-xs text-emerald-600 mt-0.5">Signed {new Date(req.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                  </div>
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${s.cls}`}>{s.icon} {s.label}</span>
                </div>
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  {req.signedDocumentUrl && (
                    <>
                      <a href={req.signedDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-[#4ab57a] border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors"><FileText size={12} /> View Signed Document</a>
                      <a href={req.signedDocumentUrl} download className="flex items-center gap-1.5 text-xs font-medium text-[#b8d4f0] hover:text-white border border-[#243550] px-3 py-1.5 rounded-lg transition-colors"><Download size={12} /> Download</a>
                    </>
                  )}
                  <button onClick={() => handleDeleteSigRequest(req.id, req.documentName)} className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-red-500 border border-[#243550] hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"><Trash2 size={11} /> Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Vendors tab */}
      {activeTab === 'vendors' && (
      <div className="bg-[#1a2335] rounded-xl border border-[#243550]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550]">
          <h2 className="font-semibold text-white">Vendors</h2>
          <button onClick={() => { setVendorForm({ name: '', role: 'Cleaner', phone: '', email: '', notes: '' }); setEditingVendorId(null); }} className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-[#4ab57a] border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"><Plus size={13} /> Add Vendor</button>
        </div>
        {vendorForm !== null && (
          <div className="px-5 py-4 border-b border-[#243550] bg-[#111d30] space-y-3">
            <p className="text-xs font-semibold text-[#b8d4f0] uppercase tracking-wide">{editingVendorId ? 'Edit Vendor' : 'New Vendor'}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#b8d4f0] block mb-1">Name *</label>
                <input value={vendorForm.name} onChange={e => setVendorForm(f => f && ({ ...f, name: e.target.value }))} className="w-full border border-[#243550] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Jane's Cleaning Co." />
              </div>
              <div>
                <label className="text-xs text-[#b8d4f0] block mb-1">Role</label>
                <select value={vendorForm.role} onChange={e => setVendorForm(f => f && ({ ...f, role: e.target.value }))} className="w-full border border-[#243550] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-[#1a2335]">
                  {VENDOR_ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#b8d4f0] block mb-1">Phone</label>
                <input value={vendorForm.phone} onChange={e => setVendorForm(f => f && ({ ...f, phone: e.target.value }))} className="w-full border border-[#243550] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="(555) 000-0000" />
              </div>
              <div>
                <label className="text-xs text-[#b8d4f0] block mb-1">Email</label>
                <input value={vendorForm.email} onChange={e => setVendorForm(f => f && ({ ...f, email: e.target.value }))} className="w-full border border-[#243550] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="vendor@example.com" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-[#b8d4f0] block mb-1">Notes</label>
                <input value={vendorForm.notes} onChange={e => setVendorForm(f => f && ({ ...f, notes: e.target.value }))} className="w-full border border-[#243550] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Preferred contact, schedule, rates..." />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveVendor} disabled={!vendorForm.name.trim()} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">{editingVendorId ? 'Save Changes' : 'Add Vendor'}</button>
              <button onClick={() => { setVendorForm(null); setEditingVendorId(null); }} className="border border-[#243550] text-[#b8d4f0] text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-[#1e2d45] transition-colors">Cancel</button>
            </div>
          </div>
        )}
        <div className="divide-y divide-[#243550]">
          {(owner.vendors ?? []).length === 0 && vendorForm === null && (
            <p className="text-sm text-[#3a5070] text-center py-8">No vendors yet. Add cleaners, handymen, and other service providers.</p>
          )}
          {(owner.vendors ?? []).map(v => (
            <div key={v.id} className="flex items-start gap-3 px-5 py-4">
              <div className="w-9 h-9 rounded-lg bg-[#1a1505] flex items-center justify-center flex-shrink-0 text-base">
                {v.role === 'Cleaner' ? '🧹' : v.role === 'Handyman' ? '🔧' : v.role === 'Plumber' ? '🪠' : v.role === 'Electrician' ? '⚡' : v.role === 'Landscaper' ? '🌿' : v.role === 'HVAC' ? '❄️' : v.role === 'Pool Service' ? '🏊' : v.role === 'Pest Control' ? '🐛' : '🔨'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{v.name}</p>
                  <span className="text-xs bg-[#1e2d45] text-[#b8d4f0] px-2 py-0.5 rounded-full">{v.role}</span>
                </div>
                <div className="flex flex-wrap gap-3 mt-1">
                  {v.phone && <a href={`tel:${v.phone}`} className="text-xs text-teal-600 hover:underline">{v.phone}</a>}
                  {v.email && <a href={`mailto:${v.email}`} className="text-xs text-teal-600 hover:underline">{v.email}</a>}
                </div>
                {v.notes && <p className="text-xs text-[#b8d4f0] mt-1">{v.notes}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => startEditVendor(v)} className="p-1.5 text-[#3a5070] hover:text-teal-600 hover:bg-[#0a2518] rounded-lg transition-colors"><Edit2 size={13} /></button>
                <button onClick={() => deleteVendor(v.id)} className="p-1.5 text-[#3a5070] hover:text-red-500 hover:bg-[#2a1515] rounded-lg transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Outreach tab */}
      {activeTab === 'onboarding' && (
      <div className="space-y-3">
        {/* Generate / re-send link bar */}
        <div className="bg-[#1a2335] border border-[#243550] rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-white">
              {onboardingData ? 'Re-send onboarding form' : 'Send onboarding form to this client'}
            </p>
            <p className="text-xs text-[#3a5070] mt-0.5">
              {onboardingData
                ? 'Generate a new link to let the client update their info — existing data will be overwritten on submit.'
                : 'Generate a link — when they submit, their info updates this client profile (no duplicate created).'}
            </p>
          </div>
          <button
            onClick={generateOnboardingLink}
            disabled={generatingOLink}
            className="flex items-center gap-1.5 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            {generatingOLink ? <Loader size={13} className="animate-spin" /> : <Link2 size={13} />}
            {onboardingData ? 'Re-generate Link' : 'Generate Link'}
          </button>
        </div>

        {/* Generated link display */}
        {oLink && (
          <div className="bg-[#0f1923] border border-[#1e3a5a] rounded-xl p-3 flex items-center gap-3">
            <p className="text-xs text-[#b8d4f0] flex-1 break-all font-mono">{oLink}</p>
            <button onClick={copyOLink} className="flex-shrink-0 p-1.5 rounded-lg bg-[#1e2d45] hover:bg-[#1e3a5a] transition-colors">
              {oLinkCopied ? <Check size={14} className="text-[#4ab57a]" /> : <Copy size={14} className="text-[#4a90d9]" />}
            </button>
          </div>
        )}

        {onboardingLoading ? (
          <div className="flex justify-center py-12"><Loader size={20} className="animate-spin text-[#4a90d9]" /></div>
        ) : !onboardingData ? (
          <div className="bg-[#1a2335] rounded-xl border border-[#243550] flex flex-col items-center justify-center py-14 text-center px-6">
            <ClipboardList size={32} className="text-[#3a5070] mb-3" />
            <p className="text-sm text-white font-medium mb-1">No onboarding data yet</p>
            <p className="text-xs text-[#3a5070]">Generate a link above and send it to the client — their answers will populate here automatically.</p>
          </div>
        ) : (
          <>
            <OSection title="Owner Information">
              <OField label="Full Name"      value={onboardingData.fullName} />
              <OField label="Email"          value={onboardingData.email} />
              <OField label="Phone"          value={onboardingData.phone} />
              <OField label="Monthly Costs"  value={onboardingData.monthlyCosts} />
            </OSection>

            <OSection title="Property Details">
              <OField label="Address"        value={onboardingData.propertyAddress} />
              <OField label="Type"           value={onboardingData.propertyType} />
              <OField label="Bedrooms"       value={onboardingData.bedrooms} />
              <OField label="Bathrooms"      value={onboardingData.bathrooms} />
              <OField label="Bed Sizes"      value={onboardingData.bedSizes} />
              <OField label="Door Codes"     value={onboardingData.doorCodes} credential />
              <OField label="Max Guests"     value={onboardingData.maxGuests} />
            </OSection>

            <OSection title="Listing Platforms">
              <OField label="Active Platforms"    value={onboardingData.platforms} />
              <OField label="Listing Links"       value={onboardingData.listingLinks} />
              <OField label="Average Rating"      value={onboardingData.averageRatings} />
              <OField label="Account Preference"  value={onboardingData.accountPreference} />
              <OField label="Airbnb Login"        value={onboardingData.airbnbLogin}    credential />
              <OField label="VRBO Login"          value={onboardingData.vrboLogin}      credential />
              <OField label="Booking.com Login"   value={onboardingData.bookingLogin}   credential />
              <OField label="Stripe Login"        value={onboardingData.stripeLogin}    credential />
              <OField label="Bank Account Info"   value={onboardingData.bankInfo}       credential />
            </OSection>

            <OSection title="Property Access">
              <OField label="Entry Type"    value={onboardingData.entryType} />
              <OField label="Lock Code"     value={onboardingData.lockCode}      credential />
              <OField label="WiFi Network"  value={onboardingData.wifiName} />
              <OField label="WiFi Password" value={onboardingData.wifiPassword}  credential />
            </OSection>

            <OSection title="Features & Amenities">
              <OField label="Amenities"         value={onboardingData.amenities} />
              <OField label="Other Amenities"   value={onboardingData.otherAmenities} />
            </OSection>

            <OSection title="Supplies & Maintenance">
              <OField label="Stocked Supplies"    value={onboardingData.stockedSupplies} />
              <OField label="Supply Ordering"     value={onboardingData.supplyOrdering} />
              <OField label="Preferred Cleaner"   value={onboardingData.preferredCleaner} />
              <OField label="Cleaner Contact"     value={onboardingData.cleanerContact} credential />
              <OField label="Preferred Handyman"  value={onboardingData.preferredHandyman} />
              <OField label="Handyman Contact"    value={onboardingData.handymanContact} credential />
            </OSection>

            <OSection title="Pricing & Preferences">
              <OField label="Pricing Tool"    value={onboardingData.pricingTool} />
              <OField label="PriceLabs"       value={onboardingData.priceLabs} />
              <OField label="Blackout Dates"  value={onboardingData.blackoutDates} />
              <OField label="PMS Software"    value={onboardingData.pms} />
              <OField label="Pets Allowed"    value={onboardingData.petsAllowed} />
              <OField label="House Rules"     value={onboardingData.houseRules} />
            </OSection>

            <OSection title="Final Notes">
              <OField label="Pro Photos"      value={onboardingData.professionalPhotos} />
              <OField label="Additional Info" value={onboardingData.additionalInfo} />
              <OField label="Questions"       value={onboardingData.questions} />
            </OSection>
          </>
        )}
      </div>
      )}

      {activeTab === 'outreach' && (
      <div className="bg-[#1a2335] rounded-xl border border-[#243550]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550]">
          <h2 className="font-semibold text-white">Outreach History</h2>
          <button onClick={onAddOutreach} className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-[#4ab57a] border border-teal-200 hover:border-teal-400 px-3 py-1.5 rounded-lg transition-colors font-medium"><Plus size={13} /> Log Outreach</button>
        </div>
        <div className="divide-y divide-[#243550]">
          {ownerOutreach.length === 0 && <p className="text-sm text-[#3a5070] text-center py-8">No outreach logged yet.</p>}
          {[...ownerOutreach].sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
            <div key={entry.id} className="flex items-start gap-3 px-5 py-4">
              <span className="text-lg mt-0.5">{OUTREACH_ICONS[entry.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-white">{entry.subject}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTCOME_STYLES[entry.outcome]}`}>{entry.outcome.replace('_', ' ')}</span>
                </div>
                {entry.notes && <p className="text-xs text-[#b8d4f0] mt-1">{entry.notes}</p>}
                {entry.followUpDate && <p className="text-xs text-amber-600 mt-1">Follow-up: {new Date(entry.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
              </div>
              <div className="text-xs text-[#3a5070] flex-shrink-0">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>

    {/* Modals */}
    {showSigModal && (
      <SignatureRequestModal
        owner={owner}
        onSent={() => fetchSignatureRequests(owner.id).then(setSigRequests).catch(() => {})}
        onClose={() => { setShowSigModal(false); setPrefillSigDoc(null); }}
        prefillDocUrl={prefillSigDoc?.fileUrl}
        prefillDocName={prefillSigDoc?.fileName}
      />
    )}
    {showDocGenerator && (
      <DocumentGeneratorModal
        owner={owner}
        onGenerated={doc => setOwnerDocs(prev => [doc, ...prev])}
        onSendForSignature={(fileUrl, fileName) => { setPrefillSigDoc({ fileUrl, fileName }); setShowSigModal(true); }}
        onClose={() => setShowDocGenerator(false)}
      />
    )}
    {showDrivePicker && (
      <DrivePickerModal onSelect={handleLinkDriveFiles} onClose={() => setShowDrivePicker(false)} />
    )}

    {/* Import modal */}
    {importOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-[#1a2335] rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#243550]">
            <div className="flex items-center gap-2">
              <Download size={15} className={importSource === 'hostaway' ? 'text-violet-600' : 'text-indigo-600'} />
              <h3 className="font-bold text-white text-sm">Import from {importSourceLabel}</h3>
            </div>
            <button onClick={() => setImportOpen(false)} className="text-[#3a5070] hover:text-[#b8d4f0]"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {importLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={20} className="animate-spin text-indigo-500" />
              </div>
            ) : importError ? (
              <p className="text-sm text-red-500 text-center py-8">{importError}</p>
            ) : importProps.length === 0 ? (
              <p className="text-sm text-[#3a5070] text-center py-8">No properties found in {importSourceLabel}.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[#b8d4f0] mb-3">{importProps.length} propert{importProps.length === 1 ? 'y' : 'ies'} found — select to import:</p>
                {importProps.map(p => (
                  <label key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-[#243550] hover:border-indigo-300 cursor-pointer transition-colors">
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
                      <div className="text-sm font-medium text-white truncate">{p.nickname || p.name}</div>
                      {p.nickname && p.name && p.nickname !== p.name && <div className="text-xs text-[#3a5070] truncate">{p.name}</div>}
                      {p.address && <div className="text-xs text-[#b8d4f0] mt-0.5 truncate">{p.address}{p.city ? `, ${p.city}` : ''}{p.state ? `, ${p.state}` : ''}</div>}
                      <div className="text-xs text-[#3a5070] mt-1">{p.bedrooms}bd · {p.bathrooms}ba · max {p.max_guests}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          {!importLoading && !importError && importProps.length > 0 && (
            <div className="px-5 py-4 border-t border-[#243550] space-y-2">
              {importError && <p className="text-xs text-red-500">{importError}</p>}
              <button
                onClick={handleImport}
                disabled={selectedIds.size === 0 || importing}
                className={`w-full flex items-center justify-center gap-2 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors ${
                  importSource === 'hostaway'
                    ? 'bg-violet-600 hover:bg-violet-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {importing ? <><Loader size={13} className="animate-spin" /> Importing...</> : `Import ${selectedIds.size} Propert${selectedIds.size === 1 ? 'y' : 'ies'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
    {selectedReport && <ReportViewerModal report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
}

import { useState } from 'react';
import { Plus, Edit2, Trash2, Home, DollarSign, Users, Zap, CheckCircle2, Copy, Check, Mail, CalendarDays, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import type { CleaningPropertyConfig, AssignedCleaner, Cleaner, IcalUrl } from '../../types/cleaning';
import type { UplistingProperty, UplistingReservation } from '../../services/uplisting';

interface Props {
  configs: CleaningPropertyConfig[];
  cleaners: Cleaner[];
  uplistingProperties: UplistingProperty[];
  reservations: UplistingReservation[];
  onSave: (c: CleaningPropertyConfig) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSyncIcal: (propertyId: string) => Promise<{ created: number; cancelled: number; errors: string[] }>;
}

interface FormState {
  propertyId: string;
  propertyName: string;
  cleaningFee: string;
  feeAutoFilled: boolean;
  assignedCleaners: AssignedCleaner[];
  doorCode: string;
  address: string;
  checkoutTime: string;
  checkinTime: string;
  photoUrl: string;
  stagingPhotoUrls: string[];
  stagingUrlInput: string;
  icalUrls: IcalUrl[];
  icalUrlInput: string;
  icalPlatform: string;
  laundromatAddress: string;
}

const EMPTY: FormState = {
  propertyId: '', propertyName: '', cleaningFee: '', feeAutoFilled: false, assignedCleaners: [],
  doorCode: '', address: '', checkoutTime: '', checkinTime: '',
  photoUrl: '', stagingPhotoUrls: [], stagingUrlInput: '',
  icalUrls: [], icalUrlInput: '', icalPlatform: 'Airbnb',
  laundromatAddress: '',
};

function displayName(propertyId: string | undefined, propertyName: string, props: UplistingProperty[]): string {
  const p = props.find(up => up.id === propertyId);
  return p?.nickname || p?.name || propertyName;
}

const ICAL_PLATFORMS = ['Airbnb', 'VRBO', 'Booking.com', 'Guesty', 'Hostaway', 'Direct', 'Other'];

export default function PropertiesView({ configs, cleaners, uplistingProperties, reservations, onSave, onDelete, onSyncIcal }: Props) {
  // --- Edit modal state ---
  const [editing, setEditing] = useState<CleaningPropertyConfig | null | 'new'>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [manualEntry, setManualEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- iCal sync state ---
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { created: number; cancelled: number; errors: string[] }>>({});

  // --- Batch onboarding state ---
  const [selectedForOnboard, setSelectedForOnboard] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchClientName, setBatchClientName] = useState('');
  const [batchClientEmail, setBatchClientEmail] = useState('');
  const [batchSending, setBatchSending] = useState(false);
  const [batchLink, setBatchLink] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchCopied, setBatchCopied] = useState(false);
  const [batchEmailSent, setBatchEmailSent] = useState(false);

  const activeCleaners = cleaners.filter(c => c.status === 'active');
  const enrolledIds = new Set(configs.map(c => c.propertyId));
  const unenrolled = uplistingProperties.filter(p => !enrolledIds.has(p.id));
  const nonOnboardedConfigs = configs.filter(c => !c.onboardedAt);
  const selectedConfigs = configs.filter(c => selectedForOnboard.has(c.id));

  function toggleSelect(id: string) {
    setSelectedForOnboard(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openBatchModal() {
    const firstId = [...selectedForOnboard][0];
    const firstConfig = configs.find(c => c.id === firstId);
    setBatchClientName(firstConfig?.clientName ?? '');
    setBatchClientEmail(firstConfig?.clientEmail ?? '');
    setBatchLink(null);
    setBatchError(null);
    setBatchCopied(false);
    setBatchEmailSent(false);
    setBatchModalOpen(true);
  }

  function closeBatchModal() {
    setBatchModalOpen(false);
  }

  async function handleBatchAction(copyOnly: boolean) {
    if (!selectedConfigs.length || !batchClientEmail.trim()) return;
    setBatchSending(true);
    setBatchError(null);
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: 'cleaning-client',
          action: 'send-onboarding',
          propertyConfigIds: selectedConfigs.map(c => c.id),
          propertyNames: selectedConfigs.map(c => c.propertyName),
          clientName: batchClientName.trim() || null,
          clientEmail: batchClientEmail.trim(),
          copyOnly,
          appUrl: window.location.origin,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed.');
      const link: string = d.link;
      setBatchLink(link);
      if (copyOnly) {
        try { await navigator.clipboard.writeText(link); } catch {}
        setBatchCopied(true);
      } else {
        setBatchEmailSent(true);
      }
    } catch (e: unknown) {
      setBatchError(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setBatchSending(false);
    }
  }

  async function reCopyLink() {
    if (!batchLink) return;
    try { await navigator.clipboard.writeText(batchLink); setBatchCopied(true); } catch {}
  }

  // --- Edit modal helpers ---
  function openAdd() {
    setForm({ ...EMPTY });
    setManualEntry(false);
    setSaveError(null);
    setEditing('new');
  }

  function openEdit(config: CleaningPropertyConfig) {
    setForm({
      propertyId: config.propertyId,
      propertyName: config.propertyName,
      cleaningFee: String(config.cleaningFee),
      feeAutoFilled: false,
      assignedCleaners: [...config.assignedCleaners],
      doorCode: config.doorCode ?? '',
      address: config.address ?? '',
      checkoutTime: config.checkoutTime ?? '',
      checkinTime: config.checkinTime ?? '',
      photoUrl: config.photoUrl ?? '',
      stagingPhotoUrls: [...(config.stagingPhotoUrls ?? [])],
      stagingUrlInput: '',
      icalUrls: [...(config.icalUrls ?? [])],
      icalUrlInput: '',
      icalPlatform: 'Airbnb',
      laundromatAddress: config.laundromatAddress ?? '',
    });
    setEditing(config);
  }

  async function handleSyncIcal(propertyId: string) {
    setSyncingId(propertyId);
    setSyncResult(prev => { const n = { ...prev }; delete n[propertyId]; return n; });
    try {
      const r = await onSyncIcal(propertyId);
      setSyncResult(prev => ({ ...prev, [propertyId]: r }));
    } catch (e) {
      setSyncResult(prev => ({ ...prev, [propertyId]: { created: 0, cancelled: 0, errors: [e instanceof Error ? e.message : 'Sync failed'] } }));
    } finally {
      setSyncingId(null);
    }
  }

  function addIcalUrl() {
    const raw = form.icalUrlInput.trim();
    if (!raw) return;
    const url = raw.replace(/^webcal:\/\//i, 'https://');
    setForm(f => ({ ...f, icalUrls: [...f.icalUrls, { platform: f.icalPlatform, url }], icalUrlInput: '' }));
  }

  function onPropertySelect(pid: string) {
    const prop = uplistingProperties.find(p => p.id === pid);
    const autoFee = reservations
      .filter(r => r.listing_id === pid && (r.cleaning_fee ?? 0) > 0)
      .sort((a, b) => b.check_out.localeCompare(a.check_out))[0]?.cleaning_fee;
    setForm(f => ({
      ...f,
      propertyId: pid,
      propertyName: prop?.name ?? prop?.nickname ?? pid,
      cleaningFee: autoFee ? String(autoFee) : f.cleaningFee,
      feeAutoFilled: !!autoFee,
      photoUrl: prop?.photo_url ?? f.photoUrl,
      address: f.address || prop?.address || '',
    }));
  }

  function isAssigned(cleanerId: string) {
    return form.assignedCleaners.some(c => c.id === cleanerId);
  }

  function getPayout(cleanerId: string): string {
    return String(form.assignedCleaners.find(c => c.id === cleanerId)?.payout ?? '');
  }

  function toggleCleaner(cleanerId: string) {
    setForm(f => {
      if (f.assignedCleaners.some(c => c.id === cleanerId)) {
        return { ...f, assignedCleaners: f.assignedCleaners.filter(c => c.id !== cleanerId) };
      }
      return { ...f, assignedCleaners: [...f.assignedCleaners, { id: cleanerId, payout: 0 }] };
    });
  }

  function setCleanerPayout(cleanerId: string, val: string) {
    setForm(f => ({
      ...f,
      assignedCleaners: f.assignedCleaners.map(c =>
        c.id === cleanerId ? { ...c, payout: parseFloat(val) || 0 } : c
      ),
    }));
  }

  function moveCleanerUp(cleanerId: string) {
    setForm(f => {
      const idx = f.assignedCleaners.findIndex(c => c.id === cleanerId);
      if (idx <= 0) return f;
      const arr = [...f.assignedCleaners];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return { ...f, assignedCleaners: arr };
    });
  }

  function moveCleanerDown(cleanerId: string) {
    setForm(f => {
      const idx = f.assignedCleaners.findIndex(c => c.id === cleanerId);
      if (idx < 0 || idx >= f.assignedCleaners.length - 1) return f;
      const arr = [...f.assignedCleaners];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return { ...f, assignedCleaners: arr };
    });
  }

  async function handleSave() {
    if (!form.propertyId && !form.propertyName) return;
    setSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const existing = editing !== 'new' ? editing : null;
      const config: CleaningPropertyConfig = {
        id: existing?.id ?? `cpc_${Date.now()}`,
        propertyId: form.propertyId || form.propertyName,
        propertyName: form.propertyName,
        cleaningFee: parseFloat(form.cleaningFee) || 0,
        assignedCleaners: form.assignedCleaners,
        enrolledAt: existing?.enrolledAt ?? now,
        doorCode: form.doorCode.trim() || undefined,
        address: form.address.trim() || undefined,
        checkoutTime: form.checkoutTime.trim() || undefined,
        checkinTime: form.checkinTime.trim() || undefined,
        photoUrl: form.photoUrl.trim() || undefined,
        stagingPhotoUrls: form.stagingPhotoUrls.filter(Boolean),
        icalUrls: form.icalUrls,
        laundromatAddress: form.laundromatAddress.trim() || undefined,
      };
      await onSave(config);
      setEditing(null);
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : (err as { message?: string })?.message) ?? 'Save failed.';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  function getCleanerName(id: string) {
    return cleaners.find(c => c.id === id)?.name ?? id;
  }

  function avgPayout(config: CleaningPropertyConfig) {
    if (!config.assignedCleaners.length) return null;
    const payouts = config.assignedCleaners.map(c => c.payout).filter(p => p > 0);
    if (!payouts.length) return null;
    return payouts.reduce((s, p) => s + p, 0) / payouts.length;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cleaning Properties</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">{configs.length} properties enrolled in cleaning service</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedForOnboard.size > 0 && (
            <button
              onClick={openBatchModal}
              className="flex items-center gap-2 px-4 py-2 bg-[#1e4030] border border-[#2a6040] hover:bg-[#2a5040] text-[#5ce0a0] text-sm font-semibold rounded-xl transition-colors"
            >
              <Mail size={15} />
              Send Onboarding ({selectedForOnboard.size})
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-[#4a90d9] hover:bg-[#5aa0e9] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={16} />
            Enroll Property
          </button>
        </div>
      </div>

      {nonOnboardedConfigs.length > 0 && (
        <p className="text-xs text-[#3a5070]">Check properties below to batch-send onboarding links to your clients.</p>
      )}

      {configs.length === 0 ? (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Home size={28} className="text-[#4a90d9]" />
          <p className="text-sm font-semibold text-white">No properties enrolled</p>
          <p className="text-xs text-[#3a5070]">Enroll a property to start tracking cleaning jobs and automatic billing.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {configs.map(c => {
            const avg = avgPayout(c);
            const profit = avg !== null ? c.cleaningFee - avg : null;
            const isSelected = selectedForOnboard.has(c.id);
            return (
              <div
                key={c.id}
                className={`bg-[#1a2335] border rounded-2xl p-4 transition-colors ${
                  isSelected ? 'border-[#3a8060]' : 'border-[#1e2d45]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Checkbox (non-onboarded only) */}
                    {!c.onboardedAt ? (
                      <button
                        onClick={() => toggleSelect(c.id)}
                        className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-[#3a8060] border-[#3a8060]'
                            : 'border-[#2a4060] hover:border-[#5ce0a0]'
                        }`}
                      >
                        {isSelected && <Check size={11} className="text-white" />}
                      </button>
                    ) : (
                      <div className="w-5 flex-shrink-0" />
                    )}
                    {/* Property thumbnail */}
                    {c.photoUrl ? (
                      <div className="w-14 h-14 rounded-xl overflow-hidden border border-[#1e2d45] flex-shrink-0">
                        <img src={c.photoUrl} alt={c.propertyName} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl border border-[#1e2d45] bg-[#0f1923] flex items-center justify-center flex-shrink-0">
                        <Home size={20} className="text-[#2a4060]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Home size={16} className="text-[#4a90d9] flex-shrink-0" />
                        <p className="font-semibold text-white truncate">{displayName(c.propertyId, c.propertyName, uplistingProperties)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4">
                        <div className="flex items-center gap-1.5">
                          <DollarSign size={13} className="text-[#5ce0a0]" />
                          <span className="text-xs text-[#3a5070]">Client charge:</span>
                          <span className="text-xs font-semibold text-white">${c.cleaningFee}</span>
                        </div>
                        {profit !== null && (
                          <div className="flex items-center gap-1.5">
                            <DollarSign size={13} className="text-[#d0954a]" />
                            <span className="text-xs text-[#3a5070]">Avg profit:</span>
                            <span className="text-xs font-semibold text-[#d0954a]">${profit.toFixed(0)}</span>
                          </div>
                        )}
                      </div>
                      {c.assignedCleaners.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Users size={13} className="text-[#4a90d9] flex-shrink-0" />
                            <span className="text-xs text-[#3a5070] font-medium">Cleaners (dispatch order):</span>
                          </div>
                          {c.assignedCleaners.map((ac, i) => (
                            <div key={ac.id} className="ml-5 flex items-center gap-2 text-xs">
                              <span className="text-[#2a4060] font-semibold w-4">{i + 1}.</span>
                              <span className="text-[#b8d4f0]">{getCleanerName(ac.id)}</span>
                              {ac.payout > 0 && (
                                <span className="text-[#d07af5] font-semibold">${ac.payout}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {c.laundromatAddress && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-xs">🧺</span>
                          <span className="text-xs text-[#8090f0] font-medium">Off-site laundromat</span>
                          <span className="text-[10px] text-[#2a4060]">· {c.laundromatAddress}</span>
                        </div>
                      )}
                      {(c.icalUrls?.length ?? 0) > 0 && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <CalendarDays size={12} className="text-[#4a90d9] flex-shrink-0" />
                          <span className="text-xs text-[#3a5070]">{c.icalUrls!.length} iCal feed{c.icalUrls!.length > 1 ? 's' : ''}</span>
                          {c.icalUrls![0]?.lastSyncedAt && (
                            <span className="text-[10px] text-[#2a4060]">· synced {new Date(c.icalUrls![0].lastSyncedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      )}
                      {syncResult[c.propertyId] && (
                        <div className={`mt-1.5 text-[10px] px-2 py-1 rounded-lg border ${syncResult[c.propertyId].errors.length ? 'bg-[#1a0e0e] border-[#3a1a1a] text-[#e05c5c]' : 'bg-[#0a2518] border-[#1e4030] text-[#5ce0a0]'}`}>
                          {syncResult[c.propertyId].errors.length
                            ? syncResult[c.propertyId].errors.join(', ')
                            : `+${syncResult[c.propertyId].created} jobs${syncResult[c.propertyId].cancelled ? `, ${syncResult[c.propertyId].cancelled} cancelled` : ''}`}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {c.onboardedAt && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#5ce0a0] bg-[#0a2518] border border-[#1e4030] px-2 py-0.5 rounded-full mr-1">
                        <CheckCircle2 size={10} />
                        Onboarded
                      </span>
                    )}
                    {(c.icalUrls?.length ?? 0) > 0 && (
                      <button
                        onClick={() => handleSyncIcal(c.propertyId)}
                        disabled={syncingId === c.propertyId}
                        title="Sync iCal calendars now"
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-[#4a90d9] hover:bg-[#1e2d45] disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw size={11} className={syncingId === c.propertyId ? 'animate-spin' : ''} />
                        {syncingId === c.propertyId ? 'Syncing…' : 'Sync iCal'}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(c)}
                      className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#4a90d9] hover:bg-[#1e2d45] transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => { if (confirm('Remove this property from cleaning?')) onDelete(c.id); }}
                      className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch Onboarding Modal */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
              <h2 className="font-bold text-white">Send Onboarding Link</h2>
              <button onClick={closeBatchModal} className="text-[#3a5070] hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Selected properties */}
              <div>
                <p className="text-xs font-semibold text-[#3a5070] mb-1.5">
                  {selectedConfigs.length === 1 ? 'Property' : `${selectedConfigs.length} Properties`}
                </p>
                <div className="space-y-1">
                  {selectedConfigs.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm text-[#b8d4f0]">
                      <Home size={12} className="text-[#4a90d9] flex-shrink-0" />
                      <span className="truncate">{displayName(c.propertyId, c.propertyName, uplistingProperties)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1">Client Name</label>
                <input
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={batchClientName}
                  onChange={e => setBatchClientName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1">Client Email *</label>
                <input
                  type="email"
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={batchClientEmail}
                  onChange={e => setBatchClientEmail(e.target.value)}
                  placeholder="owner@example.com"
                />
              </div>

              {batchError && (
                <p className="text-xs text-[#e05c5c] bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg px-3 py-2">{batchError}</p>
              )}

              {/* Success feedback */}
              {(batchCopied || batchEmailSent) && batchLink && (
                <div className="bg-[#0a2518] border border-[#1e4030] rounded-lg px-3 py-2.5 space-y-1.5">
                  {batchCopied && (
                    <p className="text-xs font-semibold text-[#5ce0a0] flex items-center gap-1.5">
                      <Check size={12} /> Link copied to clipboard
                    </p>
                  )}
                  {batchEmailSent && (
                    <p className="text-xs font-semibold text-[#5ce0a0] flex items-center gap-1.5">
                      <Check size={12} /> Email sent to {batchClientEmail}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-0.5">
                    <p className="text-xs text-[#3a5070] truncate flex-1 font-mono">{batchLink}</p>
                    <button
                      onClick={reCopyLink}
                      title="Copy link"
                      className="p-1 rounded text-[#3a5070] hover:text-[#5ce0a0] flex-shrink-0 transition-colors"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleBatchAction(true)}
                  disabled={batchSending || !batchClientEmail.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] disabled:opacity-50 transition-colors"
                >
                  <Copy size={14} />
                  Copy Link
                </button>
                <button
                  onClick={() => handleBatchAction(false)}
                  disabled={batchSending || !batchClientEmail.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors"
                >
                  <Mail size={14} />
                  {batchEmailSent ? 'Resend' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] flex-shrink-0">
              <h2 className="font-bold text-white">{editing === 'new' ? 'Enroll Property' : 'Edit Property'}</h2>
              <button onClick={() => setEditing(null)} className="text-[#3a5070] hover:text-white transition-colors text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">

              {/* Property selector */}
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Property *</label>
                {editing === 'new' ? (
                  unenrolled.length > 0 && !manualEntry ? (
                    <>
                      <select
                        className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                        value={form.propertyId}
                        onChange={e => onPropertySelect(e.target.value)}
                      >
                        <option value="">Select a property…</option>
                        {unenrolled.map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.nickname || p.address}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => { setManualEntry(true); setForm(f => ({ ...f, propertyId: '', propertyName: '' })); }}
                        className="mt-1.5 text-xs text-[#4a90d9] hover:text-[#6ab0f9] transition-colors"
                      >
                        + Enter property manually instead
                      </button>
                    </>
                  ) : (
                    <>
                      {unenrolled.length === 0 && (
                        <p className="text-xs text-[#d0954a] mb-2">No Uplisting properties found — enter manually.</p>
                      )}
                      <input
                        className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                        value={form.propertyName}
                        onChange={e => setForm(f => ({ ...f, propertyName: e.target.value, propertyId: e.target.value }))}
                        placeholder="Property name or address"
                        autoFocus
                      />
                      {unenrolled.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setManualEntry(false); setForm(f => ({ ...f, propertyId: '', propertyName: '' })); }}
                          className="mt-1.5 text-xs text-[#3a5070] hover:text-[#b8d4f0] transition-colors"
                        >
                          ← Pick from Uplisting / Hostaway
                        </button>
                      )}
                    </>
                  )
                ) : (
                  <p className="text-sm font-medium text-white px-3 py-2.5 bg-[#0f1923] rounded-lg border border-[#1e2d45]">{form.propertyName}</p>
                )}
              </div>

              {/* Client charge */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#3a5070]">Client Charge ($)</label>
                  {form.feeAutoFilled && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-[#5ce0a0] bg-[#0a2518] border border-[#1e4030] px-2 py-0.5 rounded-full">
                      <Zap size={9} />
                      Auto-filled from Uplisting
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="5"
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={form.cleaningFee}
                  onChange={e => setForm(f => ({ ...f, cleaningFee: e.target.value, feeAutoFilled: false }))}
                  placeholder="150"
                />
                <p className="text-xs text-[#3a5070] mt-1">What you charge the property owner per clean</p>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Property Address</label>
                <input
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="123 Ocean Drive, Miami FL 33101"
                />
                <p className="text-xs text-[#3a5070] mt-1">Shown to cleaners on their portal link</p>
              </div>

              {/* Door code */}
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Door Code</label>
                <input
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] font-mono tracking-widest"
                  value={form.doorCode}
                  onChange={e => setForm(f => ({ ...f, doorCode: e.target.value }))}
                  placeholder="1234"
                />
                <p className="text-xs text-[#3a5070] mt-1">Displayed prominently on the cleaner portal</p>
              </div>

              {/* Laundry location */}
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Laundry</label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, laundromatAddress: f.laundromatAddress ? '' : ' ' }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.laundromatAddress
                      ? 'bg-[#1e2035] border-[#3a4080] text-[#8090f0]'
                      : 'bg-[#0f1923] border-[#1e2d45] text-[#3a5070]'
                  }`}
                >
                  <span className="text-base">🧺</span>
                  {form.laundromatAddress ? 'Off-site laundromat' : 'Laundry done at property'}
                </button>
                {form.laundromatAddress !== '' && (
                  <input
                    className="w-full mt-2 bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={form.laundromatAddress}
                    onChange={e => setForm(f => ({ ...f, laundromatAddress: e.target.value }))}
                    placeholder="123 Wash Ave, Miami FL 33101"
                  />
                )}
                <p className="text-xs text-[#2a4060] mt-1">Shown to cleaners on their portal with a clear call-out</p>
              </div>

              {/* Check-out / check-in times */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Guest Check-out Time</label>
                  <input
                    className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={form.checkoutTime}
                    onChange={e => setForm(f => ({ ...f, checkoutTime: e.target.value }))}
                    placeholder="11:00 AM"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Next Check-in Time</label>
                  <input
                    className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={form.checkinTime}
                    onChange={e => setForm(f => ({ ...f, checkinTime: e.target.value }))}
                    placeholder="3:00 PM"
                  />
                </div>
              </div>

              {/* Staging / listing photos */}
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Staging Reference Photos</label>
                <p className="text-xs text-[#2a4060] mb-2">Cleaners see these to know how the property should look. Airbnb listing photo auto-fills when you select a property above.</p>
                {/* Main listing photo preview */}
                {form.photoUrl && (
                  <div className="relative mb-2 rounded-xl overflow-hidden border border-[#1e2d45] bg-[#0f1923]">
                    <img src={form.photoUrl} alt="Listing photo" className="w-full h-36 object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">Airbnb Cover Photo</div>
                    <button
                      onClick={() => setForm(f => ({ ...f, photoUrl: '' }))}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold hover:bg-red-500 transition-colors"
                    >×</button>
                  </div>
                )}
                {/* Additional staging photos */}
                {form.stagingPhotoUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {form.stagingPhotoUrls.map((url, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden border border-[#1e2d45] bg-[#0f1923] aspect-square">
                        <img src={url} alt={`Staging ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setForm(f => ({ ...f, stagingPhotoUrls: f.stagingPhotoUrls.filter((_, idx) => idx !== i) }))}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold hover:bg-red-500 transition-colors"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Add URL */}
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 text-xs text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={form.stagingUrlInput}
                    onChange={e => setForm(f => ({ ...f, stagingUrlInput: e.target.value }))}
                    placeholder="Paste photo URL (Airbnb, Google Drive, Dropbox…)"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && form.stagingUrlInput.trim()) {
                        e.preventDefault();
                        setForm(f => ({ ...f, stagingPhotoUrls: [...f.stagingPhotoUrls, f.stagingUrlInput.trim()], stagingUrlInput: '' }));
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!form.stagingUrlInput.trim()) return;
                      setForm(f => ({ ...f, stagingPhotoUrls: [...f.stagingPhotoUrls, f.stagingUrlInput.trim()], stagingUrlInput: '' }));
                    }}
                    className="px-3 py-2 bg-[#1e2d45] border border-[#2a4060] text-[#4a90d9] text-xs font-semibold rounded-lg hover:bg-[#2a3d55] transition-colors whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* iCal Calendar Sync */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <CalendarDays size={13} className="text-[#4a90d9]" />
                  <label className="text-xs font-semibold text-[#3a5070]">Calendar Sync (iCal)</label>
                </div>
                <p className="text-xs text-[#2a4060] mb-2">
                  Paste Airbnb / VRBO iCal export URLs to auto-create cleaning jobs from guest checkouts. Jobs sync daily at 11am and on-demand via "Sync Now."
                </p>
                {form.icalUrls.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {form.icalUrls.map((u, i) => (
                      <div key={i} className="flex items-center gap-2 bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2">
                        <span className="text-[10px] font-bold text-[#4a90d9] w-20 flex-shrink-0">{u.platform}</span>
                        <span className="text-[10px] text-[#3a5070] truncate flex-1 font-mono">{u.url}</span>
                        {u.lastSyncedAt && (
                          <span className="text-[10px] text-[#2a4060] flex-shrink-0 whitespace-nowrap">
                            {new Date(u.lastSyncedAt).toLocaleDateString()}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, icalUrls: f.icalUrls.filter((_, idx) => idx !== i) }))}
                          className="text-[#3a5070] hover:text-[#e05c5c] text-lg leading-none flex-shrink-0 transition-colors"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    className="bg-[#0f1923] border border-[#1e2d45] rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-[#4a90d9] flex-shrink-0"
                    value={form.icalPlatform}
                    onChange={e => setForm(f => ({ ...f, icalPlatform: e.target.value }))}
                  >
                    {ICAL_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    className="flex-1 bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 text-xs text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={form.icalUrlInput}
                    onChange={e => setForm(f => ({ ...f, icalUrlInput: e.target.value }))}
                    placeholder="webcal:// or https:// export URL"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIcalUrl(); } }}
                  />
                  <button
                    type="button"
                    onClick={addIcalUrl}
                    className="px-3 py-2 bg-[#1e2d45] border border-[#2a4060] text-[#4a90d9] text-xs font-semibold rounded-lg hover:bg-[#2a3d55] transition-colors whitespace-nowrap"
                  >Add</button>
                </div>
              </div>

              {/* Per-cleaner payout */}
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1">
                  Assign Cleaners &amp; Set Their Payout
                </label>
                <p className="text-xs text-[#2a4060] mb-2">Check to assign · drag priority with arrows · order = dispatch priority (1 = contacted first)</p>
                {activeCleaners.length === 0 ? (
                  <p className="text-xs text-[#3a5070]">No active cleaners yet. Add cleaners in the Cleaners tab first.</p>
                ) : (
                  <div className="space-y-2">
                    {/* Assigned cleaners in priority order, then unassigned */}
                    {[
                      ...form.assignedCleaners.map(ac => activeCleaners.find(cl => cl.id === ac.id)).filter((cl): cl is typeof activeCleaners[number] => !!cl),
                      ...activeCleaners.filter(cl => !form.assignedCleaners.some(ac => ac.id === cl.id)),
                    ].map(cl => {
                      const selected = isAssigned(cl.id);
                      const payoutVal = getPayout(cl.id);
                      const priority = form.assignedCleaners.findIndex(c => c.id === cl.id);
                      return (
                        <div
                          key={cl.id}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                            selected ? 'bg-[#162035] border-[#1e3a5a]' : 'bg-[#0f1923] border-[#1e2d45]'
                          }`}
                        >
                          <button
                            onClick={() => toggleCleaner(cl.id)}
                            className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                              selected ? 'bg-[#4a90d9] border-[#4a90d9]' : 'border-[#2a4060] hover:border-[#4a90d9]'
                            }`}
                          >
                            {selected && <span className="text-white text-[10px] font-bold">{priority + 1}</span>}
                          </button>
                          <button
                            onClick={() => toggleCleaner(cl.id)}
                            className="flex-1 text-left"
                          >
                            <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-[#3a5070]'}`}>{cl.name}</span>
                          </button>
                          {selected && (
                            <div className="flex flex-col gap-0.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => moveCleanerUp(cl.id)}
                                disabled={priority === 0}
                                className="p-0.5 rounded text-[#3a5070] hover:text-[#4a90d9] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCleanerDown(cl.id)}
                                disabled={priority === form.assignedCleaners.length - 1}
                                className="p-0.5 rounded text-[#3a5070] hover:text-[#4a90d9] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <ChevronDown size={13} />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`text-xs ${selected ? 'text-[#3a5070]' : 'text-[#2a4060]'}`}>$</span>
                            <input
                              type="number"
                              min="0"
                              step="5"
                              disabled={!selected}
                              value={selected ? payoutVal : ''}
                              onChange={e => setCleanerPayout(cl.id, e.target.value)}
                              placeholder="payout"
                              className="w-20 bg-[#0f1923] border border-[#1e2d45] rounded px-2 py-1 text-xs text-white placeholder-[#2a4060] focus:outline-none focus:border-[#4a90d9] disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Profit preview */}
              {form.cleaningFee && form.assignedCleaners.some(c => c.payout > 0) && (
                <div className="bg-[#0a1a10] border border-[#1e3a2a] rounded-lg px-3 py-2.5 space-y-1">
                  <p className="text-xs font-semibold text-[#5ce0a0]">Profit per clean (client ${form.cleaningFee})</p>
                  {form.assignedCleaners.filter(c => c.payout > 0).map(ac => {
                    const name = getCleanerName(ac.id);
                    const profit = parseFloat(form.cleaningFee || '0') - ac.payout;
                    return (
                      <div key={ac.id} className="flex justify-between text-xs">
                        <span className="text-[#3a5070]">{name}</span>
                        <span className={`font-semibold ${profit >= 0 ? 'text-[#5ce0a0]' : 'text-[#e05c5c]'}`}>
                          ${profit.toFixed(0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {saveError && (
              <div className="mx-5 mb-3 px-3 py-2 bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg text-xs text-[#e05c5c]">
                {saveError}
              </div>
            )}
            <div className="flex gap-3 px-5 pb-5 flex-shrink-0">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (!form.propertyId && !form.propertyName)}
                className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

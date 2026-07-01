import { useState } from 'react';
import { Plus, Edit2, Trash2, Home, DollarSign, Users, Zap, CheckCircle2, Copy, Check, Mail } from 'lucide-react';
import type { CleaningPropertyConfig, AssignedCleaner, Cleaner } from '../../types/cleaning';
import type { UplistingProperty, UplistingReservation } from '../../services/uplisting';

interface Props {
  configs: CleaningPropertyConfig[];
  cleaners: Cleaner[];
  uplistingProperties: UplistingProperty[];
  reservations: UplistingReservation[];
  onSave: (c: CleaningPropertyConfig) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
}

const EMPTY: FormState = {
  propertyId: '', propertyName: '', cleaningFee: '', feeAutoFilled: false, assignedCleaners: [],
  doorCode: '', address: '', checkoutTime: '', checkinTime: '',
};

function displayName(propertyId: string | undefined, propertyName: string, props: UplistingProperty[]): string {
  const p = props.find(up => up.id === propertyId);
  return p?.nickname || p?.name || propertyName;
}

export default function PropertiesView({ configs, cleaners, uplistingProperties, reservations, onSave, onDelete }: Props) {
  // --- Edit modal state ---
  const [editing, setEditing] = useState<CleaningPropertyConfig | null | 'new'>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    });
    setEditing(config);
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
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {c.onboardedAt && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#5ce0a0] bg-[#0a2518] border border-[#1e4030] px-2 py-0.5 rounded-full mr-1">
                        <CheckCircle2 size={10} />
                        Onboarded
                      </span>
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
                  unenrolled.length > 0 ? (
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
                  ) : (
                    <>
                      <p className="text-xs text-[#d0954a] mb-2">No Uplisting properties found — enter manually.</p>
                      <input
                        className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                        value={form.propertyName}
                        onChange={e => setForm(f => ({ ...f, propertyName: e.target.value, propertyId: e.target.value }))}
                        placeholder="Property name or address"
                      />
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

              {/* Per-cleaner payout */}
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1">
                  Assign Cleaners &amp; Set Their Payout
                </label>
                <p className="text-xs text-[#2a4060] mb-2">Check to assign · each cleaner has their own negotiated rate · order = dispatch priority</p>
                {activeCleaners.length === 0 ? (
                  <p className="text-xs text-[#3a5070]">No active cleaners yet. Add cleaners in the Cleaners tab first.</p>
                ) : (
                  <div className="space-y-2">
                    {activeCleaners.map(cl => {
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

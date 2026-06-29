import { useState } from 'react';
import { Plus, Edit2, Trash2, Home, DollarSign, Users } from 'lucide-react';
import type { CleaningPropertyConfig, Cleaner } from '../../types/cleaning';
import type { UplistingProperty } from '../../services/uplisting';

interface Props {
  configs: CleaningPropertyConfig[];
  cleaners: Cleaner[];
  uplistingProperties: UplistingProperty[];
  onSave: (c: CleaningPropertyConfig) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface FormState {
  propertyId: string;
  propertyName: string;
  cleaningFee: string;
  cleanerPayout: string;
  assignedCleanerIds: string[];
}

const EMPTY: FormState = {
  propertyId: '', propertyName: '', cleaningFee: '', cleanerPayout: '', assignedCleanerIds: [],
};

export default function PropertiesView({ configs, cleaners, uplistingProperties, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<CleaningPropertyConfig | null | 'new'>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const activeCleaners = cleaners.filter(c => c.status === 'active');
  const enrolledIds = new Set(configs.map(c => c.propertyId));
  const unenrolled = uplistingProperties.filter(p => !enrolledIds.has(p.id));

  function openAdd() {
    setForm({ ...EMPTY });
    setEditing('new');
  }

  function openEdit(config: CleaningPropertyConfig) {
    setForm({
      propertyId: config.propertyId,
      propertyName: config.propertyName,
      cleaningFee: String(config.cleaningFee),
      cleanerPayout: String(config.cleanerPayout),
      assignedCleanerIds: [...config.assignedCleanerIds],
    });
    setEditing(config);
  }

  function onPropertySelect(pid: string) {
    const prop = uplistingProperties.find(p => p.id === pid);
    setForm(f => ({
      ...f,
      propertyId: pid,
      propertyName: prop?.name ?? prop?.nickname ?? pid,
    }));
  }

  function toggleCleaner(id: string) {
    setForm(f => ({
      ...f,
      assignedCleanerIds: f.assignedCleanerIds.includes(id)
        ? f.assignedCleanerIds.filter(c => c !== id)
        : [...f.assignedCleanerIds, id],
    }));
  }

  async function handleSave() {
    if (!form.propertyId || !form.propertyName) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = editing !== 'new' ? editing : null;
      const config: CleaningPropertyConfig = {
        id: existing?.id ?? `cpc_${Date.now()}`,
        propertyId: form.propertyId,
        propertyName: form.propertyName,
        cleaningFee: parseFloat(form.cleaningFee) || 0,
        cleanerPayout: parseFloat(form.cleanerPayout) || 0,
        assignedCleanerIds: form.assignedCleanerIds,
        enrolledAt: existing?.enrolledAt ?? now,
      };
      await onSave(config);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  function getCleanerNames(ids: string[]) {
    return ids.map(id => cleaners.find(c => c.id === id)?.name ?? id).join(', ');
  }

  const profit = (fee: number, payout: number) => fee - payout;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cleaning Properties</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">{configs.length} properties enrolled in cleaning service</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-[#4a90d9] hover:bg-[#5aa0e9] text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus size={16} />
          Enroll Property
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Home size={28} className="text-[#4a90d9]" />
          <p className="text-sm font-semibold text-white">No properties enrolled</p>
          <p className="text-xs text-[#3a5070]">Enroll a property to start tracking cleaning jobs and automatic billing.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {configs.map(c => (
            <div key={c.id} className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Home size={16} className="text-[#4a90d9] flex-shrink-0" />
                    <p className="font-semibold text-white truncate">{c.propertyName}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <div className="flex items-center gap-1.5">
                      <DollarSign size={13} className="text-[#5ce0a0]" />
                      <span className="text-xs text-[#3a5070]">Client charge:</span>
                      <span className="text-xs font-semibold text-white">${c.cleaningFee}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <DollarSign size={13} className="text-[#d07af5]" />
                      <span className="text-xs text-[#3a5070]">Cleaner payout:</span>
                      <span className="text-xs font-semibold text-white">${c.cleanerPayout}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <DollarSign size={13} className="text-[#d0954a]" />
                      <span className="text-xs text-[#3a5070]">Your profit:</span>
                      <span className="text-xs font-semibold text-[#d0954a]">${profit(c.cleaningFee, c.cleanerPayout)}</span>
                    </div>
                  </div>
                  {c.assignedCleanerIds.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <Users size={13} className="text-[#4a90d9] flex-shrink-0" />
                      <p className="text-xs text-[#3a5070]">
                        <span className="font-medium text-[#b8d4f0]">{getCleanerNames(c.assignedCleanerIds)}</span>
                        <span className="text-[#2a4060]"> · dispatch priority order</span>
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
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
          ))}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Client Charge ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={form.cleaningFee}
                    onChange={e => setForm(f => ({ ...f, cleaningFee: e.target.value }))}
                    placeholder="150"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Cleaner Payout ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                    value={form.cleanerPayout}
                    onChange={e => setForm(f => ({ ...f, cleanerPayout: e.target.value }))}
                    placeholder="120"
                  />
                </div>
              </div>

              {form.cleaningFee && form.cleanerPayout && (
                <div className="bg-[#0a2518] border border-[#1e3a2a] rounded-lg px-3 py-2 text-xs text-[#5ce0a0]">
                  Your profit per clean: <span className="font-bold">${(parseFloat(form.cleaningFee || '0') - parseFloat(form.cleanerPayout || '0')).toFixed(0)}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-2">
                  Assigned Cleaners <span className="text-[#2a4060] font-normal">(dispatch priority order — top = first to receive email)</span>
                </label>
                {activeCleaners.length === 0 ? (
                  <p className="text-xs text-[#3a5070]">No active cleaners yet. Add cleaners in the Cleaners tab first.</p>
                ) : (
                  <div className="space-y-2">
                    {activeCleaners.map((cl) => {
                      const selected = form.assignedCleanerIds.includes(cl.id);
                      const priority = form.assignedCleanerIds.indexOf(cl.id);
                      return (
                        <button
                          key={cl.id}
                          onClick={() => toggleCleaner(cl.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                            selected
                              ? 'bg-[#162035] border-[#1e3a5a] text-white'
                              : 'bg-[#0f1923] border-[#1e2d45] text-[#3a5070] hover:border-[#2a4060]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-[#4a90d9] border-[#4a90d9]' : 'border-[#2a4060]'}`}>
                              {selected && <span className="text-white text-[10px] font-bold">{priority + 1}</span>}
                            </div>
                            <span className="font-medium">{cl.name}</span>
                          </div>
                          <span className="text-xs text-[#3a5070]">{cl.email}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
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

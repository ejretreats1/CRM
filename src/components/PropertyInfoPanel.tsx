import { useState } from 'react';
import { Edit2, Check, X, Eye, EyeOff, Wifi, Key, Clock, Zap, Trash2, ScrollText, Wrench, FileText } from 'lucide-react';
import type { PropertyInfo } from '../types';

interface Props {
  info: PropertyInfo;
  onSave: (info: PropertyInfo) => Promise<void>;
}

const SENSITIVE_KEYS: (keyof PropertyInfo)[] = ['doorCode', 'lockboxCode', 'gateCode', 'garageCode', 'wifiPassword', 'alarmCode'];

type Section = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  fields: { key: keyof PropertyInfo; label: string; multiline?: boolean }[];
};

const SECTIONS: Section[] = [
  {
    id: 'access', label: 'Access & Entry', icon: Key, color: 'text-[#d0954a]',
    fields: [
      { key: 'doorCode', label: 'Front door code' },
      { key: 'lockboxCode', label: 'Lockbox code' },
      { key: 'gateCode', label: 'Gate code' },
      { key: 'garageCode', label: 'Garage code' },
      { key: 'parkingNotes', label: 'Parking', multiline: true },
    ],
  },
  {
    id: 'wifi', label: 'WiFi', icon: Wifi, color: 'text-[#6ab0f5]',
    fields: [
      { key: 'wifiNetwork', label: 'Network name (SSID)' },
      { key: 'wifiPassword', label: 'Password' },
    ],
  },
  {
    id: 'checkinout', label: 'Check-in / Check-out', icon: Clock, color: 'text-[#4a90d9]',
    fields: [
      { key: 'checkInTime', label: 'Check-in time' },
      { key: 'checkOutTime', label: 'Check-out time' },
      { key: 'checkInInstructions', label: 'Check-in instructions', multiline: true },
      { key: 'checkOutInstructions', label: 'Check-out instructions', multiline: true },
    ],
  },
  {
    id: 'utilities', label: 'Utilities & Systems', icon: Zap, color: 'text-violet-600',
    fields: [
      { key: 'thermostatNotes', label: 'Thermostat / HVAC', multiline: true },
      { key: 'breakerLocation', label: 'Breaker panel location' },
      { key: 'waterShutoffLocation', label: 'Water shutoff location' },
      { key: 'gasShutoffLocation', label: 'Gas shutoff location' },
      { key: 'alarmCode', label: 'Alarm code' },
      { key: 'alarmCompany', label: 'Alarm company' },
    ],
  },
  {
    id: 'trash', label: 'Trash & Recycling', icon: Trash2, color: 'text-[#5ce0a0]',
    fields: [
      { key: 'trashPickupDays', label: 'Pickup day(s)' },
      { key: 'trashBinLocation', label: 'Bin location' },
      { key: 'trashNotes', label: 'Notes', multiline: true },
    ],
  },
  {
    id: 'rules', label: 'House Rules', icon: ScrollText, color: 'text-[#e05c5c]',
    fields: [
      { key: 'quietHours', label: 'Quiet hours' },
      { key: 'petPolicy', label: 'Pet policy' },
      { key: 'smokingPolicy', label: 'Smoking policy' },
      { key: 'houseRulesNotes', label: 'Other rules', multiline: true },
    ],
  },
  {
    id: 'appliances', label: 'Appliances & Quirks', icon: Wrench, color: 'text-[#8aaac8]',
    fields: [{ key: 'applianceNotes', label: 'Notes', multiline: true }],
  },
  {
    id: 'general', label: 'General Notes', icon: FileText, color: 'text-[#8aaac8]',
    fields: [{ key: 'generalNotes', label: 'Notes', multiline: true }],
  },
];

function isSensitive(key: keyof PropertyInfo): boolean {
  return SENSITIVE_KEYS.includes(key);
}

export default function PropertyInfoPanel({ info, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PropertyInfo>(info);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Set<keyof PropertyInfo>>(new Set());

  function toggleReveal(key: keyof PropertyInfo) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function startEdit() {
    setForm(info);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setEditing(false);
  }

  function set(key: keyof PropertyInfo, value: string) {
    setForm(f => ({ ...f, [key]: value || undefined }));
  }

  // Only show sections that have at least one value in view mode
  const populatedSections = SECTIONS.filter(s =>
    s.fields.some(f => info[f.key])
  );

  const hasAnyInfo = populatedSections.length > 0;

  return (
    <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-[#4a90d9]" />
          <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide">Property Info</p>
        </div>
        {!editing ? (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#4a90d9] transition-colors"
          >
            <Edit2 size={11} /> {hasAnyInfo ? 'Edit' : 'Add info'}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#4a90d9] font-medium transition-colors"
            >
              <Check size={12} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 text-xs text-[#3a5070] hover:text-[#8aaac8] transition-colors"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="p-5 space-y-6">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <div key={section.id}>
                <div className="flex items-center gap-1.5 mb-3">
                  <Icon size={13} className={section.color} />
                  <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide">{section.label}</p>
                </div>
                <div className="space-y-2.5">
                  {section.fields.map(({ key, label, multiline }) => (
                    <div key={key}>
                      <label className="block text-xs text-[#3a5070] mb-1">{label}</label>
                      <div className="relative">
                        {multiline ? (
                          <textarea
                            value={form[key] as string ?? ''}
                            onChange={e => set(key, e.target.value)}
                            rows={2}
                            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9] resize-none"
                          />
                        ) : (
                          <input
                            type={isSensitive(key) && !revealed.has(key) ? 'password' : 'text'}
                            value={form[key] as string ?? ''}
                            onChange={e => set(key, e.target.value)}
                            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 pr-9 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#4a90d9] font-mono"
                          />
                        )}
                        {isSensitive(key) && !multiline && (
                          <button
                            type="button"
                            onClick={() => toggleReveal(key)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] hover:text-[#8aaac8]"
                          >
                            {revealed.has(key) ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : !hasAnyInfo ? (
        <div className="px-5 py-10 text-center">
          <FileText size={28} className="text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-[#3a5070]">No property info yet.</p>
          <p className="text-xs text-[#3a5070] mt-0.5">Add door codes, WiFi, check-in instructions, and more.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {populatedSections.map(section => {
            const Icon = section.icon;
            const populated = section.fields.filter(f => info[f.key]);
            return (
              <div key={section.id} className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Icon size={13} className={section.color} />
                  <p className="text-xs font-semibold text-[#8aaac8] uppercase tracking-wide">{section.label}</p>
                </div>
                <div className="space-y-2">
                  {populated.map(({ key, label, multiline }) => (
                    <div key={key}>
                      <p className="text-xs text-[#3a5070] mb-0.5">{label}</p>
                      {multiline ? (
                        <p className="text-sm text-[#8aaac8] whitespace-pre-wrap leading-relaxed">{info[key] as string}</p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className={`text-sm text-white ${isSensitive(key) && !revealed.has(key) ? 'font-mono tracking-widest text-[#3a5070] select-none' : 'font-mono'}`}>
                            {isSensitive(key) && !revealed.has(key) ? '••••••••' : info[key] as string}
                          </p>
                          {isSensitive(key) && (
                            <button
                              onClick={() => toggleReveal(key)}
                              className="text-[#3a5070] hover:text-[#8aaac8] transition-colors flex-shrink-0"
                            >
                              {revealed.has(key) ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

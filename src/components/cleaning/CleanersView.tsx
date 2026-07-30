import { useState } from 'react';
import { Plus, Edit2, Trash2, User, Phone, Mail, CheckCircle, XCircle, Link2, Send, CreditCard, LayoutDashboard, FileText, Copy, Check, Download, Smartphone, X, Calendar } from 'lucide-react';
import type { Cleaner, CleaningJobType } from '../../types/cleaning';

interface Props {
  cleaners: Cleaner[];
  onSave: (c: Cleaner) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ALL_SKILLS: { value: CleaningJobType; label: string; emoji: string }[] = [
  { value: 'cleaning',  label: 'Cleaning',  emoji: '🧹' },
  { value: 'handyman',  label: 'Handyman',  emoji: '🔧' },
  { value: 'lawncare',  label: 'Lawn Care', emoji: '🌿' },
];

const EMPTY: Omit<Cleaner, 'id' | 'createdAt'> = {
  name: '', email: '', phone: '', status: 'active', skills: ['cleaning'],
};

export default function CleanersView({ cleaners, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<Cleaner | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  // Cleaner detail panel
  const [selected, setSelected] = useState<Cleaner | null>(null);

  // Agreement modal state
  const [agreementModal, setAgreementModal] = useState<Cleaner | null>(null);
  const [agreementSending, setAgreementSending] = useState(false);
  const [agreementLink, setAgreementLink] = useState('');
  const [agreementCopied, setAgreementCopied] = useState(false);
  const [agreementEmailSent, setAgreementEmailSent] = useState(false);
  const [agreementError, setAgreementError] = useState('');

  // PDF download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Send portal link state
  const [portalSentId, setPortalSentId] = useState<string | null>(null);
  const [portalSendingId, setPortalSendingId] = useState<string | null>(null);

  // Broadcast re-setup email state
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  async function sendPortalLink(cleanerId: string) {
    setPortalSendingId(cleanerId);
    try {
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaner', action: 'send-portal-link', cleanerId }),
      });
      setPortalSentId(cleanerId);
      setTimeout(() => setPortalSentId(null), 3000);
    } finally {
      setPortalSendingId(null);
    }
  }

  async function sendBroadcastResetup() {
    if (!confirm('Send a re-setup email to ALL active cleaners instructing them to delete and re-save their home screen app?')) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: 'cleaner', action: 'broadcast-resetup' }),
      });
      const d = await r.json();
      setBroadcastResult(`Sent to ${d.sent ?? 0} cleaner${d.sent === 1 ? '' : 's'}`);
      setTimeout(() => setBroadcastResult(null), 5000);
    } catch {
      setBroadcastResult('Failed to send');
      setTimeout(() => setBroadcastResult(null), 4000);
    } finally {
      setBroadcastSending(false);
    }
  }

  async function downloadAgreement(cleanerId: string) {
    setDownloadingId(cleanerId);
    try {
      window.open(`/api/documents?flow=cleaner-agreement-pdf&cleanerId=${encodeURIComponent(cleanerId)}`, '_blank');
    } finally {
      setDownloadingId(null);
    }
  }

  // Stripe Connect modal state
  const [stripeModal, setStripeModal] = useState<Cleaner | null>(null);
  const [stripeSending, setStripeSending] = useState(false);
  const [stripeCopied, setStripeCopied] = useState(false);
  const [stripeLink, setStripeLink] = useState('');
  const [stripeEmailSent, setStripeEmailSent] = useState(false);
  const [stripeError, setStripeError] = useState('');

  function openAdd() {
    setForm({ ...EMPTY });
    setEditing({ id: '', createdAt: '' } as Cleaner);
  }
  function openEdit(c: Cleaner) {
    setForm({ name: c.name, email: c.email, phone: c.phone ?? '', status: c.status, skills: c.skills ?? ['cleaning'] });
    setEditing(c);
  }
  function closeModal() { setEditing(null); }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const cleaner: Cleaner = {
        id: editing?.id || `cleaner_${Date.now()}`,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: (form.phone ?? '').trim() || undefined,
        status: form.status,
        skills: (form.skills ?? ['cleaning']).length > 0 ? form.skills : ['cleaning'],
        createdAt: editing?.createdAt || now,
        dashboardToken: editing?.dashboardToken || crypto.randomUUID(),
      };
      await onSave(cleaner);
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this cleaner?')) return;
    await onDelete(id);
    if (selected?.id === id) setSelected(null);
  }

  function openAgreementModal(c: Cleaner) {
    setAgreementModal(c);
    setAgreementLink('');
    setAgreementCopied(false);
    setAgreementEmailSent(false);
    setAgreementError('');
  }
  function closeAgreementModal() { setAgreementModal(null); }

  async function handleAgreementAction(copyOnly: boolean) {
    if (!agreementModal) return;
    setAgreementSending(true);
    setAgreementError('');
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: 'cleaner-onboard',
          action: 'send',
          cleanerId: agreementModal.id,
          cleanerName: agreementModal.name,
          cleanerEmail: agreementModal.email,
          appUrl: window.location.origin,
          sendEmail: !copyOnly,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setAgreementError(d.error ?? 'Failed to generate link.'); return; }
      setAgreementLink(d.link);
      if (copyOnly) {
        await navigator.clipboard.writeText(d.link).catch(() => {});
        setAgreementCopied(true);
      } else {
        setAgreementEmailSent(true);
      }
    } catch {
      setAgreementError('Network error. Please try again.');
    } finally {
      setAgreementSending(false);
    }
  }

  function openStripeModal(c: Cleaner) {
    setStripeModal(c);
    setStripeLink('');
    setStripeCopied(false);
    setStripeEmailSent(false);
    setStripeError('');
  }
  function closeStripeModal() { setStripeModal(null); }

  async function handleStripeAction(copyOnly: boolean) {
    if (!stripeModal) return;
    setStripeSending(true);
    setStripeError('');
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: 'cleaner',
          action: 'send-connect',
          cleanerId: stripeModal.id,
          cleanerName: stripeModal.name,
          cleanerEmail: stripeModal.email,
          appUrl: window.location.origin,
          sendEmail: !copyOnly,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setStripeError(d.error ?? 'Failed to generate link.'); return; }
      if (copyOnly) {
        setStripeLink(d.link);
        await navigator.clipboard.writeText(d.link).catch(() => {});
        setStripeCopied(true);
      } else {
        setStripeEmailSent(true);
      }
    } catch {
      setStripeError('Network error. Please try again.');
    } finally {
      setStripeSending(false);
    }
  }

  async function copyStripeLink() {
    if (!stripeLink) return;
    await navigator.clipboard.writeText(stripeLink);
    setStripeCopied(true);
  }

  function stripeStatusBadge(c: Cleaner) {
    if (c.stripeConnectStatus === 'active') {
      return <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-medium"><CreditCard size={11} /> Stripe Active</span>;
    }
    if (c.stripeConnectStatus === 'pending') {
      return <span className="flex items-center gap-1 text-xs text-amber-400 font-medium"><CreditCard size={11} /> Stripe Pending</span>;
    }
    return <span className="text-xs text-[#3a5070]">No Stripe</span>;
  }

  function Avatar({ c, size = 'md' }: { c: Cleaner; size?: 'sm' | 'md' | 'lg' }) {
    const sz = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'md' ? 'w-9 h-9 text-sm' : 'w-8 h-8 text-xs';
    if (c.photoUrl) {
      return <img src={c.photoUrl} alt={c.name} className={`${sz} rounded-full object-cover border-2 border-[#1e3a5a] flex-shrink-0`} />;
    }
    return (
      <div className={`${sz} rounded-full bg-gradient-to-br from-[#1e3a5a] to-[#0e1e3a] border-2 border-[#1e3a5a] flex items-center justify-center flex-shrink-0`}>
        <span className="font-bold text-[#4a90d9]">{c.name[0]?.toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cleaners</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">Your cleaning team — {cleaners.filter(c => c.status === 'active').length} active</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sendBroadcastResetup}
            disabled={broadcastSending}
            title="Send re-setup instructions to all active cleaners"
            className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Smartphone size={15} />
            {broadcastSending ? 'Sending…' : broadcastResult ?? 'Re-setup App'}
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-[#4a90d9] hover:bg-[#5aa0e9] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus size={16} />
            Add Cleaner
          </button>
        </div>
      </div>

      {cleaners.length === 0 ? (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <User size={28} className="text-[#4a90d9]" />
          <p className="text-sm font-semibold text-white">No cleaners yet</p>
          <p className="text-xs text-[#3a5070]">Add your cleaning team members to start dispatching jobs.</p>
        </div>
      ) : (
        <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2d45] text-[#3a5070] text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Stripe</th>
                <th className="text-left px-4 py-3 hidden xl:table-cell">Agreement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d45]">
              {cleaners.map(c => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`cursor-pointer transition-colors ${selected?.id === c.id ? 'bg-[#0e1e3a]' : 'hover:bg-[#162035]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar c={c} size="sm" />
                      <div>
                        <span className="font-medium text-white">{c.name}</span>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {(c.skills ?? ['cleaning']).map(sk => {
                            const info = ALL_SKILLS.find(s => s.value === sk);
                            return info ? (
                              <span key={sk} className="text-[10px] px-1.5 py-px rounded-full bg-[#162035] border border-[#1e2d45] text-[#3a5070] font-medium">
                                {info.emoji} {info.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#b8d4f0] hidden sm:table-cell">
                    <span className="flex items-center gap-1"><Mail size={12} />{c.email}</span>
                  </td>
                  <td className="px-4 py-3 text-[#b8d4f0] hidden md:table-cell">
                    {c.phone ? <span className="flex items-center gap-1"><Phone size={12} />{c.phone}</span> : <span className="text-[#3a5070]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'active' ? (
                      <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-medium"><CheckCircle size={12} /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[#3a5070] font-medium"><XCircle size={12} /> Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">{stripeStatusBadge(c)}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    {c.agreementSignedAt ? (
                      <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-medium"><CheckCircle size={11} /> Signed</span>
                    ) : (
                      <span className="text-xs text-[#3a5070]">Not signed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cleaner Detail Panel ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-4">
                <Avatar c={selected} size="lg" />
                <div>
                  <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {selected.status === 'active' ? (
                      <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-semibold bg-[#0a2518] border border-[#1e4030] px-2 py-0.5 rounded-full">
                        <CheckCircle size={10} /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[#3a5070] font-semibold bg-[#162035] border border-[#1e2d45] px-2 py-0.5 rounded-full">
                        <XCircle size={10} /> Inactive
                      </span>
                    )}
                    {selected.stripeConnectStatus === 'active' && (
                      <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-semibold bg-[#0a2518] border border-[#1e4030] px-2 py-0.5 rounded-full">
                        <CreditCard size={10} /> Stripe Active
                      </span>
                    )}
                    {selected.stripeConnectStatus === 'pending' && (
                      <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold bg-[#2a1a05] border border-[#4a3010] px-2 py-0.5 rounded-full">
                        <CreditCard size={10} /> Stripe Pending
                      </span>
                    )}
                  </div>
                  {(selected.skills ?? ['cleaning']).length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {(selected.skills ?? ['cleaning']).map(sk => {
                        const info = ALL_SKILLS.find(s => s.value === sk);
                        return info ? (
                          <span key={sk} className="text-xs px-2 py-0.5 rounded-full bg-[#162035] border border-[#1e3a5a] text-[#b8d4f0] font-medium">
                            {info.emoji} {info.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#3a5070] hover:text-white transition-colors mt-1">
                <X size={20} />
              </button>
            </div>

            {/* Contact info */}
            <div className="px-6 pb-4 grid grid-cols-1 gap-2">
              <a href={`mailto:${selected.email}`} className="flex items-center gap-3 p-3 bg-[#162035] rounded-xl hover:bg-[#1e2d45] transition-colors group">
                <Mail size={15} className="text-[#4a90d9] flex-shrink-0" />
                <span className="text-sm text-[#b8d4f0] group-hover:text-white transition-colors">{selected.email}</span>
              </a>
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="flex items-center gap-3 p-3 bg-[#162035] rounded-xl hover:bg-[#1e2d45] transition-colors group">
                  <Phone size={15} className="text-[#4a90d9] flex-shrink-0" />
                  <span className="text-sm text-[#b8d4f0] group-hover:text-white transition-colors">{selected.phone}</span>
                </a>
              )}
              {selected.agreementSignedAt && (
                <div className="flex items-center gap-3 p-3 bg-[#0a2518] border border-[#1e4030] rounded-xl">
                  <Calendar size={15} className="text-[#5ce0a0] flex-shrink-0" />
                  <span className="text-sm text-[#5ce0a0]">Agreement signed {new Date(selected.agreementSignedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-6 pb-6">
              <p className="text-xs text-[#3a5070] font-semibold uppercase tracking-wider mb-3">Actions</p>
              <div className="grid grid-cols-3 gap-2">
                {/* Portal link */}
                <button
                  onClick={() => sendPortalLink(selected.id)}
                  disabled={portalSendingId === selected.id}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors disabled:opacity-50 ${
                    portalSentId === selected.id
                      ? 'bg-[#0a2518] border-[#1e4030] text-[#5ce0a0]'
                      : 'bg-[#162035] border-[#1e2d45] text-[#b8d4f0] hover:border-[#d0954a] hover:text-[#d0954a]'
                  }`}
                >
                  {portalSentId === selected.id ? <Check size={18} /> : <Smartphone size={18} />}
                  <span className="text-[10px] font-semibold text-center leading-tight">
                    {portalSentId === selected.id ? 'Sent!' : 'Send Portal Link'}
                  </span>
                </button>

                {/* Copy dashboard link */}
                <button
                  onClick={() => {
                    if (!selected.dashboardToken) {
                      alert('No secure link yet — click "Send Portal Link" first. That will generate a token and email it to the cleaner. Then copy the link from there.');
                      return;
                    }
                    const nameSlug = selected.name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
                    const url = `${window.location.origin}/?cleaner-dashboard=${nameSlug}:${selected.id}:${selected.dashboardToken}`;
                    navigator.clipboard.writeText(url).catch(() => {});
                    alert(`Dashboard link copied!\n\n${url}`);
                  }}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-[#162035] border-[#1e2d45] text-[#b8d4f0] hover:border-[#4a90d9] hover:text-[#4a90d9] transition-colors"
                >
                  <LayoutDashboard size={18} />
                  <span className="text-[10px] font-semibold text-center leading-tight">Copy Dashboard Link</span>
                </button>

                {/* Send agreement */}
                <button
                  onClick={() => { setSelected(null); openAgreementModal(selected); }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ${
                    selected.agreementSignedAt
                      ? 'bg-[#0a2518] border-[#1e4030] text-[#5ce0a0] hover:border-[#5ce0a0]'
                      : 'bg-[#162035] border-[#1e2d45] text-[#b8d4f0] hover:border-[#d0954a] hover:text-[#d0954a]'
                  }`}
                >
                  <FileText size={18} />
                  <span className="text-[10px] font-semibold text-center leading-tight">
                    {selected.agreementSignedAt ? 'Resend Agreement' : 'Send Agreement'}
                  </span>
                </button>

                {/* Download agreement PDF */}
                {selected.agreementSignedAt && (
                  <button
                    onClick={() => downloadAgreement(selected.id)}
                    disabled={downloadingId === selected.id}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-[#162035] border-[#1e2d45] text-[#b8d4f0] hover:border-[#5ce0a0] hover:text-[#5ce0a0] transition-colors disabled:opacity-50"
                  >
                    <Download size={18} />
                    <span className="text-[10px] font-semibold text-center leading-tight">Download Agreement</span>
                  </button>
                )}

                {/* Stripe setup */}
                {selected.stripeConnectStatus !== 'active' && (
                  <button
                    onClick={() => { setSelected(null); openStripeModal(selected); }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-[#162035] border-[#1e2d45] text-[#b8d4f0] hover:border-amber-400 hover:text-amber-400 transition-colors"
                  >
                    <CreditCard size={18} />
                    <span className="text-[10px] font-semibold text-center leading-tight">Setup Stripe Payouts</span>
                  </button>
                )}

                {/* Edit */}
                <button
                  onClick={() => { setSelected(null); openEdit(selected); }}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-[#162035] border-[#1e2d45] text-[#b8d4f0] hover:border-[#4a90d9] hover:text-[#4a90d9] transition-colors"
                >
                  <Edit2 size={18} />
                  <span className="text-[10px] font-semibold text-center leading-tight">Edit Cleaner</span>
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-[#162035] border-[#1e2d45] text-[#3a5070] hover:border-[#e05c5c] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"
                >
                  <Trash2 size={18} />
                  <span className="text-[10px] font-semibold text-center leading-tight">Remove Cleaner</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {editing !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
              <h2 className="font-bold text-white">{editing.id ? 'Edit Cleaner' : 'Add Cleaner'}</h2>
              <button onClick={closeModal} className="text-[#3a5070] hover:text-white transition-colors text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Full Name *</label>
                <input
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Email *</label>
                <input
                  type="email"
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Phone</label>
                <input
                  type="tel"
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-1.5">Status</label>
                <select
                  className="w-full bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#4a90d9]"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] mb-2">Skills</label>
                <div className="flex gap-2 flex-wrap">
                  {ALL_SKILLS.map(s => {
                    const checked = (form.skills ?? ['cleaning']).includes(s.value);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm(f => {
                          const cur = f.skills ?? ['cleaning'];
                          const next = checked ? cur.filter(x => x !== s.value) : [...cur, s.value];
                          return { ...f, skills: next.length ? next : [s.value] };
                        })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          checked
                            ? 'bg-[#1e3a5a] border-[#4a90d9] text-[#b8d4f0]'
                            : 'bg-[#0f1923] border-[#1e2d45] text-[#3a5070] hover:border-[#3a5070]'
                        }`}
                      >
                        {s.emoji} {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={closeModal} className="flex-1 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.email.trim()}
                className="flex-1 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Cleaner'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agreement Modal */}
      {agreementModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
              <div>
                <h2 className="font-bold text-white">Send Contractor Agreement</h2>
                <p className="text-xs text-[#3a5070] mt-0.5">{agreementModal.name}</p>
              </div>
              <button onClick={closeAgreementModal} className="text-[#3a5070] hover:text-white transition-colors text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-[#b8d4f0]">
                Send {agreementModal.name} a link to review and e-sign their Independent Contractor Agreement (includes NDA and non-compete). Their signed copy is emailed to them automatically and stored in your system.
              </p>
              {agreementModal.agreementSignedAt && (
                <div className="bg-[#0a2518] border border-[#1e4030] text-[#5ce0a0] text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle size={12} />
                  Already signed on {new Date(agreementModal.agreementSignedAt).toLocaleDateString()}. You can resend if needed.
                </div>
              )}
              {agreementError && (
                <div className="bg-[#2a0e0e] border border-[#5a1a1a] text-[#e05c5c] text-xs rounded-lg px-3 py-2">{agreementError}</div>
              )}
              {agreementEmailSent && (
                <div className="bg-[#0a1f14] border border-[#1a4a2e] text-[#5ce0a0] text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle size={12} /> Email sent to {agreementModal.email}
                </div>
              )}
              {agreementLink && (
                <div className="bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 space-y-2">
                  <p className="text-xs text-[#3a5070] font-medium">Agreement link (share this):</p>
                  <p className="text-xs text-[#b8d4f0] break-all font-mono">{agreementLink}</p>
                  <button
                    onClick={async () => { await navigator.clipboard.writeText(agreementLink).catch(() => {}); setAgreementCopied(true); }}
                    className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-[#5aa0e9] font-medium"
                  >
                    {agreementCopied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy link</>}
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => handleAgreementAction(true)}
                disabled={agreementSending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors disabled:opacity-50"
              >
                <Link2 size={14} />
                {agreementSending && !agreementEmailSent ? 'Generating…' : 'Copy Link'}
              </button>
              <button
                onClick={() => handleAgreementAction(false)}
                disabled={agreementSending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors disabled:opacity-50"
              >
                <Send size={14} />
                {agreementSending && !agreementCopied ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stripe Connect Modal */}
      {stripeModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1a2335] border border-[#1e2d45] rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45]">
              <div>
                <h2 className="font-bold text-white">Setup Stripe Payouts</h2>
                <p className="text-xs text-[#3a5070] mt-0.5">{stripeModal.name}</p>
              </div>
              <button onClick={closeStripeModal} className="text-[#3a5070] hover:text-white transition-colors text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-[#b8d4f0]">
                Send {stripeModal.name} a link to connect their Stripe account so they can receive payouts automatically after each job.
              </p>
              {stripeError && (
                <div className="bg-[#2a0e0e] border border-[#5a1a1a] text-[#e05c5c] text-xs rounded-lg px-3 py-2">{stripeError}</div>
              )}
              {stripeEmailSent && (
                <div className="bg-[#0a1f14] border border-[#1a4a2e] text-[#5ce0a0] text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle size={12} /> Email sent to {stripeModal.email}
                </div>
              )}
              {stripeLink && (
                <div className="bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 space-y-2">
                  <p className="text-xs text-[#3a5070]">Setup link (share this):</p>
                  <p className="text-xs text-[#b8d4f0] break-all font-mono">{stripeLink}</p>
                  <button onClick={copyStripeLink} className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-[#5aa0e9] font-medium">
                    <Link2 size={11} />
                    {stripeCopied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => handleStripeAction(true)}
                disabled={stripeSending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors disabled:opacity-50"
              >
                <Link2 size={14} />
                {stripeSending && !stripeEmailSent ? 'Generating…' : 'Copy Link'}
              </button>
              <button
                onClick={() => handleStripeAction(false)}
                disabled={stripeSending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4a90d9] text-white text-sm font-semibold rounded-xl hover:bg-[#5aa0e9] transition-colors disabled:opacity-50"
              >
                <Send size={14} />
                {stripeSending && !stripeCopied ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

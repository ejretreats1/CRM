import { useState } from 'react';
import { Plus, Edit2, Trash2, User, Phone, Mail, CheckCircle, XCircle, Link2, Send, CreditCard, LayoutDashboard } from 'lucide-react';
import type { Cleaner } from '../../types/cleaning';

interface Props {
  cleaners: Cleaner[];
  onSave: (c: Cleaner) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const EMPTY: Omit<Cleaner, 'id' | 'createdAt'> = {
  name: '', email: '', phone: '', status: 'active',
};

export default function CleanersView({ cleaners, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<Cleaner | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

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
    setForm({ name: c.name, email: c.email, phone: c.phone ?? '', status: c.status });
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
        createdAt: editing?.createdAt || now,
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
      return (
        <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-medium">
          <CreditCard size={11} /> Stripe Active
        </span>
      );
    }
    if (c.stripeConnectStatus === 'pending') {
      return (
        <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
          <CreditCard size={11} /> Stripe Pending
        </span>
      );
    }
    return (
      <span className="text-xs text-[#3a5070]">No Stripe</span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cleaners</h1>
          <p className="text-sm text-[#3a5070] mt-0.5">Your cleaning team — {cleaners.filter(c => c.status === 'active').length} active</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-[#4a90d9] hover:bg-[#5aa0e9] text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus size={16} />
          Add Cleaner
        </button>
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
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d45]">
              {cleaners.map(c => (
                <tr key={c.id} className="hover:bg-[#162035] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#162035] border border-[#1e3a5a] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#4a90d9]">{c.name[0]?.toUpperCase()}</span>
                      </div>
                      <span className="font-medium text-white">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#b8d4f0] hidden sm:table-cell">
                    <a href={`mailto:${c.email}`} className="hover:text-[#4a90d9] flex items-center gap-1">
                      <Mail size={12} />
                      {c.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-[#b8d4f0] hidden md:table-cell">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="hover:text-[#4a90d9] flex items-center gap-1">
                        <Phone size={12} />
                        {c.phone}
                      </a>
                    ) : (
                      <span className="text-[#3a5070]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'active' ? (
                      <span className="flex items-center gap-1 text-xs text-[#5ce0a0] font-medium">
                        <CheckCircle size={12} /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-[#3a5070] font-medium">
                        <XCircle size={12} /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {stripeStatusBadge(c)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}?cleaner-dashboard=${c.id}`;
                          navigator.clipboard.writeText(url).catch(() => {});
                          alert(`Dashboard link copied!\n\n${url}`);
                        }}
                        title="Copy cleaner dashboard link"
                        className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#5ce0a0] hover:bg-[#1e2d45] transition-colors"
                      >
                        <LayoutDashboard size={14} />
                      </button>
                      {c.stripeConnectStatus !== 'active' && (
                        <button
                          onClick={() => openStripeModal(c)}
                          title="Setup Stripe Connect"
                          className="p-1.5 rounded-lg text-[#3a5070] hover:text-amber-400 hover:bg-[#1e2d45] transition-colors"
                        >
                          <CreditCard size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#4a90d9] hover:bg-[#1e2d45] transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2.5 bg-[#0f1923] border border-[#1e2d45] text-[#b8d4f0] text-sm font-semibold rounded-xl hover:bg-[#1e2d45] transition-colors"
              >
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
                <div className="bg-[#2a0e0e] border border-[#5a1a1a] text-[#e05c5c] text-xs rounded-lg px-3 py-2">
                  {stripeError}
                </div>
              )}

              {stripeEmailSent && (
                <div className="bg-[#0a1f14] border border-[#1a4a2e] text-[#5ce0a0] text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle size={12} />
                  Email sent to {stripeModal.email}
                </div>
              )}

              {stripeLink && (
                <div className="bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2 space-y-2">
                  <p className="text-xs text-[#3a5070]">Setup link (share this):</p>
                  <p className="text-xs text-[#b8d4f0] break-all font-mono">{stripeLink}</p>
                  <button
                    onClick={copyStripeLink}
                    className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-[#5aa0e9] font-medium"
                  >
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

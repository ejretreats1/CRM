import { useState } from 'react';
import { Plus, Edit2, Trash2, BookOpen, X, ChevronLeft } from 'lucide-react';
import type { CleaningSop } from '../../services/cleaningDb';

interface Props {
  sops: CleaningSop[];
  onSave: (sop: CleaningSop) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// Renders plain-text with # headings, - bullets, numbered lists
function RichContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-white mt-6 mb-2 first:mt-0 pb-2 border-b border-[#1e2d45]">
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-[#4a90d9] mt-4 mb-1.5">
          {line.slice(3)}
        </h3>
      );
    } else if (/^[-•] /.test(line)) {
      // Collect consecutive bullet lines
      const bullets: string[] = [];
      while (i < lines.length && /^[-•] /.test(lines[i])) {
        bullets.push(lines[i].replace(/^[-•] /, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1.5 my-2 ml-1">
          {bullets.map((b, bi) => (
            <li key={bi} className="flex items-start gap-2 text-sm text-[#b8d4f0]">
              <span className="text-[#4a90d9] mt-1 shrink-0">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      // Collect consecutive numbered lines
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1.5 my-2 ml-1 list-none">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2.5 text-sm text-[#b8d4f0]">
              <span className="text-[#4a90d9] font-bold shrink-0 w-5 text-right">{ii + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-[#b8d4f0] leading-relaxed">
          {line}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

const BLANK: Omit<CleaningSop, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '',
  content: '',
  sortOrder: 0,
};

export default function SopsView({ sops, onSave, onDelete }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(sops[0]?.id ?? null);
  const [showList, setShowList] = useState(true); // mobile: list vs detail
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ title: string; content: string }>({ title: '', content: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const selected = sops.find(s => s.id === selectedId) ?? sops[0] ?? null;

  function openNew() {
    setEditingId(null);
    setForm({ title: '', content: '' });
    setEditing(true);
  }

  function openEdit(sop: CleaningSop) {
    setEditingId(sop.id);
    setForm({ title: sop.title, content: sop.content });
    setEditing(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const sop: CleaningSop = {
        id: editingId ?? `sop_${Date.now()}`,
        title: form.title.trim(),
        content: form.content,
        sortOrder: editingId ? (sops.find(s => s.id === editingId)?.sortOrder ?? sops.length) : sops.length,
        createdAt: editingId ? (sops.find(s => s.id === editingId)?.createdAt ?? now) : now,
        updatedAt: now,
      };
      await onSave(sop);
      setSelectedId(sop.id);
      setEditing(false);
      setShowList(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await onDelete(id);
      if (selectedId === id) {
        const remaining = sops.filter(s => s.id !== id);
        setSelectedId(remaining[0]?.id ?? null);
      }
      setConfirmDelete(null);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex overflow-hidden">

        {/* Left sidebar — SOP list */}
        <div className={`
          flex flex-col border-r border-[#1e2d45] bg-[#0f1623]
          w-full md:w-64 lg:w-72 shrink-0
          ${showList ? 'flex' : 'hidden md:flex'}
        `}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d45]">
            <div className="flex items-center gap-2">
              <BookOpen size={15} className="text-[#4a90d9]" />
              <span className="text-sm font-semibold text-white">Playbooks</span>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-1 text-xs text-[#4a90d9] hover:text-[#5aa0e9] font-medium"
            >
              <Plus size={14} />
              New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {sops.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-[#3a5070]">No SOPs yet.</p>
                <button onClick={openNew} className="mt-2 text-xs text-[#4a90d9] hover:underline">
                  Create your first SOP
                </button>
              </div>
            ) : (
              sops.map(sop => (
                <button
                  key={sop.id}
                  onClick={() => { setSelectedId(sop.id); setShowList(false); }}
                  className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                    selectedId === sop.id
                      ? 'border-[#4a90d9] bg-[#1a2335]'
                      : 'border-transparent hover:bg-[#1a2335]/50'
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${selectedId === sop.id ? 'text-white' : 'text-[#b8d4f0]'}`}>
                    {sop.title}
                  </p>
                  <p className="text-xs text-[#3a5070] mt-0.5 truncate">
                    {sop.content.split('\n').find(l => l.trim() && !l.startsWith('#'))?.replace(/^[-•\d.] /, '') ?? ''}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel — SOP detail */}
        <div className={`
          flex-1 flex flex-col overflow-hidden
          ${!showList ? 'flex' : 'hidden md:flex'}
        `}>
          {selected ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-[#1e2d45] shrink-0">
                <button
                  onClick={() => setShowList(true)}
                  className="md:hidden text-[#3a5070] hover:text-white"
                >
                  <ChevronLeft size={18} />
                </button>
                <h2 className="flex-1 text-base font-bold text-white truncate">{selected.title}</h2>
                <button
                  onClick={() => openEdit(selected)}
                  className="flex items-center gap-1.5 text-xs text-[#4a90d9] hover:text-[#5aa0e9] font-medium px-3 py-1.5 rounded-lg border border-[#1e3a5a] hover:border-[#4a90d9] transition-colors"
                >
                  <Edit2 size={12} />
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(selected.id)}
                  className="text-[#3a5070] hover:text-red-400 transition-colors p-1.5"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
                <div className="max-w-2xl">
                  <RichContent content={selected.content} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <BookOpen size={32} className="text-[#1e2d45] mx-auto mb-3" />
                <p className="text-sm text-[#3a5070]">Select an SOP or create a new one</p>
                <button onClick={openNew} className="mt-3 text-sm text-[#4a90d9] hover:underline">
                  Create SOP
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="bg-[#1a2335] rounded-t-2xl sm:rounded-2xl border border-[#2a3f5a] w-full sm:max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a3f5a]">
              <h3 className="text-base font-bold text-white">{editingId ? 'Edit SOP' : 'New SOP'}</h3>
              <button onClick={() => setEditing(false)} className="text-[#3a5070] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#3a5070] uppercase tracking-wide mb-1.5">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. CRM Overview & Setup"
                  className="w-full bg-[#0f1623] border border-[#2a3f5a] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#3a5070] uppercase tracking-wide mb-1.5">
                  Content
                </label>
                <p className="text-xs text-[#3a5070] mb-2">
                  Use <code className="text-[#4a90d9]"># Heading</code> for sections, <code className="text-[#4a90d9]">- item</code> for bullets, <code className="text-[#4a90d9]">1. step</code> for numbered steps.
                </p>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={18}
                  placeholder="# Section Title&#10;&#10;- Bullet point&#10;1. Numbered step&#10;&#10;## Sub-section&#10;Regular paragraph text."
                  className="w-full bg-[#0f1623] border border-[#2a3f5a] rounded-xl px-3 py-2.5 text-sm text-[#b8d4f0] placeholder-[#3a5070] focus:outline-none focus:border-[#4a90d9] font-mono leading-relaxed resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-[#2a3f5a]">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2.5 border border-[#2a3f5a] text-[#b8d4f0] text-sm font-medium rounded-xl hover:bg-[#0f1623] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="flex-1 py-2.5 bg-[#4a90d9] text-white text-sm font-bold rounded-xl hover:bg-[#5aa0e9] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save SOP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1a2335] rounded-2xl border border-[#2a3f5a] p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-white mb-2">Delete SOP?</h3>
            <p className="text-sm text-[#3a5070] mb-5">
              "{sops.find(s => s.id === confirmDelete)?.title}" will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 border border-[#2a3f5a] text-[#b8d4f0] text-sm font-medium rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-500 disabled:opacity-50"
              >
                {deleting === confirmDelete ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

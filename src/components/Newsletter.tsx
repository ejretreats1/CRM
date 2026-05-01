import { useState, useMemo, useRef, useEffect } from 'react';
import { Mail, Users, Send, CheckCircle, AlertCircle, Loader, Eye, EyeOff, ImagePlus, X, Link, Search, ChevronDown, ChevronUp, Save } from 'lucide-react';
import type { Lead, Owner } from '../types';

interface NewsletterProps {
  leads: Lead[];
  owners: Owner[];
}

interface Contact {
  email: string;
  name: string;
  group: 'client' | 'lead' | 'team';
}

type TextBlock = { id: string; type: 'text'; content: string };
type ImageBlock = { id: string; type: 'image'; src: string };
type Block = TextBlock | ImageBlock;

type SendState = 'idle' | 'sending' | 'done' | 'error';

const DRAFT_KEY = 'newsletter_draft';
interface Draft { subject: string; blocks: Block[]; savedAt: string; }

function loadDraft(): Draft | null {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; }
}
function saveDraft(subject: string, blocks: Block[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, blocks, savedAt: new Date().toISOString() })); } catch { /* quota */ }
}
function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function newTextBlock(content = ''): TextBlock {
  return { id: `t_${Date.now()}_${Math.random()}`, type: 'text', content };
}
function newImageBlock(src: string): ImageBlock {
  return { id: `i_${Date.now()}_${Math.random()}`, type: 'image', src };
}

// Hoisted outside component — js-hoist-regexp
const BULLET_RE = /^[•·‣▸\-\*–—]\s+/;

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTextHtml(content: string): string {
  const lines = content.split('\n');
  const parts: string[] = [];
  let listOpen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (BULLET_RE.test(line)) {
      if (!listOpen) { parts.push('<ul style="margin:0 0 12px 0;padding-left:24px;line-height:1.8">'); listOpen = true; }
      parts.push(`<li style="margin-bottom:4px">${esc(line.replace(BULLET_RE, ''))}</li>`);
    } else {
      if (listOpen) { parts.push('</ul>'); listOpen = false; }
      parts.push(line === '' ? '<br/>' : `<p style="margin:0 0 12px 0;line-height:1.6">${esc(raw)}</p>`);
    }
  }
  if (listOpen) parts.push('</ul>');
  return parts.join('');
}

function nodeToText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  const el = node as Element;
  if (el.tagName === 'LI') return '• ' + Array.from(el.childNodes).map(nodeToText).join('').trim() + '\n';
  if (el.tagName === 'BR') return '\n';
  if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4'].includes(el.tagName)) {
    const inner = Array.from(el.childNodes).map(nodeToText).join('');
    return inner.trim() ? inner.trimEnd() + '\n' : '\n';
  }
  return Array.from(el.childNodes).map(nodeToText).join('');
}

export default function Newsletter({ leads, owners }: NewsletterProps) {
  const [subject, setSubject] = useState(() => loadDraft()?.subject ?? '');
  const [blocks, setBlocks] = useState<Block[]>(() => { const d = loadDraft(); return d?.blocks?.length ? d.blocks : [newTextBlock()]; });
  const [lastSaved, setLastSaved] = useState<Date | null>(() => { const d = loadDraft(); return d ? new Date(d.savedAt) : null; });
  const [insertingAfter, setInsertingAfter] = useState<string | null>(null);
  const [insertMode, setInsertMode] = useState<'upload' | 'url' | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientListOpen, setRecipientListOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [teamUsers, setTeamUsers] = useState<Contact[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/clerk-users')
      .then(r => r.json())
      .then(d => {
        if (d.users) {
          setTeamUsers(d.users.map((u: { email: string; name: string }) => ({
            email: u.email,
            name: u.name,
            group: 'team' as const,
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Auto-save draft
  useEffect(() => {
    const hasAnyContent = subject.trim() || blocks.some(b => b.type === 'text' && b.content.trim()) || blocks.some(b => b.type === 'image');
    if (!hasAnyContent) return;
    const timer = setTimeout(() => {
      saveDraft(subject, blocks);
      setLastSaved(new Date());
    }, 1500);
    return () => clearTimeout(timer);
  }, [subject, blocks]);

  // All unique contacts
  const allContacts = useMemo<Contact[]>(() => {
    const seen = new Set<string>();
    const list: Contact[] = [];
    for (const o of owners) {
      if (o.email && !seen.has(o.email.toLowerCase())) {
        seen.add(o.email.toLowerCase());
        list.push({ email: o.email, name: o.name, group: 'client' });
      }
    }
    for (const l of leads) {
      if (l.email && !seen.has(l.email.toLowerCase())) {
        seen.add(l.email.toLowerCase());
        list.push({ email: l.email, name: l.name, group: 'lead' });
      }
    }
    for (const u of teamUsers) {
      if (u.email && !seen.has(u.email.toLowerCase())) {
        seen.add(u.email.toLowerCase());
        list.push(u);
      }
    }
    return list;
  }, [leads, owners, teamUsers]);

  const filteredContacts = useMemo(() => {
    const q = recipientSearch.toLowerCase();
    return q ? allContacts.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : allContacts;
  }, [allContacts, recipientSearch]);

  const clients = allContacts.filter(c => c.group === 'client');
  const leadsOnly = allContacts.filter(c => c.group === 'lead');
  const team = allContacts.filter(c => c.group === 'team');

  const recipients = allContacts.filter(c => selectedEmails.has(c.email.toLowerCase()));

  function toggleContact(email: string) {
    const key = email.toLowerCase();
    setSelectedEmails(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectGroup(group: Contact['group'], select: boolean) {
    const group_ = allContacts.filter(c => c.group === group);
    setSelectedEmails(prev => {
      const next = new Set(prev);
      group_.forEach(c => select ? next.add(c.email.toLowerCase()) : next.delete(c.email.toLowerCase()));
      return next;
    });
  }

  function selectAll() {
    setSelectedEmails(new Set(allContacts.map(c => c.email.toLowerCase())));
  }

  function clearAll() {
    setSelectedEmails(new Set());
  }

  const allClientsSelected = clients.length > 0 && clients.every(c => selectedEmails.has(c.email.toLowerCase()));
  const allLeadsSelected = leadsOnly.length > 0 && leadsOnly.every(c => selectedEmails.has(c.email.toLowerCase()));
  const allTeamSelected = team.length > 0 && team.every(c => selectedEmails.has(c.email.toLowerCase()));

  // Blocks helpers
  function updateText(id: string, content: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
  }

  function removeBlock(id: string) {
    setBlocks(prev => {
      const next = prev.filter(b => b.id !== id);
      return next.length === 0 ? [newTextBlock()] : next;
    });
  }

  function openInsert(afterId: string) {
    setInsertingAfter(afterId);
    setInsertMode(null);
    setUrlInput('');
  }

  function closeInsert() {
    setInsertingAfter(null);
    setInsertMode(null);
    setUrlInput('');
  }

  function insertImage(src: string) {
    if (!src || !insertingAfter) return;
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === insertingAfter);
      const copy = [...prev];
      copy.splice(idx + 1, 0, newImageBlock(src), newTextBlock());
      return copy;
    });
    closeInsert();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => insertImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>, blockId: string) {
    const html = e.clipboardData.getData('text/html');
    if (!html) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.querySelector('li')) return;
    e.preventDefault();
    const normalized = nodeToText(doc.body).trim();
    const target = e.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    updateText(blockId, target.value.slice(0, start) + normalized + target.value.slice(end));
  }

  function buildHtml() {
    const bodyHtml = blocks.map(block => {
      if (block.type === 'text') return buildTextHtml(block.content);
      return `<img src="${block.src}" alt="" style="width:100%;display:block;margin:20px 0;border-radius:6px;"/>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#ffffff;margin:0;padding:0;color:#1e293b">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px">
    <p style="margin:0 0 24px 0;font-size:15px;color:#64748b">E&amp;J Retreats</p>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0"/>
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">
      — The E&amp;J Retreats Team<br/>
      <a href="mailto:ejretreats1@gmail.com" style="color:#94a3b8">ejretreats1@gmail.com</a>
    </p>
  </div>
</body>
</html>`;
  }

  const hasContent = blocks.some(b => b.type === 'text' && b.content.trim());

  async function handleSend() {
    if (!subject.trim() || !hasContent || recipients.length === 0) return;
    setConfirming(false);
    setSendState('sending');
    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), html: buildHtml(), recipients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setResult(data);
      setSendState('done');
      clearDraft();
      setLastSaved(null);
    } catch {
      setSendState('error');
    }
  }

  function reset() {
    setSubject('');
    setBlocks([newTextBlock()]);
    setSelectedEmails(new Set());
    setSendState('idle');
    setResult(null);
    setConfirming(false);
    setLastSaved(null);
    clearDraft();
    closeInsert();
  }

  if (sendState === 'done') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-xl font-bold text-slate-900">Newsletter Sent!</p>
          <p className="text-slate-500 text-sm mt-1">{result?.sent} emails delivered{result?.failed ? `, ${result.failed} failed` : ''}.</p>
        </div>
        <button onClick={reset} className="mt-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
          Send Another
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Mail size={22} className="text-teal-600" /> Newsletter
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Send monthly updates to your clients and leads</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Recipients */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users size={15} className="text-teal-600" /> Recipients
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-xs text-teal-600 hover:text-teal-700 transition-colors">All</button>
                <span className="text-slate-300 text-xs">·</span>
                <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">None</button>
              </div>
            </div>

            {/* Quick group toggles */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => selectGroup('client', !allClientsSelected)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  allClientsSelected
                    ? 'bg-teal-50 text-teal-700 border-teal-300'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-700'
                }`}
              >
                {allClientsSelected ? '✓' : '+'} All Clients ({clients.length})
              </button>
              <button
                onClick={() => selectGroup('lead', !allLeadsSelected)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  allLeadsSelected
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-700'
                }`}
              >
                {allLeadsSelected ? '✓' : '+'} All Leads ({leadsOnly.length})
              </button>
              {team.length > 0 && (
                <button
                  onClick={() => selectGroup('team', !allTeamSelected)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    allTeamSelected
                      ? 'bg-violet-50 text-violet-700 border-violet-300'
                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-700'
                  }`}
                >
                  {allTeamSelected ? '✓' : '+'} Team ({team.length})
                </button>
              )}
              <button
                onClick={() => setRecipientListOpen(o => !o)}
                className="flex items-center gap-1 ml-auto text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Pick individual {recipientListOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* Individual picker */}
            {recipientListOpen && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-100/50 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Search size={13} className="text-slate-400 flex-shrink-0" />
                    <input
                      value={recipientSearch}
                      onChange={e => setRecipientSearch(e.target.value)}
                      placeholder="Search by name or email..."
                      className="flex-1 bg-transparent text-sm text-slate-700 placeholder-zinc-600 outline-none"
                    />
                    {recipientSearch && <button onClick={() => setRecipientSearch('')} className="text-slate-300 hover:text-slate-500"><X size={12} /></button>}
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {filteredContacts.length === 0 ? (
                    <p className="text-xs text-slate-300 text-center py-4">No contacts found</p>
                  ) : filteredContacts.map(c => (
                    <label key={c.email} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEmails.has(c.email.toLowerCase())}
                        onChange={() => toggleContact(c.email)}
                        className="accent-teal-600 w-4 h-4 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400 truncate">{c.email}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        c.group === 'client' ? 'bg-teal-100 text-teal-700'
                        : c.group === 'lead' ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-violet-100 text-violet-700'
                      }`}>
                        {c.group === 'client' ? 'Client' : c.group === 'lead' ? 'Lead' : 'Team'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className={`flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg ${
              recipients.length > 0 ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-100 text-slate-400'
            }`}>
              <Mail size={14} />
              {recipients.length > 0 ? `${recipients.length} recipient${recipients.length !== 1 ? 's' : ''} selected` : 'No recipients selected'}
            </div>
          </div>

          {/* Compose */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">Compose</h3>
              <div className="flex items-center gap-3">
                {lastSaved && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Save size={11} />
                    Draft saved {lastSaved.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => { saveDraft(subject, blocks); setLastSaved(new Date()); }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-600 transition-colors"
                  title="Save draft"
                >
                  <Save size={12} /> Save
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(p => !p)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-400 transition-colors"
                >
                  {preview ? <EyeOff size={12} /> : <Eye size={12} />}
                  {preview ? 'Edit' : 'Preview'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Subject Line</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="E&J Retreats — April 2026 Update"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {preview ? (
              <iframe
                srcDoc={buildHtml()}
                className="border border-slate-200 rounded-lg overflow-hidden w-full"
                style={{ minHeight: 400, border: 'none' }}
                title="Email Preview"
              />
            ) : (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-500 mb-2">Message</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                {blocks.map((block, idx) => (
                  <div key={block.id}>
                    {block.type === 'text' ? (
                      <textarea
                        value={block.content}
                        onChange={e => updateText(block.id, e.target.value)}
                        onPaste={e => handlePaste(e, block.id)}
                        rows={idx === 0 && blocks.length === 1 ? 10 : 4}
                        placeholder={idx === 0 ? `Hey everyone,\n\nHere's what's new at E&J Retreats this month...` : 'Continue writing...'}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none font-mono"
                      />
                    ) : (
                      <div className="relative rounded-lg overflow-hidden border border-slate-200 group">
                        <img src={block.src} alt="" className="w-full object-cover max-h-56" />
                        <button
                          onClick={() => removeBlock(block.id)}
                          className="absolute top-2 right-2 bg-slate-100/80 hover:bg-slate-100 rounded-full p-1.5 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Insert image slot */}
                    {insertingAfter === block.id ? (
                      <div className="my-2 border border-dashed border-teal-600/50 rounded-xl p-3 bg-teal-900/10 space-y-2">
                        <p className="text-xs font-medium text-teal-400 text-center">Insert image</p>
                        {insertMode === 'url' ? (
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={urlInput}
                              onChange={e => setUrlInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') insertImage(urlInput.trim()); if (e.key === 'Escape') closeInsert(); }}
                              placeholder="https://example.com/image.jpg"
                              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                            <button onClick={() => insertImage(urlInput.trim())} className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition-colors">Add</button>
                            <button onClick={closeInsert} className="px-2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => { setInsertMode('upload'); fileRef.current?.click(); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition-colors"
                            >
                              <ImagePlus size={14} /> Upload
                            </button>
                            <button
                              onClick={() => setInsertMode('url')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition-colors"
                            >
                              <Link size={14} /> Paste URL
                            </button>
                            <button onClick={closeInsert} className="px-2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => openInsert(block.id)}
                        className="w-full my-1 py-1.5 text-xs text-slate-300 hover:text-teal-400 hover:bg-teal-900/10 rounded-lg border border-transparent hover:border-teal-700/30 transition-all flex items-center justify-center gap-1.5"
                      >
                        <ImagePlus size={12} /> Insert image here
                      </button>
                    )}
                  </div>
                ))}
                <p className="text-xs text-slate-300 mt-1">Blank lines become spacing. Click "Insert image here" to add a photo anywhere in the email.</p>
              </div>
            )}
          </div>

          {lastSaved && (
            <div className="flex justify-end">
              <button
                onClick={reset}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                Discard draft
              </button>
            </div>
          )}

          {sendState === 'error' && (
            <div className="flex items-center gap-2 bg-red-900/20 border border-red-700 text-red-400 rounded-lg px-3 py-2.5 text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              Failed to send. Check that RESEND_API_KEY and NEWSLETTER_FROM_EMAIL are set in Vercel.
            </div>
          )}

          {confirming ? (
            <div className="bg-amber-900/20 border border-amber-700 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-300">Send to {recipients.length} people?</p>
              <p className="text-xs text-amber-400">Subject: <span className="font-medium">{subject}</span></p>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2 rounded-lg hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSend} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Send size={13} /> Yes, Send Now
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={!subject.trim() || !hasContent || recipients.length === 0 || sendState === 'sending'}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {sendState === 'sending' ? (
                <><Loader size={14} className="animate-spin" /> Sending...</>
              ) : (
                <><Send size={14} /> Send Newsletter to {recipients.length} {recipients.length === 1 ? 'Person' : 'People'}</>
              )}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

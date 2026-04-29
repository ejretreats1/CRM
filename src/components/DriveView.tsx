import { useState, useEffect, useRef } from 'react';
import { Folder, ChevronRight, Home, ExternalLink, RefreshCw, AlertCircle, Loader, Plus, ChevronDown } from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string;
  webViewLink: string;
  isFolder: boolean;
}

interface Crumb {
  id: string | null;
  name: string;
}

const NEW_TYPES = [
  { label: 'Google Doc',    emoji: '📝', mimeType: 'application/vnd.google-apps.document' },
  { label: 'Google Sheet',  emoji: '📊', mimeType: 'application/vnd.google-apps.spreadsheet' },
  { label: 'Google Slides', emoji: '📑', mimeType: 'application/vnd.google-apps.presentation' },
  { label: 'New Folder',    emoji: '📁', mimeType: 'application/vnd.google-apps.folder' },
];

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileIcon(mimeType: string) {
  const m = mimeType.toLowerCase();
  if (m.includes('pdf'))         return '📄';
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return '📊';
  if (m.includes('document') || m.includes('word')) return '📝';
  if (m.includes('presentation') || m.includes('powerpoint')) return '📑';
  if (m.includes('image'))       return '🖼️';
  if (m.includes('video'))       return '🎬';
  if (m.includes('audio'))       return '🎵';
  if (m.includes('zip') || m.includes('compressed')) return '📦';
  return '📄';
}

interface DriveViewProps {
  isAdmin: boolean;
}

export default function DriveView({ isAdmin }: DriveViewProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'My Drive' }]);
  const [creating, setCreating] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  const currentFolder = crumbs[crumbs.length - 1];
  const ROOT_FOLDER_NAME = 'E&J Retreats CRM';

  useEffect(() => {
    const isRoot = crumbs.length === 1 && crumbs[0].id === null;
    load(currentFolder.id, isRoot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder.id]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function load(folderId: string | null, autoNavigate = false) {
    setLoading(true);
    setError('');
    try {
      const url = folderId ? `/api/drive?folderId=${encodeURIComponent(folderId)}` : '/api/drive';
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const loaded: DriveFile[] = data.files ?? [];

      if (autoNavigate) {
        const root = loaded.find(f => f.isFolder && f.name === ROOT_FOLDER_NAME);
        if (root) {
          setCrumbs([{ id: null, name: 'My Drive' }, { id: root.id, name: root.name }]);
          return;
        }
      }

      setFiles(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Drive files.');
    } finally {
      setLoading(false);
    }
  }

  async function createFile(mimeType: string) {
    if (!currentFolder.id) return;
    setNewMenuOpen(false);
    setCreating(true);

    const isFolder = mimeType === 'application/vnd.google-apps.folder';
    const defaultName = isFolder ? 'New Folder' : 'Untitled';

    try {
      const res = await fetch('/api/drive-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: currentFolder.id, mimeType, name: defaultName }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Open the new file in a new tab (folders don't need opening)
      if (!isFolder && data.file?.webViewLink) {
        window.open(data.file.webViewLink, '_blank', 'noopener,noreferrer');
      }

      // Refresh to show the new file
      await load(currentFolder.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create file.');
    } finally {
      setCreating(false);
    }
  }

  function openFolder(file: DriveFile) {
    setCrumbs(prev => [...prev, { id: file.id, name: file.name }]);
  }

  function navigateToCrumb(index: number) {
    setCrumbs(prev => prev.slice(0, index + 1));
  }

  const visibleFiles = isAdmin
    ? files
    : files.filter(f => !(f.isFolder && f.name.toLowerCase() === 'admin'));
  const folders = visibleFiles.filter(f => f.isFolder);
  const docs = visibleFiles.filter(f => !f.isFolder);
  const insideFolder = currentFolder.id !== null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="text-2xl">📁</span> Google Drive
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Browse your shared Drive files</p>
          </div>
          <div className="flex items-center gap-2">
            {/* New button — only inside a folder */}
            {insideFolder && (
              <div className="relative" ref={newMenuRef}>
                <button
                  onClick={() => setNewMenuOpen(o => !o)}
                  disabled={creating}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                  New
                  <ChevronDown size={13} />
                </button>
                {newMenuOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg z-10 overflow-hidden">
                    {NEW_TYPES.map(({ label, emoji, mimeType }) => (
                      <button
                        key={mimeType}
                        onClick={() => createFile(mimeType)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <span>{emoji}</span> {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => load(currentFolder.id)}
              disabled={loading}
              className="p-2 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 mt-3 flex-wrap">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-slate-300" />}
              <button
                onClick={() => navigateToCrumb(i)}
                className={`text-sm flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors ${
                  i === crumbs.length - 1
                    ? 'text-slate-800 font-semibold pointer-events-none'
                    : 'text-teal-600 hover:text-teal-700'
                }`}
              >
                {i === 0 && <Home size={13} />}
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            <AlertCircle size={16} className="flex-shrink-0" />
            <div>
              <p className="font-medium">Could not load Drive files</p>
              <p className="text-xs mt-0.5 text-red-500">{error}</p>
              {error.includes('GOOGLE_SERVICE_ACCOUNT_KEY') && (
                <p className="text-xs mt-1 text-red-500">Add <code className="bg-red-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code> to your Vercel environment variables.</p>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={24} className="text-slate-300 animate-spin" />
          </div>
        ) : files.length === 0 && !error ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm">No files found.</p>
            {crumbs.length === 1 && (
              <p className="text-slate-400 text-xs mt-1">
                Share your Drive folders with the service account email to see them here.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Folders */}
            {folders.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Folders ({folders.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {folders.map(f => (
                    <button
                      key={f.id}
                      onClick={() => openFolder(f)}
                      className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all text-center group"
                    >
                      <Folder size={32} className="text-amber-400 group-hover:text-amber-500 transition-colors fill-amber-50" />
                      <span className="text-xs font-medium text-slate-700 leading-tight line-clamp-2 w-full">{f.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {docs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Files ({docs.length})
                </p>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {docs.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                      <span className="text-xl flex-shrink-0">{fileIcon(f.mimeType)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatSize(f.size)}{f.size ? ' · ' : ''}{formatDate(f.modifiedTime)}
                        </p>
                      </div>
                      <a
                        href={f.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium flex-shrink-0 px-2.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
                      >
                        Open <ExternalLink size={11} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

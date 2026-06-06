import { useState, useEffect } from 'react';
import { Folder, ChevronRight, Home, Loader, AlertCircle, X, Check } from 'lucide-react';

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

export interface PickedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
}

interface DrivePickerModalProps {
  onSelect: (files: PickedDriveFile[]) => void;
  onClose: () => void;
}

function fileIcon(mimeType: string) {
  const m = mimeType.toLowerCase();
  if (m.includes('pdf')) return '📄';
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return '📊';
  if (m.includes('document') || m.includes('word')) return '📝';
  if (m.includes('presentation') || m.includes('powerpoint')) return '📑';
  if (m.includes('image')) return '🖼️';
  if (m.includes('video')) return '🎬';
  if (m.includes('audio')) return '🎵';
  return '📄';
}

export default function DrivePickerModal({ onSelect, onClose }: DrivePickerModalProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'My Drive' }]);
  const [selected, setSelected] = useState<Map<string, PickedDriveFile>>(new Map());

  const currentFolder = crumbs[crumbs.length - 1];

  useEffect(() => {
    const isRoot = crumbs.length === 1 && crumbs[0].id === null;
    load(currentFolder.id, isRoot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder.id]);

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
        const root = loaded.find(f => f.isFolder && f.name === 'E&J Retreats CRM');
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

  function toggleFile(f: DriveFile) {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(f.id)) {
        next.delete(f.id);
      } else {
        next.set(f.id, { id: f.id, name: f.name, mimeType: f.mimeType, webViewLink: f.webViewLink });
      }
      return next;
    });
  }

  const folders = files.filter(f => f.isFolder);
  const docs = files.filter(f => !f.isFolder);
  const selectedCount = selected.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[#1a2335] rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d45] flex-shrink-0">
          <div>
            <h2 className="font-semibold text-white">Link from Google Drive</h2>
            <p className="text-xs text-[#3a5070] mt-0.5">
              {selectedCount === 0
                ? 'Select one or more files to add to this client\'s documents'
                : `${selectedCount} file${selectedCount !== 1 ? 's' : ''} selected`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#8aaac8] hover:bg-[#1e2d45] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 px-5 py-2.5 border-b border-[#1e2d45] flex-shrink-0 bg-[#1e2d45] flex-wrap">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="text-[#3a5070]" />}
              <button
                onClick={() => setCrumbs(prev => prev.slice(0, i + 1))}
                className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#1e2d45] transition-colors ${
                  i === crumbs.length - 1
                    ? 'text-[#8aaac8] font-semibold pointer-events-none'
                    : 'text-[#4a90d9] hover:text-[#4a90d9]'
                }`}
              >
                {i === 0 && <Home size={11} />}
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="flex items-center gap-2 text-[#e05c5c] bg-[#2a0e0e] border border-[#5a1a1a] rounded-lg px-3 py-2.5 text-xs mb-3">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader size={20} className="text-[#3a5070] animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {folders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wider mb-2">Folders</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {folders.map(f => (
                      <button
                        key={f.id}
                        onClick={() => setCrumbs(prev => [...prev, { id: f.id, name: f.name }])}
                        className="flex items-center gap-2 p-3 bg-[#1a2335] rounded-lg border border-[#1e2d45] hover:border-amber-300 hover:bg-[#2a1a0a] transition-all text-left"
                      >
                        <Folder size={18} className="text-amber-400 fill-amber-50 flex-shrink-0" />
                        <span className="text-xs font-medium text-[#8aaac8] truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {docs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#3a5070] uppercase tracking-wider mb-2">Files</p>
                  <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] divide-y divide-[#1e2d45]">
                    {docs.map(f => {
                      const isSelected = selected.has(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggleFile(f)}
                          className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                            isSelected ? 'bg-[#162035]' : 'hover:bg-[#1e2d45]'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                            isSelected
                              ? 'bg-[#4a90d9] border-[#4a90d9]'
                              : 'border-[#1e2d45] bg-[#1a2335]'
                          }`}>
                            {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-lg flex-shrink-0">{fileIcon(f.mimeType)}</span>
                          <span className={`flex-1 min-w-0 text-sm font-medium truncate transition-colors ${
                            isSelected ? 'text-[#4a90d9]' : 'text-[#8aaac8]'
                          }`}>
                            {f.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {folders.length === 0 && docs.length === 0 && !error && (
                <p className="text-center text-sm text-[#3a5070] py-12">This folder is empty.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#1e2d45] flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm text-[#8aaac8] hover:text-[#8aaac8] px-4 py-2 rounded-lg border border-[#1e2d45] hover:border-[#1e2d45] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSelect(Array.from(selected.values()))}
            disabled={selectedCount === 0}
            className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:bg-[#1e2d45] disabled:text-[#3a5070] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {selectedCount === 0 ? 'Select files to link' : `Link ${selectedCount} file${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

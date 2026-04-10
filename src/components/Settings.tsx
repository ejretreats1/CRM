import { useState } from 'react';
import { Key, CheckCircle, XCircle, Loader, Eye, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { testConnection } from '../services/uplisting';
import type { UplistingProperty, UplistingReservation } from '../services/uplisting';

interface SettingsProps {
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  lastSync: string | null;
  properties: UplistingProperty[];
  reservations: UplistingReservation[];
  onSync: () => Promise<void>;
  onClearData: () => void;
}

type Status = 'idle' | 'testing' | 'success' | 'error';

export default function Settings({
  apiKey,
  onSaveApiKey,
  lastSync,
  properties,
  reservations,
  onSync,
  onClearData,
}: SettingsProps) {
  const [inputKey, setInputKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [syncing, setSyncing] = useState(false);

  const handleTest = async () => {
    if (!inputKey.trim()) return;
    setStatus('testing');
    setStatusMsg('');
    const result = await testConnection(inputKey.trim());
    if (result.ok) {
      setStatus('success');
      setStatusMsg(`Connected! Found ${result.properties?.length ?? 0} properties.`);
      onSaveApiKey(inputKey.trim());
    } else {
      setStatus('error');
      setStatusMsg(result.error ?? 'Connection failed.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Connect your Uplisting account to sync live property and booking data.</p>
      </div>

      {/* API Key card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-teal-600" />
          <h2 className="font-semibold text-slate-800">Uplisting API Key</h2>
        </div>

        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={inputKey}
            onChange={(e) => { setInputKey(e.target.value); setStatus('idle'); }}
            placeholder="Paste your Uplisting API key..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="button"
            onClick={() => setShowKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Find your API key in Uplisting → Settings → API. Keep it private — never share it publicly.
        </p>

        {/* Status message */}
        {status !== 'idle' && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg
            ${status === 'success' ? 'bg-emerald-50 text-emerald-700' :
              status === 'error' ? 'bg-red-50 text-red-600' :
              'bg-slate-50 text-slate-500'}`}
          >
            {status === 'testing' && <Loader size={14} className="animate-spin" />}
            {status === 'success' && <CheckCircle size={14} />}
            {status === 'error' && <XCircle size={14} />}
            {status === 'testing' ? 'Testing connection...' : statusMsg}
          </div>
        )}

        <button
          onClick={handleTest}
          disabled={!inputKey.trim() || status === 'testing'}
          className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {apiKey && inputKey === apiKey ? 'Re-test Connection' : 'Save & Test Connection'}
        </button>
      </div>

      {/* Sync status */}
      {apiKey && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Data Sync</h2>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Properties synced', value: properties.length },
              { label: 'Reservations synced', value: reservations.length },
              { label: 'Last synced', value: lastSync
                  ? new Date(lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : 'Never' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-lg p-3">
                <div className="text-lg font-bold text-slate-900">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={() => {
                if (confirm('Clear all synced Uplisting data? Your manually entered data will remain.')) {
                  onClearData();
                }
              }}
              className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Trash2 size={14} /> Clear Synced Data
            </button>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
        <p className="font-semibold">How to find your API key</p>
        <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
          <li>Log in to Uplisting at app.uplisting.io</li>
          <li>Go to Settings → Integrations or API</li>
          <li>Copy your API key and paste it above</li>
        </ol>
      </div>
    </div>
  );
}

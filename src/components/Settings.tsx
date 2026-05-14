import { useState } from 'react';
import { Key, CheckCircle, XCircle, Loader, Eye, EyeOff, RefreshCw, Trash2, CalendarDays, Save, Hash, Plus, X } from 'lucide-react';
import { testConnection } from '../services/uplisting';
import { testHostawayConnection } from '../services/hostaway';
import type { UplistingProperty, UplistingReservation } from '../services/uplisting';

interface SlackChannel {
  id: string;
  name: string;
}

interface SettingsProps {
  // Uplisting
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  lastSync: string | null;
  properties: UplistingProperty[];
  reservations: UplistingReservation[];
  onSync: () => Promise<void>;
  onClearData: () => void;
  // Hostaway
  hostawayAccountId: string;
  hostawaySecret: string;
  onSaveHostawayCredentials: (accountId: string, secret: string) => Promise<void>;
  hostawayLastSync: string | null;
  hostawayProperties: UplistingProperty[];
  hostawayReservations: UplistingReservation[];
  onHostawaySync: () => Promise<void>;
  onClearHostawayData: () => void;
  // Other
  calendarUrl: string;
  onSaveCalendarUrl: (url: string) => void;
  slackToken: string;
  onSaveSlackToken: (token: string) => void;
  slackChannels: SlackChannel[];
  onSaveSlackChannels: (channels: SlackChannel[]) => void;
}

type Status = 'idle' | 'testing' | 'success' | 'error';

export default function Settings({
  apiKey, onSaveApiKey,
  calendarUrl, onSaveCalendarUrl,
  slackToken, onSaveSlackToken,
  slackChannels, onSaveSlackChannels,
  lastSync, properties, reservations, onSync, onClearData,
  hostawayAccountId, hostawaySecret, onSaveHostawayCredentials,
  hostawayLastSync, hostawayProperties, hostawayReservations, onHostawaySync, onClearHostawayData,
}: SettingsProps) {
  // Uplisting
  const [inputKey, setInputKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Hostaway
  const [hostawayIdInput, setHostawayIdInput] = useState(hostawayAccountId);
  const [hostawaySecretInput, setHostawaySecretInput] = useState(hostawaySecret);
  const [showHostawaySecret, setShowHostawaySecret] = useState(false);
  const [hostawayStatus, setHostawayStatus] = useState<Status>('idle');
  const [hostawayStatusMsg, setHostawayStatusMsg] = useState('');
  const [hostawaySyncing, setHostawaySyncing] = useState(false);

  // Calendar
  const [icalInput, setIcalInput] = useState(calendarUrl);
  const [calSaved, setCalSaved] = useState(false);

  // Slack
  const [slackTokenInput, setSlackTokenInput] = useState(slackToken);
  const [channelList, setChannelList] = useState<SlackChannel[]>(slackChannels);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelId, setNewChannelId] = useState('');
  const [showSlackToken, setShowSlackToken] = useState(false);
  const [slackSaved, setSlackSaved] = useState(false);

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

  const handleTestHostaway = async () => {
    if (!hostawayIdInput.trim() || !hostawaySecretInput.trim()) return;
    setHostawayStatus('testing');
    setHostawayStatusMsg('');
    const result = await testHostawayConnection(hostawayIdInput.trim(), hostawaySecretInput.trim());
    if (result.ok) {
      setHostawayStatus('success');
      setHostawayStatusMsg(`Connected! Found ${result.properties?.length ?? 0} listings.`);
      await onSaveHostawayCredentials(hostawayIdInput.trim(), hostawaySecretInput.trim());
    } else {
      setHostawayStatus('error');
      setHostawayStatusMsg(result.error ?? 'Connection failed.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await onSync(); } finally { setSyncing(false); }
  };

  const handleHostawaySync = async () => {
    setHostawaySyncing(true);
    try { await onHostawaySync(); } finally { setHostawaySyncing(false); }
  };

  const handleSaveCalendar = () => {
    onSaveCalendarUrl(icalInput.trim());
    setCalSaved(true);
    setTimeout(() => setCalSaved(false), 2000);
  };

  const handleAddChannel = () => {
    const id = newChannelId.trim();
    if (!id) return;
    if (channelList.find(c => c.id === id)) return;
    setChannelList(prev => [...prev, { id, name: newChannelName.trim() || id }]);
    setNewChannelName('');
    setNewChannelId('');
    setSlackSaved(false);
  };

  const handleRemoveChannel = (id: string) => {
    setChannelList(prev => prev.filter(c => c.id !== id));
    setSlackSaved(false);
  };

  const handleSaveSlack = () => {
    onSaveSlackToken(slackTokenInput.trim());
    onSaveSlackChannels(channelList);
    setSlackSaved(true);
    setTimeout(() => setSlackSaved(false), 2000);
  };

  const fmtSync = (ts: string | null) =>
    ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never';

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your integrations and connected services.</p>
      </div>

      {/* Google Calendar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-teal-600" />
          <h2 className="font-semibold text-slate-900">Google Calendar</h2>
          {calendarUrl && (
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-auto">Connected</span>
          )}
        </div>
        <p className="text-sm text-slate-500">Connect your Google Calendar to display upcoming meetings on the dashboard.</p>
        <input
          type="text"
          value={icalInput}
          onChange={e => { setIcalInput(e.target.value); setCalSaved(false); }}
          placeholder="https://calendar.google.com/calendar/ical/..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <p className="text-xs text-slate-400">In Google Calendar: Settings → Your calendar → “Secret address in iCal format”.</p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveCalendar}
            disabled={!icalInput.trim() && !calendarUrl}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {calSaved ? <CheckCircle size={14} /> : <Save size={14} />}
            {calSaved ? 'Saved!' : 'Save Calendar URL'}
          </button>
          {calendarUrl && (
            <button onClick={() => { setIcalInput(''); onSaveCalendarUrl(''); }} className="text-sm text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-3 py-2 rounded-lg transition-colors">Remove</button>
          )}
        </div>
      </div>

      {/* Slack Integration */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Hash size={18} className="text-purple-500" />
          <h2 className="font-semibold text-slate-900">Slack Feed</h2>
          {slackToken && channelList.length > 0 && (
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-auto">
              {channelList.length} channel{channelList.length > 1 ? 's' : ''} connected
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">Show a live feed of your Zapier Slack notifications on the dashboard.</p>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Bot Token</label>
          <div className="relative">
            <input
              type={showSlackToken ? 'text' : 'password'}
              value={slackTokenInput}
              onChange={e => { setSlackTokenInput(e.target.value); setSlackSaved(false); }}
              placeholder="xoxb-..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button type="button" onClick={() => setShowSlackToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showSlackToken ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-2">Channels</label>
          {channelList.length > 0 && (
            <div className="space-y-2 mb-3">
              {channelList.map(ch => (
                <div key={ch.id} className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  <Hash size={13} className="text-purple-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-purple-800 flex-1">{ch.name}</span>
                  <span className="text-xs text-purple-500 font-mono">{ch.id}</span>
                  <button type="button" onClick={() => handleRemoveChannel(ch.id)} className="text-purple-400 hover:text-red-500 transition-colors flex-shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="Name (e.g. zapier-leads)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            <input type="text" value={newChannelId} onChange={e => setNewChannelId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddChannel(); }} placeholder="Channel ID (C...)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400" />
            <button type="button" onClick={handleAddChannel} disabled={!newChannelId.trim()} className="bg-purple-100 hover:bg-purple-200 disabled:opacity-40 text-purple-700 px-3 py-2 rounded-lg transition-colors flex-shrink-0"><Plus size={15} /></button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSaveSlack} disabled={!slackTokenInput.trim() || channelList.length === 0} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {slackSaved ? <CheckCircle size={14} /> : <Save size={14} />}
            {slackSaved ? 'Saved!' : 'Save Slack Settings'}
          </button>
          {slackToken && (
            <button onClick={() => { setSlackTokenInput(''); setChannelList([]); onSaveSlackToken(''); onSaveSlackChannels([]); }} className="text-sm text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-3 py-2 rounded-lg transition-colors">Remove All</button>
          )}
        </div>
      </div>

      {/* Uplisting API Key */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-teal-600" />
          <h2 className="font-semibold text-slate-900">Uplisting API Key</h2>
          {apiKey && <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-auto">Connected</span>}
        </div>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={inputKey}
            onChange={e => { setInputKey(e.target.value); setStatus('idle'); }}
            placeholder="Paste your Uplisting API key..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="text-xs text-slate-400">Find your API key in Uplisting → Settings → API.</p>
        {status !== 'idle' && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            status === 'success' ? 'bg-emerald-50 text-emerald-700' :
            status === 'error'   ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
          }`}>
            {status === 'testing' && <Loader size={14} className="animate-spin" />}
            {status === 'success' && <CheckCircle size={14} />}
            {status === 'error'   && <XCircle size={14} />}
            {status === 'testing' ? 'Testing connection...' : statusMsg}
          </div>
        )}
        <button onClick={handleTest} disabled={!inputKey.trim() || status === 'testing'} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {apiKey && inputKey === apiKey ? 'Re-test Connection' : 'Save & Test Connection'}
        </button>
      </div>

      {/* Uplisting Sync */}
      {apiKey && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Uplisting Data Sync</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Properties synced', value: properties.length },
              { label: 'Reservations synced', value: reservations.length },
              { label: 'Last synced', value: fmtSync(lastSync) },
            ].map(s => (
              <div key={s.label} className="bg-slate-100 rounded-lg p-3">
                <div className="text-lg font-bold text-slate-900">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={() => { if (confirm('Clear all synced Uplisting data?')) onClearData(); }} className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Trash2 size={14} /> Clear Synced Data
            </button>
          </div>
        </div>
      )}

      {/* Hostaway */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-violet-600" />
          <h2 className="font-semibold text-slate-900">Hostaway</h2>
          {hostawayAccountId && hostawaySecret && (
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-auto">Connected</span>
          )}
        </div>
        <p className="text-sm text-slate-500">Connect a Hostaway account to sync its properties and reservations into the CRM alongside Uplisting.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account ID</label>
            <input
              type="text"
              value={hostawayIdInput}
              onChange={e => { setHostawayIdInput(e.target.value); setHostawayStatus('idle'); }}
              placeholder="e.g. 12345"
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">API Secret</label>
            <div className="relative">
              <input
                type={showHostawaySecret ? 'text' : 'password'}
                value={hostawaySecretInput}
                onChange={e => { setHostawaySecretInput(e.target.value); setHostawayStatus('idle'); }}
                placeholder="Paste your Hostaway API secret..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button type="button" onClick={() => setShowHostawaySecret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showHostawaySecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400">In Hostaway: Settings → API &amp; Integrations. Copy your Account ID and API Secret.</p>
        {hostawayStatus !== 'idle' && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            hostawayStatus === 'success' ? 'bg-emerald-50 text-emerald-700' :
            hostawayStatus === 'error'   ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
          }`}>
            {hostawayStatus === 'testing' && <Loader size={14} className="animate-spin" />}
            {hostawayStatus === 'success' && <CheckCircle size={14} />}
            {hostawayStatus === 'error'   && <XCircle size={14} />}
            {hostawayStatus === 'testing' ? 'Testing connection...' : hostawayStatusMsg}
          </div>
        )}
        <button
          onClick={handleTestHostaway}
          disabled={!hostawayIdInput.trim() || !hostawaySecretInput.trim() || hostawayStatus === 'testing'}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {hostawayAccountId && hostawayIdInput === hostawayAccountId ? 'Re-test Connection' : 'Save & Test Connection'}
        </button>
      </div>

      {/* Hostaway Sync */}
      {hostawayAccountId && hostawaySecret && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Hostaway Data Sync</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Properties synced', value: hostawayProperties.length },
              { label: 'Reservations synced', value: hostawayReservations.length },
              { label: 'Last synced', value: fmtSync(hostawayLastSync) },
            ].map(s => (
              <div key={s.label} className="bg-slate-100 rounded-lg p-3">
                <div className="text-lg font-bold text-slate-900">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleHostawaySync} disabled={hostawaySyncing} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <RefreshCw size={14} className={hostawaySyncing ? 'animate-spin' : ''} />
              {hostawaySyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={() => { if (confirm('Clear all synced Hostaway data?')) onClearHostawayData(); }} className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Trash2 size={14} /> Clear Synced Data
            </button>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
        <p className="font-semibold">How to find your Uplisting API key</p>
        <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
          <li>Log in to Uplisting at app.uplisting.io</li>
          <li>Go to Settings → Integrations or API</li>
          <li>Copy your API key and paste it above</li>
        </ol>
      </div>
    </div>
  );
}

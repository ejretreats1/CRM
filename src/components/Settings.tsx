import { useState, useEffect } from 'react';
import { Key, CheckCircle, XCircle, Loader, Eye, EyeOff, RefreshCw, Trash2, CalendarDays, Save, Hash, Plus, X, Users, UserPlus, Copy, Check, Instagram, Facebook } from 'lucide-react';
import { testConnection } from '../services/uplisting';
import { testHostawayConnection } from '../services/hostaway';
import type { UplistingProperty, UplistingReservation } from '../services/uplisting';
import { cacheGet } from '../services/appCache';
import { loadFbSdk, fbLogin, connectMeta, disconnectMeta, addMetaPage } from '../services/meta';
import type { MetaConnection } from '../services/meta';

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
  // PriceLabs
  priceLabsApiKey: string;
  onSavePriceLabsApiKey: (key: string) => Promise<void>;
  // Other
  calendarUrl: string;
  onSaveCalendarUrl: (url: string) => void;
  slackToken: string;
  onSaveSlackToken: (token: string) => void;
  slackChannels: SlackChannel[];
  onSaveSlackChannels: (channels: SlackChannel[]) => void;
  isAdmin?: boolean;
}

type Status = 'idle' | 'testing' | 'success' | 'error';

interface TeamMember { id: string; email: string; name: string; role: string; }
interface CreatedCreds { email: string; password: string; name: string; }

const META_SCOPE = 'pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic';

interface IgOverride { id: string; username: string }

function MetaConnect() {
  const appId = (import.meta as unknown as { env: Record<string, string> }).env.VITE_META_APP_ID as string | undefined;
  const [conn, setConn] = useState<MetaConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [igOverride, setIgOverride] = useState<IgOverride | null>(null);
  const [igIdInput, setIgIdInput] = useState('');
  const [igUsernameInput, setIgUsernameInput] = useState('');
  const [igSaved, setIgSaved] = useState(false);
  const [pageIdInput, setPageIdInput] = useState('');
  const [pageAdding, setPageAdding] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    cacheGet<MetaConnection>('meta_connection').then(v => {
      setConn(v ? { pages: v.pages, connectedAt: v.connectedAt, expiresAt: v.expiresAt } : null);
      setLoading(false);
    });
    cacheGet<IgOverride>('meta_ig_override').then(v => { if (v) setIgOverride(v); });
  }, []);

  useEffect(() => {
    if (appId) loadFbSdk(appId);
  }, [appId]);

  async function handleConnect() {
    if (typeof window.FB === 'undefined') { setError('Facebook SDK not ready — try again in a moment.'); return; }
    setConnecting(true);
    setError('');
    try {
      const token = await fbLogin(META_SCOPE);
      if (!token) { setConnecting(false); return; }
      const updated = await connectMeta(token);
      setConn(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectMeta();
    setConn(null);
  }

  async function saveIgOverride() {
    const v = { id: igIdInput.trim(), username: igUsernameInput.trim().replace(/^@/, '') };
    const { cacheSet } = await import('../services/appCache');
    await cacheSet('meta_ig_override', v);
    setIgOverride(v);
    setIgSaved(true);
    setTimeout(() => setIgSaved(false), 2000);
  }

  async function handleAddPage() {
    if (!pageIdInput.trim()) return;
    setPageAdding(true); setPageError('');
    try {
      const updated = await addMetaPage(pageIdInput.trim());
      setConn(updated);
      setPageIdInput('');
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Failed to add page');
    } finally {
      setPageAdding(false);
    }
  }

  async function removeIgOverride() {
    const { cacheRemove } = await import('../services/appCache');
    await cacheRemove('meta_ig_override');
    setIgOverride(null);
    setIgIdInput('');
    setIgUsernameInput('');
  }

  if (loading) return null;


  return (
    <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Facebook size={18} className="text-[#1877F2]" />
        <h2 className="font-semibold text-white">Meta (Facebook & Instagram)</h2>
        {conn && <span className="text-xs text-[#5ce0a0] bg-[#0a2518] border border-[#0a4a2a] px-2 py-0.5 rounded-full ml-auto">Connected</span>}
      </div>

      {!appId ? (
        <div className="text-xs text-[#d0954a] space-y-1">
          <p className="font-semibold">Setup required</p>
          <ol className="list-decimal list-inside space-y-0.5 text-[#b87a30]">
            <li>Go to <span className="font-mono">developers.facebook.com</span> → Create App → Business type</li>
            <li>Add products: Facebook Login + Instagram Graph API</li>
            <li>Copy your App ID and App Secret</li>
            <li>In Vercel: add <span className="font-mono">VITE_META_APP_ID</span> and <span className="font-mono">META_APP_SECRET</span></li>
            <li>Redeploy, then come back to connect</li>
          </ol>
        </div>
      ) : conn ? (
        <div className="space-y-3">
          {conn.pages.length === 0 && (
            <div className="bg-[#1a1000] border border-[#3a2a00] rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-[#d0954a]">No Facebook Pages found automatically</p>
              <p className="text-xs text-[#8a6030]">Enter your Page ID manually. Find it at <span className="font-mono">facebook.com/YOUR_PAGE</span> → About → scroll to "Page ID".</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pageIdInput}
                  onChange={e => setPageIdInput(e.target.value)}
                  placeholder="Facebook Page ID  e.g. 123456789012345"
                  className="flex-1 bg-[#0f1923] border border-[#3a2a00] text-white text-xs rounded-lg px-3 py-2 placeholder-[#5a4020] focus:outline-none focus:ring-1 focus:ring-[#d0954a]"
                />
                <button
                  onClick={handleAddPage}
                  disabled={pageAdding || !pageIdInput.trim()}
                  className="flex items-center gap-1.5 bg-[#d0954a] hover:bg-[#b07030] disabled:opacity-50 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  {pageAdding ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />}
                  {pageAdding ? 'Adding…' : 'Add Page'}
                </button>
              </div>
              {pageError && <p className="text-xs text-[#e05c5c]">{pageError}</p>}
            </div>
          )}
          {conn.pages.map(page => (
            <div key={page.id} className="bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <Facebook size={13} className="text-[#1877F2] flex-shrink-0" />
                <span className="text-sm font-medium text-white">{page.name}</span>
                <CheckCircle size={12} className="text-[#5ce0a0] ml-auto" />
              </div>
              {page.igAccount && (
                <div className="flex items-center gap-2 pl-5">
                  <Instagram size={12} className="text-[#d07af5] flex-shrink-0" />
                  <span className="text-xs text-[#b8d4f0]">@{page.igAccount.username}</span>
                  <CheckCircle size={11} className="text-[#5ce0a0] ml-auto" />
                </div>
              )}
            </div>
          ))}
          {/* Instagram manual override — always available when connected */}
          {(
            igOverride ? (
              <div className="bg-[#0f1923] border border-[#1e2d45] rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 pl-5">
                  <Instagram size={12} className="text-[#d07af5] flex-shrink-0" />
                  <span className="text-xs text-[#b8d4f0]">@{igOverride.username}</span>
                  <span className="text-xs text-[#3a5070] ml-auto">(manual)</span>
                  <button onClick={removeIgOverride} className="text-[#3a5070] hover:text-[#e05c5c] transition-colors ml-1"><X size={11} /></button>
                </div>
              </div>
            ) : (
              <div className="bg-[#1a1a2e] border border-[#2a1a35] rounded-lg px-3 py-3 space-y-2">
                <p className="text-xs text-[#d07af5] font-semibold">Link Instagram manually</p>
                <p className="text-xs text-[#3a5070]">API auto-discovery failed. Paste your Instagram Account ID and username below.</p>
                <input
                  type="text"
                  value={igIdInput}
                  onChange={e => setIgIdInput(e.target.value)}
                  placeholder="Instagram Account ID  e.g. 17841475907866507"
                  className="w-full bg-[#0f1923] border border-[#2a1a35] text-white text-xs rounded-lg px-3 py-2 placeholder-[#3a5070] focus:outline-none focus:ring-1 focus:ring-[#d07af5]"
                />
                <input
                  type="text"
                  value={igUsernameInput}
                  onChange={e => setIgUsernameInput(e.target.value)}
                  placeholder="Username  e.g. ejretreats"
                  className="w-full bg-[#0f1923] border border-[#2a1a35] text-white text-xs rounded-lg px-3 py-2 placeholder-[#3a5070] focus:outline-none focus:ring-1 focus:ring-[#d07af5]"
                />
                <button
                  onClick={saveIgOverride}
                  disabled={!igIdInput.trim() || !igUsernameInput.trim()}
                  className="flex items-center gap-1.5 bg-[#2a1a35] hover:bg-[#3a1a45] disabled:opacity-50 text-[#d07af5] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {igSaved ? <CheckCircle size={12} /> : <Save size={12} />}
                  {igSaved ? 'Saved!' : 'Save Instagram Account'}
                </button>
              </div>
            )
          )}
          <div className="flex items-center gap-3 pt-1">
            <p className="text-xs text-[#3a5070] flex-1">Token expires {new Date(conn.expiresAt).toLocaleDateString()}</p>
            <button onClick={handleDisconnect} className="text-xs text-[#e05c5c] hover:text-[#e05c5c] border border-[#5a1a1a] px-3 py-1.5 rounded-lg transition-colors">Disconnect</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#1464d8] disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {connecting ? <Loader size={14} className="animate-spin" /> : <Facebook size={14} />}
            {connecting ? 'Connecting…' : 'Connect Meta Account'}
          </button>
          {error && <p className="text-xs text-[#e05c5c]">{error}</p>}
          <p className="text-xs text-[#3a5070]">Opens a Facebook login popup. Grants access to post on your behalf to connected Pages and Instagram Business accounts.</p>
        </div>
      )}
    </div>
  );
}

export default function Settings({
  apiKey, onSaveApiKey,
  calendarUrl, onSaveCalendarUrl,
  slackToken, onSaveSlackToken,
  slackChannels, onSaveSlackChannels,
  lastSync, properties, reservations, onSync, onClearData,
  hostawayAccountId, hostawaySecret, onSaveHostawayCredentials,
  hostawayLastSync, hostawayProperties, hostawayReservations, onHostawaySync, onClearHostawayData,
  priceLabsApiKey, onSavePriceLabsApiKey,
  isAdmin,
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

  // PriceLabs
  const [plKeyInput, setPlKeyInput] = useState(priceLabsApiKey);
  const [showPlKey, setShowPlKey] = useState(false);
  const [plSaved, setPlSaved] = useState(false);
  const [plSaving, setPlSaving] = useState(false);
  const [plSaveError, setPlSaveError] = useState('');

  const handleSavePriceLabs = async () => {
    setPlSaving(true);
    setPlSaveError('');
    try {
      await onSavePriceLabsApiKey(plKeyInput.trim());
      setPlSaved(true);
      setTimeout(() => setPlSaved(false), 2000);
    } catch (e) {
      setPlSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPlSaving(false);
    }
  };

  // Team management
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdCreds, setCreatedCreds] = useState<CreatedCreds | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    setTeamLoading(true);
    fetch('/api/clerk-manage-users')
      .then(r => r.json())
      .then(d => setTeamMembers(d.users ?? []))
      .catch(() => {})
      .finally(() => setTeamLoading(false));
  }, [isAdmin]);

  async function handleCreateVA(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/clerk-manage-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), firstName: newFirstName.trim(), lastName: newLastName.trim(), password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create account');
      setTeamMembers(m => [...m, data.user]);
      setCreatedCreds({ email: newEmail.trim(), password: newPassword, name: data.user.name });
      setNewEmail(''); setNewFirstName(''); setNewLastName(''); setNewPassword('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteMember(userId: string) {
    if (!confirm('Remove this team member? They will no longer be able to log in.')) return;
    await fetch('/api/clerk-manage-users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setTeamMembers(m => m.filter(u => u.id !== userId));
  }

  function copyToClipboard(text: string, field: 'email' | 'password') {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

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
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-[#b8d4f0] mt-0.5">Manage your integrations and connected services.</p>
      </div>

      {/* Team Management — admin only */}
      {isAdmin && (
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#4a90d9]" />
            <h2 className="font-semibold text-white">Team Members</h2>
          </div>

          {/* Existing members */}
          {teamLoading ? (
            <p className="text-sm text-[#3a5070] flex items-center gap-2"><Loader size={13} className="animate-spin" /> Loading…</p>
          ) : teamMembers.length > 0 ? (
            <div className="divide-y divide-slate-100 border border-[#1e2d45] rounded-lg overflow-hidden">
              {teamMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    <p className="text-xs text-[#3a5070]">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.role === 'admin' ? 'bg-[#1a1535] text-[#d07af5]' : 'bg-[#162035] text-[#4a90d9]'}`}>
                      {m.role}
                    </span>
                    {m.role !== 'admin' && (
                      <button onClick={() => handleDeleteMember(m.id)} className="text-[#3a5070] hover:text-[#e05c5c] transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#3a5070]">No team members yet.</p>
          )}

          {/* Created credentials banner */}
          {createdCreds && (
            <div className="bg-[#0a2518] border border-[#0a4a2a] rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-emerald-800">Account created for {createdCreds.name} — share these credentials:</p>
              <div className="space-y-2">
                {[{ label: 'Email', value: createdCreds.email, field: 'email' as const }, { label: 'Password', value: createdCreds.password, field: 'password' as const }].map(({ label, value, field }) => (
                  <div key={field} className="flex items-center gap-2 bg-[#1a2335] border border-[#0a4a2a] rounded-lg px-3 py-2">
                    <span className="text-xs text-[#3a5070] w-16 flex-shrink-0">{label}</span>
                    <span className="text-sm font-mono text-white flex-1 truncate">{value}</span>
                    <button onClick={() => copyToClipboard(value, field)} className="text-[#5ce0a0] hover:text-[#4ab57a] flex-shrink-0">
                      {copiedField === field ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#5ce0a0]">Save the password now — it won't be shown again. The VA can change it after logging in.</p>
              <button onClick={() => setCreatedCreds(null)} className="text-xs text-[#4ab57a] hover:text-emerald-900 underline">Dismiss</button>
            </div>
          )}

          {/* Create new VA form */}
          <div className="border-t border-[#1e2d45] pt-4">
            <p className="text-sm font-medium text-[#b8d4f0] flex items-center gap-1.5 mb-3"><UserPlus size={14} className="text-[#4a90d9]" /> Create VA Account</p>
            <form onSubmit={handleCreateVA} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#b8d4f0] mb-1">First name</label>
                  <input value={newFirstName} onChange={e => setNewFirstName(e.target.value)} placeholder="Jane" className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
                </div>
                <div>
                  <label className="block text-xs text-[#b8d4f0] mb-1">Last name</label>
                  <input value={newLastName} onChange={e => setNewLastName(e.target.value)} placeholder="Smith" className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#b8d4f0] mb-1">Email *</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="va@yourcompany.com" required className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9]" />
              </div>
              <div>
                <label className="block text-xs text-[#b8d4f0] mb-1">Temporary password *</label>
                <div className="relative">
                  <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 characters" required className="w-full border border-[#1e2d45] rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] font-mono" />
                  <button type="button" onClick={() => setShowNewPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a5070] hover:text-[#b8d4f0]">
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              {createError && <p className="text-xs text-[#e05c5c] flex items-center gap-1"><XCircle size={12} /> {createError}</p>}
              <button type="submit" disabled={creating || !newEmail.trim() || !newPassword.trim()} className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                {creating ? <Loader size={13} className="animate-spin" /> : <UserPlus size={13} />}
                {creating ? 'Creating…' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Google Calendar */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-[#4a90d9]" />
          <h2 className="font-semibold text-white">Google Calendar</h2>
          {calendarUrl && (
            <span className="text-xs text-[#5ce0a0] bg-[#0a2518] border border-[#0a4a2a] px-2 py-0.5 rounded-full ml-auto">Connected</span>
          )}
        </div>
        <p className="text-sm text-[#b8d4f0]">Connect your Google Calendar to display upcoming meetings on the dashboard.</p>
        <input
          type="text"
          value={icalInput}
          onChange={e => { setIcalInput(e.target.value); setCalSaved(false); }}
          placeholder="https://calendar.google.com/calendar/ical/..."
          className="w-full border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        />
        <p className="text-xs text-[#3a5070]">In Google Calendar: Settings → Your calendar → "Secret address in iCal format".</p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveCalendar}
            disabled={!icalInput.trim() && !calendarUrl}
            className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {calSaved ? <CheckCircle size={14} /> : <Save size={14} />}
            {calSaved ? 'Saved!' : 'Save Calendar URL'}
          </button>
          {calendarUrl && (
            <button onClick={() => { setIcalInput(''); onSaveCalendarUrl(''); }} className="text-sm text-[#e05c5c] hover:text-[#e05c5c] border border-[#5a1a1a] hover:border-[#5a1a1a] px-3 py-2 rounded-lg transition-colors">Remove</button>
          )}
        </div>
      </div>

      {/* Slack Integration */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Hash size={18} className="text-[#d07af5]" />
          <h2 className="font-semibold text-white">Slack Feed</h2>
          {slackToken && channelList.length > 0 && (
            <span className="text-xs text-[#5ce0a0] bg-[#0a2518] border border-[#0a4a2a] px-2 py-0.5 rounded-full ml-auto">
              {channelList.length} channel{channelList.length > 1 ? 's' : ''} connected
            </span>
          )}
        </div>
        <p className="text-sm text-[#b8d4f0]">Show a live feed of your Zapier Slack notifications on the dashboard.</p>
        <div>
          <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Bot Token</label>
          <div className="relative">
            <input
              type={showSlackToken ? 'text' : 'password'}
              value={slackTokenInput}
              onChange={e => { setSlackTokenInput(e.target.value); setSlackSaved(false); }}
              placeholder="xoxb-..."
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button type="button" onClick={() => setShowSlackToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a5070] hover:text-[#b8d4f0]">
              {showSlackToken ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#b8d4f0] mb-2">Channels</label>
          {channelList.length > 0 && (
            <div className="space-y-2 mb-3">
              {channelList.map(ch => (
                <div key={ch.id} className="flex items-center gap-2 bg-[#2a1a35] border border-purple-200 rounded-lg px-3 py-2">
                  <Hash size={13} className="text-purple-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-purple-800 flex-1">{ch.name}</span>
                  <span className="text-xs text-[#d07af5] font-mono">{ch.id}</span>
                  <button type="button" onClick={() => handleRemoveChannel(ch.id)} className="text-purple-400 hover:text-[#e05c5c] transition-colors flex-shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="Name (e.g. zapier-leads)" className="flex-1 border border-[#1e2d45] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            <input type="text" value={newChannelId} onChange={e => setNewChannelId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddChannel(); }} placeholder="Channel ID (C...)" className="flex-1 border border-[#1e2d45] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400" />
            <button type="button" onClick={handleAddChannel} disabled={!newChannelId.trim()} className="bg-[#2a1a35] hover:bg-purple-200 disabled:opacity-40 text-purple-700 px-3 py-2 rounded-lg transition-colors flex-shrink-0"><Plus size={15} /></button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSaveSlack} disabled={!slackTokenInput.trim() || channelList.length === 0} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            {slackSaved ? <CheckCircle size={14} /> : <Save size={14} />}
            {slackSaved ? 'Saved!' : 'Save Slack Settings'}
          </button>
          {slackToken && (
            <button onClick={() => { setSlackTokenInput(''); setChannelList([]); onSaveSlackToken(''); onSaveSlackChannels([]); }} className="text-sm text-[#e05c5c] hover:text-[#e05c5c] border border-[#5a1a1a] hover:border-[#5a1a1a] px-3 py-2 rounded-lg transition-colors">Remove All</button>
          )}
        </div>
      </div>

      {/* Uplisting API Key */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-[#4a90d9]" />
          <h2 className="font-semibold text-white">Uplisting API Key</h2>
          {apiKey && <span className="text-xs text-[#5ce0a0] bg-[#0a2518] border border-[#0a4a2a] px-2 py-0.5 rounded-full ml-auto">Connected</span>}
        </div>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={inputKey}
            onChange={e => { setInputKey(e.target.value); setStatus('idle'); }}
            placeholder="Paste your Uplisting API key..."
            className="w-full border border-[#1e2d45] rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
          />
          <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a5070] hover:text-[#b8d4f0]">
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="text-xs text-[#3a5070]">Find your API key in Uplisting → Settings → API.</p>
        {status !== 'idle' && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            status === 'success' ? 'bg-[#0a2518] text-[#4ab57a]' :
            status === 'error'   ? 'bg-[#2a0e0e] text-[#e05c5c]' : 'bg-[#1e2d45] text-[#b8d4f0]'
          }`}>
            {status === 'testing' && <Loader size={14} className="animate-spin" />}
            {status === 'success' && <CheckCircle size={14} />}
            {status === 'error'   && <XCircle size={14} />}
            {status === 'testing' ? 'Testing connection...' : statusMsg}
          </div>
        )}
        <button onClick={handleTest} disabled={!inputKey.trim() || status === 'testing'} className="bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {apiKey && inputKey === apiKey ? 'Re-test Connection' : 'Save & Test Connection'}
        </button>
      </div>

      {/* Uplisting Sync */}
      {apiKey && (
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-3">
          <h2 className="font-semibold text-white">Uplisting Data Sync</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Properties synced', value: properties.length },
              { label: 'Reservations synced', value: reservations.length },
              { label: 'Last synced', value: fmtSync(lastSync) },
            ].map(s => (
              <div key={s.label} className="bg-[#1e2d45] rounded-lg p-3">
                <div className="text-lg font-bold text-white">{s.value}</div>
                <div className="text-xs text-[#b8d4f0]">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={() => { if (confirm('Clear all synced Uplisting data?')) onClearData(); }} className="flex items-center gap-2 border border-[#5a1a1a] text-[#e05c5c] hover:bg-[#2a0e0e] text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Trash2 size={14} /> Clear Synced Data
            </button>
          </div>
        </div>
      )}

      {/* Hostaway */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-violet-600" />
          <h2 className="font-semibold text-white">Hostaway</h2>
          {hostawayAccountId && hostawaySecret && (
            <span className="text-xs text-[#5ce0a0] bg-[#0a2518] border border-[#0a4a2a] px-2 py-0.5 rounded-full ml-auto">Connected</span>
          )}
        </div>
        <p className="text-sm text-[#b8d4f0]">Connect a Hostaway account to sync its properties and reservations into the CRM alongside Uplisting.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#b8d4f0] mb-1">Account ID</label>
            <input
              type="text"
              value={hostawayIdInput}
              onChange={e => { setHostawayIdInput(e.target.value); setHostawayStatus('idle'); }}
              placeholder="e.g. 12345"
              className="w-full border border-[#1e2d45] rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#b8d4f0] mb-1">API Secret</label>
            <div className="relative">
              <input
                type={showHostawaySecret ? 'text' : 'password'}
                value={hostawaySecretInput}
                onChange={e => { setHostawaySecretInput(e.target.value); setHostawayStatus('idle'); }}
                placeholder="Paste your Hostaway API secret..."
                className="w-full border border-[#1e2d45] rounded-lg px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button type="button" onClick={() => setShowHostawaySecret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a5070] hover:text-[#b8d4f0]">
                {showHostawaySecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-[#3a5070]">In Hostaway: Settings → API &amp; Integrations. Copy your Account ID and API Secret.</p>
        {hostawayStatus !== 'idle' && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            hostawayStatus === 'success' ? 'bg-[#0a2518] text-[#4ab57a]' :
            hostawayStatus === 'error'   ? 'bg-[#2a0e0e] text-[#e05c5c]' : 'bg-[#1e2d45] text-[#b8d4f0]'
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
        <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-3">
          <h2 className="font-semibold text-white">Hostaway Data Sync</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Properties synced', value: hostawayProperties.length },
              { label: 'Reservations synced', value: hostawayReservations.length },
              { label: 'Last synced', value: fmtSync(hostawayLastSync) },
            ].map(s => (
              <div key={s.label} className="bg-[#1e2d45] rounded-lg p-3">
                <div className="text-lg font-bold text-white">{s.value}</div>
                <div className="text-xs text-[#b8d4f0]">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleHostawaySync} disabled={hostawaySyncing} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <RefreshCw size={14} className={hostawaySyncing ? 'animate-spin' : ''} />
              {hostawaySyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={() => { if (confirm('Clear all synced Hostaway data?')) onClearHostawayData(); }} className="flex items-center gap-2 border border-[#5a1a1a] text-[#e05c5c] hover:bg-[#2a0e0e] text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Trash2 size={14} /> Clear Synced Data
            </button>
          </div>
        </div>
      )}

      {/* PriceLabs */}
      <div className="bg-[#1a2335] rounded-xl border border-[#1e2d45] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-[#4a90d9]" />
          <h2 className="font-semibold text-white">PriceLabs</h2>
          {priceLabsApiKey && <span className="ml-auto flex items-center gap-1 text-xs text-[#5ce0a0]"><CheckCircle size={12} /> Connected</span>}
        </div>
        <p className="text-sm text-[#b8d4f0]">Connect PriceLabs to pull portfolio performance data and get AI-powered pricing recommendations in Revenue Intelligence.</p>
        <div className="relative">
          <input
            type={showPlKey ? 'text' : 'password'}
            value={plKeyInput}
            onChange={e => setPlKeyInput(e.target.value)}
            placeholder="Paste your PriceLabs API key…"
            className="w-full pr-10 pl-3 py-2.5 border border-[#1e2d45] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] font-mono"
          />
          <button onClick={() => setShowPlKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a5070] hover:text-[#b8d4f0]">
            {showPlKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSavePriceLabs}
            disabled={!plKeyInput.trim() || plSaving}
            className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {plSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            {plSaved ? 'Saved!' : 'Save'}
          </button>
          {priceLabsApiKey && (
            <button onClick={() => { setPlKeyInput(''); onSavePriceLabsApiKey(''); }} className="text-sm text-[#e05c5c] hover:text-[#e05c5c] border border-[#5a1a1a] hover:border-[#5a1a1a] px-3 py-2 rounded-lg transition-colors">
              Remove
            </button>
          )}
        </div>
        {plSaveError && <p className="text-xs text-[#e05c5c]">{plSaveError}</p>}
        <p className="text-xs text-[#3a5070]">In PriceLabs: Account → API → Generate API Key.</p>
      </div>

      {/* Meta */}
      <MetaConnect />

      {/* Help */}
      <div className="bg-[#162035] border border-[#1e3a5a] rounded-xl p-4 text-sm text-[#6ab0f5] space-y-1">
        <p className="font-semibold">How to find your Uplisting API key</p>
        <ol className="list-decimal list-inside space-y-0.5 text-[#6ab0f5]">
          <li>Log in to Uplisting at app.uplisting.io</li>
          <li>Go to Settings → Integrations or API</li>
          <li>Copy your API key and paste it above</li>
        </ol>
      </div>
    </div>
  );
}

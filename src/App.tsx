import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import LoginPage from './components/LoginPage';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Pipeline from './components/Pipeline';
import Owners from './components/Owners';
import OwnerDetail from './components/OwnerDetail';
import OutreachLog from './components/OutreachLog';
import Settings from './components/Settings';
import VAHub from './components/VAHub';
import DriveView from './components/DriveView';
import RevenueReports from './components/RevenueReports';
import ListingOptimizer from './components/ListingOptimizer';
import Newsletter from './components/Newsletter';
import GuestMarketing from './components/GuestMarketing';
import QuarterlyReports from './components/QuarterlyReports';
import Properties from './components/Properties';
import PropertyPortal from './components/PropertyPortal';
import CalendarIntelligence from './components/CalendarIntelligence';
import EmailTracking from './components/EmailTracking';
import DealScanner from './components/DealScanner';
import LeadCampaigns from './components/LeadCampaigns';
import SmsView from './components/cleaning/SmsView';
import ShareView from './components/ShareView';
import PortalView from './components/PortalView';
import OwnerPortalPage from './components/OwnerPortalPage';
import OnboardingPage from './components/OnboardingPage';
import CleanerPortalPage from './components/CleanerPortalPage';
import CleanerDashboard from './components/CleanerDashboard';
import CleaningClientOnboardingPage from './components/CleaningClientOnboardingPage';
import CleanerOnboardingPage from './components/CleanerOnboardingPage';
import CleanerSetupPage from './components/CleanerSetupPage';
import CleanerConnectPage from './components/CleanerConnectPage';
import ModeSelector from './components/ModeSelector';
import LeadModal from './components/modals/LeadModal';
import LeadDetailModal from './components/modals/LeadDetailModal';
import OwnerModal from './components/modals/OwnerModal';
import PropertyModal from './components/modals/PropertyModal';
import OutreachModal from './components/modals/OutreachModal';
import { useSupabaseCache } from './hooks/useSupabaseCache';
import {
  fetchLeads, upsertLead, deleteLead,
  fetchOwners, upsertOwner, deleteOwner, archiveOwner,
  upsertProperty, deleteProperty,
  fetchOutreach, upsertOutreach, deleteOutreach,
} from './services/db';
import { fetchContacts } from './services/contacts';
import ESign from './components/ESign';
import ContentStudio from './components/ContentStudio';
import CleaningBusiness from './components/cleaning/CleaningBusiness';
import { fetchWarmupEntries, upsertWarmupEntry, deleteWarmupEntry } from './services/warmup';
import type { WarmupEntry } from './services/warmup';
import {
  fetchProjects, upsertProject, deleteProject as deleteProjectDb,
  fetchTodos, upsertTodo, deleteTodo,
} from './services/projects';
import { fetchProperties, fetchReservations, estimateMonthlyRevenue, estimateOccupancy } from './services/uplisting';
import { fetchHostawayProperties, fetchHostawayReservations } from './services/hostaway';
import { fetchSettings, saveSettings } from './services/settings';
import type { Lead, Owner, Property, OutreachEntry, View, Project, Todo, Contact } from './types';
import type { UplistingProperty, UplistingReservation } from './services/uplisting';
import type { SlackChannel } from './services/settings';

type Modal =
  | { type: 'lead'; lead?: Lead }
  | { type: 'lead-detail'; lead: Lead }
  | { type: 'owner'; owner?: Owner }
  | { type: 'property'; ownerId: string; property?: Property }
  | { type: 'outreach'; entry?: OutreachEntry; preselectedOwnerId?: string }
  | null;

export default function App() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const isAdmin = (user?.publicMetadata?.role as string) === 'admin';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [outreach, setOutreach] = useState<OutreachEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [warmupEntries, setWarmupEntries] = useState<WarmupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings stored in Supabase (shared across devices)
  const [uplistingApiKey, setUplistingApiKey] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');
  const [slackToken, setSlackToken] = useState('');
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [hostawayAccountId, setHostawayAccountId] = useState('');
  const [hostawaySecret, setHostawaySecret] = useState('');
  const [priceLabsApiKey, setPriceLabsApiKey] = useState('');

  // Uplisting cached data (Supabase app_cache)
  const [uplistingProperties, setUplistingProperties] = useSupabaseCache<UplistingProperty[]>('ej_uplisting_properties', []);
  const [uplistingReservations, setUplistingReservations] = useSupabaseCache<UplistingReservation[]>('ej_uplisting_reservations', []);
  const [lastSync, setLastSync] = useSupabaseCache<string | null>('ej_uplisting_last_sync', null);

  // Hostaway cached data (Supabase app_cache)
  const [hostawayProperties, setHostawayProperties] = useSupabaseCache<UplistingProperty[]>('ej_hostaway_properties', []);
  const [hostawayReservations, setHostawayReservations] = useSupabaseCache<UplistingReservation[]>('ej_hostaway_reservations', []);
  const [hostawayLastSync, setHostawayLastSync] = useSupabaseCache<string | null>('ej_hostaway_last_sync', null);

  // Merged arrays — passed to all views so both PMS sources appear everywhere
  const allProperties  = useMemo(() => [...uplistingProperties,  ...hostawayProperties],  [uplistingProperties,  hostawayProperties]);
  const allReservations = useMemo(() => [...uplistingReservations, ...hostawayReservations], [uplistingReservations, hostawayReservations]);

  const [mode, setMode] = useState<'property' | 'cleaning' | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  // Load all data from Supabase on mount
  useEffect(() => {
    async function loadAll() {
      try {
        const [l, o, out, proj, td, settings, cts, wu] = await Promise.all([
          fetchLeads(),
          fetchOwners(),
          fetchOutreach(),
          fetchProjects(),
          fetchTodos(),
          fetchSettings(),
          fetchContacts().catch(() => [] as Contact[]),
          fetchWarmupEntries().catch(() => [] as WarmupEntry[]),
        ]);
        setLeads(l);
        setOwners(o);
        setOutreach(out);
        setProjects(proj);
        setTodos(td);
        setContacts(cts);
        setWarmupEntries(wu);
        setUplistingApiKey(settings.uplistingApiKey);
        setCalendarUrl(settings.calendarUrl);
        setSlackToken(settings.slackToken);
        setSlackChannels(settings.slackChannels);
        setHostawayAccountId(settings.hostawayAccountId);
        setHostawaySecret(settings.hostawaySecret);
        setPriceLabsApiKey(settings.priceLabsApiKey);
      } catch (e) {
        setError('Failed to load data. Check your Supabase connection.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  const navigate = (v: View, extra?: string) => {
    setView(v);
    if (v === 'owner-detail' && extra) setSelectedOwnerId(extra);
    if (v === 'property-portal' && extra) {
      const [ownerId, propertyId] = extra.split('::');
      setSelectedOwnerId(ownerId);
      setSelectedPropertyId(propertyId);
    }
  };

  // Uplisting sync
  const handleSync = useCallback(async () => {
    if (!uplistingApiKey) return;
    try {
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      const ninetyDaysAhead = new Date(today);
      ninetyDaysAhead.setDate(today.getDate() + 90);
      const props = await fetchProperties(uplistingApiKey);
      const res = await fetchReservations(
        uplistingApiKey,
        oneYearAgo.toISOString().slice(0, 10),
        ninetyDaysAhead.toISOString().slice(0, 10),
        props,
      );
      setUplistingProperties(props);
      setUplistingReservations(res);
      setLastSync(new Date().toISOString());

      setOwners(prev => prev.map(owner => {
        const updatedProps = owner.properties.map(prop => {
          const parts = prop.id.split('_');
          const uplistingId = parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
          if (!uplistingId) return prop;
          const monthlyRevenue = estimateMonthlyRevenue(uplistingId, res);
          const occupancyRate  = estimateOccupancy(uplistingId, res);
          if (monthlyRevenue === prop.monthlyRevenue && occupancyRate === prop.occupancyRate) return prop;
          const updated = { ...prop, monthlyRevenue, occupancyRate };
          upsertProperty(owner.id, updated);
          return updated;
        });
        return { ...owner, properties: updatedProps };
      }));
    } catch {
      // sync errors shown in Settings
    }
  }, [uplistingApiKey, setUplistingProperties, setUplistingReservations, setLastSync]);

  useEffect(() => {
    if (!uplistingApiKey) return;
    handleSync();
  }, [uplistingApiKey, handleSync]);

  // Hostaway sync
  const handleHostawaySync = useCallback(async () => {
    if (!hostawayAccountId || !hostawaySecret) return;
    try {
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      const ninetyDaysAhead = new Date(today);
      ninetyDaysAhead.setDate(today.getDate() + 90);
      const [props, resv] = await Promise.all([
        fetchHostawayProperties(hostawayAccountId, hostawaySecret),
        fetchHostawayReservations(
          hostawayAccountId, hostawaySecret,
          oneYearAgo.toISOString().slice(0, 10),
          ninetyDaysAhead.toISOString().slice(0, 10),
        ),
      ]);
      setHostawayProperties(props);
      setHostawayReservations(resv);
      setHostawayLastSync(new Date().toISOString());

      setOwners(prev => prev.map(owner => {
        const updatedProps = owner.properties.map(prop => {
          const parts = prop.id.split('_');
          const hostawayId = parts[0] === 'p' && parts.length >= 3 ? parts.slice(2).join('_') : null;
          if (!hostawayId) return prop;
          const monthlyRevenue = estimateMonthlyRevenue(hostawayId, resv);
          const occupancyRate  = estimateOccupancy(hostawayId, resv);
          if (monthlyRevenue === prop.monthlyRevenue && occupancyRate === prop.occupancyRate) return prop;
          const updated = { ...prop, monthlyRevenue, occupancyRate };
          upsertProperty(owner.id, updated);
          return updated;
        });
        return { ...owner, properties: updatedProps };
      }));
    } catch {
      // sync errors shown in Settings
    }
  }, [hostawayAccountId, hostawaySecret, setHostawayProperties, setHostawayReservations, setHostawayLastSync]);

  useEffect(() => {
    if (!hostawayAccountId || !hostawaySecret) return;
    handleHostawaySync();
  }, [hostawayAccountId, hostawaySecret, handleHostawaySync]);

  // Settings save handlers
  const handleSaveApiKey = async (key: string) => {
    setUplistingApiKey(key);
    await saveSettings({ uplistingApiKey: key });
  };
  const handleSaveCalendarUrl = async (url: string) => {
    setCalendarUrl(url);
    await saveSettings({ calendarUrl: url });
  };
  const handleSaveSlackToken = async (token: string) => {
    setSlackToken(token);
    await saveSettings({ slackToken: token });
  };
  const handleSaveSlackChannels = async (channels: SlackChannel[]) => {
    setSlackChannels(channels);
    await saveSettings({ slackChannels: channels });
  };
  const handleSaveHostawayCredentials = async (id: string, secret: string) => {
    setHostawayAccountId(id);
    setHostawaySecret(secret);
    await saveSettings({ hostawayAccountId: id, hostawaySecret: secret });
  };
  const handleSavePriceLabsApiKey = async (key: string) => {
    setPriceLabsApiKey(key);
    await saveSettings({ priceLabsApiKey: key });
  };

  // Auto-create client from won lead
  const autoCreateClientFromLead = async (lead: Lead, currentOwners: Owner[]) => {
    const alreadyExists = currentOwners.some(
      o => o.email && lead.email && o.email.toLowerCase() === lead.email.toLowerCase()
    );
    if (alreadyExists) return;
    const newOwner: Owner = {
      id: `o_${Date.now()}`,
      name: lead.name,
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      source: lead.source,
      notes: lead.notes ?? '',
      properties: [],
      createdAt: new Date().toISOString(),
    };
    await upsertOwner(newOwner);
    setOwners(prev => [newOwner, ...prev]);
  };

  // Lead CRUD
  const saveLeadHandler = async (lead: Lead) => {
    const prevLead = leads.find(l => l.id === lead.id);
    await upsertLead(lead);
    setLeads(prev => {
      const exists = prev.find(l => l.id === lead.id);
      return exists ? prev.map(l => l.id === lead.id ? lead : l) : [lead, ...prev];
    });
    if (lead.stage === 'won' && prevLead?.stage !== 'won') {
      await autoCreateClientFromLead(lead, owners);
    }
    setModal(null);
  };

  // Owner CRUD
  const saveOwnerHandler = async (owner: Owner) => {
    await upsertOwner(owner);
    setOwners(prev => {
      const exists = prev.find(o => o.id === owner.id);
      return exists ? prev.map(o => o.id === owner.id ? owner : o) : [owner, ...prev];
    });
    setModal(null);
  };
  const updateOwnerHandler = async (owner: Owner) => {
    await upsertOwner(owner);
    setOwners(prev => prev.map(o => o.id === owner.id ? owner : o));
  };
  const deleteOwnerHandler = async (id: string) => {
    if (!confirm('Permanently delete this client? This cannot be undone.')) return;
    await deleteOwner(id);
    setOwners(prev => prev.filter(o => o.id !== id));
  };
  const archiveOwnerHandler = async (id: string, archived: boolean) => {
    // Optimistic update so UI responds immediately
    setOwners(prev => prev.map(o => o.id === id ? { ...o, archived } : o));
    try {
      await archiveOwner(id, archived);
    } catch (err) {
      // Roll back on failure
      setOwners(prev => prev.map(o => o.id === id ? { ...o, archived: !archived } : o));
      console.error('Archive failed:', err);
      alert(
        'Could not archive client. If this is the first time using this feature, run this SQL in your Supabase dashboard:\n\n' +
        'ALTER TABLE owners ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;\n\n' +
        'Then try again.'
      );
    }
  };

  // Property CRUD
  const savePropertyHandler = async (ownerId: string, property: Property) => {
    // Find previous status to detect onboarding transitions
    const prevOwner = owners.find(o => o.id === ownerId);
    const prevStatus = prevOwner?.properties.find(p => p.id === property.id)?.status;

    await upsertProperty(ownerId, property);
    setOwners(prev => prev.map(o => {
      if (o.id !== ownerId) return o;
      const exists = o.properties.find(p => p.id === property.id);
      return {
        ...o,
        properties: exists
          ? o.properties.map(p => p.id === property.id ? property : p)
          : [...o.properties, property],
      };
    }));

    // Auto-manage onboarding todo
    const existingTodo = todos.find(t => t.linkedPropertyId === property.id && !t.completed);
    if (property.status === 'onboarding' && prevStatus !== 'onboarding' && !existingTodo) {
      // Becoming onboarding — create in-progress todo for Ethan
      const owner = owners.find(o => o.id === ownerId);
      const now = new Date().toISOString();
      const todo: Todo = {
        id: `todo_${Date.now()}`,
        text: `Onboarding: ${property.address}${owner ? ` (${owner.name})` : ''}`,
        completed: false,
        inProgress: true,
        assignedTo: 'ethan',
        priority: 'high',
        createdAt: now,
        updatedAt: now,
        linkedOwnerId: ownerId,
        linkedPropertyId: property.id,
      };
      await handleAddTodo(todo);
    } else if (property.status !== 'onboarding' && existingTodo) {
      // Leaving onboarding — mark todo complete
      await handleToggleTodo({ ...existingTodo, completed: true, inProgress: false, updatedAt: new Date().toISOString() });
    }

    setModal(null);
  };
  const deletePropertyHandler = async (ownerId: string, propertyId: string) => {
    await deleteProperty(propertyId);
    setOwners(prev => prev.map(o =>
      o.id === ownerId ? { ...o, properties: o.properties.filter(p => p.id !== propertyId) } : o
    ));
  };
  const importPropertiesHandler = async (ownerId: string, properties: Property[]) => {
    for (const property of properties) {
      await upsertProperty(ownerId, property);
    }
    setOwners(prev => prev.map(o => {
      if (o.id !== ownerId) return o;
      const existingIds = new Set(o.properties.map(p => p.id));
      const newProps = properties.filter(p => !existingIds.has(p.id));
      return { ...o, properties: [...o.properties, ...newProps] };
    }));
  };

  // Outreach CRUD
  const saveOutreachHandler = async (entry: OutreachEntry) => {
    await upsertOutreach(entry);
    setOutreach(prev => {
      const exists = prev.find(e => e.id === entry.id);
      return exists ? prev.map(e => e.id === entry.id ? entry : e) : [entry, ...prev];
    });
    setModal(null);
  };

  // Project CRUD
  const handleAddProject = async (project: Project) => {
    await upsertProject(project);
    setProjects(prev => [project, ...prev]);
  };
  const handleUpdateProject = async (project: Project) => {
    await upsertProject(project);
    setProjects(prev => prev.map(p => p.id === project.id ? project : p));
  };
  const handleDeleteProject = async (id: string) => {
    await deleteProjectDb(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  // Todo CRUD
  const handleAddTodo = async (todo: Todo) => {
    await upsertTodo(todo);
    setTodos(prev => [todo, ...prev]);
  };
  const handleToggleTodo = async (todo: Todo) => {
    await upsertTodo(todo);
    setTodos(prev => prev.map(t => t.id === todo.id ? todo : t));
  };
  const handleDeleteTodo = async (id: string) => {
    await deleteTodo(id);
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  // Bulk import
  const handleWarmupAdd = async (e: WarmupEntry) => {
    setWarmupEntries(prev => [...prev, e]);
    await upsertWarmupEntry(e).catch(() => {});
  };

  const handleWarmupRemove = async (id: string) => {
    setWarmupEntries(prev => prev.filter(e => e.id !== id));
    await deleteWarmupEntry(id).catch(() => {});
  };

  const handleWarmupTogglePause = async (id: string) => {
    const entry = warmupEntries.find(e => e.id === id);
    if (!entry) return;
    const days = Math.max(0, Math.floor((Date.now() - new Date(entry.startDate).getTime()) / 86_400_000));
    let newStatus: WarmupEntry['status'];
    if (entry.status === 'paused') newStatus = days >= 42 ? 'ready' : 'warming';
    else if (entry.status === 'warming') newStatus = 'paused';
    else newStatus = entry.status;
    const updated = { ...entry, status: newStatus };
    setWarmupEntries(prev => prev.map(e => e.id === id ? updated : e));
    await upsertWarmupEntry(updated).catch(() => {});
  };

  const handleWarmupUpdate = async (updated: WarmupEntry) => {
    setWarmupEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    await upsertWarmupEntry(updated).catch(() => {});
  };

  const warmupAddresses = warmupEntries
    .filter(e => e.status !== 'paused')
    .map(e => e.email);

  const importLeadsHandler = async (newLeads: Lead[]) => {
    await Promise.all(newLeads.map(upsertLead));
    setLeads(prev => [...newLeads, ...prev]);
  };

  // Bulk handlers
  const updateLeadsHandler = async (updated: Lead[]) => {
    const deleted = leads.filter(l => !updated.find(u => u.id === l.id));
    const changed = updated.filter(l => {
      const orig = leads.find(o => o.id === l.id);
      return !orig || l.stage !== orig.stage || l.updatedAt !== orig.updatedAt;
    });
    const newlyWon = updated.filter(l => {
      const orig = leads.find(o => o.id === l.id);
      return l.stage === 'won' && orig?.stage !== 'won';
    });
    setLeads(updated);
    await Promise.all([
      ...deleted.map(l => deleteLead(l.id)),
      ...changed.map(upsertLead),
    ]);
    for (const lead of newlyWon) {
      await autoCreateClientFromLead(lead, owners);
    }
  };
  const updateOutreachHandler = async (updated: OutreachEntry[]) => {
    const removed = outreach.filter(e => !updated.find(u => u.id === e.id));
    setOutreach(updated);
    await Promise.all(removed.map(e => deleteOutreach(e.id)));
  };

  const selectedOwner = owners.find(o => o.id === selectedOwnerId);
  const uplistingConnected = !!uplistingApiKey;

  // Public share/portal links — render without auth
  const searchParams = new URLSearchParams(window.location.search);
  const shareId = searchParams.get('share');
  if (shareId) return <ShareView reportId={shareId} />;
  const portalId = searchParams.get('portal');
  if (portalId) return <PortalView personId={portalId} />;
  const ownerPortalToken = searchParams.get('owner-portal');
  if (ownerPortalToken) return <OwnerPortalPage token={ownerPortalToken} />;
  const onboardingToken = searchParams.get('onboarding');
  if (onboardingToken) return <OnboardingPage token={onboardingToken} />;
  const cleanerParam = searchParams.get('cleaner');
  if (cleanerParam) return <CleanerPortalPage combined={cleanerParam} />;
  const cleanerDashboardParam = searchParams.get('cleaner-dashboard');
  if (cleanerDashboardParam) return <CleanerDashboard combined={cleanerDashboardParam} />;
  const cleaningOnboardToken = searchParams.get('cleaning-onboard');
  if (cleaningOnboardToken) return <CleaningClientOnboardingPage token={cleaningOnboardToken} />;
  const cleanerOnboardToken = searchParams.get('cleaner-onboard');
  if (cleanerOnboardToken) return <CleanerOnboardingPage token={cleanerOnboardToken} />;
  const cleanerSetupParam = searchParams.get('cleaner-setup');
  if (cleanerSetupParam) return <CleanerSetupPage combined={cleanerSetupParam} />;
  const cleanerConnectedParam = searchParams.get('cleaner-connected');
  if (cleanerConnectedParam) return <CleanerConnectPage combined={cleanerConnectedParam} />;

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1e2d45]">
        <div className="text-[#b8d4f0] text-sm">Loading...</div>
      </div>
    );
  }
  if (!isSignedIn) return <LoginPage />;

  function selectMode(m: 'property' | 'cleaning') {
    setMode(m);
    setView(m === 'cleaning' ? 'cleaning-dashboard' : 'dashboard');
  }

  if (mode === null) {
    return <ModeSelector onSelect={selectMode} />;
  }
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1e2d45]">
        <div className="text-[#b8d4f0] text-sm">Loading CRM data...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#1e2d45]">
        <div className="bg-[#2a0e0e] border border-[#5a1a1a] text-[#e05c5c] px-6 py-4 rounded-xl text-sm max-w-md text-center">
          {error}
        </div>
      </div>
    );
  }

  return (
    <Layout currentView={view} onNavigate={navigate} isAdmin={isAdmin} mode={mode!} onSelectMode={selectMode} onGoHome={() => setMode(null)}>
      {view === 'dashboard' && (
        <Dashboard
          leads={leads}
          owners={owners}
          outreach={outreach}
          todos={todos}
          calendarUrl={calendarUrl}
          slackToken={slackToken}
          slackChannels={slackChannels}
          onNavigate={navigate}
          onToggleTodo={handleToggleTodo}
          onAddTodo={handleAddTodo}
          onOpenLeadDetail={(lead) => setModal({ type: 'lead-detail', lead })}
          uplistingConnected={uplistingConnected}
          uplistingProperties={allProperties}
          uplistingReservations={allReservations}
          lastSync={lastSync}
          onSync={handleSync}
        />
      )}

      {view === 'pipeline' && (
        <Pipeline
          leads={leads}
          onUpdateLeads={updateLeadsHandler}
          onOpenLeadModal={(lead) => setModal({ type: 'lead', lead })}
          onOpenLeadDetail={(lead) => setModal({ type: 'lead-detail', lead })}
          onImportLeads={importLeadsHandler}
        />
      )}

      {view === 'owners' && (
        <Owners
          owners={owners}
          onViewOwner={(id) => navigate('owner-detail', id)}
          onOpenOwnerModal={(owner) => setModal({ type: 'owner', owner })}
          onDeleteOwner={deleteOwnerHandler}
          onArchiveOwner={archiveOwnerHandler}
        />
      )}

      {view === 'owner-detail' && selectedOwner && (
        <OwnerDetail
          owner={selectedOwner}
          outreach={outreach}
          onBack={() => navigate('owners')}
          onEdit={() => setModal({ type: 'owner', owner: selectedOwner })}
          onAddProperty={() => setModal({ type: 'property', ownerId: selectedOwner.id })}
          onEditProperty={(property) => setModal({ type: 'property', ownerId: selectedOwner.id, property })}
          onDeleteProperty={(propertyId) => deletePropertyHandler(selectedOwner.id, propertyId)}
          onAddOutreach={() => setModal({ type: 'outreach', preselectedOwnerId: selectedOwner.id })}
          uplistingApiKey={uplistingApiKey || undefined}
          hostawayAccountId={hostawayAccountId || undefined}
          hostawaySecret={hostawaySecret || undefined}
          onImportProperties={(properties) => importPropertiesHandler(selectedOwner.id, properties)}
          reservations={allReservations}
          onUpdateOwner={updateOwnerHandler}
          onNavigateToProperty={(ownerId, propertyId) => navigate('property-portal', `${ownerId}::${propertyId}`)}
        />
      )}

      {view === 'outreach' && (
        <OutreachLog
          outreach={outreach}
          onUpdateOutreach={updateOutreachHandler}
          onOpenOutreachModal={(entry) => setModal({ type: 'outreach', entry })}
        />
      )}

      {view === 'settings' && (
        <Settings
          apiKey={uplistingApiKey}
          onSaveApiKey={handleSaveApiKey}
          calendarUrl={calendarUrl}
          onSaveCalendarUrl={handleSaveCalendarUrl}
          slackToken={slackToken}
          onSaveSlackToken={handleSaveSlackToken}
          slackChannels={slackChannels}
          onSaveSlackChannels={handleSaveSlackChannels}
          lastSync={lastSync}
          properties={uplistingProperties}
          reservations={uplistingReservations}
          onSync={handleSync}
          onClearData={() => {
            setUplistingProperties([]);
            setUplistingReservations([]);
            setLastSync(null);
          }}
          hostawayAccountId={hostawayAccountId}
          hostawaySecret={hostawaySecret}
          onSaveHostawayCredentials={handleSaveHostawayCredentials}
          hostawayLastSync={hostawayLastSync}
          hostawayProperties={hostawayProperties}
          hostawayReservations={hostawayReservations}
          onHostawaySync={handleHostawaySync}
          onClearHostawayData={() => {
            setHostawayProperties([]);
            setHostawayReservations([]);
            setHostawayLastSync(null);
          }}
          priceLabsApiKey={priceLabsApiKey}
          onSavePriceLabsApiKey={handleSavePriceLabsApiKey}
          isAdmin={isAdmin}
        />
      )}

      {view === 'va-hub' && (
        <VAHub
          projects={projects}
          todos={todos}
          slackToken={slackToken}
          slackChannels={slackChannels}
          onAddProject={handleAddProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onAddTodo={handleAddTodo}
          onToggleTodo={handleToggleTodo}
          onDeleteTodo={handleDeleteTodo}
          onNavigate={navigate}
        />
      )}

      {view === 'drive' && <DriveView isAdmin={isAdmin} />}

      {view === 'revenue-reports' && (
        <RevenueReports leads={leads} owners={owners} onUpdateLead={saveLeadHandler} />
      )}

      {view === 'listing-optimizer' && <ListingOptimizer />}

      {view === 'newsletter' && <Newsletter leads={leads} owners={owners} />}

      {view === 'guest-marketing' && (
        <GuestMarketing reservations={allReservations} apiKey={uplistingApiKey || undefined} warmupAddresses={warmupAddresses} />
      )}

      {view === 'quarterly-reports' && (
        <QuarterlyReports owners={owners} reservations={allReservations} />
      )}

      {view === 'properties' && (
        <Properties
          owners={owners}
          reservations={allReservations}
          uplistingProperties={allProperties}
          onViewProperty={(ownerId, propertyId) => navigate('property-portal', `${ownerId}::${propertyId}`)}
        />
      )}

      {(() => {
        if (view !== 'property-portal') return null;
        const portalOwner    = owners.find(o => o.id === selectedOwnerId);
        const portalProperty = portalOwner?.properties.find(p => p.id === selectedPropertyId);
        if (!portalOwner || !portalProperty) return null;
        return (
          <PropertyPortal
            owner={portalOwner}
            property={portalProperty}
            reservations={allReservations}
            uplistingProperties={allProperties}
            onBack={() => navigate('properties')}
            onViewOwner={(ownerId) => navigate('owner-detail', ownerId)}
            onUpdateProperty={(p) => savePropertyHandler(portalOwner.id, p)}
            onUpdateOwner={updateOwnerHandler}
          />
        );
      })()}

      {view === 'calendar-intel' && (
        <CalendarIntelligence owners={owners} reservations={allReservations} priceLabsApiKey={priceLabsApiKey || undefined} />
      )}

      {view === 'email-tracking' && (
        <EmailTracking
          warmupEntries={warmupEntries}
          onWarmupAdd={handleWarmupAdd}
          onWarmupRemove={handleWarmupRemove}
          onWarmupTogglePause={handleWarmupTogglePause}
          onWarmupUpdate={handleWarmupUpdate}
        />
      )}

      {view === 'deal-scanner' && <DealScanner />}

      {view === 'campaigns' && (
        <LeadCampaigns
          leads={leads}
          contacts={contacts}
          onContactsChange={setContacts}
          warmupAddresses={warmupAddresses}
        />
      )}

      {view === 'sms-outreach' && <SmsView />}

      {view === 'esign' && (
        <ESign userId={user?.id ?? 'crm'} />
      )}

      {view === 'content-studio' && (
        <ContentStudio />
      )}

      {(view === 'cleaning-dashboard' || view === 'cleaning-schedule' || view === 'cleaning-jobs' ||
        view === 'cleaning-properties' || view === 'cleaning-cleaners' || view === 'cleaning-payments' || view === 'cleaning-leads' || view === 'cleaning-sops' || view === 'cleaning-email' || view === 'cleaning-scraper' || view === 'cleaning-marketing') && (
        <CleaningBusiness
          currentView={view}
          onNavigate={navigate}
          reservations={allReservations}
          uplistingProperties={allProperties}
        />
      )}

      {modal?.type === 'lead-detail' && (
        <LeadDetailModal
          lead={modal.lead}
          onEdit={() => setModal({ type: 'lead', lead: modal.lead })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'lead' && (
        <LeadModal lead={modal.lead} onSave={saveLeadHandler} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'owner' && (
        <OwnerModal owner={modal.owner} onSave={saveOwnerHandler} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'property' && (
        <PropertyModal
          property={modal.property}
          onSave={(property) => savePropertyHandler(modal.ownerId, property)}
          onClose={() => setModal(null)}
          uplistingProperties={allProperties}
        />
      )}
      {modal?.type === 'outreach' && (
        <OutreachModal
          entry={modal.entry}
          preselectedOwnerId={modal.preselectedOwnerId}
          leads={leads}
          owners={owners}
          onSave={saveOutreachHandler}
          onClose={() => setModal(null)}
        />
      )}
    </Layout>
  );
}

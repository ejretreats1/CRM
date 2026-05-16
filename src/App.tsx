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
import LeadModal from './components/modals/LeadModal';
import LeadDetailModal from './components/modals/LeadDetailModal';
import OwnerModal from './components/modals/OwnerModal';
import PropertyModal from './components/modals/PropertyModal';
import OutreachModal from './components/modals/OutreachModal';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  fetchLeads, upsertLead, deleteLead,
  fetchOwners, upsertOwner, deleteOwner,
  upsertProperty, deleteProperty,
  fetchOutreach, upsertOutreach, deleteOutreach,
} from './services/db';
import {
  fetchProjects, upsertProject, deleteProject as deleteProjectDb,
  fetchTodos, upsertTodo, deleteTodo,
} from './services/projects';
import { fetchProperties, fetchReservations, estimateMonthlyRevenue, estimateOccupancy } from './services/uplisting';
import { fetchHostawayProperties, fetchHostawayReservations } from './services/hostaway';
import { fetchSettings, saveSettings } from './services/settings';
import type { Lead, Owner, Property, OutreachEntry, View, Project, Todo } from './types';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings stored in Supabase (shared across devices)
  const [uplistingApiKey, setUplistingApiKey] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');
  const [slackToken, setSlackToken] = useState('');
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [hostawayAccountId, setHostawayAccountId] = useState('');
  const [hostawaySecret, setHostawaySecret] = useState('');

  // Uplisting cached data (device-local)
  const [uplistingProperties, setUplistingProperties] = useLocalStorage<UplistingProperty[]>('ej_uplisting_properties', []);
  const [uplistingReservations, setUplistingReservations] = useLocalStorage<UplistingReservation[]>('ej_uplisting_reservations', []);
  const [lastSync, setLastSync] = useLocalStorage<string | null>('ej_uplisting_last_sync', null);

  // Hostaway cached data (device-local)
  const [hostawayProperties, setHostawayProperties] = useLocalStorage<UplistingProperty[]>('ej_hostaway_properties', []);
  const [hostawayReservations, setHostawayReservations] = useLocalStorage<UplistingReservation[]>('ej_hostaway_reservations', []);
  const [hostawayLastSync, setHostawayLastSync] = useLocalStorage<string | null>('ej_hostaway_last_sync', null);

  // Merged arrays — passed to all views so both PMS sources appear everywhere
  const allProperties  = useMemo(() => [...uplistingProperties,  ...hostawayProperties],  [uplistingProperties,  hostawayProperties]);
  const allReservations = useMemo(() => [...uplistingReservations, ...hostawayReservations], [uplistingReservations, hostawayReservations]);

  const [view, setView] = useState<View>('dashboard');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  // Load all data from Supabase on mount
  useEffect(() => {
    async function loadAll() {
      try {
        const [l, o, out, proj, td, settings] = await Promise.all([
          fetchLeads(),
          fetchOwners(),
          fetchOutreach(),
          fetchProjects(),
          fetchTodos(),
          fetchSettings(),
        ]);
        setLeads(l);
        setOwners(o);
        setOutreach(out);
        setProjects(proj);
        setTodos(td);
        setUplistingApiKey(settings.uplistingApiKey);
        setCalendarUrl(settings.calendarUrl);
        setSlackToken(settings.slackToken);
        setSlackChannels(settings.slackChannels);
        setHostawayAccountId(settings.hostawayAccountId);
        setHostawaySecret(settings.hostawaySecret);
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
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const ninetyDaysAhead = new Date(today);
      ninetyDaysAhead.setDate(today.getDate() + 90);
      const [props, res] = await Promise.all([
        fetchProperties(uplistingApiKey),
        fetchReservations(
          uplistingApiKey,
          thirtyDaysAgo.toISOString().slice(0, 10),
          ninetyDaysAhead.toISOString().slice(0, 10),
        ),
      ]);
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
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const ninetyDaysAhead = new Date(today);
      ninetyDaysAhead.setDate(today.getDate() + 90);
      const [props, resv] = await Promise.all([
        fetchHostawayProperties(hostawayAccountId, hostawaySecret),
        fetchHostawayReservations(
          hostawayAccountId, hostawaySecret,
          thirtyDaysAgo.toISOString().slice(0, 10),
          ninetyDaysAhead.toISOString().slice(0, 10),
        ),
      ]);
      setHostawayProperties(props);
      setHostawayReservations(resv);
      setHostawayLastSync(new Date().toISOString());
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
    if (!confirm('Delete this client? This cannot be undone.')) return;
    await deleteOwner(id);
    setOwners(prev => prev.filter(o => o.id !== id));
  };

  // Property CRUD
  const savePropertyHandler = async (ownerId: string, property: Property) => {
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

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }
  if (!isSignedIn) return <LoginPage />;
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-slate-500 text-sm">Loading CRM data...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl text-sm max-w-md text-center">
          {error}
        </div>
      </div>
    );
  }

  return (
    <Layout currentView={view} onNavigate={navigate} isAdmin={isAdmin}>
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
        />
      )}

      {view === 'owners' && (
        <Owners
          owners={owners}
          onViewOwner={(id) => navigate('owner-detail', id)}
          onOpenOwnerModal={(owner) => setModal({ type: 'owner', owner })}
          onDeleteOwner={deleteOwnerHandler}
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
        />
      )}

      {view === 'drive' && <DriveView isAdmin={isAdmin} />}

      {view === 'revenue-reports' && (
        <RevenueReports leads={leads} owners={owners} onUpdateLead={saveLeadHandler} />
      )}

      {view === 'listing-optimizer' && <ListingOptimizer />}

      {view === 'newsletter' && <Newsletter leads={leads} owners={owners} />}

      {view === 'guest-marketing' && (
        <GuestMarketing reservations={allReservations} apiKey={uplistingApiKey || undefined} />
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
          />
        );
      })()}

      {view === 'calendar-intel' && (
        <CalendarIntelligence owners={owners} reservations={allReservations} />
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

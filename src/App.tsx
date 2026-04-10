import { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Pipeline from './components/Pipeline';
import Owners from './components/Owners';
import OwnerDetail from './components/OwnerDetail';
import OutreachLog from './components/OutreachLog';
import Settings from './components/Settings';
import LeadModal from './components/modals/LeadModal';
import OwnerModal from './components/modals/OwnerModal';
import PropertyModal from './components/modals/PropertyModal';
import OutreachModal from './components/modals/OutreachModal';
import { useLocalStorage } from './hooks/useLocalStorage';
import {
  fetchLeads, upsertLead, deleteLead,
  fetchOwners, upsertOwner,
  upsertProperty, deleteProperty,
  fetchOutreach, upsertOutreach, deleteOutreach,
} from './services/db';
import { fetchProperties, fetchReservations } from './services/uplisting';
import type { Lead, Owner, Property, OutreachEntry, View } from './types';
import type { UplistingProperty, UplistingReservation } from './services/uplisting';

type Modal =
  | { type: 'lead'; lead?: Lead }
  | { type: 'owner'; owner?: Owner }
  | { type: 'property'; ownerId: string; property?: Property }
  | { type: 'outreach'; entry?: OutreachEntry; preselectedOwnerId?: string }
  | null;

export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [outreach, setOutreach] = useState<OutreachEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Uplisting integration (still in localStorage — no sensitive data)
  const [uplistingApiKey, setUplistingApiKey] = useLocalStorage<string>('ej_uplisting_key', '');
  const [uplistingProperties, setUplistingProperties] = useLocalStorage<UplistingProperty[]>('ej_uplisting_properties', []);
  const [uplistingReservations, setUplistingReservations] = useLocalStorage<UplistingReservation[]>('ej_uplisting_reservations', []);
  const [lastSync, setLastSync] = useLocalStorage<string | null>('ej_uplisting_last_sync', null);

  const [view, setView] = useState<View>('dashboard');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  // ── Load all data from Supabase on mount ───────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      try {
        const [l, o, out] = await Promise.all([fetchLeads(), fetchOwners(), fetchOutreach()]);
        setLeads(l);
        setOwners(o);
        setOutreach(out);
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
  };

  // ── Uplisting sync ─────────────────────────────────────────────────────────
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
          ninetyDaysAhead.toISOString().slice(0, 10)
        ),
      ]);
      setUplistingProperties(props);
      setUplistingReservations(res);
      setLastSync(new Date().toISOString());
    } catch {
      // Sync errors shown in Settings
    }
  }, [uplistingApiKey, setUplistingProperties, setUplistingReservations, setLastSync]);

  // ── Lead CRUD ──────────────────────────────────────────────────────────────
  const saveLeadHandler = async (lead: Lead) => {
    await upsertLead(lead);
    setLeads(prev => {
      const exists = prev.find(l => l.id === lead.id);
      return exists ? prev.map(l => l.id === lead.id ? lead : l) : [lead, ...prev];
    });
    setModal(null);
  };


  // ── Owner CRUD ─────────────────────────────────────────────────────────────
  const saveOwnerHandler = async (owner: Owner) => {
    await upsertOwner(owner);
    setOwners(prev => {
      const exists = prev.find(o => o.id === owner.id);
      return exists ? prev.map(o => o.id === owner.id ? owner : o) : [owner, ...prev];
    });
    setModal(null);
  };

  // ── Property CRUD ──────────────────────────────────────────────────────────
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

  // ── Outreach CRUD ──────────────────────────────────────────────────────────
  const saveOutreachHandler = async (entry: OutreachEntry) => {
    await upsertOutreach(entry);
    setOutreach(prev => {
      const exists = prev.find(e => e.id === entry.id);
      return exists ? prev.map(e => e.id === entry.id ? entry : e) : [entry, ...prev];
    });
    setModal(null);
  };

  // ── Bulk handlers (Pipeline drag-drop, OutreachLog delete) ─────────────────
  const updateLeadsHandler = async (updated: Lead[]) => {
    const deleted = leads.filter(l => !updated.find(u => u.id === l.id));
    const changed = updated.filter(l => {
      const orig = leads.find(o => o.id === l.id);
      return !orig || l.stage !== orig.stage || l.updatedAt !== orig.updatedAt;
    });
    setLeads(updated);
    await Promise.all([
      ...deleted.map(l => deleteLead(l.id)),
      ...changed.map(upsertLead),
    ]);
  };

  const updateOutreachHandler = async (updated: OutreachEntry[]) => {
    const removed = outreach.filter(e => !updated.find(u => u.id === e.id));
    setOutreach(updated);
    await Promise.all(removed.map(e => deleteOutreach(e.id)));
  };

  const selectedOwner = owners.find(o => o.id === selectedOwnerId);
  const uplistingConnected = !!uplistingApiKey;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">Loading CRM data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl text-sm max-w-md text-center">
          {error}
        </div>
      </div>
    );
  }

  return (
    <Layout currentView={view} onNavigate={navigate}>
      {view === 'dashboard' && (
        <Dashboard
          leads={leads}
          owners={owners}
          outreach={outreach}
          onNavigate={navigate}
          uplistingConnected={uplistingConnected}
          uplistingProperties={uplistingProperties}
          uplistingReservations={uplistingReservations}
          lastSync={lastSync}
          onSync={handleSync}
        />
      )}

      {view === 'pipeline' && (
        <Pipeline
          leads={leads}
          onUpdateLeads={updateLeadsHandler}
          onOpenLeadModal={(lead) => setModal({ type: 'lead', lead })}
        />
      )}

      {view === 'owners' && (
        <Owners
          owners={owners}
          onViewOwner={(id) => navigate('owner-detail', id)}
          onOpenOwnerModal={(owner) => setModal({ type: 'owner', owner })}
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
          onSaveApiKey={setUplistingApiKey}
          lastSync={lastSync}
          properties={uplistingProperties}
          reservations={uplistingReservations}
          onSync={handleSync}
          onClearData={() => {
            setUplistingProperties([]);
            setUplistingReservations([]);
            setLastSync(null);
          }}
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

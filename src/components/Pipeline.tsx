import { useState, useRef } from 'react';
import { Plus, Phone, Mail, MapPin, DollarSign, MoreVertical, Trash2, Edit2 } from 'lucide-react';
import type { Lead, LeadStage } from '../types';

interface PipelineProps {
  leads: Lead[];
  onUpdateLeads: (leads: Lead[]) => void;
  onOpenLeadModal: (lead?: Lead) => void;
}

const STAGES: { id: LeadStage; label: string; color: string; dot: string }[] = [
  { id: 'new', label: 'New Lead', color: 'bg-slate-100', dot: 'bg-slate-400' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-50', dot: 'bg-blue-400' },
  { id: 'proposal', label: 'Proposal Sent', color: 'bg-purple-50', dot: 'bg-purple-400' },
  { id: 'negotiating', label: 'Negotiating', color: 'bg-amber-50', dot: 'bg-amber-400' },
  { id: 'won', label: 'Won', color: 'bg-emerald-50', dot: 'bg-emerald-500' },
  { id: 'lost', label: 'Lost', color: 'bg-red-50', dot: 'bg-red-400' },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface LeadCardProps {
  lead: Lead;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function LeadCard({ lead, onEdit, onDelete, onDragStart }: LeadCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => { /* reset handled by parent */ }}
      className="bg-white rounded-lg border border-slate-200 p-3.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{lead.name}</p>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
              <button
                onClick={() => { setMenuOpen(false); onEdit(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 w-full"
              >
                <Edit2 size={12} /> Edit
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 w-full"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mt-1.5">
        <MapPin size={11} className="text-slate-400 flex-shrink-0" />
        <span className="text-xs text-slate-500 truncate">{lead.propertyAddress}</span>
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1 text-xs text-teal-700 font-medium">
          <DollarSign size={11} />
          {formatCurrency(lead.estimatedRevenue)}/mo
        </div>
        <span className="text-xs text-slate-400">{timeAgo(lead.updatedAt)}</span>
      </div>

      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100">
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{lead.propertyType}</span>
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{lead.bedrooms}BR</span>
      </div>

      {lead.notes && (
        <p className="text-xs text-slate-400 mt-2 line-clamp-2">{lead.notes}</p>
      )}

      <div className="flex gap-2 mt-2.5">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-teal-600 hover:underline">
            <Phone size={11} />{lead.phone}
          </a>
        )}
        {lead.email && !lead.phone && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-teal-600 hover:underline">
            <Mail size={11} />{lead.email}
          </a>
        )}
      </div>
    </div>
  );
}

export default function Pipeline({ leads, onUpdateLeads, onOpenLeadModal }: PipelineProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDrop = (e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    if (!draggedId) return;
    onUpdateLeads(leads.map(l => l.id === draggedId ? { ...l, stage, updatedAt: new Date().toISOString() } : l));
    setDraggedId(null);
    setDragOverStage(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this lead?')) {
      onUpdateLeads(leads.filter(l => l.id !== id));
    }
  };

  const totalPipelineValue = leads
    .filter(l => l.stage !== 'lost')
    .reduce((s, l) => s + l.estimatedRevenue, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Lead Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {leads.filter(l => l.stage !== 'won' && l.stage !== 'lost').length} active leads
            · {formatCurrency(totalPipelineValue)}/mo pipeline value
          </p>
        </div>
        <button
          onClick={() => onOpenLeadModal()}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-5 h-full min-w-max">
          {STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.stage === stage.id);
            const stageValue = stageLeads.reduce((s, l) => s + l.estimatedRevenue, 0);
            const isOver = dragOverStage === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                onDragLeave={() => setDragOverStage(null)}
                className={`
                  kanban-column flex flex-col w-64 rounded-xl border transition-all duration-150
                  ${isOver ? 'ring-2 ring-teal-400 border-teal-300 bg-teal-50' : `${stage.color} border-slate-200`}
                `}
              >
                {/* Column header */}
                <div className="px-3.5 py-3 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                    <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                    <span className="ml-auto bg-white text-slate-500 text-xs font-medium px-1.5 py-0.5 rounded-full border border-slate-200">
                      {stageLeads.length}
                    </span>
                  </div>
                  {stageLeads.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">{formatCurrency(stageValue)}/mo</p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[120px]">
                  {stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onEdit={() => onOpenLeadModal(lead)}
                      onDelete={() => handleDelete(lead.id)}
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                    />
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Drop leads here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

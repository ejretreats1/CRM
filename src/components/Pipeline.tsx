import { useState, useRef } from 'react';
import { Plus, Phone, Mail, MapPin, DollarSign, MoreVertical, Trash2, Edit2, Clock, Video } from 'lucide-react';
import type { Lead, LeadStage } from '../types';

interface PipelineProps {
  leads: Lead[];
  onUpdateLeads: (leads: Lead[]) => void;
  onOpenLeadModal: (lead?: Lead) => void;
  onOpenLeadDetail: (lead: Lead) => void;
}

const STAGES: {
  id: LeadStage;
  label: string;
  accent: string;
  accentText: string;
  accentBg: string;
  accentBadge: string;
  accentBadgeText: string;
  dot: string;
}[] = [
  {
    id: 'new',
    label: 'New Lead',
    accent: 'bg-[#4a90d9]',
    accentText: 'text-[#6ab0f5]',
    accentBg: 'bg-[#111d30]',
    accentBadge: 'bg-[#162035] border-[#1e3a5a]',
    accentBadgeText: 'text-[#6ab0f5]',
    dot: 'bg-[#4a90d9]',
  },
  {
    id: 'contacted',
    label: 'Contacted',
    accent: 'bg-[#8b5cf6]',
    accentText: 'text-[#c4b5fd]',
    accentBg: 'bg-[#130f22]',
    accentBadge: 'bg-[#1a1535] border-[#3a2070]',
    accentBadgeText: 'text-[#c4b5fd]',
    dot: 'bg-[#8b5cf6]',
  },
  {
    id: 'cold',
    label: 'Old / Cold Lead',
    accent: 'bg-[#64748b]',
    accentText: 'text-[#94a3b8]',
    accentBg: 'bg-[#111820]',
    accentBadge: 'bg-[#1a2535] border-[#2a3545]',
    accentBadgeText: 'text-[#94a3b8]',
    dot: 'bg-[#64748b]',
  },
  {
    id: 'won',
    label: 'Won',
    accent: 'bg-[#10b981]',
    accentText: 'text-[#4ab57a]',
    accentBg: 'bg-[#0a1f16]',
    accentBadge: 'bg-[#0a2518] border-[#0a4a2a]',
    accentBadgeText: 'text-[#4ab57a]',
    dot: 'bg-[#10b981]',
  },
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

function formatCallTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
}

interface LeadCardProps {
  lead: Lead;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function LeadCard({ lead, onView, onEdit, onDelete, onDragStart }: LeadCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasUpcomingCall = lead.scheduledCallAt && new Date(lead.scheduledCallAt) >= new Date();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onView}
      className="bg-[#1a2335] rounded-xl border border-[#243550] p-3.5 cursor-pointer shadow-sm hover:shadow-lg hover:border-[#4a90d9]/60 hover:bg-[#1e2d45] transition-all select-none group"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white leading-tight">{lead.name}</p>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="p-0.5 rounded text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#243550] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 bg-[#1a2335] border border-[#243550] rounded-xl shadow-xl z-10 py-1.5 min-w-[130px]">
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                className="flex items-center gap-2 px-3 py-2 text-xs text-[#b8d4f0] hover:bg-[#243550] w-full transition-colors"
              >
                <Edit2 size={12} /> Edit
              </button>
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2 px-3 py-2 text-xs text-[#e05c5c] hover:bg-[#2a0e0e] w-full transition-colors"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mt-1.5">
        <MapPin size={11} className="text-[#3a5070] flex-shrink-0" />
        <span className="text-xs text-[#b8d4f0] truncate">{lead.propertyAddress}</span>
      </div>

      {hasUpcomingCall && (
        <div className="mt-2.5 bg-[#162035] border border-[#1e3a5a] rounded-lg px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <Clock size={11} className="text-[#4a90d9] flex-shrink-0" />
            <span className="text-xs text-[#4a90d9] font-semibold truncate">
              {formatCallTime(lead.scheduledCallAt!)}
            </span>
          </div>
          {lead.scheduledCallLink && (
            <a
              href={lead.scheduledCallLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-[#6ab0f5] hover:text-white transition-colors truncate"
            >
              <Video size={11} className="flex-shrink-0" /> Join Meeting
            </a>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[#243550]">
        <div className="flex items-center gap-1 text-xs text-[#4a90d9] font-semibold">
          <DollarSign size={11} />
          {formatCurrency(lead.estimatedRevenue)}/mo
        </div>
        <span className="text-xs text-[#3a5070]">{timeAgo(lead.updatedAt)}</span>
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-xs bg-[#243550] text-[#b8d4f0] px-2 py-0.5 rounded-full">{lead.propertyType}</span>
        <span className="text-xs bg-[#243550] text-[#b8d4f0] px-2 py-0.5 rounded-full">{lead.bedrooms}BR</span>
      </div>

      {lead.notes && (
        <p className="text-xs text-[#5a7090] mt-2 line-clamp-2 leading-relaxed">{lead.notes}</p>
      )}

      {(lead.phone || lead.email) && (
        <div className="flex gap-3 mt-2.5">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-xs text-[#6ab0f5] hover:text-white transition-colors">
              <Phone size={11} />{lead.phone}
            </a>
          )}
          {lead.email && !lead.phone && (
            <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-xs text-[#6ab0f5] hover:text-white transition-colors">
              <Mail size={11} />{lead.email}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function Pipeline({ leads, onUpdateLeads, onOpenLeadModal, onOpenLeadDetail }: PipelineProps) {
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

  const activeLeads = leads.filter(l => l.stage !== 'won');
  const totalPipelineValue = activeLeads.reduce((s, l) => s + l.estimatedRevenue, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 bg-[#1a2335] border-b border-[#1e2d45] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Lead Pipeline</h1>
          <p className="text-sm text-[#b8d4f0] mt-0.5">
            {activeLeads.length} active leads · <span className="text-[#4a90d9] font-semibold">{formatCurrency(totalPipelineValue)}/mo</span> pipeline value
          </p>
        </div>
        <button
          onClick={() => onOpenLeadModal()}
          className="flex items-center gap-2 bg-[#4a90d9] hover:bg-[#3a80c9] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-[#4a90d9]/20"
        >
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-[#0f1623]">
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
                className={`flex flex-col w-72 rounded-2xl border transition-all duration-150 overflow-hidden
                  ${isOver
                    ? 'ring-2 ring-[#4a90d9] border-[#4a90d9] shadow-xl shadow-[#4a90d9]/20'
                    : `${stage.accentBg} border-[#243550]`
                  }`}
              >
                {/* Colored top accent bar */}
                <div className={`h-1 w-full ${stage.accent} flex-shrink-0`} />

                {/* Column header */}
                <div className="px-4 py-3.5 border-b border-[#243550]/60 flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${stage.dot} shadow-sm flex-shrink-0`} />
                    <span className={`text-sm font-bold ${stage.accentText} flex-1`}>{stage.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${stage.accentBadge} ${stage.accentBadgeText}`}>
                      {stageLeads.length}
                    </span>
                  </div>
                  {stageLeads.length > 0 && (
                    <p className={`text-xs ${stage.accentText} opacity-60 mt-1.5 font-medium pl-5`}>
                      {formatCurrency(stageValue)}/mo
                    </p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[120px]">
                  {stageLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onView={() => onOpenLeadDetail(lead)}
                      onEdit={() => onOpenLeadModal(lead)}
                      onDelete={() => handleDelete(lead.id)}
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                    />
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <div className={`w-8 h-8 rounded-full ${stage.accentBadge} border flex items-center justify-center`}>
                        <span className={`w-2 h-2 rounded-full ${stage.dot} opacity-40`} />
                      </div>
                      <p className="text-xs text-[#3a5070]">Drop leads here</p>
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

import Modal from './Modal';
import type { Lead } from '../../types';
import { MapPin, Phone, Mail, DollarSign, Clock, Video, FileText, Home } from 'lucide-react';

const STAGE_LABELS: Record<string, string> = {
  new:  'New Lead',
  cold: 'Old / Cold Lead',
  won:  'Won',
};

const SOURCE_LABELS: Record<string, string> = {
  referral:      'Referral',
  website:       'Website',
  social:        'Social Media',
  cold_outreach: 'Cold Outreach',
  event:         'Event',
  other:         'Other',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

interface LeadDetailModalProps {
  lead: Lead;
  onEdit: () => void;
  onClose: () => void;
}

export default function LeadDetailModal({ lead, onEdit, onClose }: LeadDetailModalProps) {
  const hasUpcomingCall = lead.scheduledCallAt && new Date(lead.scheduledCallAt) >= new Date();

  return (
    <Modal title={lead.name} onClose={onClose}>
      <div className="space-y-4">
        {/* Stage + source badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            lead.stage === 'won'  ? 'bg-emerald-100 text-emerald-700' :
            lead.stage === 'cold' ? 'bg-blue-100 text-blue-700' :
                                    'bg-teal-100 text-teal-700'
          }`}>
            {STAGE_LABELS[lead.stage] ?? lead.stage}
          </span>
          {lead.source && (
            <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600">
              {SOURCE_LABELS[lead.source] ?? lead.source}
            </span>
          )}
        </div>

        {/* Contact info */}
        <div className="bg-slate-50 rounded-lg p-3.5 space-y-2">
          {lead.phone && (
            <div className="flex items-center gap-2">
              <Phone size={13} className="text-slate-400 flex-shrink-0" />
              <a href={`tel:${lead.phone}`} className="text-sm text-teal-600 hover:underline">{lead.phone}</a>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-2">
              <Mail size={13} className="text-slate-400 flex-shrink-0" />
              <a href={`mailto:${lead.email}`} className="text-sm text-teal-600 hover:underline">{lead.email}</a>
            </div>
          )}
          {lead.propertyAddress && (
            <div className="flex items-center gap-2">
              <MapPin size={13} className="text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-700">{lead.propertyAddress}</span>
            </div>
          )}
        </div>

        {/* Property details */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <Home size={14} className="text-slate-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">Type</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{lead.propertyType || '—'}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">Bedrooms</p>
            <p className="text-2xl font-bold text-slate-800">{lead.bedrooms}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <DollarSign size={14} className="text-teal-600 mx-auto mb-1" />
            <p className="text-xs text-slate-500">Est. Revenue</p>
            <p className="text-sm font-bold text-teal-700 mt-0.5">
              ${lead.estimatedRevenue.toLocaleString()}/mo
            </p>
          </div>
        </div>

        {/* Scheduled call */}
        {lead.scheduledCallAt && (
          <div className={`rounded-lg p-3.5 space-y-1.5 ${
            hasUpcomingCall ? 'bg-teal-50 border border-teal-200' : 'bg-slate-50'
          }`}>
            <div className="flex items-center gap-2">
              <Clock size={13} className={hasUpcomingCall ? 'text-teal-600' : 'text-slate-400'} />
              <span className="text-xs font-medium text-slate-600">Scheduled Call</span>
              {!hasUpcomingCall && <span className="text-xs text-slate-400">(past)</span>}
            </div>
            <p className="text-sm font-medium text-slate-800">{formatDateTime(lead.scheduledCallAt)}</p>
            {lead.scheduledCallLink && (
              <a
                href={lead.scheduledCallLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
              >
                <Video size={13} /> Join Meeting
              </a>
            )}
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText size={13} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-600">Notes</span>
            </div>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3.5 whitespace-pre-wrap leading-relaxed">
              {lead.notes}
            </p>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex gap-4 text-xs text-slate-400 pt-1 border-t border-slate-100">
          <span>Added {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>Updated {new Date(lead.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Edit Lead
          </button>
        </div>
      </div>
    </Modal>
  );
}

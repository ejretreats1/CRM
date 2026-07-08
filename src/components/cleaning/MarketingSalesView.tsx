import { MailOpen, ScanSearch, UserPlus } from 'lucide-react';
import type { View } from '../../types';

interface Props {
  onNavigate: (view: View) => void;
}

const TILES = [
  {
    id: 'cleaning-email' as View,
    label: 'Email Marketing',
    description: 'Create campaigns, manage templates, and send to your lead list',
    icon: MailOpen,
    color: '#4a90d9',
    bg: 'linear-gradient(135deg, #0e1e3a 0%, #0a1628 100%)',
    border: '#1e2d45',
    hoverBorder: '#4a90d9',
  },
  {
    id: 'cleaning-scraper' as View,
    label: 'Lead Scraper',
    description: 'Find property managers, realtors, and STR companies to target',
    icon: ScanSearch,
    color: '#3dd68c',
    bg: 'linear-gradient(135deg, #0a2518 0%, #071a10 100%)',
    border: '#1e2d45',
    hoverBorder: '#3dd68c',
  },
  {
    id: 'cleaning-leads' as View,
    label: 'Leads',
    description: 'Manage outreach leads and imported scraped contacts',
    icon: UserPlus,
    color: '#c084fc',
    bg: 'linear-gradient(135deg, #1a0a2e 0%, #110720 100%)',
    border: '#1e2d45',
    hoverBorder: '#c084fc',
  },
];

export default function MarketingSalesView({ onNavigate }: Props) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Marketing &amp; Sales</h1>
        <p className="text-sm text-[#3a5070] mt-1">Find leads, run campaigns, and manage your pipeline</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TILES.map(tile => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.id}
              onClick={() => onNavigate(tile.id)}
              className="group flex flex-col items-center text-center p-8 rounded-2xl border transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
              style={{ background: tile.bg, borderColor: tile.border }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = tile.hoverBorder)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = tile.border)}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: tile.color + '20' }}
              >
                <Icon size={30} style={{ color: tile.color }} />
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{tile.label}</h3>
              <p className="text-[#3a5070] text-sm leading-relaxed">{tile.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

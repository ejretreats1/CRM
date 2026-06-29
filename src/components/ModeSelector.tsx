import { Building2, Brush } from 'lucide-react';

interface Props {
  onSelect: (mode: 'property' | 'cleaning') => void;
}

export default function ModeSelector({ onSelect }: Props) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Property Management */}
      <button
        onClick={() => onSelect('property')}
        className="group relative flex-1 flex flex-col items-center justify-center gap-6 bg-[#0f1923] hover:bg-[#162035] transition-colors duration-300 border-r border-[#1e2d45] cursor-pointer"
      >
        <div className="flex flex-col items-center gap-5 px-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#1a2a3f] border border-[#1e3a5a] group-hover:border-[#4a90d9] flex items-center justify-center transition-colors duration-300">
            <Building2 size={38} className="text-[#4a90d9]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Property Management</h2>
            <p className="text-sm text-[#3a5070] max-w-xs leading-relaxed">
              Pipeline, owners, listings, revenue reports, outreach, and more.
            </p>
          </div>
          <div className="mt-2 px-6 py-2.5 rounded-xl border border-[#1e3a5a] group-hover:border-[#4a90d9] group-hover:bg-[#4a90d9] text-[#4a90d9] group-hover:text-white text-sm font-semibold transition-all duration-300">
            Open →
          </div>
        </div>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(74,144,217,0.04) 0%, transparent 70%)' }}
        />
      </button>

      {/* Divider */}
      <div className="w-px bg-[#1e2d45] flex-shrink-0 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#1a2335] border border-[#1e2d45] flex items-center justify-center z-10">
          <span className="text-[#3a5070] text-xs font-bold">or</span>
        </div>
      </div>

      {/* Cleaning Business */}
      <button
        onClick={() => onSelect('cleaning')}
        className="group relative flex-1 flex flex-col items-center justify-center gap-6 bg-[#0f1923] hover:bg-[#111f18] transition-colors duration-300 cursor-pointer"
      >
        <div className="flex flex-col items-center gap-5 px-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#0f2018] border border-[#1a4030] group-hover:border-[#3dd68c] flex items-center justify-center transition-colors duration-300">
            <Brush size={38} className="text-[#3dd68c]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Cleaning Business</h2>
            <p className="text-sm text-[#3a5070] max-w-xs leading-relaxed">
              Jobs, cleaners, property configs, payments, and payout automation.
            </p>
          </div>
          <div className="mt-2 px-6 py-2.5 rounded-xl border border-[#1a4030] group-hover:border-[#3dd68c] group-hover:bg-[#3dd68c] text-[#3dd68c] group-hover:text-[#0f2018] text-sm font-semibold transition-all duration-300">
            Open →
          </div>
        </div>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(61,214,140,0.04) 0%, transparent 70%)' }}
        />
      </button>

      {/* Top logo */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
        <div className="text-xs font-bold tracking-widest text-[#2a4060] uppercase">E&amp;J Retreats</div>
      </div>
    </div>
  );
}

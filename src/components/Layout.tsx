import { useState } from 'react';
import {
  LayoutDashboard,
  Columns3,
  Users,
  MessageSquare,
  Menu,
  X,
  Building2,
  Settings,
} from 'lucide-react';
import type { View } from '../types';

interface LayoutProps {
  currentView: View;
  onNavigate: (view: View, extra?: string) => void;
  children: React.ReactNode;
}

const navItems = [
  { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline' as View, label: 'Pipeline', icon: Columns3 },
  { id: 'owners' as View, label: 'Owners', icon: Users },
  { id: 'outreach' as View, label: 'Outreach Log', icon: MessageSquare },
];

const bottomNavItems = [
  { id: 'settings' as View, label: 'Settings', icon: Settings },
];

export default function Layout({ currentView, onNavigate, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeView = currentView === 'owner-detail' ? 'owners' : currentView;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200
          flex flex-col transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 leading-tight text-sm">E&J Retreats</div>
            <div className="text-xs text-slate-400">CRM Portal</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { onNavigate(id); setSidebarOpen(false); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${activeView === id
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
              `}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 py-3 border-t border-slate-100 space-y-1">
          {bottomNavItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { onNavigate(id); setSidebarOpen(false); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${activeView === id
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
              `}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          <p className="text-xs text-slate-400 px-3 pt-1">E&amp;J Retreats © 2026</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="font-semibold text-slate-800 text-sm">E&J Retreats CRM</div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

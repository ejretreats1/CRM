import { useState } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import {
  LayoutDashboard,
  Columns3,
  Users,
  MessageSquare,
  Menu,
  X,
  Building2,
  Settings,
  FolderKanban,
  HardDrive,
  FileBarChart2,
  Sparkles,
  Mail,
  LogOut,
} from 'lucide-react';
import type { View } from '../types';

interface LayoutProps {
  currentView: View;
  onNavigate: (view: View, extra?: string) => void;
  isAdmin: boolean;
  children: React.ReactNode;
}

const navItems = [
  { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline' as View, label: 'Pipeline', icon: Columns3 },
  { id: 'owners' as View, label: 'Clients', icon: Users },
  { id: 'outreach' as View, label: 'Outreach Log', icon: MessageSquare },
  { id: 'va-hub' as View, label: 'VA Hub', icon: FolderKanban },
  { id: 'drive' as View, label: 'Google Drive', icon: HardDrive },
  { id: 'revenue-reports' as View, label: 'AI Rev Projection Reports', icon: FileBarChart2 },
  { id: 'listing-optimizer' as View, label: 'Listing Optimizer', icon: Sparkles },
  { id: 'newsletter' as View, label: 'Newsletter', icon: Mail },
  { id: 'guest-marketing' as View, label: 'Guest Marketing', icon: Users },
];

export default function Layout({ currentView, onNavigate, isAdmin, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();

  const activeView = currentView === 'owner-detail' ? 'owners' : currentView;

  function handleNav(id: View) {
    onNavigate(id);
    setSidebarOpen(false);
  }

  const initials = (
    user?.firstName?.[0] ??
    user?.emailAddresses?.[0]?.emailAddress?.[0] ??
    '?'
  ).toUpperCase();

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : (user?.emailAddresses?.[0]?.emailAddress ?? '');

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden print:block print:h-auto print:overflow-visible">
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
          flex flex-col transform transition-transform duration-200 ease-in-out print:hidden
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
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleNav(id)}
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

        {/* Bottom: Settings (admin only) + user row */}
        <div className="px-3 py-3 border-t border-slate-100 space-y-1">
          {isAdmin && (
            <button
              onClick={() => handleNav('settings')}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${activeView === 'settings'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
              `}
            >
              <Settings size={18} />
              Settings
            </button>
          )}

          {/* User row */}
          <div className="flex items-center gap-2.5 px-3 py-2">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-teal-700">{initials}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">{displayName}</p>
              <p className="text-xs text-slate-400">{isAdmin ? 'Admin' : 'VA'}</p>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>

          <p className="text-xs text-slate-400 px-3 pt-1">E&amp;J Retreats © 2026</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:h-auto">
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
        <main className="flex-1 overflow-y-auto print:overflow-visible print:h-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

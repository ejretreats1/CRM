import { useState } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import {
  LayoutDashboard,
  Columns3,
  Users,
  X,
  Building2,
  Settings,
  FolderKanban,
  HardDrive,
  FileBarChart2,
  Sparkles,
  Mail,
  MailOpen,
  LogOut,
  BarChart3,
  Home,
  Brain,
  MoreHorizontal,
  ScanSearch,
  Send,
  FileSignature,
  Wand2,
  Brush,
  CalendarDays,
  Briefcase,
  CreditCard,
  LayoutGrid,
  BookOpen,
  MessageSquare,
  Megaphone,
} from 'lucide-react';
import type { View } from '../types';

interface LayoutProps {
  currentView: View;
  onNavigate: (view: View, extra?: string) => void;
  isAdmin: boolean;
  children: React.ReactNode;
  mode: 'property' | 'cleaning';
  onSelectMode: (mode: 'property' | 'cleaning') => void;
  onGoHome: () => void;
}

const PROPERTY_NAV_ITEMS = [
  { id: 'dashboard' as View,        label: 'Dashboard',            icon: LayoutDashboard },
  { id: 'pipeline' as View,         label: 'Pipeline',             icon: Columns3 },
  { id: 'owners' as View,           label: 'Clients',              icon: Users },
  { id: 'properties' as View,       label: 'Properties',           icon: Home },
  { id: 'va-hub' as View,           label: 'VA Hub',               icon: FolderKanban },
  { id: 'drive' as View,            label: 'Google Drive',         icon: HardDrive },
  { id: 'calendar-intel' as View,   label: 'Revenue Intelligence', icon: Brain },
  { id: 'revenue-reports' as View,  label: 'AI Rev Projection Reports', icon: FileBarChart2 },
  { id: 'listing-optimizer' as View,'label': 'Listing Optimizer',  icon: Sparkles },
  { id: 'newsletter' as View,       label: 'Newsletter',           icon: Mail },
  { id: 'guest-marketing' as View,  label: 'Guest Marketing',      icon: Users },
  { id: 'quarterly-reports' as View,'label': 'Quarterly Reports',  icon: BarChart3 },
  { id: 'email-tracking' as View,   label: 'Email Tracking',       icon: MailOpen },
  { id: 'deal-scanner' as View,     label: 'Deal Scanner',         icon: ScanSearch },
  { id: 'campaigns' as View,        label: 'Lead Campaigns',        icon: Send },
  { id: 'sms-outreach' as View,     label: 'SMS Outreach',          icon: MessageSquare },
  { id: 'esign' as View,            label: 'E-Sign Documents',      icon: FileSignature },
  { id: 'content-studio' as View,   label: 'Content Studio',        icon: Wand2 },
];

const CLEANING_NAV_ITEMS = [
  { id: 'cleaning-dashboard' as View,  label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'cleaning-schedule' as View,   label: 'Calendar',        icon: CalendarDays },
  { id: 'cleaning-jobs' as View,       label: 'Jobs',            icon: Briefcase },
  { id: 'cleaning-properties' as View, label: 'Properties',      icon: Home },
  { id: 'cleaning-cleaners' as View,   label: 'Cleaners',        icon: Users },
  { id: 'cleaning-payments' as View,   label: 'Payments',        icon: CreditCard },
  { id: 'cleaning-marketing' as View,  label: 'Marketing/Sales', icon: Megaphone },
  { id: 'cleaning-sops' as View,       label: "SOP's",           icon: BookOpen },
];

// Bottom tab bar shows the 4 most-used views per mode; the rest live in "More"
const PROPERTY_TAB_IDS: View[] = ['dashboard', 'pipeline', 'owners', 'properties'];
const CLEANING_TAB_IDS: View[] = ['cleaning-dashboard', 'cleaning-schedule', 'cleaning-jobs', 'cleaning-payments'];

// Short labels for bottom tab bar
const TAB_LABELS: Partial<Record<View, string>> = {
  dashboard: 'Home',
  pipeline: 'Pipeline',
  owners: 'Clients',
  properties: 'Properties',
  'cleaning-dashboard': 'Home',
  'cleaning-schedule': 'Calendar',
  'cleaning-jobs': 'Jobs',
  'cleaning-payments': 'Payments',
};

// Top header label per view
const TOP_LABELS: Partial<Record<View, string>> = {
  'owner-detail':    'Client Detail',
  'property-portal': 'Property',
  'settings':        'Settings',
  'deal-scanner':    'Deal Scanner',
};

function ModeToggle({
  mode, onSelect,
}: { mode: 'property' | 'cleaning'; onSelect: (mode: 'property' | 'cleaning') => void }) {
  return (
    <div className="flex items-center bg-[#0f1923] border border-[#1e2d45] rounded-full p-0.5 gap-0.5">
      <button
        onClick={() => onSelect('property')}
        title="Property Management"
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
          mode === 'property' ? 'bg-[#4a90d9] text-white' : 'text-[#3a5070] hover:text-[#b8d4f0]'
        }`}
      >
        <Building2 size={13} />
        <span className="text-xs font-semibold">Property</span>
      </button>
      <button
        onClick={() => onSelect('cleaning')}
        title="Cleaning Business"
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
          mode === 'cleaning' ? 'bg-[#3dd68c] text-[#0f2018]' : 'text-[#3a5070] hover:text-[#b8d4f0]'
        }`}
      >
        <Brush size={13} />
        <span className="text-xs font-semibold">Cleaning</span>
      </button>
    </div>
  );
}

export default function Layout({ currentView, onNavigate, isAdmin, children, mode, onSelectMode, onGoHome }: LayoutProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();

  const navItems = mode === 'cleaning' ? CLEANING_NAV_ITEMS : PROPERTY_NAV_ITEMS;
  const tabIds = mode === 'cleaning' ? CLEANING_TAB_IDS : PROPERTY_TAB_IDS;
  const tabItems = navItems.filter(i => tabIds.includes(i.id));
  const moreItems = navItems.filter(i => !tabIds.includes(i.id));

  const activeView = currentView === 'owner-detail' ? 'owners'
    : currentView === 'property-portal' ? 'properties'
    : currentView;

  const topLabel = TOP_LABELS[currentView]
    ?? navItems.find(i => i.id === activeView)?.label
    ?? 'E&J CRM';

  // "More" tab is highlighted when active view isn't one of the 4 tabs
  const isMoreActive = !tabIds.includes(activeView);

  function handleNav(id: View) {
    onNavigate(id);
    setMoreOpen(false);
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
    <div className="flex h-screen bg-[#1e2d45] overflow-hidden print:block print:h-auto print:overflow-visible">

      {/* ── Desktop sidebar (lg+) ── */}
      <aside className="hidden lg:flex w-64 bg-[#1a2335] border-r border-[#1e2d45] flex-col flex-shrink-0 print:hidden">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e2d45]">
          <img
            src="/logo.png"
            alt="E&J Retreats"
            className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
            onError={e => {
              const img = e.currentTarget;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <div className="w-10 h-10 rounded-xl bg-[#4a90d9] items-center justify-center flex-shrink-0 hidden">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white leading-tight text-sm">E&J Retreats</div>
            <div className="text-xs text-[#3a5070]">CRM Portal</div>
          </div>
        </div>

        {/* Home + mode toggle */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <button
            onClick={onGoHome}
            title="Back to app picker"
            className="w-9 h-9 flex-shrink-0 rounded-lg border border-[#1e2d45] hover:border-[#2a4060] hover:bg-[#1e2d45] flex items-center justify-center text-[#3a5070] hover:text-[#b8d4f0] transition-colors"
          >
            <LayoutGrid size={16} />
          </button>
          <ModeToggle mode={mode} onSelect={onSelectMode} />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="px-3 pb-1.5 text-[10px] font-bold tracking-widest text-[#2a4060] uppercase">
            {mode === 'cleaning' ? 'Cleaning Business' : 'Property Management'}
          </p>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleNav(id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${activeView === id
                  ? mode === 'cleaning'
                    ? 'bg-[#0f2018] text-[#3dd68c] border border-[#1a4030]'
                    : 'bg-[#162035] text-[#4a90d9] border border-[#1e3a5a]'
                  : 'text-[#b8d4f0] hover:bg-[#1e2d45] hover:text-white border border-transparent'}
              `}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        {/* Bottom: Settings + user row */}
        <div className="px-3 py-3 border-t border-[#1e2d45] space-y-0.5">
          {isAdmin && (
            <button
              onClick={() => handleNav('settings')}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border
                ${activeView === 'settings'
                  ? 'bg-[#162035] text-[#4a90d9] border-[#1e3a5a]'
                  : 'text-[#b8d4f0] hover:bg-[#1e2d45] hover:text-white border-transparent'}
              `}
            >
              <Settings size={18} />
              Settings
            </button>
          )}
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#162035] flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-[#4a90d9]">{initials}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-[#3a5070]">{isAdmin ? 'Admin' : 'VA'}</p>
            </div>
            <button
              onClick={() => signOut()}
              title="Sign out"
              className="p-1.5 rounded-lg text-[#3a5070] hover:text-[#e05c5c] hover:bg-[#2a0e0e] transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
          <p className="text-xs text-[#3a5070] px-3 pt-1">E&amp;J Retreats © 2026</p>
        </div>
      </aside>

      {/* ── Mobile: "More" bottom sheet ── */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 print:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#1a2335] rounded-t-2xl shadow-2xl tab-bar-safe"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-0.5">
              <div className="w-9 h-1 rounded-full bg-slate-300" />
            </div>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e2d45]">
              <span className="text-sm font-bold text-white">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-7 h-7 rounded-full bg-[#1e2d45] flex items-center justify-center text-[#b8d4f0]"
              >
                <X size={14} />
              </button>
            </div>
            {/* Grid of extra nav items for the active mode */}
            <div className="px-4 pt-3 pb-1 grid grid-cols-3 gap-2">
              {moreItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleNav(id)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3.5 rounded-xl text-xs font-medium transition-colors ${
                    activeView === id
                      ? 'bg-[#162035] text-[#4a90d9]'
                      : 'bg-[#1e2d45] text-[#b8d4f0] active:bg-[#1e2d45]'
                  }`}
                >
                  <Icon size={22} />
                  <span className="text-center leading-tight">{label}</span>
                </button>
              ))}
              {isAdmin && (
                <button
                  onClick={() => handleNav('settings')}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3.5 rounded-xl text-xs font-medium transition-colors ${
                    activeView === 'settings'
                      ? 'bg-[#162035] text-[#4a90d9]'
                      : 'bg-[#1e2d45] text-[#b8d4f0] active:bg-[#1e2d45]'
                  }`}
                >
                  <Settings size={22} />
                  <span>Settings</span>
                </button>
              )}
            </div>
            {/* Back to app picker */}
            <div className="mx-4 mt-3">
              <button
                onClick={() => { setMoreOpen(false); onGoHome(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#1e2d45] hover:bg-[#2a3d55] transition-colors"
              >
                <LayoutGrid size={16} className="text-[#3a5070]" />
                <span className="text-sm text-[#b8d4f0] font-medium">Back to App Picker</span>
              </button>
            </div>

            {/* User row + sign out */}
            <div className="mx-4 mt-3 pt-3 border-t border-[#1e2d45] flex items-center gap-2.5">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#162035] flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-[#4a90d9]">{initials}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{displayName}</p>
                <p className="text-xs text-[#3a5070]">{isAdmin ? 'Admin' : 'VA'}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 text-xs text-[#b8d4f0] hover:text-[#e05c5c] transition-colors px-3 py-1.5 rounded-lg hover:bg-[#2a0e0e]"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:h-auto">

        {/* Mobile top header */}
        <header className="lg:hidden bg-[#1a2335] border-b border-[#1e2d45] print:hidden mobile-header-safe">
          <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img
                src="/logo.png"
                alt="E&J Retreats"
                className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
                onError={e => {
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  const fallback = img.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div className="w-7 h-7 rounded-lg bg-[#4a90d9] items-center justify-center flex-shrink-0 hidden">
                <Building2 size={14} className="text-white" />
              </div>
              <span className="font-bold text-white text-sm truncate">{topLabel}</span>
            </div>
            {/* App picker + avatar */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={onGoHome}
                title="Back to app picker"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#3a5070] hover:text-[#b8d4f0] hover:bg-[#1e2d45] transition-colors flex-shrink-0"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setMoreOpen(true)}
                className="flex-shrink-0"
              >
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#162035] flex items-center justify-center">
                    <span className="text-xs font-semibold text-[#4a90d9]">{initials}</span>
                  </div>
                )}
              </button>
            </div>
          </div>
          {/* Permanent mode toggle — full width so labels are readable like on desktop */}
          <div className="px-4 pb-2.5">
            <ModeToggle mode={mode} onSelect={onSelectMode} />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden print:overflow-visible print:h-auto main-scroll-area">
          {children}
        </main>

        {/* ── Mobile bottom tab bar ── */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#1a2335] border-t border-[#1e2d45] z-30 print:hidden tab-bar-safe">
          <div className="flex" style={{ height: 56 }}>
            {tabItems.map(({ id, icon: Icon }) => {
              const active = activeView === id;
              return (
                <button
                  key={id}
                  onClick={() => handleNav(id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    active ? (mode === 'cleaning' ? 'text-[#3dd68c]' : 'text-[#4a90d9]') : 'text-[#3a5070]'
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                  <span className="text-[10px] font-medium leading-none">
                    {TAB_LABELS[id] ?? id}
                  </span>
                </button>
              );
            })}
            {/* More */}
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isMoreActive ? (mode === 'cleaning' ? 'text-[#3dd68c]' : 'text-[#4a90d9]') : 'text-[#3a5070]'
              }`}
            >
              <MoreHorizontal size={22} strokeWidth={isMoreActive ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium leading-none">More</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

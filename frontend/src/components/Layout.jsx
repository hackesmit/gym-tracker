import { NavLink, Outlet } from 'react-router-dom';
import {
  Menu, X, LogOut, Heart, Users, Trophy, User as UserIcon, MessageCircle,
  Home, Target, ClipboardList, TrendingUp, BarChart3, Leaf, BookOpen, Calendar, Award, Settings as SettingsIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  TodaysQuest, EyeOfSauron, Lembas,
  Chronicle as ChronicleIcon, SettingsGear,
} from './LotrIcons';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

const REALM_META = {
  gondor:    { label: 'Gondor',    icon: '🏰' },
  rohan:     { label: 'Rohan',     icon: '🐴' },
  rivendell: { label: 'Rivendell', icon: '🌿' },
  mordor:    { label: 'Mordor',    icon: '🔥' },
  shire:     { label: 'Shire',     icon: '🍺' },
};

/* PNG nav icon — renders an <img> at the given size */
function LotrNavIcon({ src, size = 22, className = '' }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`lotr-nav-icon object-contain ${className}`}
      draggable={false}
    />
  );
}

/* Wrapper that unifies SVG components and PNG <img> into a single interface */
function makePngNav(src) {
  return function PngNavIcon({ size = 22, className = '' }) {
    return <LotrNavIcon src={src} size={size} className={className} />;
  };
}

const NavHornBlow = makePngNav('/lotr/nav-horn-blow.png');
const NavAxe      = makePngNav('/lotr/nav-axe.png');
const NavEye      = makePngNav('/lotr/nav-eye.png');
const NavHorn     = makePngNav('/lotr/nav-horn.png');
const NavHand     = makePngNav('/lotr/nav-hand.png');

const lotrNavItems = [
  { to: '/',              icon: TodaysQuest,   labelKey: 'nav.dashboard' },
  { to: '/tracker',       icon: EyeOfSauron,   labelKey: 'nav.tracker' },
  { to: '/log',           icon: NavHornBlow,   labelKey: 'nav.log' },
  { to: '/progress',      icon: NavAxe,        labelKey: 'nav.progress' },
  { to: '/analytics',     icon: NavEye,        labelKey: 'nav.analytics' },
  { to: '/recovery',      icon: Lembas,        labelKey: 'nav.recovery' },
  { to: '/history',       icon: ChronicleIcon, labelKey: 'nav.chronicle' },
  { to: '/program',       icon: NavHorn,       labelKey: 'nav.program' },
  { to: '/achievements',  icon: NavHand,       labelKey: 'nav.achievements' },
  { to: '/cardio',        icon: Heart,         labelKey: 'nav.cardio' },
  { to: '/friends',       icon: Users,         labelKey: 'nav.friends' },
  { to: '/medals',        icon: Trophy,        labelKey: 'nav.medals' },
  { to: '/chat',          icon: MessageCircle, labelKey: 'nav.chat' },
  { to: '/profile',       icon: UserIcon,      labelKey: 'nav.profile' },
  { to: '/settings',      icon: SettingsGear,  labelKey: 'nav.settings' },
];

const neutralNavItems = [
  { to: '/',              icon: Home,          labelKey: 'nav.dashboard' },
  { to: '/tracker',       icon: Target,        labelKey: 'nav.tracker' },
  { to: '/log',           icon: ClipboardList, labelKey: 'nav.log' },
  { to: '/progress',      icon: TrendingUp,    labelKey: 'nav.progress' },
  { to: '/analytics',     icon: BarChart3,     labelKey: 'nav.analytics' },
  { to: '/recovery',      icon: Leaf,          labelKey: 'nav.recovery' },
  { to: '/history',       icon: BookOpen,      labelKey: 'nav.history' },
  { to: '/program',       icon: Calendar,      labelKey: 'nav.program' },
  { to: '/achievements',  icon: Award,         labelKey: 'nav.achievements' },
  { to: '/cardio',        icon: Heart,         labelKey: 'nav.cardio' },
  { to: '/friends',       icon: Users,         labelKey: 'nav.friends' },
  { to: '/medals',        icon: Trophy,        labelKey: 'nav.medals' },
  { to: '/chat',          icon: MessageCircle, labelKey: 'nav.chat' },
  { to: '/profile',       icon: UserIcon,      labelKey: 'nav.profile' },
  { to: '/settings',      icon: SettingsIcon,  labelKey: 'nav.settings' },
];

function AppLogo({ size = 'md' }) {
  const px = size === 'sm' ? 28 : 36;
  return (
    <img
      src="/lotr/logo.jpg"
      alt="Anabolic Analyzer"
      width={px}
      height={px}
      className="rounded-full object-cover"
    />
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { realm, cycleRealm, themeMode } = useApp();
  const { user, logout } = useAuth();
  const meta = REALM_META[realm] || REALM_META.gondor;
  const lotrMode = themeMode === 'lotr';
  const navItems = lotrMode ? lotrNavItems : neutralNavItems;
  const t = useT();
  const appName = lotrMode ? 'Anabolic Analyzer' : t('app.name.neutral');

  return (
    <div className="flex min-h-screen">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-56 nav-gondor shrink-0">
        <div className="p-4 border-b border-surface-lighter">
          <h1 className="font-display text-lg font-semibold text-accent-light flex items-center gap-2 tracking-wide">
            <AppLogo /> {appName}
          </h1>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'nav-active'
                    : 'text-text-muted hover:bg-surface-light hover:text-text'
                }`
              }
            >
              <Icon size={22} />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
        {/* Realm toggle (LOTR mode only) + user/logout */}
        <div className="p-3 border-t border-surface-lighter space-y-2">
          {lotrMode && (
            <button
              onClick={cycleRealm}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-surface-light text-text-muted hover:text-text touch-manipulation"
              title={`Switch realm (current: ${meta.label})`}
            >
              <span className="text-base">{meta.icon}</span>
              <span className="text-xs tracking-wide">{meta.label}</span>
            </button>
          )}
          {user && (
            <button
              onClick={logout}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-text-muted hover:text-text hover:bg-surface-light transition-colors"
              title="Sign out"
            >
              <span className="truncate">{user.username}</span>
              <LogOut size={14} />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface border-b border-surface-lighter px-4 py-3 flex items-center justify-between"
           style={{ borderBottomColor: 'color-mix(in srgb, var(--color-accent) 15%, var(--color-surface-lighter) 85%)' }}>
        <h1 className="font-display text-base font-semibold text-accent-light flex items-center gap-2 tracking-wide">
          <AppLogo size="sm" /> {appName}
        </h1>
        <div className="flex items-center gap-1">
          {lotrMode && (
            <button
              onClick={cycleRealm}
              className="text-base p-2 touch-manipulation"
              title={`Switch realm (current: ${meta.label})`}
            >
              {meta.icon}
            </button>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-text-muted p-2 -mr-2 touch-manipulation"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)}>
          <nav className="absolute top-14 left-0 right-0 bg-surface border-b border-surface-lighter p-3 space-y-0.5"
               onClick={(e) => e.stopPropagation()}>
            {navItems.map(({ to, icon: Icon, labelKey }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                    isActive ? 'nav-active' : 'text-text-muted hover:text-text'
                  }`
                }
              >
                <Icon size={22} />
                {t(labelKey)}
              </NavLink>
            ))}
            {user && (
              <button
                onClick={() => { setMobileOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-text-muted hover:text-text"
              >
                <LogOut size={22} /> {t('nav.signOut')} ({user.username})
              </button>
            )}
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 p-4 pt-20 md:p-6 md:pt-6 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

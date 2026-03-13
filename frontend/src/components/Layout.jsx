import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Target, Dumbbell, TrendingUp,
  BarChart3, Heart, ClipboardList, Settings, Menu, X, Scale,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tracker', icon: Target, label: 'Tracker' },
  { to: '/log', icon: Dumbbell, label: 'Log Workout' },
  { to: '/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/recovery', icon: Heart, label: 'Recovery' },
  { to: '/program', icon: ClipboardList, label: 'Program' },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { units, setUnits } = useApp();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-surface border-r border-surface-lighter shrink-0">
        <div className="p-4 border-b border-surface-lighter">
          <h1 className="text-lg font-bold text-primary-light flex items-center gap-2">
            <Dumbbell size={22} /> Gym Tracker
          </h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary-light'
                    : 'text-text-muted hover:bg-surface-light hover:text-text'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-surface-lighter">
          <button
            onClick={() => setUnits(units === 'kg' ? 'lbs' : 'kg')}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:bg-surface-light transition-colors"
          >
            <Scale size={16} />
            Units: {units.toUpperCase()}
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface border-b border-surface-lighter px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-primary-light flex items-center gap-2">
          <Dumbbell size={18} /> Gym Tracker
        </h1>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-text-muted">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)}>
          <nav className="absolute top-14 left-0 right-0 bg-surface border-b border-surface-lighter p-3 space-y-1"
               onClick={(e) => e.stopPropagation()}>
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary/15 text-primary-light' : 'text-text-muted hover:text-text'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:p-6 p-4 pt-18 md:pt-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

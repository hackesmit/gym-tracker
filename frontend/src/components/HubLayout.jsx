import { NavLink, Outlet } from 'react-router-dom';
import { useT } from '../i18n';

/**
 * Shared layout for hub pages (Stats, Profile, Social).
 * Renders a horizontal sub-tab strip + <Outlet /> for the active child route.
 *
 * Props:
 *   tabs: Array<{ to: string, labelKey: string, end?: boolean }>
 *     `to` is a relative path (e.g. "progress"), resolved against the hub's route.
 */
export default function HubLayout({ tabs }) {
  const t = useT();
  return (
    <div>
      <nav className="flex gap-1 overflow-x-auto border-b border-surface-lighter pb-2 mb-4">
        {tabs.map(({ to, labelKey, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'nav-active'
                  : 'text-text-muted hover:bg-surface-light hover:text-text'
              }`
            }
          >
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

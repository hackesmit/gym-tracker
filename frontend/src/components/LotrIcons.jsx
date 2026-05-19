/**
 * Lord of the Rings themed SVG icon components.
 * Hand-crafted 64×64 illustrated icon set — "Icons of Middle-earth".
 * Each icon accepts `size` (default 24) and `className` props.
 * Uses currentColor for theme compatibility.
 */

// ── NAVIGATION ──

export function TodaysQuest({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="32" cy="32" r="26"/>
      <circle cx="32" cy="32" r="3" fill="currentColor"/>
      <path d="M32 10v6M32 48v6M10 32h6M48 32h6"/>
      <path d="M32 6l-2 6h4l-2-6z" fill="currentColor" stroke="none"/>
      <path d="M18.5 18.5l4 4M41.5 41.5l4 4M18.5 45.5l4-4M41.5 22.5l4-4"/>
      <path d="M32 20l5 12-5 4-5-4z" fill="currentColor" opacity="0.3"/>
      <path d="M32 20l5 12-5 4-5-4z"/>
    </svg>
  );
}

export function Chronicle({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 8h28c2 0 4 2 4 4v40c0 2-2 4-4 4H20c-2 0-4-2-4-4V8z"/>
      <path d="M16 8c0 0-2 0-2 3s2 3 2 3"/>
      <path d="M16 52c-2 0-4-1-4-3V11"/>
      <path d="M22 18h16M22 24h20M22 30h12"/>
      <path d="M38 38l4-4 4 4-4 4z" fill="currentColor" opacity="0.3"/>
      <path d="M22 42h10"/>
      <path d="M20 8v48"/>
    </svg>
  );
}

export function SettingsGear({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="32" cy="32" r="8"/>
      <circle cx="32" cy="32" r="3" fill="currentColor" opacity="0.3"/>
      <path d="M32 6v8M32 50v8"/>
      <path d="M50.4 13.6l-5.6 5.6M19.2 44.8l-5.6 5.6"/>
      <path d="M58 32h-8M14 32H6"/>
      <path d="M50.4 50.4l-5.6-5.6M19.2 19.2l-5.6-5.6"/>
      <circle cx="32" cy="10" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="32" cy="54" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="54" cy="32" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="10" cy="32" r="2" fill="currentColor" opacity="0.2"/>
    </svg>
  );
}

// ── STRENGTH & METRICS ──

export function Sword({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 4l3 32h-6z" fill="currentColor" opacity="0.08"/>
      <path d="M32 4l3 32h-6z"/>
      <path d="M32 8v24" opacity="0.3"/>
      <path d="M20 36h24" strokeWidth="2.5"/>
      <path d="M18 35c0-2 2-3 4-3M46 35c0-2-2-3-4-3" opacity="0.5"/>
      <circle cx="20" cy="36" r="1.5" fill="currentColor" opacity="0.3"/>
      <circle cx="44" cy="36" r="1.5" fill="currentColor" opacity="0.3"/>
      <path d="M30 38h4v12h-4z" fill="currentColor" opacity="0.12"/>
      <path d="M30 38h4v12h-4z"/>
      <path d="M30 41h4M30 44h4M30 47h4" opacity="0.3"/>
      <circle cx="32" cy="54" r="4"/>
      <circle cx="32" cy="54" r="2" fill="currentColor" opacity="0.2"/>
      <path d="M30 14l1 3M34 18l-1 3" opacity="0.25"/>
    </svg>
  );
}

export function Ring({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="32" cy="50" rx="16" ry="3" fill="currentColor" opacity="0.08" stroke="none"/>
      <path d="M18 30c2 3 7 5 14 5s12-2 14-5" opacity="0.15" strokeWidth="3"/>
      <ellipse cx="32" cy="32" rx="22" ry="18" strokeWidth="1.8"/>
      <ellipse cx="32" cy="32" rx="13" ry="9" strokeWidth="1.8"/>
      <path d="M10 32c1-6 5-12 9-15" strokeWidth="1.2" opacity="0.3"/>
      <path d="M54 32c-1-6-5-12-9-15" strokeWidth="1.2" opacity="0.3"/>
      <path d="M10 32c1 6 5 12 9 15" strokeWidth="1.2" opacity="0.2"/>
      <path d="M54 32c-1 6-5 12-9 15" strokeWidth="1.2" opacity="0.2"/>
      <path d="M12 36c4 6 10 10 20 10s16-4 20-10" strokeWidth="1" opacity="0.5" strokeDasharray="3 2.5"/>
      <path d="M14 38c4 5 9 8 18 8s14-3 18-8" strokeWidth="0.8" opacity="0.3" strokeDasharray="2 3"/>
      <path d="M11 26c1-3 3-6 6-9" strokeWidth="3" opacity="0.45"/>
      <path d="M48 18c2 2 3 5 4 8" strokeWidth="2" opacity="0.2"/>
      <path d="M22 15c3-1 6-2 10-2s7 1 10 2" strokeWidth="1" opacity="0.35"/>
    </svg>
  );
}

export function Torch({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 6c0 0-16 18-16 34 0 10 7 18 16 18s16-8 16-18C48 24 32 6 32 6z"/>
      <path d="M32 6c0 0-16 18-16 34 0 10 7 18 16 18s16-8 16-18C48 24 32 6 32 6z" fill="currentColor" opacity="0.08"/>
      <path d="M32 22c0 0-8 10-8 20 0 6 3 10 8 10s8-4 8-10c0-10-8-20-8-20z"/>
      <path d="M32 22c0 0-8 10-8 20 0 6 3 10 8 10s8-4 8-10c0-10-8-20-8-20z" fill="currentColor" opacity="0.15"/>
      <path d="M32 36c0 0-3 4-3 8s1 5 3 5 3-1 3-5-3-8-3-8z" fill="currentColor" opacity="0.25"/>
    </svg>
  );
}

// ── JOURNEY & PROGRESSION ──

export function MapScroll({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 12l14-4 16 4 14-4v44l-14 4-16-4-14 4z"/>
      <path d="M24 8v44M40 12v44"/>
      <path d="M10 12l14-4 16 4 14-4v44l-14 4-16-4-14 4z" fill="currentColor" opacity="0.05"/>
      <path d="M16 20l4 2 2-3 3 4" opacity="0.4"/>
      <path d="M30 18l3 3-2 4 4 2" opacity="0.4"/>
      <path d="M44 22l2 4-3 2 4 3" opacity="0.4"/>
      <circle cx="18" cy="30" r="1.5" fill="currentColor" opacity="0.3"/>
      <circle cx="34" cy="28" r="1.5" fill="currentColor" opacity="0.3"/>
      <circle cx="48" cy="34" r="1.5" fill="currentColor" opacity="0.3"/>
      <path d="M15 38h6M29 36h6M43 40h6" opacity="0.2" strokeDasharray="1 2"/>
    </svg>
  );
}

// ── SOCIAL / FELLOWSHIP ──

export function EyeOfSauron({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 32c0 0 12-20 28-20s28 20 28 20-12 20-28 20S4 32 4 32z"/>
      <path d="M4 32c0 0 12-20 28-20s28 20 28 20-12 20-28 20S4 32 4 32z" fill="currentColor" opacity="0.04"/>
      <ellipse cx="32" cy="32" rx="12" ry="14"/>
      <ellipse cx="32" cy="32" rx="12" ry="14" fill="currentColor" opacity="0.08"/>
      <ellipse cx="32" cy="32" rx="3" ry="14" fill="currentColor" opacity="0.15"/>
      <ellipse cx="32" cy="32" rx="3" ry="14"/>
      <ellipse cx="32" cy="32" rx="1.5" ry="8" fill="currentColor" opacity="0.25"/>
      <path d="M8 28c2-4 5-8 8-10" opacity="0.3"/>
      <path d="M56 28c-2-4-5-8-8-10" opacity="0.3"/>
      <path d="M8 36c2 4 5 8 8 10" opacity="0.3"/>
      <path d="M56 36c-2 4-5 8-8 10" opacity="0.3"/>
      <path d="M26 24c2-2 4-3 6-3" opacity="0.4" strokeWidth="1.2"/>
    </svg>
  );
}

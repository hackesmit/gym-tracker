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
// Alias
export { TodaysQuest as CompassMap };

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

export function Trophy({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 10h24v16c0 8-5 14-12 14s-12-6-12-14V10z"/>
      <path d="M20 16h-6c-2 0-3 1-3 3v2c0 5 4 9 9 9"/>
      <path d="M44 16h6c2 0 3 1 3 3v2c0 5-4 9-9 9"/>
      <path d="M28 40v6M36 40v6"/>
      <path d="M22 48h20v4H22z" fill="currentColor" opacity="0.2"/>
      <path d="M22 48h20v4H22z"/>
      <path d="M32 18v8M28 22h8" opacity="0.5"/>
      <circle cx="32" cy="22" r="2" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}

export function Mountain({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 54l20-38 8 12 6-8 18 34H6z"/>
      <path d="M6 54l20-38 8 12" fill="currentColor" opacity="0.1"/>
      <path d="M22 24l-3 6 6 0z" fill="currentColor" opacity="0.2"/>
      <path d="M26 16l-1-4 2-2 2 2-1 4"/>
      <path d="M40 36l-2-4 4 0z" fill="currentColor" opacity="0.15"/>
      <path d="M10 54l4-8M16 54l6-12M50 54l-6-10"/>
    </svg>
  );
}

export function WhiteTree({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 58V26" strokeWidth="2.2"/>
      <path d="M32 42l-3 4M32 46l3 3" opacity="0.3"/>
      <path d="M32 58c-4 0-10 2-14 2"/>
      <path d="M32 58c4 0 10 2 14 2"/>
      <path d="M32 56c-2 1-6 3-8 3" opacity="0.5"/>
      <path d="M32 56c2 1 6 3 8 3" opacity="0.5"/>
      <path d="M32 26c-4-1-10-2-14 2"/>
      <path d="M32 30c-6 0-12 1-16 6"/>
      <path d="M32 34c-4 1-10 4-14 10"/>
      <path d="M32 26c4-1 10-2 14 2"/>
      <path d="M32 30c6 0 12 1 16 6"/>
      <path d="M32 34c4 1 10 4 14 10"/>
      <path d="M32 22c-3-2-6-4-8-2"/>
      <path d="M32 22c3-2 6-4 8-2"/>
      <path d="M32 18c-2-3-1-6 0-10"/>
      <path d="M32 14c-2-2-4-2-5 0" opacity="0.5"/>
      <path d="M32 14c2-2 4-2 5 0" opacity="0.5"/>
      <circle cx="18" cy="28" r="1.5" fill="currentColor" opacity="0.35"/>
      <circle cx="46" cy="28" r="1.5" fill="currentColor" opacity="0.35"/>
      <circle cx="16" cy="36" r="1.5" fill="currentColor" opacity="0.3"/>
      <circle cx="48" cy="36" r="1.5" fill="currentColor" opacity="0.3"/>
      <circle cx="18" cy="44" r="1.5" fill="currentColor" opacity="0.25"/>
      <circle cx="46" cy="44" r="1.5" fill="currentColor" opacity="0.25"/>
      <circle cx="24" cy="20" r="1" fill="currentColor" opacity="0.35"/>
      <circle cx="40" cy="20" r="1" fill="currentColor" opacity="0.35"/>
      <circle cx="32" cy="8" r="2" fill="currentColor" opacity="0.25"/>
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

export function Hammer({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <g transform="rotate(-45 32 32)">
        <path d="M31 28L31 62L33 62L33 28" fill="currentColor" opacity="0.08"/>
        <line x1="31" y1="28" x2="31" y2="62"/>
        <line x1="33" y1="28" x2="33" y2="62"/>
        <line x1="31" y1="62" x2="33" y2="62"/>
        <line x1="30" y1="44" x2="34" y2="44" opacity="0.3"/>
        <line x1="30" y1="48" x2="34" y2="48" opacity="0.3"/>
        <line x1="30" y1="52" x2="34" y2="52" opacity="0.3"/>
        <line x1="30" y1="56" x2="34" y2="56" opacity="0.3"/>
        <path d="M33 10L48 8L50 14L33 18Z" fill="currentColor" opacity="0.1"/>
        <path d="M33 10L48 8L50 14L33 18Z"/>
        <path d="M48 8L50 14" strokeWidth="2.2"/>
        <path d="M38 10L40 14" opacity="0.2"/>
        <path d="M31 10L16 6C6 12 4 26 10 34L31 26Z" fill="currentColor" opacity="0.1"/>
        <path d="M31 10L16 6C6 12 4 26 10 34L31 26"/>
        <path d="M16 6C6 12 4 26 10 34" strokeWidth="2.2"/>
        <path d="M31 10L33 10L33 26L31 26Z" fill="currentColor" opacity="0.12"/>
        <path d="M31 10L33 10"/>
        <path d="M31 26L33 26"/>
        <path d="M24 12L26 17L22 17Z" opacity="0.3"/>
        <path d="M20 16L22 21L18 21Z" opacity="0.25"/>
        <path d="M26 19L28 23L24 23Z" opacity="0.2"/>
      </g>
    </svg>
  );
}

export function Barbell({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 32h32"/>
      <rect x="8" y="24" width="8" height="16" rx="1" fill="currentColor" opacity="0.15"/>
      <rect x="8" y="24" width="8" height="16" rx="1"/>
      <rect x="48" y="24" width="8" height="16" rx="1" fill="currentColor" opacity="0.15"/>
      <rect x="48" y="24" width="8" height="16" rx="1"/>
      <rect x="4" y="28" width="4" height="8" rx="1"/>
      <rect x="56" y="28" width="4" height="8" rx="1"/>
      <circle cx="32" cy="32" r="3" fill="currentColor" opacity="0.2"/>
      <path d="M12 22v20M52 22v20" opacity="0.3"/>
    </svg>
  );
}

export function MithrilVest({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 14l-8 6v30l8 4h24l8-4V20l-8-6"/>
      <path d="M20 14c0 0 4-4 12-4s12 4 12 4"/>
      <path d="M24 14v-2c0-2 3-4 8-4s8 2 8 4v2"/>
      <path d="M20 14l12 10 12-10" fill="currentColor" opacity="0.1"/>
      <path d="M20 24h24M20 30h24M20 36h24M20 42h24" opacity="0.15" strokeDasharray="2 3"/>
      <path d="M26 24l6 6 6-6M26 36l6 6 6-6" opacity="0.2"/>
      <circle cx="32" cy="32" r="1.5" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}

// ── ACHIEVEMENTS & BADGES ──

export function Crown({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 42l4-24 8 10 8-16 8 16 8-10 4 24z"/>
      <path d="M12 42l4-24 8 10 8-16 8 16 8-10 4 24z" fill="currentColor" opacity="0.1"/>
      <path d="M12 42h40v6H12z" fill="currentColor" opacity="0.15"/>
      <path d="M12 42h40v6H12z"/>
      <circle cx="16" cy="18" r="2" fill="currentColor" opacity="0.3"/>
      <circle cx="32" cy="12" r="2" fill="currentColor" opacity="0.3"/>
      <circle cx="48" cy="18" r="2" fill="currentColor" opacity="0.3"/>
      <circle cx="24" cy="28" r="1.5" fill="currentColor" opacity="0.2"/>
      <circle cx="32" cy="34" r="1.5" fill="currentColor" opacity="0.2"/>
      <circle cx="40" cy="28" r="1.5" fill="currentColor" opacity="0.2"/>
    </svg>
  );
}

export function Star({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 6l4 14h14l-11 8 4 14-11-8-11 8 4-14-11-8h14z"/>
      <path d="M32 6l4 14h14l-11 8 4 14-11-8-11 8 4-14-11-8h14z" fill="currentColor" opacity="0.08"/>
      <circle cx="32" cy="28" r="6"/>
      <circle cx="32" cy="28" r="3" fill="currentColor" opacity="0.2"/>
      <path d="M32 50v8M26 54l6-4 6 4" opacity="0.4"/>
      <circle cx="32" cy="28" r="1" fill="currentColor"/>
    </svg>
  );
}
// Alias
export { Star as Evenstar };

export function StarOfFeanor({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 8l6 18 18-6-12 14 12 14-18-6-6 18-6-18-18 6 12-14-12-14 18 6z"/>
      <path d="M32 8l6 18 18-6-12 14 12 14-18-6-6 18-6-18-18 6 12-14-12-14 18 6z" fill="currentColor" opacity="0.06"/>
      <circle cx="32" cy="34" r="6"/>
      <circle cx="32" cy="34" r="2.5" fill="currentColor" opacity="0.25"/>
    </svg>
  );
}

export function DoorsOfDurin({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 58V20c0-10 9-14 20-14s20 4 20 14v38"/>
      <path d="M12 58h40"/>
      <path d="M18 58V24c0-7 6-10 14-10s14 3 14 10v34"/>
      <path d="M32 58V18"/>
      <path d="M14 20v38M50 20v38" opacity="0.3"/>
      <path d="M32 10l2 3h3l-2.5 2 1 3-3.5-2-3.5 2 1-3L27 13h3z" fill="currentColor" opacity="0.3"/>
      <path d="M32 10l2 3h3l-2.5 2 1 3-3.5-2-3.5 2 1-3L27 13h3z"/>
      <path d="M24 26v18M24 26c-2-1-4 0-4 2M24 26c2-1 4 0 4 2M24 30c-2 0-5 1-5 3M24 30c2 0 5 1 5 3" opacity="0.4"/>
      <path d="M40 26v18M40 26c-2-1-4 0-4 2M40 26c2-1 4 0 4 2M40 30c-2 0-5 1-5 3M40 30c2 0 5 1 5 3" opacity="0.4"/>
      <circle cx="28" cy="40" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="36" cy="40" r="2" fill="currentColor" opacity="0.2"/>
    </svg>
  );
}

export function Shield({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 6L10 16v18c0 14 10 20 22 24 12-4 22-10 22-24V16z"/>
      <path d="M32 6L10 16v18c0 14 10 20 22 24 12-4 22-10 22-24V16z" fill="currentColor" opacity="0.06"/>
      <path d="M32 14v38"/>
      <path d="M16 20l16 6 16-6" opacity="0.3"/>
      <path d="M32 20l-8 8 8 8 8-8z" fill="currentColor" opacity="0.12"/>
      <path d="M32 20l-8 8 8 8 8-8z"/>
      <path d="M32 26l-3 3 3 3 3-3z" fill="currentColor" opacity="0.2"/>
    </svg>
  );
}
// Alias
export { Shield as GondorShield };

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

export function MountainPass({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 56l14-28 8 10 10-22 8 14 6-8 10 34z"/>
      <path d="M4 56l14-28 8 10 10-22" fill="currentColor" opacity="0.06"/>
      <path d="M18 28l-2 4M30 24l2-4" opacity="0.4"/>
      <path d="M36 16l-1-3 1-2 1 2-1 3" fill="currentColor" opacity="0.3"/>
      <path d="M8 56h48" opacity="0.3"/>
      <path d="M22 44c4-2 10-2 14 0" opacity="0.2" strokeDasharray="2 2"/>
    </svg>
  );
}

export function RangersBoot({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 8h14v30h-14z" fill="currentColor" opacity="0.05"/>
      <path d="M22 8h14"/>
      <path d="M22 8v30"/>
      <path d="M36 8v30"/>
      <path d="M22 38c0 4-2 6-4 8-1 1-2 3-2 4h36c0-2 0-4-2-6-2-2-4-4-4-6"/>
      <path d="M16 50h36v4H16z" fill="currentColor" opacity="0.12"/>
      <path d="M16 50h36v4H16z"/>
      <path d="M44 50v4"/>
      <path d="M44 50h8v4h-8" fill="currentColor" opacity="0.08"/>
      <path d="M20 12h18" opacity="0.3"/>
      <path d="M26 18l6 0M26 24l6 0M26 30l6 0" opacity="0.35"/>
      <path d="M29 16v16" opacity="0.2"/>
      <rect x="24" y="34" width="10" height="4" rx="1" opacity="0.3"/>
      <circle cx="29" cy="36" r="1" fill="currentColor" opacity="0.25"/>
    </svg>
  );
}

export function Banner({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 6v52"/>
      <path d="M16 10h30l-8 10 8 10H16z"/>
      <path d="M16 10h30l-8 10 8 10H16z" fill="currentColor" opacity="0.1"/>
      <path d="M26 18c2-2 6-2 8 0s2 6 0 8" opacity="0.4"/>
      <circle cx="30" cy="22" r="2" fill="currentColor" opacity="0.2"/>
      <path d="M14 6h4M14 58h4"/>
      <circle cx="16" cy="58" r="2" fill="currentColor" opacity="0.15"/>
    </svg>
  );
}

export function LevelUp({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 8l-20 12v24l20 12 20-12V20z"/>
      <path d="M32 8l-20 12v24l20 12 20-12V20z" fill="currentColor" opacity="0.05"/>
      <path d="M12 20l20 12 20-12"/>
      <path d="M32 32v24"/>
      <path d="M32 16v-4M32 16l-4 6h8z" fill="currentColor" opacity="0.2"/>
      <path d="M32 16l-4 6h8z"/>
      <path d="M24 28l8 4 8-4" opacity="0.3"/>
      <path d="M20 36l12 6 12-6" opacity="0.2"/>
    </svg>
  );
}

// ── SESSION DATA ──

export function Hourglass({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 8h28M18 56h28"/>
      <path d="M20 8c0 12-0 14 12 24C20 42 20 44 20 56"/>
      <path d="M44 8c0 12 0 14-12 24 12 10 12 12 12 24"/>
      <path d="M24 14h16c0 6-4 10-8 14-4-4-8-8-8-14z" fill="currentColor" opacity="0.08"/>
      <path d="M24 50h16c0-6-4-10-8-14-4 4-8 8-8 14z" fill="currentColor" opacity="0.15"/>
      <path d="M28 48h8" opacity="0.3"/>
      <path d="M30 46h4" opacity="0.2"/>
      <circle cx="32" cy="32" r="1.5" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}
// Alias
export { Hourglass as Clock };

export function WeightStack({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="16" y="40" width="32" height="8" rx="1" fill="currentColor" opacity="0.15"/>
      <rect x="16" y="40" width="32" height="8" rx="1"/>
      <rect x="18" y="30" width="28" height="8" rx="1" fill="currentColor" opacity="0.12"/>
      <rect x="18" y="30" width="28" height="8" rx="1"/>
      <rect x="20" y="20" width="24" height="8" rx="1" fill="currentColor" opacity="0.08"/>
      <rect x="20" y="20" width="24" height="8" rx="1"/>
      <rect x="22" y="10" width="20" height="8" rx="1"/>
      <path d="M30 50v6M34 50v6"/>
      <path d="M24 56h16"/>
    </svg>
  );
}

export function Dumbbell({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M26 32h12"/>
      <rect x="10" y="22" width="8" height="20" rx="2" fill="currentColor" opacity="0.12"/>
      <rect x="10" y="22" width="8" height="20" rx="2"/>
      <rect x="46" y="22" width="8" height="20" rx="2" fill="currentColor" opacity="0.12"/>
      <rect x="46" y="22" width="8" height="20" rx="2"/>
      <rect x="18" y="26" width="8" height="12" rx="1"/>
      <rect x="38" y="26" width="8" height="12" rx="1"/>
      <path d="M6 30h4M54 30h4M6 34h4M54 34h4"/>
    </svg>
  );
}

export function ArrowUp({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M32 52V14"/>
      <path d="M22 24l10-10 10 10"/>
      <path d="M26 18l6-6 6 6" fill="currentColor" opacity="0.15"/>
      <path d="M24 36l-4 4M40 36l4 4" opacity="0.3"/>
      <path d="M22 42l-6 6M42 42l6 6" opacity="0.2"/>
      <path d="M28 8h8" opacity="0.4"/>
      <circle cx="32" cy="8" r="1.5" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}

export function Scroll({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 10c-4 0-6 2-6 5s2 5 6 5"/>
      <path d="M18 10h28v38c0 4-2 6-6 6H18"/>
      <path d="M18 20v28c-4 0-6-2-6-5V15"/>
      <path d="M18 48c-4 0-6 2-6 5s3 5 6 5h22c4 0 6-2 6-6"/>
      <path d="M24 20h16M24 26h20M24 32h14M24 38h18" opacity="0.3"/>
      <circle cx="42" cy="14" r="2" fill="currentColor" opacity="0.15"/>
    </svg>
  );
}

export function RestTimer({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="32" cy="36" r="22"/>
      <circle cx="32" cy="36" r="18" opacity="0.3"/>
      <path d="M32 20v16l10 8"/>
      <path d="M26 8h12"/>
      <path d="M32 8v6"/>
      <path d="M14 16l-4-4M50 16l4-4"/>
      <circle cx="32" cy="36" r="2" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}

// ── SOCIAL / FELLOWSHIP ──

export function Fellowship({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="32" cy="18" r="6"/>
      <path d="M22 50v-8c0-6 4-10 10-10s10 4 10 10v8"/>
      <circle cx="14" cy="24" r="5"/>
      <path d="M6 50v-6c0-5 3-8 8-8"/>
      <circle cx="50" cy="24" r="5"/>
      <path d="M58 50v-6c0-5-3-8-8-8"/>
      <path d="M10 50h44" opacity="0.3"/>
    </svg>
  );
}

export function Beacon({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 58l6-22h16l6 22z" fill="currentColor" opacity="0.06"/>
      <path d="M18 58l6-22h16l6 22"/>
      <path d="M22 36h20"/>
      <path d="M26 36v-4h12v4"/>
      <path d="M32 14c-3 4-6 8-6 14h12c0-6-3-10-6-14z" fill="currentColor" opacity="0.12"/>
      <path d="M32 14c-3 4-6 8-6 14"/>
      <path d="M32 14c3 4 6 8 6 14"/>
      <path d="M32 20c-2 2-3 5-3 8h6c0-3-1-6-3-8z" fill="currentColor" opacity="0.2"/>
      <path d="M32 10c-1 2-2 4-2 6" opacity="0.4"/>
      <path d="M32 10c1 2 2 4 2 6" opacity="0.4"/>
      <path d="M22 18l-6-4" opacity="0.3"/>
      <path d="M42 18l6-4" opacity="0.3"/>
      <path d="M20 24l-6-1" opacity="0.2"/>
      <path d="M44 24l6-1" opacity="0.2"/>
      <path d="M32 10v-4" opacity="0.25"/>
      <path d="M24 44h16M26 50h12" opacity="0.15"/>
    </svg>
  );
}

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

export function Lembas({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 20c0 0 10-12 22-12s22 12 22 12-4 16-12 24c-4 4-8 8-10 10-2-2-6-6-10-10C14 36 10 20 10 20z"/>
      <path d="M10 20c0 0 10-12 22-12s22 12 22 12-4 16-12 24c-4 4-8 8-10 10-2-2-6-6-10-10C14 36 10 20 10 20z" fill="currentColor" opacity="0.06"/>
      <path d="M32 12v42"/>
      <path d="M32 18l-10 6M32 18l10 6" opacity="0.35"/>
      <path d="M32 26l-12 8M32 26l12 8" opacity="0.3"/>
      <path d="M32 34l-10 10M32 34l10 10" opacity="0.25"/>
      <rect x="24" y="22" width="16" height="16" rx="2" fill="currentColor" opacity="0.1"/>
      <rect x="24" y="22" width="16" height="16" rx="2"/>
      <path d="M32 24v12M26 30h12" opacity="0.4"/>
      <circle cx="28" cy="27" r="0.8" fill="currentColor" opacity="0.2"/>
      <circle cx="36" cy="33" r="0.8" fill="currentColor" opacity="0.2"/>
    </svg>
  );
}

// ── REMOVED: Laurel, CrestNovice, CrestSteel, CrestGold, CrestElite (not in final icon set) ──

/**
 * Lord of the Rings themed SVG icon components.
 * Stroke-based design consistent with lucide-react style.
 * Each icon accepts `size` (default 24) and `className` props.
 */

export function WhiteTree({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Trunk */}
      <path d="M12 22v-14" />
      {/* Main branches */}
      <path d="M12 8c-1.5-2-4-3.5-5-5" />
      <path d="M12 8c1.5-2 4-3.5 5-5" />
      {/* Middle branches */}
      <path d="M12 11c-1.2-1.2-3-2.5-4.5-2.5" />
      <path d="M12 11c1.2-1.2 3-2.5 4.5-2.5" />
      {/* Lower branches */}
      <path d="M12 14c-1-0.8-2.5-1.5-3.5-1.2" />
      <path d="M12 14c1-0.8 2.5-1.5 3.5-1.2" />
      {/* Roots */}
      <path d="M12 22c-0.5 0-2-0.5-3-1" />
      <path d="M12 22c0.5 0 2-0.5 3-1" />
      {/* Stars */}
      <circle cx="8" cy="2" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="2" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="1" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Ring({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Outer ring */}
      <circle cx="12" cy="12" r="9" />
      {/* Inner ring */}
      <circle cx="12" cy="12" r="6" />
      {/* Elvish inscription suggestion — subtle arc marks */}
      <path d="M6.5 8.5a9 9 0 0 1 11 0" strokeWidth="0.8" opacity="0.5" />
      <path d="M6.5 15.5a9 9 0 0 0 11 0" strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}

export function Sword({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Blade */}
      <path d="M12 2l1.5 12h-3L12 2z" />
      {/* Guard / crossguard */}
      <path d="M7 14.5h10" strokeWidth="2" />
      {/* Grip */}
      <path d="M12 15v5" strokeWidth="2" />
      {/* Pommel */}
      <circle cx="12" cy="21" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Shield({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Shield shape — heater style */}
      <path d="M12 2L4 6v5c0 5.25 3.4 10.15 8 12 4.6-1.85 8-6.75 8-12V6l-8-4z" />
      {/* Cross */}
      <path d="M12 7v10" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function Torch({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Flame — teardrop shape */}
      <path d="M12 2c-1.5 2.5-3 4-3 6a3 3 0 0 0 6 0c0-2-1.5-3.5-3-6z" />
      {/* Inner flame */}
      <path d="M12 5c-0.7 1.2-1.3 2-1.3 3a1.3 1.3 0 0 0 2.6 0c0-1-0.6-1.8-1.3-3z" strokeWidth="1" />
      {/* Handle top */}
      <path d="M10 9.5h4" strokeWidth="2" />
      {/* Handle shaft */}
      <path d="M11 10l-1 12" strokeWidth="2" />
      <path d="M13 10l1 12" strokeWidth="2" />
      {/* Handle wrap marks */}
      <path d="M10.5 14h3" strokeWidth="1" />
      <path d="M10.3 17h3.4" strokeWidth="1" />
    </svg>
  );
}

export function Mountain({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Main peak */}
      <path d="M12 4L2 20h20L12 4z" />
      {/* Snow cap / lava glow line */}
      <path d="M12 4l-2.5 5h5L12 4z" />
      {/* Secondary smaller peak */}
      <path d="M18 12l4 8" />
      <path d="M18 12l-2.5 5" />
    </svg>
  );
}

export function Crown({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Crown outline with 5 points */}
      <path d="M3 18h18v2H3v-2z" />
      <path d="M3 18l2-10 4 4 3-8 3 8 4-4 2 10" />
      {/* Gem dots */}
      <circle cx="8" cy="16" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MapScroll({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Top roll */}
      <path d="M6 3a2 2 0 0 1 2-2h8a2 2 0 0 1 0 4H8a2 2 0 0 1-2-2z" />
      {/* Scroll body */}
      <path d="M8 5v14" />
      <path d="M16 5v14" />
      {/* Bottom roll */}
      <path d="M6 21a2 2 0 0 1 2-2h8a2 2 0 0 1 0 4H8a2 2 0 0 1-2-2z" />
      {/* Content lines — map suggestion */}
      <path d="M10 8h4" strokeWidth="1" />
      <path d="M10 11h4" strokeWidth="1" />
      <path d="M10 14h2" strokeWidth="1" />
      {/* Route dot */}
      <circle cx="14" cy="14" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Chronicle({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Left page */}
      <path d="M2 4c0-1 1-2 2-2h7v20H4c-1 0-2-1-2-2V4z" />
      {/* Right page */}
      <path d="M11 2h7c1 0 2 1 2 2v16c0 1-1 2-2 2h-7V2z" />
      {/* Spine */}
      <path d="M11 2v20" strokeWidth="2" />
      {/* Left page lines */}
      <path d="M5 7h4" strokeWidth="1" />
      <path d="M5 10h4" strokeWidth="1" />
      <path d="M5 13h3" strokeWidth="1" />
      {/* Right page lines */}
      <path d="M14 7h4" strokeWidth="1" />
      <path d="M14 10h4" strokeWidth="1" />
      <path d="M14 13h3" strokeWidth="1" />
    </svg>
  );
}

export function Hammer({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Hammer head — blocky dwarven style */}
      <path d="M6 2h6v5H6V2z" />
      <path d="M5 3h1v3H5V3z" />
      <path d="M12 3h1v3h-1V3z" />
      {/* Handle */}
      <path d="M9 7v14" strokeWidth="2" />
      {/* Handle wrap */}
      <path d="M7.5 16l3 0" strokeWidth="1" />
      <path d="M7.5 18.5l3 0" strokeWidth="1" />
      {/* Pommel */}
      <path d="M7.5 21h3" strokeWidth="2" />
    </svg>
  );
}

export function GondorShield({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {/* Shield shape */}
      <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" />
      {/* Tree trunk inside shield */}
      <path d="M12 19v-8" strokeWidth="1.2" />
      {/* Tree branches */}
      <path d="M12 11c-1-1.2-2.5-2-3.5-2.5" strokeWidth="1.2" />
      <path d="M12 11c1-1.2 2.5-2 3.5-2.5" strokeWidth="1.2" />
      <path d="M12 13c-0.8-0.8-2-1.5-2.8-1.5" strokeWidth="1.2" />
      <path d="M12 13c0.8-0.8 2-1.5 2.8-1.5" strokeWidth="1.2" />
      {/* Stars above tree */}
      <circle cx="10" cy="7" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="6" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * MedalBadge — procedural SVG for the 21-medal competitive system.
 *
 * Ported from `Medals.html` so in-app medals stay 1:1 with the design
 * source. Shared circular steel shell + category-colored ribbon +
 * engraved central glyph. Category colors follow the design system:
 *   strength    → red/orange
 *   endurance   → blue
 *   consistency → green
 *   performance → purple
 *
 * Usage:
 *   <MedalBadge icon="bench" category="strength" size={96} />
 *   <MedalBadge icon="streak" category="consistency" locked />
 */

import { useMemo } from 'react';

const CAT_COLOR = {
  strength:    '#d96848',
  endurance:   '#4a9cd9',
  consistency: '#5aa36a',
  performance: '#9970d4',
};

export function medalCategoryColor(category) {
  return CAT_COLOR[category] || '#9ca3af';
}

const ICON_STROKE = '#c5c9d0';
const ICON_FILL   = '#9fa4ad';

// Central engraved glyphs — 200x220 viewBox, centered on (100, 118).
const GLYPHS = {
  // Strength
  bench: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 70 118 L 130 118" />
      <circle cx="70" cy="118" r="10" />
      <circle cx="130" cy="118" r="10" />
      <path d="M 80 108 L 80 128 M 120 108 L 120 128" />
      <path d="M 72 138 L 128 138" strokeWidth="1.5" opacity="0.5" />
    </g>
  ),
  squat: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 68 102 L 132 102" />
      <circle cx="68" cy="102" r="8" />
      <circle cx="132" cy="102" r="8" />
      <path d="M 100 110 L 100 130" />
      <path d="M 100 130 L 86 150 M 100 130 L 114 150" />
      <circle cx="100" cy="108" r="3" fill={ICON_STROKE} />
    </g>
  ),
  deadlift: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 68 148 L 132 148" />
      <circle cx="68" cy="148" r="8" />
      <circle cx="132" cy="148" r="8" />
      <path d="M 100 148 L 100 110" />
      <circle cx="100" cy="100" r="6" />
      <path d="M 92 118 L 108 118" strokeWidth="1.5" />
      <path d="M 60 160 L 140 160" strokeWidth="1.2" opacity="0.4" />
    </g>
  ),
  ohp: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 78 90 L 122 90" />
      <circle cx="78" cy="90" r="8" />
      <circle cx="122" cy="90" r="8" />
      <path d="M 100 98 L 100 120" />
      <circle cx="100" cy="128" r="6" />
      <path d="M 92 138 L 108 138" strokeWidth="1.5" />
      <path d="M 86 94 L 86 102 M 114 94 L 114 102" strokeWidth="1.5" opacity="0.6" />
    </g>
  ),
  total: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="76" y="140" width="48" height="8" rx="1" />
      <rect x="80" y="126" width="40" height="8" rx="1" />
      <rect x="84" y="112" width="32" height="8" rx="1" />
      <rect x="88" y="98"  width="24" height="8" rx="1" />
      <path d="M 100 92 L 100 88" strokeWidth="1.5" />
    </g>
  ),
  relative: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <circle cx="100" cy="94" r="7" />
      <path d="M 100 101 L 100 122 M 88 112 L 112 112 M 100 122 L 88 140 M 100 122 L 112 140" />
      <path d="M 76 152 L 124 152" strokeWidth="1.5" opacity="0.5" />
      <path d="M 100 150 L 100 156" strokeWidth="1.5" opacity="0.5" />
    </g>
  ),
  // Endurance
  mile: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 72 130 L 128 130 L 122 122 M 128 130 L 122 138" />
      <text x="100" y="108" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight="900" fontSize="16" fill={ICON_STROKE} stroke="none">1M</text>
      <path d="M 78 142 L 122 142" strokeWidth="1" opacity="0.4" />
    </g>
  ),
  fk5: () => (
    <g>
      <text x="100" y="130" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight="900" fontSize="32" fill={ICON_STROKE}>5K</text>
      <path d="M 72 140 L 128 140" stroke={ICON_STROKE} strokeWidth="2" strokeLinecap="round" />
      <path d="M 120 134 L 128 140 L 120 146" stroke={ICON_STROKE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  fk10: () => (
    <g>
      <text x="100" y="130" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight="900" fontSize="28" fill={ICON_STROKE}>10K</text>
      <path d="M 72 140 L 128 140" stroke={ICON_STROKE} strokeWidth="2" strokeLinecap="round" />
      <path d="M 120 134 L 128 140 L 120 146" stroke={ICON_STROKE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  run: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 70 146 Q 82 110 100 130 Q 118 150 130 108" />
      <circle cx="70" cy="146" r="3" fill={ICON_STROKE} />
      <circle cx="130" cy="108" r="3" fill={ICON_STROKE} />
      <path d="M 88 132 L 92 124 M 110 134 L 114 126" strokeWidth="1.5" opacity="0.6" />
    </g>
  ),
  ride: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <circle cx="76" cy="134" r="18" />
      <circle cx="124" cy="134" r="18" />
      <circle cx="76" cy="134" r="2" fill={ICON_STROKE} />
      <circle cx="124" cy="134" r="2" fill={ICON_STROKE} />
      <path d="M 76 134 L 100 102 L 124 134 M 100 102 L 110 102" />
    </g>
  ),
  swim: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 64 108 Q 76 98 88 108 T 112 108 T 136 108" />
      <path d="M 64 124 Q 76 114 88 124 T 112 124 T 136 124" />
      <path d="M 64 140 Q 76 130 88 140 T 112 140 T 136 140" />
      <path d="M 64 156 Q 76 146 88 156 T 112 156 T 136 156" opacity="0.5" />
    </g>
  ),
  // Consistency
  streak: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 100 80 Q 84 98 88 118 Q 92 138 100 150 Q 108 138 112 118 Q 116 98 100 80 Z" />
      <path d="M 100 108 Q 94 118 96 128 Q 100 138 100 138 Q 100 138 104 128 Q 106 118 100 108 Z" fill={ICON_FILL} opacity="0.5" stroke="none" />
    </g>
  ),
  sess30: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="70" y="86" width="60" height="56" rx="3" />
      <path d="M 70 98 L 130 98" />
      <path d="M 82 80 L 82 92 M 118 80 L 118 92" />
      <circle cx="82" cy="114" r="2" fill={ICON_STROKE} />
      <circle cx="100" cy="114" r="2" fill={ICON_STROKE} />
      <circle cx="118" cy="114" r="2" fill={ICON_STROKE} />
      <circle cx="82" cy="128" r="2" fill={ICON_STROKE} />
      <circle cx="100" cy="128" r="2" fill={ICON_STROKE} />
      <circle cx="118" cy="128" r="2" fill={ICON_STROKE} />
    </g>
  ),
  sessAll: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="76" y="92" width="52" height="48" rx="2" opacity="0.4" />
      <rect x="72" y="88" width="52" height="48" rx="2" opacity="0.7" />
      <rect x="68" y="84" width="52" height="48" rx="2" />
      <path d="M 68 96 L 120 96" />
      <circle cx="78" cy="108" r="1.8" fill={ICON_STROKE} />
      <circle cx="94" cy="108" r="1.8" fill={ICON_STROKE} />
      <circle cx="110" cy="108" r="1.8" fill={ICON_STROKE} />
      <circle cx="78" cy="120" r="1.8" fill={ICON_STROKE} />
      <circle cx="94" cy="120" r="1.8" fill={ICON_STROKE} />
    </g>
  ),
  vol30: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="74" y="146" width="52" height="8" rx="1" />
      <rect x="78" y="132" width="44" height="8" rx="1" />
      <rect x="82" y="118" width="36" height="8" rx="1" />
      <rect x="86" y="104" width="28" height="8" rx="1" />
      <path d="M 100 98 L 96 92 M 100 98 L 104 92" strokeWidth="1.5" />
      <path d="M 100 98 L 100 90" strokeWidth="1.5" />
    </g>
  ),
  week: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="72" y="84" width="56" height="56" rx="2" />
      <path d="M 72 96 L 128 96" />
      <path d="M 80 110 L 84 114 L 92 104" strokeWidth="2" />
      <path d="M 98 110 L 102 114 L 110 104" strokeWidth="2" />
      <path d="M 116 110 L 120 114 M 78 128 L 82 132 L 90 122" strokeWidth="2" />
      <path d="M 96 128 L 100 132 L 108 122" strokeWidth="2" />
      <path d="M 114 128 L 118 132 L 126 122" strokeWidth="2" opacity="0.4" />
    </g>
  ),
  // Performance
  inc1rm: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 76 148 L 76 100 L 124 100" />
      <path d="M 116 92 L 124 100 L 116 108" />
      <rect x="82" y="130" width="8" height="14" rx="1" fill={ICON_FILL} />
      <rect x="94" y="118" width="8" height="26" rx="1" fill={ICON_FILL} />
      <rect x="106" y="104" width="8" height="40" rx="1" fill={ICON_FILL} />
    </g>
  ),
  incVol: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 74 148 L 74 90" />
      <path d="M 74 148 L 132 148" />
      <rect x="80" y="130" width="10" height="16" rx="1" fill={ICON_FILL} />
      <rect x="94" y="116" width="10" height="30" rx="1" fill={ICON_FILL} />
      <rect x="108" y="100" width="10" height="46" rx="1" fill={ICON_FILL} />
      <path d="M 84 126 L 100 112 L 112 96" strokeWidth="1.5" />
      <path d="M 106 98 L 112 96 L 113 102" strokeWidth="1.5" />
    </g>
  ),
  improved: () => (
    <g stroke={ICON_STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M 74 148 L 90 128 L 104 138 L 126 96" />
      <circle cx="74" cy="148" r="3" fill={ICON_STROKE} />
      <circle cx="90" cy="128" r="3" fill={ICON_STROKE} />
      <circle cx="104" cy="138" r="3" fill={ICON_STROKE} />
      <circle cx="126" cy="96" r="3" fill={ICON_STROKE} />
      <path d="M 118 94 L 126 96 L 124 104" strokeWidth="1.5" />
      <path d="M 74 92 L 74 148 L 132 148" opacity="0.3" />
    </g>
  ),
};

// Fallback glyph if a medal's icon key isn't in GLYPHS yet — keeps the
// layout intact instead of throwing.
function renderGlyph(icon) {
  const renderer = GLYPHS[icon] || GLYPHS.total;
  return renderer();
}

let uidCounter = 0;

export default function MedalBadge({
  icon = 'total',
  category = 'strength',
  size = 96,
  locked = false,
  title,
  className = '',
}) {
  const uid = useMemo(() => `mb-${++uidCounter}`, []);
  const accent = medalCategoryColor(category);
  return (
    <svg
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title || `${category} medal`}
      width={size}
      height={(size * 220) / 200}
      className={className}
      style={locked ? { filter: 'grayscale(1) brightness(0.7)', opacity: 0.45 } : undefined}
    >
      <defs>
        <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9dce2" />
          <stop offset="40%" stopColor="#8c929c" />
          <stop offset="70%" stopColor="#4a4f58" />
          <stop offset="100%" stopColor="#2a2d33" />
        </linearGradient>
        <linearGradient id={`${uid}-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6a6f78" />
          <stop offset="50%" stopColor="#3a3e46" />
          <stop offset="100%" stopColor="#1c1e22" />
        </linearGradient>
        <radialGradient id={`${uid}-plate`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0%" stopColor="#2a2d33" />
          <stop offset="100%" stopColor="#141518" />
        </radialGradient>
        <linearGradient id={`${uid}-ribbon`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Ribbon */}
      <path d="M 74 18 L 126 18 L 134 38 L 66 38 Z" fill={`url(#${uid}-ribbon)`} stroke="#1a1a1a" strokeWidth="1" strokeLinejoin="miter" />
      <path d="M 74 18 L 126 18 L 124 26 L 76 26 Z" fill={accent} opacity="0.9" />
      {/* Outer bezel */}
      <circle cx="100" cy="118" r="82" fill={`url(#${uid}-steel)`} stroke="#0e0f11" strokeWidth="1.2" />
      {/* Accent ring */}
      <circle cx="100" cy="118" r="74" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.55" />
      {/* Inner steel */}
      <circle cx="100" cy="118" r="70" fill={`url(#${uid}-inner)`} stroke="#0e0f11" strokeWidth="0.8" />
      {/* Recessed plate */}
      <circle cx="100" cy="118" r="58" fill={`url(#${uid}-plate)`} stroke="#0a0b0d" strokeWidth="0.8" />
      {/* Rivets */}
      <circle cx="100" cy="44"  r="2" fill="#2a2d33" stroke="#0e0f11" strokeWidth="0.5" />
      <circle cx="100" cy="192" r="2" fill="#2a2d33" stroke="#0e0f11" strokeWidth="0.5" />
      <circle cx="26"  cy="118" r="2" fill="#2a2d33" stroke="#0e0f11" strokeWidth="0.5" />
      <circle cx="174" cy="118" r="2" fill="#2a2d33" stroke="#0e0f11" strokeWidth="0.5" />
      {/* Top sheen */}
      <path d="M 34 86 Q 100 48 166 86 Q 100 74 34 86 Z" fill="#ffffff" opacity="0.12" />
      {/* Central glyph */}
      {renderGlyph(icon)}
    </svg>
  );
}

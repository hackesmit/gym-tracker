/**
 * RankBadge — procedural SVG badge for the 7-tier × 5-subdivision rank ladder.
 *
 * Ported verbatim from the authoritative design file `Rank Badges.html` so
 * the in-app badges stay 1:1 with the reference. Do NOT hand-edit the SVG
 * paths or materials — regenerate from that source if the design evolves.
 *
 * Usage:
 *   <RankBadge rank="Gold" subIndex={2} size={96} />
 *   <RankBadge rank="Champion" size={120} />   // Champion ignores subIndex
 */

import { useMemo } from 'react';

const RANKS = ['Copper', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

export const SUBDIVISIONS = ['V', 'IV', 'III', 'II', 'I'];

const MATERIALS = {
  Copper:   { base:'#7a3d1e', dark:'#3d1f0e', mid:'#a85a2e', light:'#d8884a', hilite:'#f1b17a', accent:'#2a1208', plate:'#2e1c14', emblem:'#e9a06b' },
  Bronze:   { base:'#8a5a2b', dark:'#4a2f14', mid:'#b07a3a', light:'#d9a365', hilite:'#f0c58a', accent:'#2e1c0a', plate:'#2f2214', emblem:'#e8be7b' },
  Silver:   { base:'#8a92a0', dark:'#2e333d', mid:'#b4bcca', light:'#e0e5ed', hilite:'#ffffff', accent:'#1a1e26', plate:'#1d2028', emblem:'#dfe4ec' },
  Gold:     { base:'#a78025', dark:'#4a3410', mid:'#d3a132', light:'#f1c55a', hilite:'#ffe79a', accent:'#2a1c06', plate:'#2a2010', emblem:'#f7d76a' },
  Platinum: { base:'#3a6bb8', dark:'#0f1c38', mid:'#5c8eda', light:'#9bc0f5', hilite:'#e0edff', accent:'#06101f', plate:'#0d1628', emblem:'#b6d3fb' },
  Diamond:  { base:'#7a4ac8', dark:'#1d0f3a', mid:'#a074e6', light:'#cfa8ff', hilite:'#f4e8ff', accent:'#0d0620', plate:'#180a30', emblem:'#d8b8ff' },
  Champion: { base:'#1a0f2e', dark:'#05030a', mid:'#2a1856', light:'#6b3cc4', hilite:'#ff4fa8', accent:'#000000', plate:'#0a0515', emblem:'#ffd4f0',
              iridescent: ['#ff4fa8', '#c94fff', '#4f8fff', '#4fffe0', '#ffe44f', '#ff884f'] },
};

const SHIELD_OUTER = 'M 100 8 L 184 48 L 184 128 Q 184 168 146 192 L 100 212 L 54 192 Q 16 168 16 128 L 16 48 Z';
const SHIELD_INNER = 'M 100 24 L 170 56 L 170 126 Q 170 158 140 180 L 100 198 L 60 180 Q 30 158 30 126 L 30 56 Z';
const SHIELD_PLATE = 'M 100 36 L 158 64 L 158 124 Q 158 150 134 168 L 100 184 L 66 168 Q 42 150 42 124 L 42 64 Z';

function GradientDefs({ uid, mat }) {
  return (
    <defs>
      <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={mat.hilite} />
        <stop offset="30%" stopColor={mat.light} />
        <stop offset="60%" stopColor={mat.base} />
        <stop offset="100%" stopColor={mat.dark} />
      </linearGradient>
      <linearGradient id={`${uid}-inner`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={mat.mid} />
        <stop offset="50%" stopColor={mat.base} />
        <stop offset="100%" stopColor={mat.dark} />
      </linearGradient>
      <linearGradient id={`${uid}-plate`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={mat.plate} />
        <stop offset="100%" stopColor={mat.accent} />
      </linearGradient>
      <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.45" r="0.55">
        <stop offset="0%" stopColor={mat.hilite} stopOpacity="0.35" />
        <stop offset="70%" stopColor={mat.hilite} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-emblem`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={mat.hilite} />
        <stop offset="50%" stopColor={mat.emblem} />
        <stop offset="100%" stopColor={mat.base} />
      </linearGradient>
      <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
        <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

// Angular central sigil — detail grows V → I.
function CentralSigil({ uid, mat, complexity }) {
  const parts = [];
  parts.push(<path key="base" d="M 100 78 L 126 132 L 100 122 L 74 132 Z" fill={`url(#${uid}-emblem)`} stroke={mat.dark} strokeWidth="0.8" strokeLinejoin="miter" />);
  parts.push(<path key="shaft" d="M 96 122 L 104 122 L 104 150 L 100 154 L 96 150 Z" fill={`url(#${uid}-emblem)`} stroke={mat.dark} strokeWidth="0.6" />);
  if (complexity >= 1) parts.push(<path key="notch" d="M 88 138 L 112 138 L 110 142 L 90 142 Z" fill={mat.emblem} stroke={mat.dark} strokeWidth="0.4" />);
  if (complexity >= 2) parts.push(<path key="fins" d="M 74 132 L 66 118 L 78 124 Z M 126 132 L 134 118 L 122 124 Z" fill={mat.light} stroke={mat.dark} strokeWidth="0.4" />);
  if (complexity >= 3) parts.push(<path key="shards" d="M 60 100 L 68 108 L 66 116 L 58 108 Z M 140 100 L 132 108 L 134 116 L 142 108 Z" fill={mat.mid} stroke={mat.dark} strokeWidth="0.4" />);
  if (complexity >= 4) parts.push(<path key="crown" d="M 92 68 L 100 56 L 108 68 L 104 74 L 100 70 L 96 74 Z" fill={mat.hilite} stroke={mat.dark} strokeWidth="0.4" />);
  return <>{parts}</>;
}

// Subdivision pips — 0 pips at V, 4 at I, plus a solid-bar treatment for I.
function SubdivisionPips({ uid, mat, subIndex }) {
  const pips = subIndex;
  const baseY = 178;
  const slots = [88, 94, 100, 106, 112];
  const nodes = [];
  if (subIndex === 4) {
    nodes.push(<path key="bar" d="M 72 172 L 128 172 L 126 176 L 74 176 Z" fill={`url(#${uid}-emblem)`} />);
    [87, 95, 105, 113].forEach((cx) => {
      nodes.push(
        <path key={`solid-${cx}`} d={`M ${cx - 3} ${baseY} L ${cx} ${baseY + 5} L ${cx + 3} ${baseY} L ${cx} ${baseY - 2} Z`} fill={mat.hilite} stroke={mat.dark} strokeWidth="0.5" />
      );
    });
    return <>{nodes}</>;
  }
  nodes.push(<path key="bar" d="M 72 172 L 128 172 L 126 176 L 74 176 Z" fill={mat.dark} opacity="0.7" />);
  for (let i = 0; i < pips; i++) {
    const cx = slots[Math.min(i, 4)];
    nodes.push(
      <path key={`pip-${i}`} d={`M ${cx - 3} ${baseY} L ${cx} ${baseY + 5} L ${cx + 3} ${baseY} L ${cx} ${baseY - 2} Z`} fill={`url(#${uid}-emblem)`} stroke={mat.dark} strokeWidth="0.4" />
    );
  }
  return <>{nodes}</>;
}

// Ornaments grow with tier (Copper=0 … Diamond=5).
function TierOrnaments({ uid, mat, tierIndex }) {
  const parts = [];
  if (tierIndex >= 1) {
    parts.push(<circle key="s1" cx="40" cy="54" r="3" fill={mat.light} stroke={mat.dark} strokeWidth="0.5" />);
    parts.push(<circle key="s2" cx="160" cy="54" r="3" fill={mat.light} stroke={mat.dark} strokeWidth="0.5" />);
  }
  if (tierIndex >= 2) parts.push(<path key="chv" d="M 84 44 L 100 34 L 116 44 L 100 40 Z" fill={mat.hilite} opacity="0.85" />);
  if (tierIndex >= 3) parts.push(<path key="wings" d="M 30 90 L 20 100 L 30 110 L 32 100 Z M 170 90 L 180 100 L 170 110 L 168 100 Z" fill={mat.mid} stroke={mat.dark} strokeWidth="0.5" />);
  if (tierIndex >= 4) parts.push(<path key="border" d={SHIELD_PLATE} fill="none" stroke={mat.hilite} strokeWidth="0.5" opacity="0.5" />);
  if (tierIndex >= 5) {
    parts.push(<path key="d1" d="M 100 50 L 110 62 L 100 58 L 90 62 Z" fill={mat.hilite} opacity="0.6" />);
    parts.push(<path key="d2" d="M 58 78 L 64 84 L 60 88 L 54 82 Z M 142 78 L 136 84 L 140 88 L 146 82 Z" fill={mat.light} opacity="0.7" />);
  }
  return <>{parts}</>;
}

// Tier-specific surface texture.
function MaterialTexture({ uid, mat, tierIndex }) {
  if (tierIndex === 0) return (
    <g opacity="0.35">
      <circle cx="70" cy="72" r="1.5" fill={mat.dark} />
      <circle cx="130" cy="88" r="1" fill={mat.dark} />
      <circle cx="82" cy="110" r="1.8" fill={mat.dark} />
      <circle cx="118" cy="130" r="1.2" fill={mat.dark} />
      <circle cx="62" cy="140" r="1" fill={mat.dark} />
    </g>
  );
  if (tierIndex === 1) {
    const lines = [];
    for (let y = 60; y < 170; y += 4) lines.push(<line key={y} x1="50" y1={y} x2="150" y2={y} />);
    return <g opacity="0.22" stroke={mat.dark} strokeWidth="0.4">{lines}</g>;
  }
  if (tierIndex === 2) return <path d={SHIELD_INNER} fill={`url(#${uid}-sheen)`} style={{ mixBlendMode: 'overlay' }} />;
  if (tierIndex === 3) return <path d={SHIELD_INNER} fill={`url(#${uid}-glow)`} />;
  if (tierIndex === 4) return (
    <g opacity="0.2" stroke={mat.hilite} strokeWidth="0.3" fill="none">
      <path d="M 80 80 L 88 76 L 96 80 L 96 88 L 88 92 L 80 88 Z" />
      <path d="M 104 80 L 112 76 L 120 80 L 120 88 L 112 92 L 104 88 Z" />
      <path d="M 92 96 L 100 92 L 108 96 L 108 104 L 100 108 L 92 104 Z" />
    </g>
  );
  if (tierIndex === 5) return (
    <g opacity="0.45">
      <path d="M 100 60 L 118 88 L 100 108 L 82 88 Z" fill={mat.light} />
      <path d="M 100 60 L 118 88 L 100 88 Z" fill={mat.hilite} opacity="0.8" />
      <path d="M 100 88 L 118 88 L 100 108 Z" fill={mat.base} opacity="0.6" />
    </g>
  );
  return null;
}

function ChampionBadge({ uid }) {
  const mat = MATERIALS.Champion;
  const irid = mat.iridescent;
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={irid[0]} />
          <stop offset="25%" stopColor={irid[1]} />
          <stop offset="50%" stopColor={irid[2]} />
          <stop offset="75%" stopColor={irid[3]} />
          <stop offset="100%" stopColor={irid[4]} />
          <animate attributeName="x1" values="0;1;0" dur="8s" repeatCount="indefinite" />
        </linearGradient>
        <linearGradient id={`${uid}-plate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0b2e" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>
        <radialGradient id={`${uid}-core`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="30%" stopColor={irid[0]} stopOpacity="0.8" />
          <stop offset="70%" stopColor={irid[1]} stopOpacity="0.3" />
          <stop offset="100%" stopColor={irid[1]} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-star`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={irid[0]} />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="100%" stopColor={irid[2]} />
        </linearGradient>
      </defs>
      <path d={SHIELD_OUTER} fill={`url(#${uid}-rim)`} stroke="#000" strokeWidth="1.4" />
      <path d={SHIELD_INNER} fill="#0a0515" stroke="#2a1545" strokeWidth="1" />
      <path d={SHIELD_PLATE} fill={`url(#${uid}-plate)`} stroke="#3a1f55" strokeWidth="0.8" />
      <circle cx="100" cy="108" r="52" fill={`url(#${uid}-core)`} />
      <path d="M 100 52 L 136 132 L 64 132 Z" fill={`url(#${uid}-star)`} stroke="#000" strokeWidth="0.8" opacity="0.95" />
      <path d="M 100 170 L 64 90 L 136 90 Z" fill={`url(#${uid}-star)`} stroke="#000" strokeWidth="0.8" opacity="0.85" />
      <path d="M 100 86 L 116 96 L 116 116 L 100 126 L 84 116 L 84 96 Z" fill="#000" stroke={irid[0]} strokeWidth="1" />
      <circle cx="100" cy="106" r="6" fill="#fff" opacity="0.9" />
      <circle cx="100" cy="106" r="3" fill={irid[0]} />
      <path d="M 38 52 L 48 62 L 38 66 L 34 60 Z" fill={irid[0]} opacity="0.9" />
      <path d="M 162 52 L 152 62 L 162 66 L 166 60 Z" fill={irid[2]} opacity="0.9" />
      <path d="M 54 160 L 64 156 L 62 164 L 56 166 Z" fill={irid[3]} opacity="0.8" />
      <path d="M 146 160 L 136 156 L 138 164 L 144 166 Z" fill={irid[4]} opacity="0.8" />
      <path d="M 92 40 L 100 26 L 108 40 L 104 46 L 100 42 L 96 46 Z" fill={irid[0]} stroke="#000" strokeWidth="0.6" />
      <path d="M 68 178 L 132 178 L 128 188 L 72 188 Z" fill="#000" stroke={irid[0]} strokeWidth="0.8" />
      <text x="100" y="186" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="8" fontWeight="700" letterSpacing="3" fill={irid[0]}>CHAMPION</text>
      <path d="M 100 8 L 184 48 L 184 62 L 100 24 L 16 62 L 16 48 Z" fill="#ffffff" opacity="0.18" />
    </>
  );
}

let uidCounter = 0;

export default function RankBadge({
  rank = 'Copper',
  subIndex = 0,
  size = 96,
  title,
  className = '',
}) {
  const uid = useMemo(() => `rb-${++uidCounter}`, []);
  const isChampion = rank === 'Champion';
  const mat = MATERIALS[rank] || MATERIALS.Copper;
  const tierIndex = RANKS.indexOf(rank);
  const safeSub = Math.max(0, Math.min(4, subIndex));
  const label = isChampion ? 'Champion' : `${rank} ${SUBDIVISIONS[safeSub]}`;

  return (
    <svg
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title || label}
      width={size}
      height={(size * 220) / 200}
      className={className}
    >
      {isChampion ? (
        <ChampionBadge uid={uid} />
      ) : (
        <>
          <GradientDefs uid={uid} mat={mat} />
          <path d={SHIELD_OUTER} fill={`url(#${uid}-rim)`} stroke={mat.dark} strokeWidth="1.2" strokeLinejoin="miter" />
          <path d={SHIELD_INNER} fill={`url(#${uid}-inner)`} stroke={mat.dark} strokeWidth="0.8" strokeLinejoin="miter" />
          <path d={SHIELD_PLATE} fill={`url(#${uid}-plate)`} stroke={mat.dark} strokeWidth="0.6" strokeLinejoin="miter" />
          <MaterialTexture uid={uid} mat={mat} tierIndex={tierIndex} />
          <TierOrnaments uid={uid} mat={mat} tierIndex={tierIndex} />
          <CentralSigil uid={uid} mat={mat} complexity={safeSub} />
          <SubdivisionPips uid={uid} mat={mat} subIndex={safeSub} />
          <path d="M 100 8 L 184 48 L 184 64 L 100 24 L 16 64 L 16 48 Z" fill={mat.hilite} opacity="0.25" />
        </>
      )}
    </svg>
  );
}

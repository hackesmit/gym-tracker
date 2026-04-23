import { useMemo, useState } from 'react';

// Rank → color mapping
const RANK_COLORS = {
  Copper:    '#a97142',
  Bronze:    '#cd7f32',
  Silver:    '#c0c0c0',
  Gold:      '#d4af37',
  Platinum:  '#8abfd1',
  Diamond:   '#b9f2ff',
  Champion:  '#ff4d4d',
};
// Surface tokens — follow the active theme's dark palette so the silhouette
// reads the same on lime as it does on, say, a rivendell-teal realm.
const NEUTRAL = 'var(--color-surface-lighter)';
const STROKE  = 'var(--color-surface-dark)';
const HEAD_FILL = 'var(--color-surface-light)';

/**
 * BodyMap — stylized anatomical SVG, front + back views.
 *
 * Props:
 *   ranks        { chest: {rank, score, group}, ... }  or  { chest: 'Gold', ... }
 *   view         'front' | 'back'  (optional, internally toggled if not provided)
 *   onRegionClick (muscleKey) => void
 *   size         number (default 400) — width in px
 *   showToggle   show built-in front/back toggle (default true)
 */
export default function BodyMap({
  ranks = {},
  view: viewProp,
  onRegionClick,
  size = 400,
  showToggle = true,
}) {
  const [internalView, setInternalView] = useState('front');
  const view = viewProp || internalView;
  const [hover, setHover] = useState(null);

  // Normalize ranks: allow either {muscle: 'Gold'} or {muscle: {rank:'Gold', score, group}}
  const normalized = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(ranks || {})) {
      if (!v) continue;
      if (typeof v === 'string') out[k] = { rank: v };
      else out[k] = v;
    }
    return out;
  }, [ranks]);

  const colorFor = (key) => {
    const entry = normalized[key];
    if (!entry || !entry.rank) return NEUTRAL;
    return RANK_COLORS[entry.rank] || NEUTRAL;
  };

  const regionProps = (key, label) => ({
    'data-muscle': key,
    role: 'button',
    tabIndex: 0,
    onMouseEnter: () => setHover({ key, label }),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover({ key, label }),
    onBlur: () => setHover(null),
    onClick: () => onRegionClick && onRegionClick(key),
    onKeyDown: (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && onRegionClick) {
        e.preventDefault();
        onRegionClick(key);
      }
    },
    style: {
      fill: colorFor(key),
      stroke: STROKE,
      strokeWidth: 1.5,
      cursor: onRegionClick ? 'pointer' : 'default',
      transition: 'fill 200ms',
    },
  });

  const tooltip = hover
    ? (() => {
        const entry = normalized[hover.key];
        const rank = entry?.rank || 'Untrained';
        const score = entry?.score != null ? Math.round(entry.score) : null;
        return `${hover.label}: ${rank}${score != null ? ` · ${score}` : ''}`;
      })()
    : null;

  const width = size;
  const height = Math.round(size * 1.5);

  return (
    <div className="inline-block" style={{ width }}>
      {showToggle && !viewProp && (
        <div className="flex gap-2 mb-2 justify-center">
          {['front', 'back'].map((v) => (
            <button
              key={v}
              onClick={() => setInternalView(v)}
              className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                view === v
                  ? 'bg-accent text-surface-dark'
                  : 'bg-surface-light text-text-muted hover:text-text'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox="0 0 200 300"
        width={width}
        height={height}
        role="img"
        aria-label="Body muscle map"
        style={{ display: 'block' }}
      >
        {/* Head */}
        <ellipse cx="100" cy="25" rx="16" ry="20" fill={HEAD_FILL} stroke={STROKE} strokeWidth="1.5" />
        {/* Neck */}
        <rect x="93" y="42" width="14" height="10" fill={HEAD_FILL} stroke={STROKE} strokeWidth="1" />

        {view === 'front' ? (
          <FrontView regionProps={regionProps} />
        ) : (
          <BackView regionProps={regionProps} />
        )}
      </svg>

      <div className="text-center text-xs text-text-muted mt-1 h-4">
        {tooltip || '\u00A0'}
      </div>
    </div>
  );
}

function FrontView({ regionProps }) {
  return (
    <>
      {/* Shoulders (front) — rounded deltoids */}
      <ellipse
        id="shoulder-l"
        cx="70" cy="62" rx="14" ry="10"
        {...regionProps('shoulders', 'Shoulders')}
      />
      <ellipse
        cx="130" cy="62" rx="14" ry="10"
        {...regionProps('shoulders', 'Shoulders')}
      />

      {/* Chest — two pec shapes */}
      <path
        id="chest"
        d="M 78 58 Q 100 55 122 58 L 125 85 Q 100 92 75 85 Z"
        {...regionProps('chest', 'Chest')}
      />

      {/* Abs — torso block under chest */}
      <path
        id="abs"
        d="M 82 88 L 118 88 L 116 140 Q 100 145 84 140 Z"
        {...regionProps('abs', 'Abs')}
      />

      {/* Arms (biceps area) */}
      <ellipse
        cx="62" cy="95" rx="10" ry="22"
        {...regionProps('arms', 'Arms')}
      />
      <ellipse
        cx="138" cy="95" rx="10" ry="22"
        {...regionProps('arms', 'Arms')}
      />
      {/* Forearms */}
      <ellipse cx="58" cy="130" rx="8" ry="18" fill={HEAD_FILL} stroke={STROKE} strokeWidth="1" />
      <ellipse cx="142" cy="130" rx="8" ry="18" fill={HEAD_FILL} stroke={STROKE} strokeWidth="1" />

      {/* Hip block */}
      <path d="M 82 142 L 118 142 L 120 160 L 80 160 Z" fill={HEAD_FILL} stroke={STROKE} strokeWidth="1" />

      {/* Quads */}
      <path
        id="quads-l"
        d="M 80 162 L 97 162 L 95 230 L 78 230 Z"
        {...regionProps('quads', 'Quads')}
      />
      <path
        d="M 103 162 L 120 162 L 122 230 L 105 230 Z"
        {...regionProps('quads', 'Quads')}
      />

      {/* Calves (front view — shins, show as calves region) */}
      <ellipse cx="86" cy="260" rx="9" ry="22" {...regionProps('calves', 'Calves')} />
      <ellipse cx="114" cy="260" rx="9" ry="22" {...regionProps('calves', 'Calves')} />
    </>
  );
}
const STROKE_LOCAL = STROKE; // for reuse

function BackView({ regionProps }) {
  return (
    <>
      {/* Shoulders (back) */}
      <ellipse cx="70" cy="62" rx="14" ry="10" {...regionProps('shoulders', 'Shoulders')} />
      <ellipse cx="130" cy="62" rx="14" ry="10" {...regionProps('shoulders', 'Shoulders')} />

      {/* Traps area (upper back - grouped into 'back') */}
      <path
        d="M 85 55 L 115 55 L 118 75 L 82 75 Z"
        {...regionProps('back', 'Back')}
      />
      {/* Lats/mid-back */}
      <path
        id="back"
        d="M 78 75 L 122 75 L 120 130 L 80 130 Z"
        {...regionProps('back', 'Back')}
      />

      {/* Arms (triceps) */}
      <ellipse cx="62" cy="95" rx="10" ry="22" {...regionProps('arms', 'Arms')} />
      <ellipse cx="138" cy="95" rx="10" ry="22" {...regionProps('arms', 'Arms')} />
      <ellipse cx="58" cy="130" rx="8" ry="18" fill={HEAD_FILL} stroke={STROKE_LOCAL} strokeWidth="1" />
      <ellipse cx="142" cy="130" rx="8" ry="18" fill={HEAD_FILL} stroke={STROKE_LOCAL} strokeWidth="1" />

      {/* Glutes */}
      <path
        id="glutes"
        d="M 82 132 L 118 132 L 120 162 L 80 162 Z"
        {...regionProps('glutes', 'Glutes')}
      />

      {/* Hamstrings */}
      <path
        d="M 80 164 L 97 164 L 95 232 L 78 232 Z"
        {...regionProps('hamstrings', 'Hamstrings')}
      />
      <path
        d="M 103 164 L 120 164 L 122 232 L 105 232 Z"
        {...regionProps('hamstrings', 'Hamstrings')}
      />

      {/* Calves */}
      <ellipse cx="86" cy="262" rx="9" ry="22" {...regionProps('calves', 'Calves')} />
      <ellipse cx="114" cy="262" rx="9" ry="22" {...regionProps('calves', 'Calves')} />
    </>
  );
}

export { RANK_COLORS };

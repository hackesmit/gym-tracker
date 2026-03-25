/**
 * Lord of the Rings themed SVG icon components.
 * Converted from 128×128 illustrated SVG icon set.
 * Each icon accepts `size` (default 24) and `className` props.
 * Uses currentColor for theme compatibility.
 */

export function WhiteTree({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="64" cy="64" r="44" strokeWidth="4" />
      <path d="M64 92V56M64 56C58 54 54 48 52 42M64 56C70 54 74 48 76 42M52 42C44 44 40 38 38 32M76 42C84 44 88 38 90 32M64 68C56 68 52 74 50 80M64 68C72 68 76 74 78 80" strokeWidth="4" />
      <path d="M50 92H78" strokeWidth="4" />
    </svg>
  );
}

export function Ring({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="64" cy="64" rx="34" ry="24" transform="rotate(-18 64 64)" strokeWidth="6" />
      <ellipse cx="64" cy="64" rx="24" ry="14" transform="rotate(-18 64 64)" strokeWidth="3" />
      <path d="M48 48C58 44 72 44 84 50" strokeWidth="2.5" />
    </svg>
  );
}

export function Sword({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 18L74 30L68 36L74 42L64 52L54 42L60 36L54 30Z" fill="currentColor" opacity="0.18" strokeWidth="3" />
      <path d="M64 52V96" strokeWidth="5" />
      <path d="M44 58H84" strokeWidth="5" />
      <path d="M54 96L44 106M74 96L84 106" strokeWidth="5" />
    </svg>
  );
}

export function Shield({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 18L100 30V58C100 82 84 100 64 110C44 100 28 82 28 58V30Z" strokeWidth="4" />
      <path d="M64 32V94M42 52C42 40 50 34 64 34C78 34 86 40 86 52C86 66 76 74 64 94C52 74 42 66 42 52Z" strokeWidth="3.5" />
    </svg>
  );
}

export function Torch({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M54 74L64 36L74 74Z" strokeWidth="4" />
      <path d="M58 74H70L74 98H54Z" strokeWidth="4" />
      <path d="M64 20C52 28 54 42 64 46C74 42 76 28 64 20Z" fill="currentColor" opacity="0.18" strokeWidth="3" />
      <path d="M48 106H80" strokeWidth="4" />
    </svg>
  );
}

export function Mountain({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 92L48 42L64 62L76 50L108 92Z" strokeWidth="4" />
      <path d="M44 92L64 62L80 92Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M44 52L48 42L54 52" strokeWidth="4" />
      <path d="M73 57L76 50L82 58" strokeWidth="4" />
    </svg>
  );
}

export function Crown({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M24 88H104L96 44L76 62L64 32L52 62L32 44Z" strokeWidth="4" />
      <circle cx="32" cy="44" r="4" fill="currentColor" />
      <circle cx="64" cy="32" r="4" fill="currentColor" />
      <circle cx="96" cy="44" r="4" fill="currentColor" />
    </svg>
  );
}

export function MapScroll({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M24 34C34 28 44 30 54 36C64 42 74 44 86 38L104 30V94C92 100 82 98 72 92C62 86 52 84 40 90L24 98Z" strokeWidth="4" />
      <path d="M40 48L50 58L42 68" strokeWidth="3" />
      <path d="M62 72L70 50L84 64" strokeWidth="3" />
      <circle cx="86" cy="38" r="4" fill="currentColor" />
    </svg>
  );
}

export function Chronicle({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M28 28H62C72 28 78 34 78 44V100H42C34 100 28 94 28 86Z" strokeWidth="4" />
      <path d="M100 28H66C56 28 50 34 50 44V100H86C94 100 100 94 100 86Z" strokeWidth="4" />
      <path d="M50 44C50 34 56 28 66 28" strokeWidth="4" />
      <path d="M40 42H44M40 54H44M40 66H44" strokeWidth="3" />
      <path d="M64 46L72 54L64 62L56 54Z" strokeWidth="4" />
      <path d="M58 84H70M58 92H70" strokeWidth="3" />
    </svg>
  );
}

export function Hammer({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M30 86H96" strokeWidth="4" />
      <path d="M48 86L60 60H84L76 72H96L86 86Z" strokeWidth="4" />
      <path d="M42 44L60 56" strokeWidth="6" />
      <rect x="30" y="28" width="18" height="14" rx="2" strokeWidth="4" />
    </svg>
  );
}

export function GondorShield({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 18L100 30V58C100 82 84 100 64 110C44 100 28 82 28 58V30Z" strokeWidth="4" />
      <path d="M64 32V94M42 52C42 40 50 34 64 34C78 34 86 40 86 52C86 66 76 74 64 94C52 74 42 66 42 52Z" strokeWidth="3.5" />
    </svg>
  );
}

// ── New icons from expanded set ──

export function Barbell({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M24 64H104" strokeWidth="5" />
      <path d="M30 48V80M38 44V84M46 50V78" strokeWidth="4" />
      <path d="M98 48V80M90 44V84M82 50V78" strokeWidth="4" />
      <circle cx="64" cy="64" r="8" strokeWidth="3" />
    </svg>
  );
}

export function Trophy({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M42 26H86V44C86 60 76 70 64 74C52 70 42 60 42 44Z" strokeWidth="4" />
      <path d="M42 34H26C26 52 34 60 48 60" strokeWidth="4" />
      <path d="M86 34H102C102 52 94 60 80 60" strokeWidth="4" />
      <path d="M56 74V88H72V74" strokeWidth="4" />
      <path d="M48 98H80" strokeWidth="4" />
      <path d="M60 44H68M64 40V48" strokeWidth="3" />
    </svg>
  );
}

export function Star({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 18L72 52L106 64L72 76L64 110L56 76L22 64L56 52Z" strokeWidth="4" />
      <circle cx="64" cy="64" r="6" fill="currentColor" />
    </svg>
  );
}

export function Laurel({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M46 94C28 86 20 68 24 48C30 60 36 68 46 74" strokeWidth="4" />
      <path d="M82 94C100 86 108 68 104 48C98 60 92 68 82 74" strokeWidth="4" />
      <path d="M48 74L40 66M42 80L34 74M82 74L90 66M86 80L94 74" strokeWidth="3" />
      <path d="M54 100H74" strokeWidth="4" />
    </svg>
  );
}

export function CompassMap({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="64" cy="64" r="44" strokeWidth="4" />
      <circle cx="64" cy="64" r="6" strokeWidth="4" />
      <path d="M64 20L74 54L108 64L74 74L64 108L54 74L20 64L54 54Z" strokeWidth="4" />
      <path d="M64 28L69 59L100 64L69 69L64 100L59 69L28 64L59 59Z" fill="currentColor" opacity="0.18" stroke="none" />
      <path d="M64 12L64 24M116 64L104 64M64 116L64 104M12 64L24 64" strokeWidth="4" />
    </svg>
  );
}

export function Clock({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="64" cy="64" r="42" strokeWidth="4" />
      <path d="M64 40V66L80 78" strokeWidth="4" />
      <path d="M64 18V26M64 102V110M18 64H26M102 64H110" strokeWidth="4" />
    </svg>
  );
}

export function ArrowUp({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 22L92 50H76V98H52V50H36Z" strokeWidth="4" />
      <path d="M26 90H42M86 90H102" strokeWidth="3" />
    </svg>
  );
}

export function CrestNovice({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 12L100 24V58C100 82 84 100 64 112C44 100 28 82 28 58V24Z" strokeWidth="4" />
      <path d="M64 30V74" strokeWidth="5" />
      <path d="M46 42H82" strokeWidth="5" />
      <path d="M40 94H88" strokeWidth="3" />
    </svg>
  );
}

export function CrestSteel({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 12L100 24V58C100 82 84 100 64 112C44 100 28 82 28 58V24Z" strokeWidth="4" />
      <path d="M44 34L84 74" strokeWidth="6" />
      <rect x="36" y="28" width="18" height="14" rx="2" strokeWidth="4" />
      <path d="M40 94H88" strokeWidth="3" />
    </svg>
  );
}

export function CrestGold({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 12L100 24V58C100 82 84 100 64 112C44 100 28 82 28 58V24Z" strokeWidth="4" />
      <path d="M64 26L72 52L98 64L72 76L64 102L56 76L30 64L56 52Z" strokeWidth="4" />
    </svg>
  );
}

export function CrestElite({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M64 12L100 24V58C100 82 84 100 64 112C44 100 28 82 28 58V24Z" strokeWidth="4" />
      <path d="M64 24L70 32L64 40L58 32Z" fill="currentColor" />
      <path d="M64 86V50M64 50C58 48 54 42 52 36M64 50C70 48 74 42 76 36M52 36C44 38 40 32 38 28M76 36C84 38 88 32 90 28M64 62C56 62 52 68 50 74M64 62C72 62 76 68 78 74" strokeWidth="3.5" />
      <path d="M50 86H78" strokeWidth="4" />
    </svg>
  );
}

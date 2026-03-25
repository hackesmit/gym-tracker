import React from 'react';

// ---------------------------------------------------------------------------
// GondorDivider -- Noble symmetrical divider with a diamond center
// ---------------------------------------------------------------------------
export function GondorDivider({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 my-4 ${className}`}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/40 to-transparent" />
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="text-[var(--color-accent)] opacity-60 shrink-0"
        aria-hidden="true"
      >
        <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="currentColor" />
      </svg>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/40 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ElvenDivider -- Flowing leaf motif, teal-green tinted (Rivendell)
// ---------------------------------------------------------------------------
export function ElvenDivider({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 my-4 ${className}`}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--color-rivendell)]/30 to-[var(--color-rivendell)]/40" />
      <svg
        width="20"
        height="12"
        viewBox="0 0 20 12"
        className="text-[var(--color-rivendell)] opacity-60 shrink-0"
        aria-hidden="true"
      >
        {/* Stylised leaf / flowing curve */}
        <path
          d="M10 1 C7 1 4 4 2 6 C4 8 7 11 10 11 C13 11 16 8 18 6 C16 4 13 1 10 1 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path d="M10 3 L10 9" stroke="currentColor" strokeWidth="0.75" />
      </svg>
      <div className="flex-1 h-px bg-gradient-to-r from-[var(--color-rivendell)]/40 via-[var(--color-rivendell)]/30 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DwarvenDivider -- Heavy angular geometric, bronze/copper (strength / PRs)
// ---------------------------------------------------------------------------
export function DwarvenDivider({ className = '' }) {
  return (
    <div className={`flex items-center gap-3 my-4 ${className}`}>
      <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-[var(--color-dwarven)]/50 to-[var(--color-dwarven)]/60" />
      <svg
        width="16"
        height="12"
        viewBox="0 0 16 12"
        className="text-[var(--color-dwarven)] opacity-70 shrink-0"
        aria-hidden="true"
      >
        {/* Angular / anvil-inspired shape */}
        <path d="M2 6 L5 1 L11 1 L14 6 L11 11 L5 11 Z" fill="currentColor" />
        <path d="M5 4 L8 2 L11 4 L11 8 L8 10 L5 8 Z" fill="var(--color-surface, #1a1a2e)" />
      </svg>
      <div className="flex-1 h-[2px] bg-gradient-to-r from-[var(--color-dwarven)]/60 via-[var(--color-dwarven)]/50 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader -- Themed page header with realm-based divider & accent
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  icon,
  realm = 'gondor',
  className = '',
}) {
  const Divider =
    realm === 'rivendell'
      ? ElvenDivider
      : realm === 'dwarven'
        ? DwarvenDivider
        : GondorDivider;

  const accentClass =
    realm === 'rivendell'
      ? 'text-[var(--color-rivendell)]'
      : realm === 'dwarven'
        ? 'text-[var(--color-dwarven)]'
        : 'text-[var(--color-accent)]';

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {icon && <span className={`text-2xl ${accentClass}`}>{icon}</span>}
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide text-text">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-text-muted mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      <Divider />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EngravedFrame -- Double-border ornamental wrapper
// ---------------------------------------------------------------------------
export function EngravedFrame({
  children,
  realm = 'gondor',
  className = '',
}) {
  const colorVar =
    realm === 'dwarven' ? 'var(--color-dwarven)' : 'var(--color-accent)';

  return (
    <div
      className={`relative rounded-lg ${className}`}
      style={{
        border: `1px solid color-mix(in srgb, ${colorVar} 30%, transparent)`,
        boxShadow: `inset 0 0 0 3px color-mix(in srgb, ${colorVar} 8%, transparent), 0 0 0 1px color-mix(in srgb, ${colorVar} 15%, transparent)`,
      }}
    >
      {/* Corner accents */}
      <span
        className="absolute top-0 left-0 w-3 h-3 border-t border-l rounded-tl-lg"
        style={{ borderColor: `color-mix(in srgb, ${colorVar} 50%, transparent)` }}
        aria-hidden="true"
      />
      <span
        className="absolute top-0 right-0 w-3 h-3 border-t border-r rounded-tr-lg"
        style={{ borderColor: `color-mix(in srgb, ${colorVar} 50%, transparent)` }}
        aria-hidden="true"
      />
      <span
        className="absolute bottom-0 left-0 w-3 h-3 border-b border-l rounded-bl-lg"
        style={{ borderColor: `color-mix(in srgb, ${colorVar} 50%, transparent)` }}
        aria-hidden="true"
      />
      <span
        className="absolute bottom-0 right-0 w-3 h-3 border-b border-r rounded-br-lg"
        style={{ borderColor: `color-mix(in srgb, ${colorVar} 50%, transparent)` }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

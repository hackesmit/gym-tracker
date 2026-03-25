const VARIANT_CLASSES = {
  default: 'stone-panel',
  heraldic: 'heraldic-card',
  rivendell: 'rivendell-card',
  dwarven: 'forged-panel',
  chronicle: 'chronicle-card',
  parchment: 'parchment-panel',
};

export default function Card({ title, children, className = '', action, variant = 'default' }) {
  const base = VARIANT_CLASSES[variant] || VARIANT_CLASSES.default;

  return (
    <div className={`${base} p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

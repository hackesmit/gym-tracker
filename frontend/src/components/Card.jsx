export default function Card({ title, children, className = '', action }) {
  return (
    <div className={`bg-surface rounded-xl border border-surface-lighter p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

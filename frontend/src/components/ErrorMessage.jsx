import { AlertTriangle } from 'lucide-react';

export default function ErrorMessage({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertTriangle className="text-danger mb-3" size={32} />
      <p className="text-text-muted text-sm mb-3">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm text-accent hover:text-accent-light transition-colors">
          Try again
        </button>
      )}
    </div>
  );
}

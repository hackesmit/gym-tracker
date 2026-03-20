import { useState, useEffect } from 'react';

export default function LoadingSpinner() {
  const [showColdStart, setShowColdStart] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowColdStart(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 w-48 bg-surface-light rounded-lg" />

      {/* Cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-surface-lighter rounded-xl p-5">
            <div className="h-4 w-32 bg-surface-light rounded mb-4" />
            <div className="space-y-3">
              <div className="h-3 w-full bg-surface-light rounded" />
              <div className="h-3 w-3/4 bg-surface-light rounded" />
              <div className="h-3 w-1/2 bg-surface-light rounded" />
            </div>
            <div className="h-32 w-full bg-surface-light rounded-lg mt-4" />
          </div>
        ))}
      </div>

      {/* Cold start message */}
      {showColdStart && (
        <p className="text-center text-sm text-text-muted animate-fade-in">
          Waking up server — free tier sleeps after 15 min of inactivity...
        </p>
      )}
    </div>
  );
}

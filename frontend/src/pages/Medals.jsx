import { useEffect, useState } from 'react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { listMedals, getMyMedals } from '../api/client';
import { Trophy } from 'lucide-react';

export default function Medals() {
  const [all, setAll] = useState([]);
  const [mine, setMine] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([listMedals(), getMyMedals()])
      .then(([a, m]) => {
        setAll(a.medals || a || []);
        const held = new Set((m.medals || m || []).map((x) => x.medal_id || x.id || x.key));
        setMine(held);
      })
      .catch((ex) => setErr(ex.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (err) return <p className="text-sm text-danger">{err}</p>;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Medals</h2>
      <p className="text-sm text-text-muted">
        King-of-the-hill records across all users. Hold a medal by setting the top value.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {all.map((m) => {
          const id = m.id || m.key;
          const isMine = mine.has(id);
          return (
            <Card key={id} className={isMine ? 'ring-2 ring-accent' : ''}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
                  <Trophy size={18} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text truncate">{m.name || m.label || id}</p>
                    {isMine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-surface-dark font-semibold">YOURS</span>}
                  </div>
                  {m.description && <p className="text-xs text-text-muted mt-0.5">{m.description}</p>}
                  <div className="mt-2 text-xs">
                    {(() => {
                      const holder = m.holder || null;
                      const holderName = holder?.username || m.holder_username || m.current_holder;
                      const value = holder?.value ?? m.current_value;
                      return (
                        <>
                          <p>
                            <span className="text-text-muted">Holder:</span>{' '}
                            <span className="font-medium">{holderName || '—'}</span>
                          </p>
                          {value != null && (
                            <p>
                              <span className="text-text-muted">Value:</span>{' '}
                              <span className="font-medium">
                                {typeof value === 'number' ? value.toLocaleString() : value}
                                {m.unit ? ` ${m.unit}` : ''}
                              </span>
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {!all.length && <p className="text-sm text-text-muted">No medals defined yet.</p>}
      </div>
    </div>
  );
}

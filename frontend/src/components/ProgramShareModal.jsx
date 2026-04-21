import { useEffect, useState } from 'react';
import { Copy, Check, X, Share2, Trash2 } from 'lucide-react';
import {
  enableProgramShare,
  disableProgramShare,
} from '../api/client';

export default function ProgramShareModal({ program, onClose, onChange }) {
  const [code, setCode] = useState(program?.share_code || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCode(program?.share_code || null);
  }, [program]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await enableProgramShare(program.id);
      setCode(res.share_code);
      onChange?.();
    } catch (err) {
      setError(err.message || 'Failed to enable sharing');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!window.confirm('Revoke this share code? Anyone holding it can no longer import.')) return;
    setBusy(true);
    setError(null);
    try {
      await disableProgramShare(program.id);
      setCode(null);
      onChange?.();
    } catch (err) {
      setError(err.message || 'Failed to revoke');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="stone-panel max-w-md w-full p-5 rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Share2 size={18} className="text-accent" /> Share program
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-text-muted mb-4">
          Anyone with this code can import a private copy of{' '}
          <span className="text-text font-medium">{program.name}</span>. Their edits
          and logs stay on their side; yours stay on yours.
        </p>

        {code ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-surface-light rounded-lg px-3 py-2.5 font-mono text-lg tracking-widest text-center">
                {code}
              </div>
              <button
                onClick={copy}
                className="px-3 py-2.5 rounded-lg bg-accent text-surface-dark hover:bg-accent-dark transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <button
              onClick={disable}
              disabled={busy}
              className="w-full py-2 rounded-lg text-sm font-medium text-danger bg-surface-light hover:bg-surface-lighter flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 size={14} /> Revoke share code
            </button>
          </div>
        ) : (
          <button
            onClick={enable}
            disabled={busy}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-accent text-surface-dark hover:bg-accent-dark disabled:opacity-50 transition-colors"
          >
            {busy ? 'Generating…' : 'Enable sharing'}
          </button>
        )}

        {error && <p className="text-xs text-danger mt-3">{error}</p>}
      </div>
    </div>
  );
}

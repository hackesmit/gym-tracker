import { useState } from 'react';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';
import { previewSharedProgram, importSharedProgram } from '../api/client';
import { useApp } from '../context/AppContext';

export default function ImportSharedProgram({ onImported }) {
  const { refreshPrograms } = useApp();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [rename, setRename] = useState('');

  const doPreview = async () => {
    const c = code.trim();
    if (!c) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const p = await previewSharedProgram(c);
      setPreview(p);
      setRename(p.name);
    } catch (err) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await importSharedProgram(code.trim(), {
        rename: rename.trim() || preview.name,
      });
      setResult(res);
      await refreshPrograms();
      onImported?.(res);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (result) {
    return (
      <div className="text-center py-4">
        <CheckCircle2 className="text-success mx-auto mb-2" size={28} />
        <p className="text-sm font-medium">Program imported</p>
        <p className="text-xs text-text-muted mt-1">
          {result.exercises_copied} exercises copied · now active
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter share code"
          className="flex-1 bg-surface-light rounded-lg px-3 py-2 text-sm font-mono tracking-widest uppercase placeholder:normal-case placeholder:tracking-normal"
          maxLength={16}
        />
        <button
          onClick={doPreview}
          disabled={!code.trim() || loading}
          className="px-3 py-2 rounded-lg bg-surface-light text-sm font-medium hover:bg-surface-lighter disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : 'Preview'}
        </button>
      </div>

      {preview && (
        <div className="stone-panel p-3 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-text-muted">Name</span>
            <span className="font-medium">{preview.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Owner</span>
            <span>{preview.owner_username || preview.owner_name || 'Unknown'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Frequency</span>
            <span>{preview.frequency}x / week</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Weeks</span>
            <span>{preview.total_weeks}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Exercises</span>
            <span>{preview.total_exercises}</span>
          </div>

          <div className="pt-2 space-y-1">
            <label className="text-xs text-text-muted">Rename on import (optional)</label>
            <input
              value={rename}
              onChange={(e) => setRename(e.target.value)}
              className="w-full bg-surface-light rounded-lg px-3 py-2 text-sm"
              placeholder={preview.name}
            />
          </div>

          <button
            onClick={doImport}
            disabled={importing}
            className="w-full py-2 rounded-lg bg-accent text-surface-dark text-sm font-medium hover:bg-accent-dark disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="animate-spin" size={16} /> Importing…
              </>
            ) : (
              <>
                <Download size={14} /> Import as my program
              </>
            )}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

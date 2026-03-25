import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Check } from 'lucide-react';
import { importProgram } from '../api/client';
import { useApp } from '../context/AppContext';

export default function ProgramUpload() {
  const { refreshPrograms } = useApp();
  const [file, setFile] = useState(null);
  const [frequency, setFrequency] = useState(4);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await importProgram(file, frequency);
      setResult(res);
      await refreshPrograms();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (result) {
    return (
      <div className="text-center py-4">
        <Check className="text-success mx-auto mb-2" size={32} />
        <p className="text-sm font-medium">Program imported!</p>
        <p className="text-xs text-text-muted mt-1">
          {result.total_exercises} exercises across {result.frequency}x/week
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-surface-lighter rounded-lg p-6 text-center cursor-pointer hover:border-accent/50 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => setFile(e.target.files[0])}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileSpreadsheet size={18} className="text-success" />
            <span>{file.name}</span>
          </div>
        ) : (
          <div className="text-text-muted">
            <Upload size={24} className="mx-auto mb-2" />
            <p className="text-sm">Drop .xlsx file or click to browse</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <label className="text-xs text-text-muted">Frequency:</label>
        {[2, 3, 4, 5].map((f) => (
          <button
            key={f}
            onClick={() => setFrequency(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              frequency === f ? 'bg-accent text-surface-dark' : 'bg-surface-light text-text-muted hover:text-text'
            }`}
          >
            {f}x
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full py-2.5 rounded-lg bg-accent text-surface-dark text-sm font-medium disabled:opacity-50 hover:bg-accent-dark transition-colors"
      >
        {uploading ? 'Importing...' : 'Import Program'}
      </button>
    </div>
  );
}

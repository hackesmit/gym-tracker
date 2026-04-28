import { useState } from 'react';
import { Save } from 'lucide-react';

/**
 * Inline "Set BW" affordance shown in SetRow when the user has no recorded
 * bodyweight. Tapping reveals a numeric input. Submission calls the parent's
 * onSubmit (which POSTs /api/body-metrics and refreshes user state).
 *
 * Auto-saves on Enter and on blur so users don't have to find the dedicated
 * save icon. Optional `onValueChange` lets a parent observe the unsaved draft
 * (used by Logger to flush a pending value before the main session save).
 */
export default function SetBwPrompt({ unitLabel, onSubmit, onValueChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (next) => {
    setValue(next);
    if (onValueChange) onValueChange(next);
  };

  const handleSave = async () => {
    if (saving) return;
    const num = parseFloat(value);
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await onSubmit(num);
      setEditing(false);
      setValue('');
      if (onValueChange) onValueChange('');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="px-2 py-1.5 text-[10px] uppercase tracking-wider rounded-lg border border-dashed border-accent/60 text-accent-light hover:bg-accent/10 touch-manipulation"
      >
        Set BW
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        placeholder={`BW (${unitLabel})`}
        className="bg-surface-light border border-accent rounded-lg px-2 py-1.5 text-xs text-text w-20 focus:ring-1 focus:ring-accent outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        aria-label="Save"
        className="p-1.5 rounded-lg bg-accent text-accent-ink touch-manipulation disabled:opacity-50"
      >
        <Save size={12} />
      </button>
    </div>
  );
}

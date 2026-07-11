// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SetRow from '../SetRow';

const baseSet = {
  set_number: 1, load_kg: '', reps_completed: '',
  rpe_actual: '', is_dropset: false,
};

const noop = () => {};

function renderRow(props) {
  return render(<SetRow
    set={baseSet}
    bodyweightKind={null}
    userBodyweightKg={80}
    unitLabel="kg"
    units="kg"
    onUpdate={noop}
    onTriggerTimer={noop}
    onSetBw={noop}
    {...props}
  />);
}

describe('SetRow', () => {
  it('renders external-load layout when bodyweightKind is null', () => {
    renderRow({ bodyweightKind: null });
    expect(screen.getByLabelText(/weight/i)).toBeInTheDocument();
    expect(screen.queryByText(/^BW$/i)).not.toBeInTheDocument();
  });

  it('renders pure-BW layout: BW chip read-only, no Added field, no DS button', () => {
    renderRow({ bodyweightKind: 'pure', userBodyweightKg: 80 });
    expect(screen.getByText(/80/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/added/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^DS$/ })).not.toBeInTheDocument();
  });

  it('renders weighted-capable layout: BW + Added + Total', () => {
    renderRow({
      bodyweightKind: 'weighted_capable',
      userBodyweightKg: 80,
      set: { ...baseSet, added_load_kg: 25 },
    });
    expect(screen.getByText(/80/)).toBeInTheDocument();
    expect(screen.getByLabelText(/added/i)).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toBeInTheDocument();
    expect(screen.getByText(/105/)).toBeInTheDocument();
  });

  it('renders Set BW prompt when userBodyweightKg is null', () => {
    renderRow({ bodyweightKind: 'pure', userBodyweightKg: null });
    expect(screen.getByRole('button', { name: /set bw/i })).toBeInTheDocument();
    expect(screen.queryByText(/^80$/)).not.toBeInTheDocument();
  });

  it('shows DS button on weighted-capable layout', () => {
    renderRow({ bodyweightKind: 'weighted_capable', userBodyweightKg: 80 });
    expect(screen.getByRole('button', { name: /DS/ })).toBeInTheDocument();
  });

  it('shows 1RM button on external layout when reps_completed === 1', () => {
    renderRow({
      bodyweightKind: null,
      set: { ...baseSet, reps_completed: 1, is_true_1rm_attempt: false },
    });
    expect(screen.getByRole('button', { name: /1RM/ })).toBeInTheDocument();
  });

  it('hides 1RM button on external layout when reps_completed > 1', () => {
    renderRow({
      bodyweightKind: null,
      set: { ...baseSet, reps_completed: 5, is_true_1rm_attempt: false },
    });
    expect(screen.queryByRole('button', { name: /1RM/ })).not.toBeInTheDocument();
  });

  it('shows 1RM button on pure-BW layout when reps_completed === 1', () => {
    renderRow({
      bodyweightKind: 'pure',
      userBodyweightKg: 80,
      set: { ...baseSet, reps_completed: 1, is_true_1rm_attempt: false },
    });
    expect(screen.getByRole('button', { name: /1RM/ })).toBeInTheDocument();
  });

  it('hides 1RM button on pure-BW layout when reps_completed > 1', () => {
    renderRow({
      bodyweightKind: 'pure',
      userBodyweightKg: 80,
      set: { ...baseSet, reps_completed: 3, is_true_1rm_attempt: false },
    });
    expect(screen.queryByRole('button', { name: /1RM/ })).not.toBeInTheDocument();
  });

  it('weighted-capable Total in lbs mode converts added correctly', () => {
    // BW 80 kg = 176.5 lbs; user types added=20 in display units (lbs).
    // Total kg = 80 + displayToKg(20, 'lbs') = 80 + 9.072 = 89.07 kg.
    // Total displayed in lbs = kgToDisplay(89.07, 'lbs') = 196.5 lbs.
    renderRow({
      bodyweightKind: 'weighted_capable',
      userBodyweightKg: 80,
      units: 'lbs',
      unitLabel: 'lbs',
      set: { ...baseSet, added_load_kg: 20 },
    });
    expect(screen.getByText(/total/i)).toBeInTheDocument();
    // Allow either 196 or 196.5 in case of rounding nuance
    expect(screen.getByText(/196/)).toBeInTheDocument();
  });

  it('external layout label has no unit text', () => {
    renderRow({ bodyweightKind: null, unitLabel: 'lbs', units: 'lbs' });
    expect(screen.getByLabelText(/^weight$/i)).toBeInTheDocument();
    expect(screen.queryByText(/lbs/i)).not.toBeInTheDocument();
  });

  it('pure-BW chip shows "BW" with no "auto" wording', () => {
    renderRow({ bodyweightKind: 'pure', userBodyweightKg: 80, unitLabel: 'lbs', units: 'lbs' });
    expect(screen.getByText(/^BW$/)).toBeInTheDocument();
    expect(screen.queryByText(/auto/i)).not.toBeInTheDocument();
  });

  describe('weight input validation — external layout (load_kg)', () => {
    it('rejects a negative value with a visible inline error and does not call onUpdate', () => {
      const onUpdate = vi.fn();
      renderRow({ bodyweightKind: null, onUpdate });
      const input = screen.getByLabelText(/^weight$/i);
      fireEvent.change(input, { target: { value: '-5' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric value with a visible inline error and does not call onUpdate', () => {
      const onUpdate = vi.fn();
      renderRow({ bodyweightKind: null, onUpdate });
      const input = screen.getByLabelText(/^weight$/i);
      fireEvent.change(input, { target: { value: 'abc' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('rejects pasted garbage containing e/E/+ with a visible inline error and does not call onUpdate', () => {
      const onUpdate = vi.fn();
      renderRow({ bodyweightKind: null, onUpdate });
      const input = screen.getByLabelText(/^weight$/i);
      fireEvent.change(input, { target: { value: '1e5' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: '+5' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('clears the error once the value is corrected to something valid', () => {
      const onUpdate = vi.fn();
      renderRow({ bodyweightKind: null, onUpdate });
      const input = screen.getByLabelText(/^weight$/i);
      fireEvent.change(input, { target: { value: '-5' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: '62.5' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onUpdate).toHaveBeenCalledWith('load_kg', '62.5');
    });

    it('propagates a valid decimal value via onUpdate unchanged, with no error', () => {
      const onUpdate = vi.fn();
      renderRow({ bodyweightKind: null, onUpdate });
      const input = screen.getByLabelText(/^weight$/i);
      fireEvent.change(input, { target: { value: '62.5' } });
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith('load_kg', '62.5');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('allows clearing the field to empty with no error, and propagates the empty value', () => {
      const onUpdate = vi.fn();
      renderRow({ bodyweightKind: null, set: { ...baseSet, load_kg: '50' }, onUpdate });
      const input = screen.getByLabelText(/^weight$/i);
      fireEvent.change(input, { target: { value: '' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onUpdate).toHaveBeenCalledWith('load_kg', '');
    });
  });

  describe('weight input validation — weighted-capable layout (added_load_kg)', () => {
    it('rejects a negative added-load value with a visible inline error and does not call onUpdate', () => {
      const onUpdate = vi.fn();
      renderRow({
        bodyweightKind: 'weighted_capable', userBodyweightKg: 80, onUpdate,
        set: { ...baseSet, added_load_kg: 25 },
      });
      const input = screen.getByLabelText(/added/i);
      fireEvent.change(input, { target: { value: '-10' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric added-load value with a visible inline error and does not call onUpdate', () => {
      const onUpdate = vi.fn();
      renderRow({
        bodyweightKind: 'weighted_capable', userBodyweightKg: 80, onUpdate,
        set: { ...baseSet, added_load_kg: 25 },
      });
      const input = screen.getByLabelText(/added/i);
      fireEvent.change(input, { target: { value: 'nope' } });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('propagates a valid decimal added-load value via onUpdate unchanged, with no error', () => {
      const onUpdate = vi.fn();
      renderRow({
        bodyweightKind: 'weighted_capable', userBodyweightKg: 80, onUpdate,
        set: { ...baseSet, added_load_kg: 25 },
      });
      const input = screen.getByLabelText(/added/i);
      fireEvent.change(input, { target: { value: '22.5' } });
      expect(onUpdate).toHaveBeenCalledWith('added_load_kg', '22.5');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('allows clearing the added-load field to empty with no error', () => {
      const onUpdate = vi.fn();
      renderRow({
        bodyweightKind: 'weighted_capable', userBodyweightKg: 80, onUpdate,
        set: { ...baseSet, added_load_kg: 25 },
      });
      const input = screen.getByLabelText(/added/i);
      fireEvent.change(input, { target: { value: '' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onUpdate).toHaveBeenCalledWith('added_load_kg', '');
    });
  });
});

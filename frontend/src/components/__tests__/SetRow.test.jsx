// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByLabelText(/kg/i)).toBeInTheDocument();
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
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MedalLeaderboardModal from '../MedalLeaderboardModal';

vi.mock('../../api/client', () => ({
  getMedalLeaderboard: vi.fn(async () => ({
    medal: {
      id: 1, name: 'Strongest Bench 1RM',
      metric_type: 'strength_1rm:bench', unit: 'kg',
      higher_is_better: true, category: 'strength',
    },
    entries: [
      { user_id: 2, username: 'bob',   value: 120.0, achieved_at: '2026-04-01T00:00:00Z' },
      { user_id: 1, username: 'alice', value: 100.0, achieved_at: '2026-03-01T00:00:00Z' },
    ],
  })),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'alice' } }),
}));

vi.mock('../../i18n', () => ({
  useT: () => (key) => key,
}));

describe('MedalLeaderboardModal', () => {
  it('renders entries in order and highlights the current user row', async () => {
    render(<MedalLeaderboardModal medal={{ id: 1, name: 'Strongest Bench 1RM' }} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('bob')).toBeInTheDocument());
    const rows = screen.getAllByTestId('leaderboard-row');
    expect(rows.map((r) => r.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('bob'), expect.stringContaining('alice')]),
    );
    expect(rows[0].textContent).toContain('bob');
    expect(rows[1].textContent).toContain('alice');
    // Current-user row gets the marker class.
    expect(rows[1].getAttribute('data-current-user')).toBe('true');
  });
});

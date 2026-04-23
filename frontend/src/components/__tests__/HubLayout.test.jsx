// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HubLayout from '../HubLayout';

// Mock useT — i18n resolves labelKey strings to themselves if no key
vi.mock('../../i18n', () => ({
  useT: () => (key) => key,
}));

const TABS = [
  { to: 'a', labelKey: 'hub.a' },
  { to: 'b', labelKey: 'hub.b' },
];

function TestHub() {
  return <HubLayout tabs={TABS} />;
}

describe('HubLayout', () => {
  it('renders all tab labels and the outlet content for the active route', () => {
    render(
      <MemoryRouter initialEntries={['/hub/a']}>
        <Routes>
          <Route path="/hub" element={<TestHub />}>
            <Route path="a" element={<div>content-a</div>} />
            <Route path="b" element={<div>content-b</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('hub.a')).toBeInTheDocument();
    expect(screen.getByText('hub.b')).toBeInTheDocument();
    expect(screen.getByText('content-a')).toBeInTheDocument();
  });
});

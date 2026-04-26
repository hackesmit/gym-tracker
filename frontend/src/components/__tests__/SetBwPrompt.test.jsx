// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SetBwPrompt from '../SetBwPrompt';

describe('SetBwPrompt', () => {
  it('renders the Set BW button initially', () => {
    render(<SetBwPrompt unitLabel="kg" onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: /set bw/i })).toBeInTheDocument();
  });

  it('reveals an input when tapped', () => {
    render(<SetBwPrompt unitLabel="kg" onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    expect(screen.getByPlaceholderText(/bw/i)).toBeInTheDocument();
  });

  it('calls onSubmit with the entered numeric value', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(80);
    });
  });

  it('does not call onSubmit on empty submission', () => {
    const onSubmit = vi.fn();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

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

  it('saves on Enter key', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '82.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(82.5);
    });
  });

  it('saves on blur when value > 0', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '78' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(78);
    });
  });

  it('does not call onSubmit on blur when value is empty', () => {
    const onSubmit = vi.fn();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not double-submit when Enter and click happen close together', async () => {
    let resolve;
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolve();
  });

  it('fires onValueChange as the user types', () => {
    const onValueChange = vi.fn();
    render(<SetBwPrompt unitLabel="kg" onSubmit={() => {}} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.change(input, { target: { value: '75' } });
    expect(onValueChange).toHaveBeenLastCalledWith('75');
  });
});

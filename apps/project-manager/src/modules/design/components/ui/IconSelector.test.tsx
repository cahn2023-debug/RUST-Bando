import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconSelector } from './IconSelector';

describe('IconSelector', () => {
  it('shows the canonical display name and object type for each option', () => {
    render(<IconSelector value="cctv" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'CCTV · cctv' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tủ thông tin (1.2x0.6m) · info_cabinet' })).toBeInTheDocument();
  });

  it('shows a mixed state without selecting an arbitrary icon', () => {
    render(<IconSelector value={null} mixed onChange={vi.fn()} />);

    expect(screen.getByText('KHÁC NHAU')).toBeInTheDocument();
    expect(screen.getAllByRole('button').every((button) => button.getAttribute('aria-pressed') !== 'true')).toBe(true);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Save } from 'lucide-react';
import { Button } from './Button';

describe('Button', () => {
  it('labels icon-only controls and exposes loading state', () => {
    render(<Button icon={Save} ariaLabel="Save project" loading />);

    const button = screen.getByRole('button', { name: 'Save project' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

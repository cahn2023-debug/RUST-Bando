import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppMenu } from './AppMenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: { count?: number }) => {
      if (options?.count !== undefined) return `${options.count} projects`;
      return fallback || _key;
    },
  }),
}));

vi.mock('@IMPLEMENT/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

describe('AppMenu', () => {
  it('supports Escape and keyboard activation of a recent project', async () => {
    const onClose = vi.fn();
    const onOpenProject = vi.fn();
    const user = userEvent.setup();

    render(
      <AppMenu
        isOpen
        onClose={onClose}
        onOpenProject={onOpenProject}
        projects={[{ id: 1, name: 'Demo', path: 'D:/demo.pmp' } as never]}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Application menu' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());

    const project = screen.getByRole('button', { name: /Demo D:\/demo\.pmp/i });
    project.focus();
    await user.keyboard('{Enter}');

    expect(onOpenProject).toHaveBeenCalledWith('D:/demo.pmp');
    expect(onClose).toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

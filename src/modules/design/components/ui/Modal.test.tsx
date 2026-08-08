import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('exposes an accessible name and closes on Escape', async () => {
    const onClose = vi.fn();

    render(
      <Modal isOpen onClose={onClose} ariaLabel="Settings dialog">
        <h2>Settings</h2>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the invoking control when closed', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">Open settings</button>
        <Modal isOpen={false} onClose={onClose} ariaLabel="Settings dialog">
          <button type="button">Save</button>
        </Modal>
      </>
    );

    const trigger = screen.getByRole('button', { name: 'Open settings' });
    trigger.focus();
    rerender(
      <>
        <button type="button">Open settings</button>
        <Modal isOpen onClose={onClose} ariaLabel="Settings dialog">
          <button type="button">Save</button>
        </Modal>
      </>
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
    rerender(
      <>
        <button type="button">Open settings</button>
        <Modal isOpen={false} onClose={onClose} ariaLabel="Settings dialog">
          <button type="button">Save</button>
        </Modal>
      </>
    );

    expect(screen.getByRole('button', { name: 'Open settings' })).toHaveFocus();
  });
});

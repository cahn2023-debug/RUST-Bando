import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmUserAction } from './userConfirmation';

describe('confirmUserAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the dialog result and forwards the message', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);

    await expect(confirmUserAction('Save changes?')).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith('Save changes?');
  });

  it('honors a cancelled dialog', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));

    await expect(confirmUserAction('Delete item?')).resolves.toBe(false);
  });

  it('fails closed when the dialog is unavailable or throws', async () => {
    vi.stubGlobal('confirm', undefined);
    await expect(confirmUserAction('Save changes?')).resolves.toBe(false);

    vi.stubGlobal('confirm', vi.fn(() => {
      throw new Error('dialog unavailable');
    }));
    await expect(confirmUserAction('Save changes?', { fallbackOnDialogError: true })).resolves.toBe(false);
  });
});

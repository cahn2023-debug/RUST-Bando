import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@IMPLEMENT/lib/tauri', () => ({
  safeInvoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'get_current_user') {
      return Promise.resolve({
        id: 'desktop-local-user',
        email: 'engineer@local.cad',
        name: 'Kỹ sư Viễn thông',
        role: 'engineer',
      });
    }
    return Promise.resolve(null);
  }),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main' }),
}));

describe('useAuthStore (Local Auth)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('hydrates default local engineer user on initAuth', async () => {
    const { initAuth, useAuthStore } = await import('./useAuthStore');
    await initAuth();

    expect(useAuthStore.getState()).toEqual(expect.objectContaining({
      user: expect.objectContaining({
        email: 'engineer@local.cad',
        role: 'engineer',
      }),
      loading: false,
      initialized: true,
    }));
  });

  it('handles local logout successfully', async () => {
    const { initAuth, useAuthStore } = await import('./useAuthStore');
    await initAuth();

    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

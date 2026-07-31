import { afterEach, describe, expect, it, vi } from 'vitest';

const firebaseAuthMocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn(() => Promise.resolve()),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: {},
  onAuthStateChanged: firebaseAuthMocks.onAuthStateChanged,
  setPersistence: firebaseAuthMocks.setPersistence,
  signInWithEmailAndPassword: firebaseAuthMocks.signInWithEmailAndPassword,
  createUserWithEmailAndPassword: firebaseAuthMocks.createUserWithEmailAndPassword,
  signOut: firebaseAuthMocks.signOut,
}));

vi.mock('@IMPLEMENT/lib/firebase', () => ({
  auth: { currentUser: null },
}));

vi.mock('@IMPLEMENT/lib/tauri', () => ({
  safeInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main' }),
}));

describe('initAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.useRealTimers();
  });

  it('confirms an initial main-window null user immediately without a stability buffer', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    firebaseAuthMocks.onAuthStateChanged.mockReset();
    firebaseAuthMocks.setPersistence.mockClear();

    const { initAuth, useAuthStore } = await import('./useAuthStore');
    const initPromise = initAuth();
    await vi.waitFor(() => {
      expect(firebaseAuthMocks.onAuthStateChanged).toHaveBeenCalled();
    });
    const handleAuthChange = firebaseAuthMocks.onAuthStateChanged.mock.calls[0][1];
    handleAuthChange(null);

    await vi.advanceTimersByTimeAsync(0);
    await initPromise;

    expect(useAuthStore.getState()).toEqual(expect.objectContaining({
      user: null,
      loading: false,
      initialized: true,
    }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Confirming No-User state instantly'));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('10000ms'));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('stability buffer'));
  });
});

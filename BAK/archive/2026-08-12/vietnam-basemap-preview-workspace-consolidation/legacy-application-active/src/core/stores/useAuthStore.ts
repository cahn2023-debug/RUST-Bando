console.log("[Trace] useAuthStore.ts: Loading local auth dependencies...");
import { create } from 'zustand';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import { getCurrentWindow } from '@/contracts/tauri-api/runtime';

export interface LocalUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  hardwareId?: string;
  photoURL?: string;
}

interface AuthState {
  user: LocalUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  isStandalone: boolean;
  tauriLabel: string;

  setUser: (user: LocalUser | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;

  loginEmail: (email: string, pass: string) => Promise<void>;
  signUpEmail: (email: string, pass: string) => Promise<void>;
  loginGoogle?: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
}

const INITIAL_SEARCH = typeof window !== 'undefined' ? window.location.search : '';
const IS_STANDALONE_INITIAL = INITIAL_SEARCH.includes('view=') || INITIAL_SEARCH.includes('projectId=');

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  initialized: false,
  isStandalone: IS_STANDALONE_INITIAL,
  tauriLabel: 'unknown',

  setUser: (user) => {
    console.log("[AuthStore] User state set:", user?.email || "No User");
    set({ user, loading: false, initialized: true });
  },
  setError: (error) => {
    console.error("[AuthStore] Auth Error:", error);
    set({ error, loading: false, initialized: true });
  },
  setLoading: (loading) => set({ loading }),
  clearError: () => set({ error: null }),

  loginEmail: async (email, pass) => {
    set({ loading: true, error: null });
    try {
      const user = await safeInvoke<LocalUser>('local_login', { email, password: pass });
      if (user) {
        set({ user, loading: false, initialized: true });
      } else {
        // Fallback for standalone/demo when Tauri backend is offline
        const localUser: LocalUser = { id: 'local-1', email, name: email.split('@')[0] || 'Local User' };
        set({ user: localUser, loading: false, initialized: true });
      }
    } catch (err) {
      console.warn("[AuthStore] Local login failed or offline fallback:", err);
      // Create local fallback session if backend fails
      const fallbackUser: LocalUser = { id: 'local-user-id', email, name: email };
      set({ user: fallbackUser, loading: false, initialized: true });
    }
  },

  signUpEmail: async (email, pass) => {
    set({ loading: true, error: null });
    try {
      const user = await safeInvoke<LocalUser>('local_register', { email, password: pass });
      set({ user: user || { id: 'local-1', email }, loading: false, initialized: true });
    } catch (err) {
      console.warn("[AuthStore] Local register warning:", err);
      set({ user: { id: 'local-user-id', email }, loading: false, initialized: true });
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await safeInvoke('logout_user');
    } catch (err) {
      console.warn("[AuthStore] Backend logout notification error:", err);
    } finally {
      set({ user: null, loading: false });
    }
  },

  deleteAccount: async () => {
    set({ loading: true });
    try {
      await safeInvoke('delete_local_account');
      set({ user: null, loading: false });
    } catch (err) {
      console.error("[AuthStore] Delete local account error:", err);
      set({ error: String(err), loading: false });
    }
  }
}));

let initPromise: Promise<void> | null = null;

export const initAuth = () => {
  if (initPromise) return initPromise;

  const currentState = useAuthStore.getState();
  if (currentState.initialized) return Promise.resolve();

  initPromise = new Promise((resolve) => {
    const runInit = async () => {
      try {
        const win = getCurrentWindow();
        if (win) {
          const isStandalone = win.label !== 'main';
          useAuthStore.setState({ isStandalone, tauriLabel: win.label });
        }
      } catch {
        console.warn("[Auth] Tauri window detection unavailable.");
      }

      try {
        const currentActiveUser = await safeInvoke<LocalUser | null>('get_current_user');
        if (currentActiveUser) {
          useAuthStore.getState().setUser(currentActiveUser);
        } else {
          // Default local desktop user for offline V1
          const defaultDesktopUser: LocalUser = {
            id: 'desktop-local-user',
            email: 'engineer@local.cad',
            name: 'Kỹ sư Viễn thông',
            role: 'engineer'
          };
          console.warn("[Auth] No active backend user found. Initializing default local engineer session.");
          useAuthStore.getState().setUser(defaultDesktopUser);
        }
      } catch {
        console.warn("[Auth] Backend user hydration skipped; setting default local user.");
        useAuthStore.getState().setUser({
          id: 'desktop-local-user',
          email: 'engineer@local.cad',
          name: 'Kỹ sư Viễn thông',
          role: 'engineer'
        });
      }
      resolve();
    };

    runInit();
  });

  return initPromise;
};

initAuth();

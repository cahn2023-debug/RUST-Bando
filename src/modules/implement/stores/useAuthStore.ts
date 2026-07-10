console.log("[Trace] useAuthStore.ts: Loading dependencies...");
import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  User,
  AuthError
} from 'firebase/auth';
import { auth } from '@IMPLEMENT/lib/firebase';
import { safeInvoke, IS_REAL_TAURI } from '@IMPLEMENT/lib/tauri';

// v48: Safely determine initial standalone state from URL to avoid module load crashes
// We will refine this in initAuth() using native Tauri APIs if available.
const INITIAL_SEARCH = typeof window !== 'undefined' ? window.location.search : '';
const IS_STANDALONE_INITIAL = INITIAL_SEARCH.includes('view=') || INITIAL_SEARCH.includes('projectId=');

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  isStandalone: boolean;
  tauriLabel: string;

  setUser: (user: User | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;

  loginEmail: (email: string, pass: string) => Promise<void>;
  signUpEmail: (email: string, pass: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,
  initialized: false,
  isStandalone: IS_STANDALONE_INITIAL,
  tauriLabel: 'unknown',

  setUser: (user) => {
    console.log("Auth State Changed: ", user?.email || "No User");
    set({ user, loading: false, initialized: true });
  },
  setError: (error) => {
    console.error("Auth Error: ", error);
    set({ error, loading: false, initialized: true });
  },
  setLoading: (loading) => set({ loading }),
  clearError: () => set({ error: null }),

  loginEmail: async (email, pass) => {
    set({ loading: true, error: null });
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      const authErr = err as AuthError;
      let msg = authErr.message;
      if (authErr.code === 'auth/invalid-credential') {
        msg = "Email hoặc mật khẩu không đúng. Nếu bạn chưa có tài khoản, hãy nhấn 'Create One' ở bên dưới.";
      }
      set({ error: msg, loading: false });
    }
  },

  signUpEmail: async (email, pass) => {
    set({ loading: true, error: null });
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      const authErr = err as AuthError;
      set({ error: authErr.message, loading: false });
    }
  },

  loginGoogle: async () => {
    console.trace("[AuthStore] loginGoogle CALLED - Tracing caller stack...");
    set({ loading: true, error: null });
    try {
      console.log("[AuthStore] Starting Google Login via Tauri Flow...");

      // 1. Get Google ID Token from Rust (Loopback Flow)
      const idToken = await safeInvoke<string>('google_login_flow');
      console.log("[AuthStore] Rust callback received ID Token successfully.");
      console.log("Received Google ID Token from Rust.");

      // 2. Create Firebase Credential
      // We need GoogleAuthProvider from firebase/auth
      const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
      const credential = GoogleAuthProvider.credential(idToken);

      // 3. Sign in to Firebase
      const result = await signInWithCredential(auth, credential);
      console.log("Firebase Login Success:", result.user.email);

      set({ user: result.user, loading: false });

      // v4: Synchronize with Rust backend
      if (result.user.email) {
        await safeInvoke('set_current_user', { email: result.user.email });
        console.log("[AuthStore] Backend session synchronized for:", result.user.email);
      }
    } catch (err) {
      console.error("Login Google Error:", err);
      set({ error: String(err), loading: false });
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      // v4: Clear backend session
      await safeInvoke('logout_user');
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      set({ user: null, loading: false });
    }
  },

  deleteAccount: async () => {
    const user = auth.currentUser;
    if (!user) return;

    set({ loading: true });
    try {
      await user.delete();
      set({ user: null, loading: false });
      console.log("Account deleted successfully");
    } catch (err) {
      console.error("Delete account error:", err);
      const authErr = err as AuthError;
      set({ error: authErr.message, loading: false });
    }
  }
}));

// Initialization logic
let initPromise: Promise<void> | null = null;
let nullStateTimer: any = null;
const STABILITY_CHECK_DURATION = 10000; // v4.0.3: Increased to 10s for slow Windows environments

export const initAuth = () => {
  if (initPromise) return initPromise;

  const currentState = useAuthStore.getState();
  if (currentState.initialized) return Promise.resolve();

  initPromise = new Promise(async (resolve) => {
    // v72: IMMEDIATE URL DETECTION (Primary for Standalone)
    const initialParams = new URLSearchParams(window.location.search);
    const isUrlStandalone = initialParams.has('view') || initialParams.has('projectId');

    let currentLabel = isUrlStandalone ? 'unknown_standalone' : 'main';
    let isStandalone = isUrlStandalone;

    try {
      // v72: Refine with Native Tauri APIs if possible
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (win) {
        currentLabel = win.label;
        isStandalone = currentLabel !== 'main';
        console.log(`[Auth] v72 Native Detection: Label=${currentLabel}, Standalone=${isStandalone}`);
        useAuthStore.setState({ isStandalone, tauriLabel: currentLabel });
      }
    } catch (e) {
      console.warn("[Auth] Tauri API not available, sticking to URL detection.");
    }

    console.log(`[Auth] Initializing Auth System (v72). Standalone: ${isStandalone}, Label: ${currentLabel}`);

    // 1. Force Local Persistence ONLY in Main Window (view === null)
    const persistencePromise = !isStandalone
      ? setPersistence(auth, browserLocalPersistence)
        .then(() => {
          console.log("1. Persistence set to LOCAL successfully (Main Window).");
        })
        .catch((err) => {
          console.error("!! Persistence Error: ", err.code, err.message);
          useAuthStore.getState().setError(err.message);
        })
      : Promise.resolve().then(() => console.log("1. Skipping setPersistence in Standalone Window."));

    persistencePromise.finally(() => {
      console.debug("[Auth] 2. Starting onAuthStateChanged listener.");
      const startTime = Date.now();

      onAuthStateChanged(auth, (user) => {
        const elapsed = Date.now() - startTime;
        console.debug(`[Auth] onAuthStateChanged fired (${elapsed}ms). User:`, user?.email || "None");

        // Clear any pending null-timers if a valid user appears
        if (user && nullStateTimer) {
          console.log("[Auth] Valid user detected. Canceling No-User grace period.");
          clearTimeout(nullStateTimer);
          nullStateTimer = null;
        }

        // v72 STABILITY BUFFER: Prevent early kick-out on Main Window
        if (!isStandalone && !user && !useAuthStore.getState().initialized) {
          if (!nullStateTimer) {
            // v4.0.3: Shorten buffer for browser environments to prevent UI lag/loops
            const duration = IS_REAL_TAURI ? STABILITY_CHECK_DURATION : 100;
            console.warn(`[Auth] Main Window (${elapsed}ms): Initial 'null' user. Starting ${duration}ms stability buffer...`);

            nullStateTimer = setTimeout(() => {
              console.warn("[Auth] Main Window: Stability buffer expired. Confirming No-User state.");
              useAuthStore.getState().setUser(null);
              nullStateTimer = null;
            }, duration);
          }
          return; // Wait for buffer
        }


        // v47/v72 STANDALONE PROTECTION (Keep 60s for sub-windows)
        if (isStandalone && !user && elapsed < 60000) {
          console.warn(`[Auth] Standalone Window (${elapsed}ms): ZERO-FAILURE SESSION GUARD. Ignoring 'null' user update.`);
          return;
        }

        useAuthStore.getState().setUser(user);
        resolve();
      }, (err) => {
        console.error("[Auth] onAuthStateChanged Error:", err);
        useAuthStore.getState().setError(err.message);
        resolve();
      });
    });

    // Safety Timeout: 15 seconds
    setTimeout(() => {
      const state = useAuthStore.getState();
      if (!state.initialized) {
        console.warn("[Auth] Initialization timed out after 15s.");
        useAuthStore.setState({ initialized: true, loading: false });
        resolve();
      }
    }, 15000);
  });

  return initPromise;
};

// Start initialization immediately
console.log("[Trace] useAuthStore.ts: Calling initAuth()...");
initAuth();

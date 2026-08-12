import { create } from 'zustand';
import { getCurrentWindow } from '@/contracts/tauri-api/runtime';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  initTheme: () => void;
}

const STORAGE_KEY = 'app-theme-mode';

const getInitialMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'dark';
};

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
};

const syncTauriTheme = async (resolvedTheme: 'light' | 'dark') => {
  try {
    const win = getCurrentWindow();
    if (win && 'setTheme' in win && typeof (win as any).setTheme === 'function') {
      await (win as any).setTheme(resolvedTheme);
    }
  } catch {
    // Ignore error in web environments
  }
};

const applyThemeToDOM = (resolvedTheme: 'light' | 'dark') => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolvedTheme);
  if (resolvedTheme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
  void syncTauriTheme(resolvedTheme);
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeMode: getInitialMode(),
  resolvedTheme: getInitialMode() === 'system' ? getSystemTheme() : (getInitialMode() as 'light' | 'dark'),

  setThemeMode: (mode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    const resolved = mode === 'system' ? getSystemTheme() : mode;
    applyThemeToDOM(resolved);
    set({ themeMode: mode, resolvedTheme: resolved });
  },

  toggleTheme: () => {
    const current = get().resolvedTheme;
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
    get().setThemeMode(next);
  },

  initTheme: () => {
    const mode = getInitialMode();
    const resolved = mode === 'system' ? getSystemTheme() : mode;
    applyThemeToDOM(resolved);
    set({ themeMode: mode, resolvedTheme: resolved });

    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        if (get().themeMode === 'system') {
          const sys = getSystemTheme();
          applyThemeToDOM(sys);
          set({ resolvedTheme: sys });
        }
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      } else {
        mediaQuery.addListener(handleChange);
      }
    }
  },
}));

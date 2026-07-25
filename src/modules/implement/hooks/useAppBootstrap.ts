import { useEffect, useRef } from "react";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { safeInvoke as invoke, safeListen } from "@IMPLEMENT/lib/tauri";

import { useThemeStore } from "@DESIGN/stores/themeStore";

/**
 * Handles application-level side effects like window visibility,
 * event listeners for file associations, and system theme synchronization.
 */
export function useAppBootstrap(handleOpenProject: (path: string) => Promise<boolean>, onProjectOpened: () => void) {
    const { lowPowerMode } = useSettingsStore();
    const { initialized: authInitialized } = useAuthStore();
    const hasShownWindowRef = useRef(false);
    const handledPendingPathRef = useRef<string | null>(null);
    const lastOpenEventRef = useRef<{ path: string; ts: number } | null>(null);

    // Initialize Theme Mode on app bootstrap
    useEffect(() => {
        useThemeStore.getState().initTheme();
    }, []);

    // Handle Low Power Mode visual flag
    useEffect(() => {
        if (lowPowerMode) {
            document.body.classList.add("low-power-active");
        } else {
            document.body.classList.remove("low-power-active");
        }
    }, [lowPowerMode]);

    // Show the main window as soon as the first React shell mounts.
    // Waiting on auth can leave the desktop window hidden long enough to look like a white-screen startup failure.
    useEffect(() => {
        if (hasShownWindowRef.current) {
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const isTauri = !!(window as any).__TAURI_IPC__;
                if (!isTauri) return;

                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                const win = getCurrentWindow();
                if (win) {
                    await win.show();
                    hasShownWindowRef.current = true;
                }
            } catch (error) {
                console.warn("[AppBootstrap] Failed to show window on initial mount:", error);
            }
        }, 0);

        return () => clearTimeout(timer);
    }, []);

    // Show and focus window once authenticated
    useEffect(() => {
        if (authInitialized) {
            const timer = setTimeout(async () => {
                try {
                    const isTauri = !!(window as any).__TAURI_IPC__;
                    if (!isTauri) return;

                    const { getCurrentWindow } = await import("@tauri-apps/api/window");
                    const win = getCurrentWindow();
                    if (win) {
                        await win.show();
                        const focusSuccess = await win.setFocus().catch(() => false);
                        console.debug("[AppBootstrap] Focus success:", focusSuccess);
                    }
                } catch (error) {
                    console.warn("[AppBootstrap] Failed to show window:", error);
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [authInitialized]);

    // Listen for 'open-pmp' events (file association)
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let cancelled = false;

        const shouldSkipDuplicateOpen = (path: string) => {
            const now = Date.now();
            const last = lastOpenEventRef.current;
            if (last && last.path === path && now - last.ts < 3000) {
                return true;
            }
            lastOpenEventRef.current = { path, ts: now };
            return false;
        };

        const setupListener = async () => {
            try {
                unlisten = await safeListen<string>("open-pmp", async (event) => {
                    const path = event.payload;
                    if (!path || shouldSkipDuplicateOpen(path)) {
                        return;
                    }
                    const success = await handleOpenProject(path);
                    if (success) {
                        onProjectOpened();
                    }
                });
            } catch (e) {
                console.warn("[AppBootstrap] Failed to setup open-pmp listener:", e);
            }
        };

        setupListener();

        // Check for pending PMP file association from startup
        const checkPendingPath = async () => {
            try {
                if (cancelled) return;
                const pendingPath = await invoke<string | null>("get_pending_pmp_path");
                if (pendingPath) {
                    if (handledPendingPathRef.current === pendingPath) {
                        return;
                    }
                    handledPendingPathRef.current = pendingPath;
                    console.info("[AppBootstrap] Handling pending PMP path from startup:", pendingPath);
                    const success = await handleOpenProject(pendingPath);
                    if (success) {
                        onProjectOpened();
                    }
                }
            } catch (e) {
                console.warn("[AppBootstrap] Failed to check for pending PMP path:", e);
            }
        };
        checkPendingPath();
        return () => {
            cancelled = true;
            if (unlisten) unlisten();
        };
    }, [handleOpenProject, onProjectOpened]);
}

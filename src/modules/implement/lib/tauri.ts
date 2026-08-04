import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, UnlistenFn } from "@tauri-apps/api/event";

export const win = typeof window !== 'undefined' ? window as any : {} as any;

// 🛡️ v4.0.3: Robust environment detection for Tauri 2
export const IS_REAL_TAURI = typeof window !== 'undefined' && (
  (!!win.__TAURI_IPC__) ||
  (!!win.__TAURI_INTERNALS__) ||
  (!!win.__TAURI__) ||
  (typeof win.__TAURI_METADATA__ !== 'undefined' && !win.is_mock_env)
);

/**
 * Một wrapper an toàn cho Tauri invoke.
 */
export async function safeInvoke<T>(command: string, args?: any): Promise<T> {
  try {
    if (!IS_REAL_TAURI) {
      if (![
        "sync_v2_get_status",
        "sync_v2_is_online",
        "sync_v2_start",
        "sync_v2_go_online",
        "sync_v2_go_offline",
        "get_pending_sync_outbox",
        "mark_outbox_synced",
        "get_active_project",
      ].includes(command)) {
        console.warn(`[Tauri SafeInvoke] No real Tauri environment detected for command: ${command}`);
      }
      return null as any;
    }
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    if (command === "build_map_tiles_v2") {
      console.info(`[Tauri SafeInvoke Info] command: ${command}`, error);
      return null as any;
    }
    console.error(`[Tauri SafeInvoke Error] command: ${command}`, error);
    if (["get_recent_projects", "get_projects", "get_project_tree", "get_materials", "get_tasks", "get_notes"].includes(command)) {
      return [] as any;
    }
    throw error;
  }
}

export async function safeEmit(event: string, payload?: any): Promise<void> {
  if (!IS_REAL_TAURI) {
    console.warn(`[Tauri SafeEmit] Browser Fallback for: ${event}`, payload);
    return Promise.resolve();
  }

  try {
    const { emit } = await import("@tauri-apps/api/event");
    return await emit(event, payload);
  } catch (error) {
    console.error(`[Tauri SafeEmit Error] event: ${event}`, error);
  }
}

export async function safeListen<T>(event: string, handler: (event: any) => void): Promise<UnlistenFn> {
  if (!IS_REAL_TAURI) {
    return Promise.resolve(() => { });
  }

  try {
    return await tauriListen<T>(event, handler);
  } catch (error) {
    console.error(`[Tauri SafeListen Error] event: ${event}`, error);
    return () => { };
  }
}

export async function safeOpenDialog(options: any): Promise<string | string[] | null> {
  if (!IS_REAL_TAURI) {
    console.warn("[Tauri SafeOpenDialog] Browser Picker not supported in optimized mode.");
    return null;
  }

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    return await open(options);
  } catch (error) {
    console.error("[Tauri SafeOpenDialog] Failed to open dialog:", error);
    return null;
  }
}

export async function safeSaveDialog(options: any): Promise<string | null> {
  if (!IS_REAL_TAURI) {
    console.warn("[Tauri SafeSaveDialog] Browser Picker not supported in optimized mode.");
    return null;
  }

  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return await save(options);
  } catch (error) {
    console.error("[Tauri SafeSaveDialog] Failed to save dialog:", error);
    return null;
  }
}

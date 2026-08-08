import { safeInvoke } from '@IMPLEMENT/lib/tauri';

export interface SyncStatus {
  status?: string;
  reason?: string;
}

export interface SyncConfig {
  coordinatorUrl?: string;
  coordinator_url?: string;
  sharedSecret?: string;
  shared_secret?: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  status?: string;
  reason?: string;
}

export const syncApi = {
  getStatus: () => safeInvoke<SyncStatus>('sync_v2_get_status'),

  isOnline: () => safeInvoke<boolean>('sync_v2_is_online'),

  start: (config: SyncConfig) => safeInvoke<SyncResult | null>('sync_v2_start', config),

  goOffline: () => safeInvoke<void>('sync_v2_go_offline'),

  goOnline: (config: SyncConfig) => safeInvoke<void>('sync_v2_go_online', config),
};

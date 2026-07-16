import { invoke } from '@tauri-apps/api/core';

export interface ProjectStorageTableSize {
  name: string;
  bytes: number;
}

export interface ProjectStorageHealth {
  projectId: string;
  databasePath: string;
  databaseSizeBytes: number;
  walSizeBytes: number;
  freelistBytes: number;
  featureCount: number;
  featureGroupCount: number;
  eventCount: number;
  snapshotBytes: number;
  eventPayloadBytes: number;
  largeEventCount: number;
  legacyMediaRefCount: number;
  mediaAssetCount: number;
  mediaAssetsSizeBytes: number;
  tableSizes: ProjectStorageTableSize[];
  integrityStatus: 'ok' | 'failed' | string;
  lastBackupAt?: string | null;
  lastIntegrityCheckAt?: string | null;
  lastRestoreTestAt?: string | null;
  lastOptimizedAt?: string | null;
  backupCount: number;
  checkedAt: string;
}

export interface ProjectStorageOptimizationResult {
  projectId: string;
  backupPath: string;
  migratedMediaRefs: number;
  repairedMediaLinks: number;
  compactedEvents: number;
  integrityBefore: string;
  integrityAfter: string;
  before: Partial<ProjectStorageHealth>;
  after: Partial<ProjectStorageHealth>;
  optimizedAt: string;
}

export const STORAGE_HEALTH_REFRESH_EVENT = 'design-storage-health-refresh';

export const getProjectStorageHealth = async (projectId: string): Promise<ProjectStorageHealth> => {
  return await invoke<ProjectStorageHealth>('get_project_storage_health', { projectId });
};

export const optimizeProjectStorage = async (
  projectId: string
): Promise<ProjectStorageOptimizationResult> => {
  return await invoke<ProjectStorageOptimizationResult>('optimize_project_storage', { projectId });
};

export const requestStorageHealthRefresh = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORAGE_HEALTH_REFRESH_EVENT));
};

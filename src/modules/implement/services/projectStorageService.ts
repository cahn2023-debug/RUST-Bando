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
  missingMediaFileCount: number;
  brokenMediaLinkCount: number;
  recoverableFeatureCount: number;
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

export interface ProjectMediaRecoveryField {
  path: string;
  current: unknown;
  recovered: unknown;
}

export interface ProjectMediaRecoveryCandidate {
  featureId: string;
  name: string;
  fields: ProjectMediaRecoveryField[];
}

export interface ProjectMediaRecoveryAnalysis {
  projectId: string;
  candidates: ProjectMediaRecoveryCandidate[];
  missingMediaFiles: Array<Record<string, unknown>>;
  brokenLinks: Array<Record<string, unknown>>;
  checkedAt: string;
}

export interface ProjectMediaRecoveryApplyResult {
  projectId: string;
  backupPath: string;
  restoredFeatures: number;
  restoredFields: number;
  appliedAt: string;
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

export const analyzeProjectMediaRecovery = async (
  projectId: string
): Promise<ProjectMediaRecoveryAnalysis> => {
  return await invoke<ProjectMediaRecoveryAnalysis>('analyze_project_media_recovery', { projectId });
};

export const applyProjectMediaRecovery = async (
  projectId: string,
  items: ProjectMediaRecoveryCandidate[]
): Promise<ProjectMediaRecoveryApplyResult> => {
  return await invoke<ProjectMediaRecoveryApplyResult>('apply_project_media_recovery', { projectId, items });
};

export const requestStorageHealthRefresh = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORAGE_HEALTH_REFRESH_EVENT));
};

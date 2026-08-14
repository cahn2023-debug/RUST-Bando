import { safeInvoke } from '@IMPLEMENT/lib/tauri';

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

export const storageApi = {
  getHealth: (projectId: string) =>
    safeInvoke<ProjectStorageHealth>('get_project_storage_health', { projectId }),

  optimize: (projectId: string) =>
    safeInvoke<ProjectStorageOptimizationResult>('optimize_project_storage', { projectId }),

  analyzeMediaRecovery: (projectId: string) =>
    safeInvoke<ProjectMediaRecoveryAnalysis>('analyze_project_media_recovery', { projectId }),

  applyMediaRecovery: (projectId: string, items: ProjectMediaRecoveryCandidate[]) =>
    safeInvoke<ProjectMediaRecoveryApplyResult>('apply_project_media_recovery', { projectId, items }),
};

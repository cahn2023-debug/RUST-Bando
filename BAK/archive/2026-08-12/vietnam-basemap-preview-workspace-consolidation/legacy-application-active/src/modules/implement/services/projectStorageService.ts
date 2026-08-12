import {
  storageApi,
  ProjectMediaRecoveryAnalysis,
  ProjectMediaRecoveryApplyResult,
  ProjectMediaRecoveryCandidate,
  ProjectStorageHealth,
  ProjectStorageOptimizationResult,
} from '@/contracts/tauri-api';

export type {
  ProjectMediaRecoveryAnalysis,
  ProjectMediaRecoveryApplyResult,
  ProjectMediaRecoveryCandidate,
  ProjectStorageHealth,
  ProjectStorageOptimizationResult,
} from '@/contracts/tauri-api';

export const STORAGE_HEALTH_REFRESH_EVENT = 'design-storage-health-refresh';

export const getProjectStorageHealth = (projectId: string): Promise<ProjectStorageHealth> =>
  storageApi.getHealth(projectId);

export const optimizeProjectStorage = (
  projectId: string
): Promise<ProjectStorageOptimizationResult> => storageApi.optimize(projectId);

export const analyzeProjectMediaRecovery = (
  projectId: string
): Promise<ProjectMediaRecoveryAnalysis> => storageApi.analyzeMediaRecovery(projectId);

export const applyProjectMediaRecovery = (
  projectId: string,
  items: ProjectMediaRecoveryCandidate[]
): Promise<ProjectMediaRecoveryApplyResult> => storageApi.applyMediaRecovery(projectId, items);

export const requestStorageHealthRefresh = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORAGE_HEALTH_REFRESH_EVENT));
};

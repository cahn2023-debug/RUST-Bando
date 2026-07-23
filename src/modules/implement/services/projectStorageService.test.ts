import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  analyzeProjectMediaRecovery,
  applyProjectMediaRecovery,
  getProjectStorageHealth,
  optimizeProjectStorage,
  requestStorageHealthRefresh,
  STORAGE_HEALTH_REFRESH_EVENT,
} from './projectStorageService';

const mockInvoke = vi.mocked(invoke);

describe('projectStorageService', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('loads storage health through the V2 command', async () => {
    mockInvoke.mockResolvedValueOnce({
      projectId: 'project-1',
      databaseSizeBytes: 1024,
    });

    const result = await getProjectStorageHealth('project-1');

    expect(mockInvoke).toHaveBeenCalledWith('get_project_storage_health', {
      projectId: 'project-1',
    });
    expect(result.databaseSizeBytes).toBe(1024);
  });

  it('runs storage optimization through the V2 command', async () => {
    mockInvoke.mockResolvedValueOnce({
      projectId: 'project-1',
      backupPath: 'D:/backup/project.pmp',
      migratedMediaRefs: 1,
      repairedMediaLinks: 0,
      compactedEvents: 1,
      integrityBefore: 'ok',
      integrityAfter: 'ok',
      before: { databaseSizeBytes: 4096 },
      after: { databaseSizeBytes: 2048 },
      optimizedAt: '2026-07-16T00:00:00Z',
    });

    const result = await optimizeProjectStorage('project-1');

    expect(mockInvoke).toHaveBeenCalledWith('optimize_project_storage', {
      projectId: 'project-1',
    });
    expect(result.integrityAfter).toBe('ok');
  });

  it('loads media recovery preview through the V2 command', async () => {
    mockInvoke.mockResolvedValueOnce({
      projectId: 'project-1',
      candidates: [],
      missingMediaFiles: [],
      brokenLinks: [],
      checkedAt: '2026-07-23T00:00:00Z',
    });

    const result = await analyzeProjectMediaRecovery('project-1');

    expect(mockInvoke).toHaveBeenCalledWith('analyze_project_media_recovery', {
      projectId: 'project-1',
    });
    expect(result.candidates).toEqual([]);
  });

  it('applies selected media recovery through the V2 command', async () => {
    const items = [{
      featureId: 'feature-1',
      name: 'Camera A',
      fields: [{ path: 'display_order', current: null, recovered: '72_1' }],
    }];
    mockInvoke.mockResolvedValueOnce({
      projectId: 'project-1',
      backupPath: 'D:/backup/project.pmp',
      restoredFeatures: 1,
      restoredFields: 1,
      appliedAt: '2026-07-23T00:00:00Z',
    });

    const result = await applyProjectMediaRecovery('project-1', items);

    expect(mockInvoke).toHaveBeenCalledWith('apply_project_media_recovery', {
      projectId: 'project-1',
      items,
    });
    expect(result.restoredFields).toBe(1);
  });

  it('emits a refresh event for active health widgets', () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_HEALTH_REFRESH_EVENT, listener);

    requestStorageHealthRefresh();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(STORAGE_HEALTH_REFRESH_EVENT, listener);
  });
});

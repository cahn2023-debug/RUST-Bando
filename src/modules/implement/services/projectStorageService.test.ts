import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
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

  it('emits a refresh event for active health widgets', () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_HEALTH_REFRESH_EVENT, listener);

    requestStorageHealthRefresh();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(STORAGE_HEALTH_REFRESH_EVENT, listener);
  });
});

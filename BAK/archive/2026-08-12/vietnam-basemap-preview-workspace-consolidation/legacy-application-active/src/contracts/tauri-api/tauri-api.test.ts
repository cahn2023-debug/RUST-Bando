import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import { aiApi, basemapApi, projectApi } from './index';

vi.mock('@IMPLEMENT/lib/tauri', () => ({
  safeInvoke: vi.fn(),
}));

const mockedSafeInvoke = vi.mocked(safeInvoke);

describe('typed Tauri API facade', () => {
  beforeEach(() => {
    mockedSafeInvoke.mockReset();
  });

  it('keeps project command names and payloads stable', async () => {
    mockedSafeInvoke.mockResolvedValue(undefined);

    await projectApi.saveProject();
    await projectApi.deleteProject('project-1');
    await projectApi.indexFiles('project-1');

    expect(mockedSafeInvoke).toHaveBeenNthCalledWith(1, 'save_project');
    expect(mockedSafeInvoke).toHaveBeenNthCalledWith(2, 'delete_project', { id: 'project-1' });
    expect(mockedSafeInvoke).toHaveBeenNthCalledWith(3, 'index_project_files', { project_id: 'project-1' });
  });

  it('routes basemap and AI calls through the safe adapter', async () => {
    mockedSafeInvoke.mockResolvedValue({});

    await basemapApi.clearCache();
    await aiApi.cancelRequest('request-1');

    expect(mockedSafeInvoke).toHaveBeenNthCalledWith(1, 'clear_basemap_tile_cache');
    expect(mockedSafeInvoke).toHaveBeenNthCalledWith(2, 'cancel_ai_request', { requestId: 'request-1' });
  });
});

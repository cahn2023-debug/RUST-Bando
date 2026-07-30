import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeInvoke } from '../../implement/lib/tauri';
import { invoke_design_event_batch } from './designIpc';

vi.mock('../../implement/lib/tauri', () => ({
  safeInvoke: vi.fn(),
}));

const mockInvoke = vi.mocked(safeInvoke);

describe('designIpc sync client', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    vi.stubEnv('VITE_COLLAB_COORDINATOR_URL', '');
    vi.stubEnv('VITE_COLLAB_SHARED_SECRET', '');
  });

  it('sends normalized camelCase and snake_case batch args to Tauri', async () => {
    mockInvoke.mockResolvedValueOnce({
      success: true,
      last_event_id: 'event-1',
      applied_events: [],
      side_effects: [],
    });

    const projectId = '11111111-1111-4111-8111-111111111111';
    const featureId = '22222222-2222-4222-8222-222222222222';

    await invoke_design_event_batch(projectId, [{
      id: '33333333-3333-4333-8333-333333333333',
      entityId: featureId,
      eventType: 'FeatureUpdated',
      type: 'FeatureUpdated',
      payload: {
        id: featureId,
        metadata: '{}',
      },
    }]);

    expect(mockInvoke).toHaveBeenCalledWith('invoke_design_event_batch', expect.objectContaining({
      project_id: projectId,
      projectId,
      request_id: expect.any(Number),
      requestId: expect.any(Number),
      batch_id: expect.any(String),
      batchId: expect.any(String),
      events: [expect.objectContaining({
        project_id: projectId,
        projectId,
        entity_id: featureId,
        entityId: featureId,
        eventType: 'FeatureUpdated',
      })],
    }));
  });

  it('returns a failed response when Tauri returns null', async () => {
    mockInvoke.mockResolvedValueOnce(null as any);

    const result = await invoke_design_event_batch('project-a', []);

    expect(result).toEqual({
      success: false,
      last_event_id: '',
      applied_events: [],
      side_effects: [],
    });
  });
});

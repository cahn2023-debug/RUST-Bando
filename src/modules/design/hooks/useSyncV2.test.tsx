import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncApi } from '@/contracts/tauri-api';
import { useSyncV2 } from './useSyncV2';

vi.mock('@/contracts/tauri-api', () => ({
    syncApi: {
        getStatus: vi.fn(),
        isOnline: vi.fn(),
        start: vi.fn(),
        goOffline: vi.fn(),
        goOnline: vi.fn(),
    },
}));

const mockInvoke = vi.mocked(syncApi.start);
const mockGetStatus = vi.mocked(syncApi.getStatus);
const mockIsOnline = vi.mocked(syncApi.isOnline);

describe('useSyncV2', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        mockGetStatus.mockReset();
        mockIsOnline.mockReset();
        vi.stubEnv('VITE_COLLAB_COORDINATOR_URL', 'https://sync.example.test/exec');
        vi.stubEnv('VITE_COLLAB_SHARED_SECRET', 'secret-1');
    });

    it('loads online status and starts sync with coordinator config', async () => {
        mockGetStatus.mockResolvedValue({ status: 'online' });
        mockIsOnline.mockResolvedValue(true);
        mockInvoke.mockResolvedValue({ pushed: 2, pulled: 1, conflicts: 0, status: 'online' });

        const { result } = renderHook(() => useSyncV2());

        await waitFor(() => expect(result.current.isOnline).toBe(true));

        await act(async () => {
            await result.current.triggerSync();
        });

        expect(mockInvoke).toHaveBeenCalledWith(expect.objectContaining({
            coordinatorUrl: 'https://sync.example.test/exec',
            coordinator_url: 'https://sync.example.test/exec',
            sharedSecret: 'secret-1',
            shared_secret: 'secret-1',
        }));
        expect(result.current.lastResult).toMatchObject({ pushed: 2, pulled: 1, conflicts: 0 });
    });

    it('normalizes missing Tauri sync result to offline state', async () => {
        mockGetStatus.mockResolvedValue({ status: 'offline' });
        mockIsOnline.mockResolvedValue(false);
        mockInvoke.mockResolvedValue(null);

        const { result } = renderHook(() => useSyncV2());

        await waitFor(() => expect(result.current.isOnline).toBe(false));

        await act(async () => {
            await result.current.triggerSync();
        });

        expect(result.current.lastResult).toEqual({
            pushed: 0,
            pulled: 0,
            conflicts: 0,
            status: 'offline',
        });
    });
});

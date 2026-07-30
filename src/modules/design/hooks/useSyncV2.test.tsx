import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import { useSyncV2 } from './useSyncV2';

vi.mock('@IMPLEMENT/lib/tauri', () => ({
    safeInvoke: vi.fn(),
}));

const mockInvoke = vi.mocked(safeInvoke);

describe('useSyncV2', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        vi.stubEnv('VITE_COLLAB_COORDINATOR_URL', 'https://sync.example.test/exec');
        vi.stubEnv('VITE_COLLAB_SHARED_SECRET', 'secret-1');
    });

    it('loads online status and starts sync with coordinator config', async () => {
        mockInvoke.mockImplementation(async (command: string) => {
            if (command === 'sync_v2_get_status') return { status: 'online' } as any;
            if (command === 'sync_v2_is_online') return true as any;
            if (command === 'sync_v2_start') {
                return { pushed: 2, pulled: 1, conflicts: 0, status: 'online' } as any;
            }
            return null as any;
        });

        const { result } = renderHook(() => useSyncV2());

        await waitFor(() => expect(result.current.isOnline).toBe(true));

        await act(async () => {
            await result.current.triggerSync();
        });

        expect(mockInvoke).toHaveBeenCalledWith('sync_v2_start', expect.objectContaining({
            coordinatorUrl: 'https://sync.example.test/exec',
            coordinator_url: 'https://sync.example.test/exec',
            sharedSecret: 'secret-1',
            shared_secret: 'secret-1',
        }));
        expect(result.current.lastResult).toMatchObject({ pushed: 2, pulled: 1, conflicts: 0 });
    });

    it('normalizes missing Tauri sync result to offline state', async () => {
        mockInvoke.mockImplementation(async (command: string) => {
            if (command === 'sync_v2_get_status') return { status: 'offline' } as any;
            if (command === 'sync_v2_is_online') return false as any;
            return null as any;
        });

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

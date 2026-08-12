import { useState, useEffect, useCallback } from 'react';
import { syncApi, SyncResult } from '@/contracts/tauri-api';

const syncConfigArgs = () => ({
    coordinatorUrl: import.meta.env.VITE_COLLAB_COORDINATOR_URL?.trim() || undefined,
    coordinator_url: import.meta.env.VITE_COLLAB_COORDINATOR_URL?.trim() || undefined,
    sharedSecret: import.meta.env.VITE_COLLAB_SHARED_SECRET?.trim() || undefined,
    shared_secret: import.meta.env.VITE_COLLAB_SHARED_SECRET?.trim() || undefined,
});

export function useSyncV2() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(true);
    const [lastResult, setLastResult] = useState<SyncResult | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const status = await syncApi.getStatus();
            if (status?.status === 'error') {
                setLastError(status.reason || 'Sync service error');
            } else if (status?.status === 'offline') {
                setLastError(null);
            } else {
                setLastError(null);
            }

            const online = await syncApi.isOnline();
            setIsOnline(Boolean(online));
        } catch (e) {
            console.error('Failed to fetch sync status:', e);
        }
    }, []);

    const triggerSync = useCallback(async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        setLastError(null);

        try {
            const result = await syncApi.start(syncConfigArgs());
            const normalized = result ?? { pushed: 0, pulled: 0, conflicts: 0, status: 'offline' };
            setLastResult(normalized);
            if (normalized.status === 'offline' && normalized.reason) {
                setLastError(normalized.reason);
            }
        } catch (e: any) {
            setLastError(String(e));
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing]);

    const toggleOnline = useCallback(async () => {
        try {
            if (isOnline) {
                await syncApi.goOffline();
            } else {
                await syncApi.goOnline(syncConfigArgs());
            }
            setIsOnline(!isOnline);
        } catch (e) {
            console.error('Failed to toggle online status:', e);
        }
    }, [isOnline]);

    // Polling status occasionally
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // 30s
        return () => clearInterval(interval);
    }, [fetchStatus]);

    return {
        isSyncing,
        isOnline,
        lastError,
        lastResult,
        triggerSync,
        toggleOnline,
        refreshStatus: fetchStatus
    };
}

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useDrawingInteraction } from './useDrawingInteraction';

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn(),
}));

const makeState = () => ({
    features: {},
    feature_groups: {
        'group-1': {
            id: 'group-1',
            layer_id: 'layer-1',
            name: 'Camera group',
            type: 'CAMERA',
        },
    },
});

const getMetadataFromCall = (dispatchEvent: ReturnType<typeof vi.fn>, callIndex = 0) => {
    const event = dispatchEvent.mock.calls[callIndex][0];
    return JSON.parse(event.payload.metadata);
};

describe('useDrawingInteraction', () => {
    let dispatchEvent: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        dispatchEvent = vi.fn().mockResolvedValue(undefined);
        useDesignSync.setState({
            state: makeState() as any,
            drawingMode: 'none',
            selectedGroupId: 'group-1',
            activeParentFeatureId: null,
            currentDrawingPoints: [],
            currentDrawingSnapIds: [],
            dispatchEvent: dispatchEvent as any,
        });
    });

    it('creates points continuously without leaving point mode', async () => {
        useDesignSync.setState({ drawingMode: 'point' });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.handleLocationChange(10, 20, 0, 'snap-1');
            await result.current.handleLocationChange(11, 21, 0, null);
        });

        expect(dispatchEvent).toHaveBeenCalledTimes(2);
        expect(useDesignSync.getState().drawingMode).toBe('point');
        expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
            type: 'FeatureCreated',
            payload: {
                layer_id: 'layer-1',
                group_id: 'group-1',
                name: 'Điểm Khảo Sát Mới',
                geom_type: 'Point',
                coordinates: JSON.stringify([20, 10]),
            },
        });
        expect(getMetadataFromCall(dispatchEvent, 0)).toMatchObject({
            icon: 'default',
            type: 'point',
            snap_to_id: 'snap-1',
        });
    });

    it('creates camera objects continuously with CCTV metadata', async () => {
        useDesignSync.setState({ drawingMode: 'image' });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.handleLocationChange(10, 20, 0, null);
            await result.current.handleLocationChange(11, 21, 0, null);
        });

        expect(dispatchEvent).toHaveBeenCalledTimes(2);
        expect(useDesignSync.getState().drawingMode).toBe('image');
        expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
            type: 'FeatureCreated',
            payload: {
                name: 'Ảnh Hiện Trường Mới',
                geom_type: 'Point',
            },
        });
        expect(getMetadataFromCall(dispatchEvent)).toMatchObject({
            icon: 'cctv',
            type: 'cctv',
        });
    });

    it('creates intersections with intersection metadata and keeps drawing mode', async () => {
        useDesignSync.setState({ drawingMode: 'intersection' });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.handleLocationChange(10, 20, 0, null);
        });

        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect(useDesignSync.getState().drawingMode).toBe('intersection');
        expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
            type: 'FeatureCreated',
            payload: {
                name: 'Nút Giao Mới',
                geom_type: 'Point',
            },
        });
        expect(getMetadataFromCall(dispatchEvent)).toMatchObject({
            icon: 'intersection',
            type: 'intersection',
        });
    });

    it('exits one-click drawing mode when no group is selected', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        useDesignSync.setState({ drawingMode: 'point', selectedGroupId: null });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.handleLocationChange(10, 20, 0, null);
        });

        expect(alertSpy).toHaveBeenCalledWith('Vui lòng chọn một nhóm trước khi thêm đối tượng.');
        expect(dispatchEvent).not.toHaveBeenCalled();
        expect(useDesignSync.getState().drawingMode).toBe('none');
        alertSpy.mockRestore();
    });

    it('cancels the current drawing session explicitly', () => {
        useDesignSync.setState({ drawingMode: 'point' });
        const { result } = renderHook(() => useDrawingInteraction());

        act(() => {
            result.current.finishDrawingSession();
        });

        expect(useDesignSync.getState().drawingMode).toBe('none');
    });
});

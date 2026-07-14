import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { useDrawingInteraction } from './useDrawingInteraction';

vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn(),
}));

const makeState = () => ({
    features: {
        'cabinet-1': {
            id: 'cabinet-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Cabinet 1',
            geom_type: 'Point',
            coordinates: [20, 10],
            metadata: JSON.stringify({ network: { role: 'cabinet' } }),
            properties: {},
        },
        'intersection-1': {
            id: 'intersection-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Intersection 1',
            geom_type: 'Point',
            coordinates: [21, 11],
            metadata: JSON.stringify({ network: { role: 'intersection' } }),
            properties: {},
        },
        'camera-1': {
            id: 'camera-1',
            layer_id: 'layer-1',
            group_id: 'group-1',
            name: 'Camera 1',
            geom_type: 'Point',
            coordinates: [22, 12],
            metadata: JSON.stringify({ icon: 'cctv' }),
            properties: {},
        },
    },
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
            dispatchEvents: vi.fn().mockResolvedValue(undefined) as any,
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
            display_order: '4',
            snap_to_id: 'snap-1',
        });
    });

    it('fills the next display order when creating a root object', async () => {
        useDesignSync.setState({
            state: {
                ...makeState(),
                features: {
                    'feature-1': {
                        id: 'feature-1',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Existing point',
                        geom_type: 'Point',
                        coordinates: [20, 10],
                        metadata: JSON.stringify({ display_order: '1' }),
                        properties: {},
                    },
                },
            } as any,
            drawingMode: 'point',
        });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.handleLocationChange(10, 20, 0, null);
        });

        expect(getMetadataFromCall(dispatchEvent)).toMatchObject({
            display_order: '2',
        });
    });

    it('fills intersection child display order from the parent map number', async () => {
        useDesignSync.setState({
            state: {
                ...makeState(),
                features: {
                    'intersection-1': {
                        id: 'intersection-1',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Intersection',
                        geom_type: 'Point',
                        coordinates: [20, 10],
                        metadata: JSON.stringify({ display_order: '15', type: 'intersection' }),
                        properties: {},
                    },
                    'camera-1': {
                        id: 'camera-1',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Camera',
                        geom_type: 'Point',
                        coordinates: [20, 10],
                        metadata: JSON.stringify({ parent_feature_id: 'intersection-1', display_order: '15_1' }),
                        properties: {},
                    },
                },
            } as any,
            drawingMode: 'image',
            activeParentFeatureId: 'intersection-1',
        });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.handleLocationChange(10, 20, 0, null);
        });

        expect(getMetadataFromCall(dispatchEvent)).toMatchObject({
            parent_feature_id: 'intersection-1',
            display_order: '15_2',
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

    it('finalizes a network connection draft as a SignalLine with explicit endpoints', async () => {
        useDesignSync.setState({
            drawingMode: 'polyline',
            currentDrawingPoints: [[20, 10], [21, 11]],
            currentDrawingSnapIds: ['cabinet-1', 'intersection-1'],
            networkConnectionDraft: { fromFeatureId: 'cabinet-1', toFeatureId: 'intersection-1' },
        });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.finalizePolyline();
        });

        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
            type: 'FeatureCreated',
            payload: {
                layer_id: 'layer-1',
                group_id: 'group-1',
                name: 'Tuyến SignalLine Mới',
                geom_type: 'LineString',
                coordinates: JSON.stringify([[20, 10], [21, 11]]),
            },
        });
        expect(getMetadataFromCall(dispatchEvent)).toMatchObject({
            infrastructure: { type: 'SignalLine' },
            network: {
                from_feature_id: 'cabinet-1',
                to_feature_id: 'intersection-1',
                direction_mode: 'auto',
            },
            start_node_id: 'cabinet-1',
            end_node_id: 'intersection-1',
            snap_links: {
                v0: 'cabinet-1',
                v1: 'intersection-1',
            },
        });
        expect(useDesignSync.getState().networkConnectionDraft).toBeNull();
        expect(useDesignSync.getState().drawingMode).toBe('none');
    });

    it('blocks polyline finalization when one endpoint is not snapped and keeps drawing state', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        useDesignSync.setState({
            drawingMode: 'polyline',
            currentDrawingPoints: [[20, 10], [21, 11]],
            currentDrawingSnapIds: ['cabinet-1', null],
        });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.finalizePolyline();
        });

        expect(dispatchEvent).not.toHaveBeenCalled();
        expect(useDesignSync.getState().drawingMode).toBe('polyline');
        expect(useDesignSync.getState().currentDrawingPoints).toEqual([[20, 10], [21, 11]]);
        expect(alertSpy).toHaveBeenCalledWith('Không thể lưu polyline vì đầu kết thúc chưa kết nối vào đối tượng hợp lệ.');
        alertSpy.mockRestore();
    });

    it('updates device parent in the same batch when a device connects directly to a source node', async () => {
        const dispatchEvents = vi.fn().mockResolvedValue(undefined);
        useDesignSync.setState({
            dispatchEvents: dispatchEvents as any,
            drawingMode: 'polyline',
            currentDrawingPoints: [[20, 10], [22, 12]],
            currentDrawingSnapIds: ['cabinet-1', 'camera-1'],
        });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.finalizePolyline();
        });

        expect(dispatchEvents).toHaveBeenCalledTimes(1);
        const events = dispatchEvents.mock.calls[0][0];
        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            type: 'FeatureUpdated',
            payload: {
                id: 'camera-1',
            },
        });
        expect(JSON.parse(events[0].payload.metadata)).toMatchObject({
            parent_feature_id: 'cabinet-1',
        });
        expect(events[1]).toMatchObject({
            type: 'FeatureCreated',
            payload: {
                name: 'Tuyến SignalLine Mới',
            },
        });
    });

    it('keeps a network connection draft when polyline finalization is blocked by missing group', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        useDesignSync.setState({
            drawingMode: 'polyline',
            selectedGroupId: null,
            currentDrawingPoints: [[20, 10], [21, 11]],
            currentDrawingSnapIds: ['cabinet-1', 'intersection-1'],
            networkConnectionDraft: { fromFeatureId: 'cabinet-1', toFeatureId: 'intersection-1' },
        });
        const { result } = renderHook(() => useDrawingInteraction());

        await act(async () => {
            await result.current.finalizePolyline();
        });

        expect(dispatchEvent).not.toHaveBeenCalled();
        expect(useDesignSync.getState().networkConnectionDraft).toEqual({
            fromFeatureId: 'cabinet-1',
            toFeatureId: 'intersection-1',
        });
        expect(useDesignSync.getState().drawingMode).toBe('polyline');
        alertSpy.mockRestore();
    });
});

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { VectorLayer } from './VectorLayer';

const polylineProps: any[] = [];

vi.mock('react-leaflet', () => ({
    Polyline: (props: any) => {
        polylineProps.push(props);
        return <div data-testid="polyline" />;
    },
    Polygon: () => <div data-testid="polygon" />,
    CircleMarker: () => <div data-testid="circle-marker" />,
}));

vi.mock('@DESIGN/features/map/MapLayerComponents/SharedMapComponents', () => ({
    getParsedMetadata: (feature: any) => typeof feature.metadata === 'string' ? JSON.parse(feature.metadata) : (feature.metadata || {}),
}));

vi.mock('@DESIGN/features/map', () => ({
    handleFeatureSelection: vi.fn(),
    stopFeatureEventPropagation: vi.fn(),
}));

describe('VectorLayer', () => {
    beforeEach(() => {
        polylineProps.length = 0;
        vi.clearAllMocks();
        useDesignSync.setState({
            drawingMode: 'none',
            editingFeatureId: null,
            groupThemePreview: null,
            setHoverId: vi.fn(),
        } as any);
    });

    it('keeps the visible polyline interactive so it can be selected directly', () => {
        const zoomTo = vi.fn();

        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Line 1',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ color: '#EF4444' }),
                    properties: {},
                }]}
                allFeatures={{}}
                parentChildMap={new Map()}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId={null}
                previewMetadata={null}
                zoomTo={zoomTo}
            />
        );

        expect(polylineProps).toHaveLength(2);
        expect(polylineProps[0].interactive).toBe(true);
        expect(polylineProps[1].interactive).toBe(true);
        expect(typeof polylineProps[1].eventHandlers?.click).toBe('function');
    });

    it('disables visible polyline interaction while drawing', () => {
        useDesignSync.setState({ drawingMode: 'polyline' } as any);

        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Line 1',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ color: '#EF4444' }),
                    properties: {},
                }]}
                allFeatures={{}}
                parentChildMap={new Map()}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId={null}
                previewMetadata={null}
                zoomTo={vi.fn()}
            />
        );

        expect(polylineProps[1].interactive).toBe(false);
    });

    it('hides intersection child polylines while zoomed out', () => {
        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Intersection Line',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ parent_feature_id: 'intersection-1', color: '#EF4444' }),
                    properties: {},
                }]}
                allFeatures={{}}
                parentChildMap={new Map()}
                featureHierarchy={{ depthMap: { 'line-1': 1 } }}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId={null}
                previewMetadata={null}
                currentZoom={18}
                zoomTo={vi.fn()}
            />
        );

        expect(polylineProps).toHaveLength(0);
    });

    it('shows intersection child polylines when zoomed in', () => {
        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Intersection Line',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ parent_feature_id: 'intersection-1', color: '#EF4444' }),
                    properties: {},
                }]}
                allFeatures={{}}
                parentChildMap={new Map()}
                featureHierarchy={{ depthMap: { 'line-1': 1 } }}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId={null}
                previewMetadata={null}
                currentZoom={19}
                zoomTo={vi.fn()}
            />
        );

        expect(polylineProps).toHaveLength(2);
    });

    it('renders line style from structured gis metadata', () => {
        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Line 1',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({
                        color: '#111111',
                        size: 2,
                        gis: {
                            color: '#0088ff',
                            weight: 9,
                            dashArray: '4 2',
                            opacity: 0.5,
                        },
                    }),
                    properties: {},
                }]}
                allFeatures={{}}
                parentChildMap={new Map()}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId={null}
                previewMetadata={null}
                zoomTo={vi.fn()}
            />
        );

        expect(polylineProps[1].pathOptions).toEqual(expect.objectContaining({
            color: '#0088ff',
            weight: 9,
            dashArray: '4 2',
            opacity: 0.5,
        }));
    });

    it('falls back to legacy line style metadata', () => {
        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Line 1',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ color: '#EF4444', weight: 7 }),
                    properties: {},
                }]}
                allFeatures={{}}
                parentChildMap={new Map()}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId={null}
                previewMetadata={null}
                zoomTo={vi.fn()}
            />
        );

        expect(polylineProps[1].pathOptions).toEqual(expect.objectContaining({
            color: '#EF4444',
            weight: 7,
        }));
    });
});

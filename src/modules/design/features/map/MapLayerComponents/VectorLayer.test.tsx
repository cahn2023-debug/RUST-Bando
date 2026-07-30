import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { VectorLayer } from './VectorLayer';

const polylineProps: any[] = [];
const markerProps: any[] = [];

vi.mock('react-leaflet', () => ({
    Polyline: (props: any) => {
        polylineProps.push(props);
        return <div data-testid="polyline" />;
    },
    Polygon: () => <div data-testid="polygon" />,
    CircleMarker: () => <div data-testid="circle-marker" />,
    Marker: (props: any) => {
        markerProps.push(props);
        return <div data-testid="snap-marker" />;
    },
}));

vi.mock('@DESIGN/features/map/MapLayerComponents/SharedMapComponents', () => ({
    getParsedMetadata: (feature: any, _previewMetadata: any, groupThemePreview: any) => {
        let metadata = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata) : (feature.metadata || {});
        if (groupThemePreview?.groupId === feature.group_id) {
            const config = groupThemePreview.config;
            metadata = {
                ...metadata,
                icon: config.icon === 'default' ? metadata.icon : config.icon,
                color: config.color,
                size: config.size,
                gis: {
                    ...(metadata.gis || {}),
                    color: config.color,
                    size: config.size,
                },
            };
        }
        return metadata;
    },
}));

vi.mock('@DESIGN/features/map', () => ({
    handleFeatureSelection: vi.fn(),
    stopFeatureEventPropagation: vi.fn(),
}));

describe('VectorLayer', () => {
    beforeEach(() => {
        polylineProps.length = 0;
        markerProps.length = 0;
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

    it('skips the invisible hit area during heavy render at lower zooms', () => {
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
                currentZoom={16}
                zoomTo={vi.fn()}
                isHeavyRender={true}
            />
        );

        expect(polylineProps).toHaveLength(1);
        expect(polylineProps[0].pathOptions.color).toBe('#EF4444');
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

    it('uses group theme preview size before an existing GIS weight', () => {
        useDesignSync.setState({
            groupThemePreview: {
                groupId: 'group-1',
                config: { icon: 'default', color: '#3B82F6', size: 11 },
            },
        } as any);

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
                        gis: {
                            color: '#0088ff',
                            weight: 4,
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
            color: '#3B82F6',
            weight: 11,
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

    it('renders stored snap markers for the selected polyline using target point coordinates', () => {
        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Line 1',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ snap_links: { v0: 'point-a' } }),
                    properties: {},
                }]}
                allFeatures={{
                    'point-a': {
                        id: 'point-a',
                        layer_id: 'layer-1',
                        group_id: 'group-1',
                        name: 'Point A',
                        geom_type: 'Point',
                        coordinates: [106.2, 10.2],
                        metadata: '{}',
                        properties: {},
                    },
                }}
                parentChildMap={new Map()}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId="line-1"
                previewMetadata={null}
                zoomTo={vi.fn()}
            />
        );

        expect(markerProps).toHaveLength(1);
        expect(markerProps[0].position).toEqual([10.2, 106.2]);
        expect(markerProps[0].interactive).toBe(false);
    });

    it('falls back to endpoint metadata and line vertex coordinates for missing targets', () => {
        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Line 1',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ start_node_id: 'missing-start', end_node_id: 'missing-end' }),
                    properties: {},
                }]}
                allFeatures={{}}
                parentChildMap={new Map()}
                feature_groups={{ 'group-1': { id: 'group-1', type: 'LINE', name: 'Lines' } }}
                selectedFeatureId="line-1"
                previewMetadata={null}
                zoomTo={vi.fn()}
            />
        );

        expect(markerProps.map(props => props.position)).toEqual([
            [10, 106],
            [10.001, 106.001],
        ]);
    });

    it('does not render stored snap markers for unselected polylines', () => {
        render(
            <VectorLayer
                features={[{
                    id: 'line-1',
                    layer_id: 'layer-1',
                    group_id: 'group-1',
                    name: 'Line 1',
                    geom_type: 'LineString',
                    coordinates: [[106, 10], [106.001, 10.001]],
                    metadata: JSON.stringify({ snap_links: { v0: 'point-a' } }),
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

        expect(markerProps).toHaveLength(0);
    });
});

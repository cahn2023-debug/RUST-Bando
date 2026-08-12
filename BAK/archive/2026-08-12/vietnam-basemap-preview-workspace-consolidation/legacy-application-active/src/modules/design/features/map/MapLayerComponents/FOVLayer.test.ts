import { describe, expect, it } from 'vitest';
import type { FeatureState } from '@CONTRACT/types';
import { buildFovFeatureCollection } from './FOVLayer';

const cameraFeature = (
    id: string,
    metadata: Record<string, any> = {},
    overrides: Partial<FeatureState> = {}
): FeatureState => ({
    id,
    layer_id: 'layer-1',
    group_id: 'camera-group',
    name: id,
    geom_type: 'Point',
    coordinates: [105.8, 21.02],
    properties: {},
    metadata: JSON.stringify({ icon: 'cctv', ...metadata }),
    ...overrides,
});

describe('buildFovFeatureCollection', () => {
    it('respects camera type filters, show_fov, zoom threshold, and default metadata', () => {
        const collection = buildFovFeatureCollection({
            features: [
                cameraFeature('visible-camera'),
                cameraFeature('disabled-camera', { show_fov: false }),
                cameraFeature('filtered-camera', { icon: 'ptz' }),
            ],
            featureGroups: { 'camera-group': { type: 'CAMERA', name: 'Camera' } },
            showFovTypes: ['camera'],
            currentZoom: 13,
        });

        expect(collection.features).toHaveLength(1);
        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            id: 'visible-camera',
            rotation: 0,
            fovAngle: 60,
            fovRadius: 50,
        }));
        expect(buildFovFeatureCollection({
            features: [cameraFeature('too-low')],
            featureGroups: { 'camera-group': { type: 'CAMERA', name: 'Camera' } },
            showFovTypes: ['camera'],
            currentZoom: 12.9,
        }).features).toHaveLength(0);
    });

    it('uses gis metadata before legacy FOV metadata', () => {
        const collection = buildFovFeatureCollection({
            features: [cameraFeature('camera-1', {
                rotation: 11,
                fov_angle: 44,
                fov_radius: 22,
                gis: {
                    rotation: 90,
                    fov_angle: 70,
                    fov_radius: 80,
                },
            })],
            featureGroups: { 'camera-group': { type: 'CAMERA', name: 'Camera' } },
            showFovTypes: ['cctv'],
            currentZoom: 18,
        });

        expect(collection.features[0].properties).toEqual(expect.objectContaining({
            rotation: 90,
            fovAngle: 70,
            fovRadius: 80,
        }));
    });

    it('hides intersection child camera FOV below zoom 15 and shows it from zoom 15', () => {
        const childCamera = cameraFeature('junction-camera', { parent_feature_id: 'junction-1' }, {
            group_id: 'junction-group',
        });
        const featureGroups = { 'junction-group': { type: 'INTERSECTION', name: 'Nút giao' } };

        expect(buildFovFeatureCollection({
            features: [childCamera],
            featureGroups,
            showFovTypes: ['cctv'],
            currentZoom: 14.9,
        }).features).toHaveLength(0);
        expect(buildFovFeatureCollection({
            features: [childCamera],
            featureGroups,
            showFovTypes: ['cctv'],
            currentZoom: 15,
        }).features).toHaveLength(1);
    });

    it('filters hidden and out-of-viewport cameras without leaving stale items', () => {
        const collection = buildFovFeatureCollection({
            features: [
                cameraFeature('hidden-camera'),
                cameraFeature('outside-camera', {}, { coordinates: [106.8, 22.02] as any }),
                cameraFeature('inside-camera'),
                cameraFeature('invalid-camera', {}, { coordinates: ['bad', 21.02] as any }),
            ],
            featureGroups: { 'camera-group': { type: 'CAMERA', name: 'Camera' } },
            showFovTypes: ['cctv'],
            currentZoom: 18,
            hiddenIds: new Set(['hidden-camera']),
            bounds: { south: 20, north: 22, west: 105, east: 106 },
        });

        expect(collection.features.map(feature => feature.properties?.id)).toEqual(['inside-camera']);
    });
});

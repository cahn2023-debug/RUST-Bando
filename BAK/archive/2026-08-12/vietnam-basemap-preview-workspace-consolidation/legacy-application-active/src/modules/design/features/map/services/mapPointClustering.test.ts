import { describe, expect, it } from 'vitest';
import type { MapLibreRenderFeature, MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';
import { buildPointClusteringCollections, onlyClusterablePointFeatures, resolvePointOverlayRenderFlags } from './mapPointClustering';

const feature = (
    id: string,
    geometryType: MapLibreRenderFeature['geometry']['type'],
    props: Partial<MapLibreRenderFeature['properties']> = {}
): MapLibreRenderFeature => ({
    type: 'Feature',
    geometry: {
        type: geometryType,
        coordinates: geometryType === 'Point' ? [105.8, 21.02] : [[105.8, 21.02], [105.81, 21.03]],
    } as MapLibreRenderFeature['geometry'],
    properties: {
        id,
        groupId: null,
        layerId: 'layer-1',
        name: id,
        geomType: geometryType,
        color: '#ef4444',
        size: 14,
        selected: false,
        ...props,
    },
});

const collection = (...features: MapLibreRenderFeature[]): MapLibreRenderFeatureCollection => ({
    type: 'FeatureCollection',
    features,
});

describe('mapPointClustering', () => {
    it('keeps only clusterable standalone points in the cluster source when clusterPoints is true', () => {
        const result = onlyClusterablePointFeatures(collection(
            feature('standalone', 'Point'),
            feature('line', 'LineString'),
            feature('line-like-point', 'Point', { geomType: 'line' }),
            feature('intersection-child', 'Point', { isIntersectionChild: true })
        ), true);

        expect(result.features.map(item => item.properties.id)).toEqual(['standalone']);
    });

    it('retains intersection child point features when clusterPoints is false so icons can render', () => {
        const result = onlyClusterablePointFeatures(collection(
            feature('standalone', 'Point'),
            feature('line', 'LineString'),
            feature('line-like-point', 'Point', { geomType: 'line' }),
            feature('intersection-child', 'Point', { isIntersectionChild: true })
        ), false);

        expect(result.features.map(item => item.properties.id)).toEqual(['standalone', 'intersection-child']);
    });

    it('feeds the cluster source when clustering is enabled even if overlay points are enabled', () => {
        const result = buildPointClusteringCollections({
            collection: collection(feature('point-1', 'Point'), feature('line-1', 'LineString')),
            clusterPoints: true,
            overlayPoints: true,
        });

        expect(result.mainCollection.features.map(item => item.properties.id)).toEqual(['line-1']);
        expect(result.clusterCollection.features.map(item => item.properties.id)).toEqual(['point-1']);
    });

    it('feeds plain MapLibre point layers when clustering and overlay points are both off', () => {
        const result = buildPointClusteringCollections({
            collection: collection(feature('point-1', 'Point'), feature('line-1', 'LineString')),
            clusterPoints: false,
            overlayPoints: false,
        });

        expect(result.mainCollection.features.map(item => item.properties.id)).toEqual(['line-1']);
        expect(result.clusterCollection.features.map(item => item.properties.id)).toEqual(['point-1']);
    });

    it('disables canvas point rendering while cluster rendering is active', () => {
        expect(resolvePointOverlayRenderFlags({
            overlayEnabled: true,
            overlayPoints: true,
            overlayLines: false,
            overlayPolygons: false,
            overlayIcons: false,
            overlayLabels: false,
            overlayEditing: false,
        }, true).overlayPoints).toBe(false);
    });
});

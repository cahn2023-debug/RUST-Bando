import { describe, expect, it, vi } from 'vitest';
import { applyBasemapLayerVisibility, applySubLayerVisibility } from './MapCanvas';
import type { SubLayerConfig } from './types';
import type maplibregl from 'maplibre-gl';

describe('applySubLayerVisibility', () => {
    it('sets layout visibility property based on subLayer rules', () => {
        const mockLayers = [
            { id: 'admin-borders', type: 'line' },
            { id: 'road-primary', type: 'line' },
            { id: 'poi-hospital', type: 'symbol' },
            { id: 'building-extrusion', type: 'fill-extrusion' },
            { id: 'hillshade-layer', type: 'hillshade' },
        ];

        const setLayoutPropertyMock = vi.fn();

        const mockMap = {
            getStyle: () => ({ layers: mockLayers }),
            setLayoutProperty: setLayoutPropertyMock,
        } as unknown as maplibregl.Map;

        const subLayers: SubLayerConfig = {
            bordersLabels: true,
            roads: false,
            pois: true,
            buildings3d: false,
            terrain: true,
        };

        applySubLayerVisibility(mockMap, subLayers);

        expect(setLayoutPropertyMock).toHaveBeenCalledWith('admin-borders', 'visibility', 'visible');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('road-primary', 'visibility', 'none');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('poi-hospital', 'visibility', 'visible');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('building-extrusion', 'visibility', 'none');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('hillshade-layer', 'visibility', 'visible');
    });

    it('keeps the Google Hybrid satellite base visible when all overlay sublayers are turned off', () => {
        const mockLayers = [
            { id: 'google-hybrid-base-layer', type: 'raster', source: 'google-hybrid-base' },
            { id: 'google-hybrid-overlay-layer', type: 'raster', source: 'google-hybrid-overlay' },
        ];
        const setLayoutPropertyMock = vi.fn();
        const mockMap = {
            getStyle: () => ({ layers: mockLayers }),
            setLayoutProperty: setLayoutPropertyMock,
        } as unknown as maplibregl.Map;

        const subLayersOff: SubLayerConfig = {
            bordersLabels: false,
            roads: false,
            pois: false,
            buildings3d: false,
            terrain: false,
        };

        applySubLayerVisibility(mockMap, subLayersOff);
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('google-hybrid-base-layer', 'visibility', 'visible');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('google-hybrid-overlay-layer', 'visibility', 'none');
    });

    it('updates composite Google raster tiles with apistyle rules', () => {
        const setLayoutPropertyMock = vi.fn();
        const setTilesMock = vi.fn();
        const mockMap = {
            getStyle: () => ({
                layers: [{ id: 'google-raster-layer', type: 'raster', source: 'google-raster' }],
            }),
            getSource: () => ({ setTiles: setTilesMock }),
            setLayoutProperty: setLayoutPropertyMock,
        } as unknown as maplibregl.Map;

        applySubLayerVisibility(mockMap, {
            bordersLabels: true,
            roads: false,
            pois: true,
            buildings3d: true,
            terrain: false,
        });

        const [tiles] = setTilesMock.mock.calls[0] as [string[]];
        expect(decodeURIComponent(tiles[0])).toContain('apistyle=s.t:3|s.e:g|p.v:off');
    });

    it('toggles local style groups independently while preserving unmapped layers', () => {
        const setLayoutPropertyMock = vi.fn();
        const mockMap = {
            getStyle: () => ({
                layers: [
                    { id: 'landcover', type: 'fill', 'source-layer': 'landcover' },
                    { id: 'road-major', type: 'line', 'source-layer': 'transportation' },
                    { id: 'poi-label', type: 'symbol', 'source-layer': 'poi' },
                    { id: 'custom-overlay', type: 'line', 'source-layer': 'custom' },
                ],
            }),
            setLayoutProperty: setLayoutPropertyMock,
        } as unknown as maplibregl.Map;

        applyBasemapLayerVisibility(mockMap, {
            landcover: false,
            water: true,
            boundaries: true,
            roads: true,
            labels: false,
            pois: false,
            buildings: true,
            terrain: true,
        });

        expect(setLayoutPropertyMock).toHaveBeenCalledWith('landcover', 'visibility', 'none');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('road-major', 'visibility', 'visible');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('poi-label', 'visibility', 'none');
        expect(setLayoutPropertyMock).toHaveBeenCalledWith('custom-overlay', 'visibility', 'visible');
    });
});

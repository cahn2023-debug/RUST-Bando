import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMapStyles } from './useMapStyles';

const STORAGE_KEY = 'design.map.features';

describe('useMapStyles', () => {
    afterEach(() => {
        window.localStorage.clear();
    });

    it('defaults to the Google Vietnam hybrid basemap with four tile subdomains', () => {
        const { result } = renderHook(() => useMapStyles());

        expect(result.current.basemapId).toBe('google-vietnam-hybrid');
        expect(result.current.getStyledTiles()).toEqual([
            'https://mt0.google.com/vt/lyrs=y&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=y&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=y&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=y&hl=vi&gl=vn&x={x}&y={y}&z={z}',
        ]);
    });

    it('keeps legacy localStorage feature toggles while adding the default basemap', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            roads: false,
            roadNames: true,
            buildings: false,
            pois: true,
            labels: false,
        }));

        const { result } = renderHook(() => useMapStyles());

        expect(result.current.basemapId).toBe('google-vietnam-hybrid');
        expect(result.current.mapFeatures).toEqual({
            roads: false,
            roadNames: true,
            buildings: false,
            pois: true,
            labels: false,
        });
    });

    it('adds apistyle to roadmap and hybrid tiles but not satellite tiles', () => {
        const { result } = renderHook(() => useMapStyles());

        act(() => {
            result.current.setMapFeatures(prev => ({
                ...prev,
                roads: false,
                pois: false,
                labels: false,
            }));
        });

        const roadTile = result.current.getStyledTiles('google-vietnam-road')[0];
        const hybridTile = result.current.getStyledTiles('google-vietnam-hybrid')[0];
        const satelliteTile = result.current.getStyledTiles('google-vietnam-satellite')[0];

        expect(roadTile).toContain('https://mt0.google.com/vt/lyrs=m&hl=vi&gl=vn');
        expect(roadTile).toContain('&apistyle=');
        expect(decodeURIComponent(roadTile)).toContain('s.t:3|s.e:g|p.v:off');
        expect(decodeURIComponent(roadTile)).toContain('s.t:8|p.v:off');
        expect(hybridTile).toContain('&apistyle=');
        expect(satelliteTile).toBe('https://mt0.google.com/vt/lyrs=s&hl=vi&gl=vn&x={x}&y={y}&z={z}');
    });
});

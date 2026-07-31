import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMapStyles } from './useMapStyles';

const STORAGE_KEY = 'design.map.features';

describe('useMapStyles', () => {
    afterEach(() => {
        window.localStorage.clear();
    });

    it('defaults to the street basemap with four tile subdomains', () => {
        const { result } = renderHook(() => useMapStyles());

        expect(result.current.basemapId).toBe('street');
        expect(result.current.activeBasemapPreset.kind).toBe('raster');
        expect(result.current.getStyledTiles()).toEqual([
            'https://mt0.google.com/vt/lyrs=m&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=m&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=m&hl=vi&gl=vn&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=m&hl=vi&gl=vn&x={x}&y={y}&z={z}',
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

        expect(result.current.basemapId).toBe('street');
        expect(result.current.mapFeatures).toEqual({
            roads: false,
            roadNames: true,
            buildings: false,
            pois: true,
            labels: false,
        });
    });

    it('migrates legacy basemap ids from localStorage', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            basemapId: 'google-vietnam-satellite',
        }));

        const { result } = renderHook(() => useMapStyles());
        expect(result.current.basemapId).toBe('satellite');

        act(() => {
            result.current.setBasemapId('dark');
        });

        expect(result.current.activeBasemapPreset.id).toBe('dark');
    });

    it('adds feature apistyle to street and dark tiles but not satellite tiles', () => {
        const { result } = renderHook(() => useMapStyles());

        act(() => {
            result.current.setMapFeatures(prev => ({
                ...prev,
                roads: false,
                pois: false,
                labels: false,
            }));
        });

        const streetTile = result.current.getStyledTiles('street')[0];
        const darkTile = result.current.getStyledTiles('dark')[0];
        const satelliteTile = result.current.getStyledTiles('satellite')[0];

        expect(streetTile).toContain('https://mt0.google.com/vt/lyrs=m&hl=vi&gl=vn');
        expect(streetTile).toContain('&apistyle=');
        expect(decodeURIComponent(streetTile)).toContain('s.t:3|s.e:g|p.v:off');
        expect(decodeURIComponent(streetTile)).toContain('s.t:8|p.v:off');
        expect(darkTile).toContain('&apistyle=');
        expect(decodeURIComponent(darkTile)).toContain('p.c:#101318');
        expect(decodeURIComponent(darkTile)).toContain('s.t:3|s.e:g|p.v:off');
        expect(satelliteTile).toBe('https://mt0.google.com/vt/lyrs=s&hl=vi&gl=vn&x={x}&y={y}&z={z}');
    });

    it('builds heat basemap tiles and exposes the heat preset kind', () => {
        const { result } = renderHook(() => useMapStyles());

        act(() => {
            result.current.setBasemapId('heat');
        });

        const heatTile = result.current.getStyledTiles()[0];
        expect(result.current.activeBasemapPreset.kind).toBe('heat');
        expect(heatTile).toContain('https://mt0.google.com/vt/lyrs=m&hl=vi&gl=vn');
        expect(decodeURIComponent(heatTile)).toContain('s.t:3|s.e:l|p.v:off');
        expect(decodeURIComponent(heatTile)).toContain('s.t:8|p.v:off');
    });
});

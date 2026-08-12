import type maplibregl from 'maplibre-gl';
import type { PreviewPoint } from './extent';

export function calculateDistanceMeters(p1: PreviewPoint, p2: PreviewPoint): number {
    const R = 6371008.8; // Radius of earth in meters
    const rad = Math.PI / 180;
    const lat1 = p1[1] * rad;
    const lat2 = p2[1] * rad;
    const dLat = (p2[1] - p1[1]) * rad;
    const dLng = (p2[0] - p1[0]) * rad;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
}

const SOURCE_ID = 'measure-geojson-source';
const LINE_LAYER_ID = 'measure-line-layer';
const POINT_LAYER_ID = 'measure-point-layer';

export class MeasureToolController {
    private map: maplibregl.Map;
    private points: PreviewPoint[] = [];
    private hoverPoint: PreviewPoint | null = null;
    private markers: maplibregl.Marker[] = [];

    constructor(map: maplibregl.Map) {
        this.map = map;
        this.setupLayers();
    }

    private setupLayers(): void {
        if (this.map.getSource(SOURCE_ID)) return;

        this.map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [],
            },
        });

        this.map.addLayer({
            id: LINE_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            filter: ['==', '$type', 'LineString'],
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
            paint: {
                'line-color': '#65d6c3',
                'line-width': 3,
                'line-dasharray': [2, 1],
            },
        });

        this.map.addLayer({
            id: POINT_LAYER_ID,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['==', '$type', 'Point'],
            paint: {
                'circle-radius': 5,
                'circle-color': '#0d1117',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#65d6c3',
            },
        });
    }

    public addPoint(point: PreviewPoint): void {
        this.points.push(point);
        this.hoverPoint = null;
        this.render();
    }

    public updateHoverPoint(point: PreviewPoint): void {
        if (this.points.length === 0) return;
        this.hoverPoint = point;
        this.render();
    }

    public getPointCount(): number {
        return this.points.length;
    }

    public getTotalDistance(): number {
        let total = 0;
        for (let i = 1; i < this.points.length; i++) {
            total += calculateDistanceMeters(this.points[i - 1], this.points[i]);
        }
        return total;
    }

    public getTotalDistanceFormatted(): string {
        return formatDistance(this.getTotalDistance());
    }

    public clear(): void {
        this.points = [];
        this.hoverPoint = null;
        this.clearMarkers();
        this.render();
    }

    public destroy(): void {
        this.clearMarkers();
        if (this.map.getLayer(LINE_LAYER_ID)) this.map.removeLayer(LINE_LAYER_ID);
        if (this.map.getLayer(POINT_LAYER_ID)) this.map.removeLayer(POINT_LAYER_ID);
        if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
    }

    private clearMarkers(): void {
        this.markers.forEach(marker => marker.remove());
        this.markers = [];
    }

    private render(): void {
        const source = this.map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (!source) return;

        const currentPoints = [...this.points];
        if (this.hoverPoint && currentPoints.length > 0) {
            currentPoints.push(this.hoverPoint);
        }

        const features: GeoJSON.Feature[] = [];

        // Line feature
        if (currentPoints.length >= 2) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: currentPoints,
                },
                properties: {},
            });
        }

        // Point features
        for (const pt of this.points) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: pt,
                },
                properties: {},
            });
        }

        source.setData({
            type: 'FeatureCollection',
            features,
        });

        // Update markers for total distance label at the last point
        this.clearMarkers();
        if (this.points.length > 0) {
            let runningTotal = 0;
            for (let i = 0; i < this.points.length; i++) {
                if (i > 0) {
                    runningTotal += calculateDistanceMeters(this.points[i - 1], this.points[i]);
                }
                const el = document.createElement('div');
                el.className = 'measure-marker-label';
                el.textContent = i === 0 ? 'Điểm đầu' : formatDistance(runningTotal);

                // Add marker
                const maplibreGlobal = (window as unknown as { maplibregl?: typeof maplibregl }).maplibregl;
                if (maplibreGlobal) {
                    const marker = new maplibreGlobal.Marker({
                        element: el,
                        anchor: 'bottom',
                        offset: [0, -10],
                    })
                        .setLngLat(this.points[i])
                        .addTo(this.map);
                    this.markers.push(marker);
                }
            }
        }
    }
}

import type maplibregl from 'maplibre-gl';
import { getIconSvgString } from '@DESIGN/components/icons/MapIcons';
import type { MapLibreRenderFeatureCollection } from '../mapLibreFastTypes';

export type MapLibreImageData = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
};

const MAX_IMAGE_CACHE_SIZE = 256;
const MAX_ICON_LOADS_PER_RENDER = 96;
const imageCache = new Map<string, Promise<MapLibreImageData>>();
const imageLoadInFlight = new Set<string>();

const canUsePerformanceNow = () => typeof performance !== 'undefined' && typeof performance.now === 'function';
const now = () => canUsePerformanceNow() ? performance.now() : Date.now();

export const clearMapImageCache = () => {
    imageCache.clear();
    imageLoadInFlight.clear();
};

const escapeSvgText = (value: unknown) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const svgBlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });

const svgSize = (svg: string) => {
    const width = Number(svg.match(/\bwidth="(\d+(?:\.\d+)?)"/)?.[1]);
    const height = Number(svg.match(/\bheight="(\d+(?:\.\d+)?)"/)?.[1]);
    return {
        width: Number.isFinite(width) && width > 0 ? Math.ceil(width) : 24,
        height: Number.isFinite(height) && height > 0 ? Math.ceil(height) : 24,
    };
};

const loadSvgBitmap = (blob: Blob) => {
    const loadWithImageElement = () => new Promise<CanvasImageSource>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load SVG image'));
        };
        image.src = url;
    });

    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob).catch(loadWithImageElement);
    }

    return loadWithImageElement();
};

export const loadSvgImage = (id: string, svg: string) => {
    const cached = imageCache.get(id);
    if (cached) {
        imageCache.delete(id);
        imageCache.set(id, cached);
        return cached;
    }

    const promise = (async (): Promise<MapLibreImageData> => {
        const { width, height } = svgSize(svg);
        const bitmap = await loadSvgBitmap(svgBlob(svg));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable');
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        return context.getImageData(0, 0, width, height);
    })();
    imageCache.set(id, promise);
    while (imageCache.size > MAX_IMAGE_CACHE_SIZE) {
        const oldestKey = imageCache.keys().next().value;
        if (!oldestKey) break;
        imageCache.delete(oldestKey);
    }
    return promise;
};

export const iconSvgForFeature = (properties: Record<string, any>) => {
    const color = String(properties.color || '#6366f1');
    const size = Number(properties.displaySize || properties.size || 24);
    const labelIndex = escapeSvgText(properties.labelIndex || '');
    if (properties.isIntersection) {
        const textColor = ['#ffffff', 'white', '#fff'].includes(color.toLowerCase().trim()) ? '#111827' : '#ffffff';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
            <g transform="rotate(45 12 12)" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 2 L8 8 L2 8"/>
                <path d="M16 2 L16 8 L22 8"/>
                <path d="M22 16 L16 16 L16 22"/>
                <path d="M8 22 L8 16 L2 16"/>
            </g>
            ${labelIndex ? `<text x="12" y="15" font-family="Arial, sans-serif" font-size="8" font-weight="900" text-anchor="middle" fill="${textColor}" stroke="rgba(0,0,0,0.7)" stroke-width="1" paint-order="stroke">${labelIndex}</text>` : ''}
        </svg>`;
    }
    return getIconSvgString(
        String(properties.iconKey || 'cctv'),
        color,
        size,
        labelIndex,
        Number(properties.rotation || 0)
    );
};

export const preparePointImages = (
    map: maplibregl.Map,
    collection: MapLibreRenderFeatureCollection,
    onImageReady: (imageId: string, image: MapLibreImageData, preloadMs: number) => void
): MapLibreRenderFeatureCollection => {
    const missingIconMap = new Map<string, Record<string, any>>();
    for (let index = 0; index < collection.features.length; index += 1) {
        const properties = collection.features[index].properties as Record<string, any>;
        const imageId = properties?.iconImageId;
        if (imageId && !map.hasImage(imageId)) {
            if (!missingIconMap.has(imageId)) {
                missingIconMap.set(imageId, properties);
            }
        }
    }

    if (missingIconMap.size === 0) return collection;

    const nextFeatures = collection.features.map(feature => {
        const imageId = (feature.properties as Record<string, any>)?.iconImageId;
        if (imageId && missingIconMap.has(imageId)) {
            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    iconImageId: '',
                },
            };
        }
        return feature;
    });

    const nextCollection: MapLibreRenderFeatureCollection = {
        ...collection,
        features: nextFeatures,
    };

    let scheduledLoads = 0;
    for (const [imageId, properties] of missingIconMap) {
        if (imageLoadInFlight.has(imageId)) continue;
        if (scheduledLoads >= MAX_ICON_LOADS_PER_RENDER) break;
        scheduledLoads += 1;
        imageLoadInFlight.add(imageId);
        const svg = iconSvgForFeature(properties);
        const preloadStart = now();
        void loadSvgImage(imageId, svg)
            .then(image => {
                imageLoadInFlight.delete(imageId);
                onImageReady(imageId, image, now() - preloadStart);
            })
            .catch(error => {
                imageLoadInFlight.delete(imageId);
                console.warn('[MapLibreFastRenderer] Failed to load point icon:', imageId, error);
            });
    }

    return nextCollection;
};

export type BasemapLayerGroupId =
    | 'landcover'
    | 'water'
    | 'boundaries'
    | 'roads'
    | 'labels'
    | 'pois'
    | 'buildings'
    | 'terrain';

export interface BasemapLayerGroupDefinition {
    id: BasemapLayerGroupId;
    label: string;
    order: number;
    defaultVisible: boolean;
}

export const BASEMAP_LAYER_GROUPS: readonly BasemapLayerGroupDefinition[] = [
    { id: 'landcover', label: 'Nền đất', order: 0, defaultVisible: true },
    { id: 'water', label: 'Nước', order: 1, defaultVisible: true },
    { id: 'boundaries', label: 'Ranh giới', order: 2, defaultVisible: true },
    { id: 'roads', label: 'Đường', order: 3, defaultVisible: true },
    { id: 'labels', label: 'Nhãn', order: 4, defaultVisible: true },
    { id: 'pois', label: 'POI', order: 5, defaultVisible: true },
    { id: 'buildings', label: 'Công trình', order: 6, defaultVisible: true },
    { id: 'terrain', label: 'Địa hình', order: 7, defaultVisible: true },
];

export interface BasemapLayerCapabilities {
    availableGroups: BasemapLayerGroupId[];
    groupLayerIds: Partial<Record<BasemapLayerGroupId, string[]>>;
    unmappedLayerIds: string[];
}

export const GOOGLE_BASEMAP_LAYER_CAPABILITIES: BasemapLayerCapabilities = {
    availableGroups: ['roads', 'labels', 'pois'],
    groupLayerIds: {},
    unmappedLayerIds: [],
};

export function getAvailableBasemapLayerGroups(
    capabilities: BasemapLayerCapabilities | null,
): BasemapLayerGroupDefinition[] {
    if (!capabilities) return [];
    return BASEMAP_LAYER_GROUPS.filter(group => capabilities.availableGroups.includes(group.id));
}

export type BasemapLayerVisibility = Record<BasemapLayerGroupId, boolean>;

export const DEFAULT_BASEMAP_LAYER_VISIBILITY: BasemapLayerVisibility = {
    landcover: true,
    water: true,
    boundaries: true,
    roads: true,
    labels: true,
    pois: true,
    buildings: true,
    terrain: true,
};

export interface BasemapStyleLayer {
    id: string;
    type: string;
    'source-layer'?: string;
}

export function detectBasemapLayerCapabilities(
    layers: readonly BasemapStyleLayer[],
): BasemapLayerCapabilities {
    const groupLayerIds: Partial<Record<BasemapLayerGroupId, string[]>> = {};
    const unmappedLayerIds: string[] = [];

    for (const layer of layers) {
        const group = classifyBasemapLayer(layer);
        if (!group) {
            unmappedLayerIds.push(layer.id);
            continue;
        }
        (groupLayerIds[group] ??= []).push(layer.id);
    }

    const availableGroups = BASEMAP_LAYER_GROUPS
        .filter(group => (groupLayerIds[group.id]?.length ?? 0) > 0)
        .map(group => group.id);

    return { availableGroups, groupLayerIds, unmappedLayerIds };
}

export function classifyBasemapLayer(layer: BasemapStyleLayer): BasemapLayerGroupId | null {
    const sourceLayer = normalizeLayerName(layer['source-layer']);
    const id = normalizeLayerName(layer.id);

    if (sourceLayer === 'landcover' || sourceLayer === 'landuse') {
        return 'landcover';
    }
    if (sourceLayer === 'water' || sourceLayer === 'waterway') {
        return 'water';
    }
    if (sourceLayer === 'boundary') {
        return 'boundaries';
    }
    if (sourceLayer === 'transportation' || sourceLayer === 'railway' || sourceLayer === 'ferry') {
        return 'roads';
    }
    if (sourceLayer === 'place') {
        return 'labels';
    }
    if (sourceLayer === 'poi' || sourceLayer === 'airport') {
        return 'pois';
    }
    if (sourceLayer === 'building') {
        return 'buildings';
    }
    if (sourceLayer === 'terrain' || sourceLayer === 'contour') {
        return 'terrain';
    }

    if (hasToken(id, 'landcover', 'landuse', 'land')) return 'landcover';
    if (hasToken(id, 'water', 'waterway')) return 'water';
    if (hasToken(id, 'boundary', 'border', 'admin')) return 'boundaries';
    if (hasToken(id, 'road', 'railway', 'ferry', 'transport')) return 'roads';
    if (hasToken(id, 'label', 'place')) return 'labels';
    if (hasToken(id, 'poi', 'amenity', 'hospital', 'school', 'airport')) return 'pois';
    if (hasToken(id, 'building', 'structure')) return 'buildings';
    if (hasToken(id, 'terrain', 'contour', 'hillshade')) return 'terrain';

    return null;
}

function normalizeLayerName(value: string | undefined): string {
    return (value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function hasToken(value: string, ...tokens: string[]): boolean {
    return tokens.some(token => value.includes(token));
}

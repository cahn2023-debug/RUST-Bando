import React from 'react';
import { FeatureState } from '@CONTRACT/types';
import { getParsedCoordinates, getCleanName, getFeatureNote } from '@TOOL/utils/featureUtils';
import { getParsedMetadata as getBaseMetadata } from '@TOOL/utils/featureMetadata';

export const getParsedMetadata = (
    f: FeatureState,
    previewMetadata: { id: string, metadata: any } | null,
    groupThemePreview: { groupId: string, config: any } | null = null
) => {
    let meta = getBaseMetadata(f);

    // 1. Apply Group Theme Preview (if any)
    if (groupThemePreview && groupThemePreview.groupId === f.group_id) {
        const config = groupThemePreview.config;

        // Only apply if it's NOT a child feature (as per business rule)
        const currentMeta = meta;
        if (!currentMeta.parent_feature_id) {
            meta = {
                ...meta,
                icon: config.icon === 'default' ? meta.icon : config.icon,
                color: config.color,
                size: config.size !== undefined ? config.size : meta.size,
                weight: config.weight !== undefined ? config.weight : meta.weight,
                stroke: config.stroke !== undefined ? config.stroke : meta.stroke,
                gis: {
                    ...(meta.gis || {}),
                    ...(config.gis || {}),
                    ...(config.size !== undefined ? { color: config.color, size: config.size } : {}),
                },
                infrastructure: {
                    ...(meta.infrastructure || {}),
                    ...(config.infrastructure || {}),
                },
                fiber: {
                    ...(meta.fiber || {}),
                    ...(config.fiber || {}),
                },
            };
        }
    }

    // 2. Apply Single Feature Preview (overrides group preview)
    if (previewMetadata && previewMetadata.id === f.id) {
        const previewMeta = typeof previewMetadata.metadata === 'string'
            ? JSON.parse(previewMetadata.metadata)
            : previewMetadata.metadata;

        // Deep merge 'gis' object to prevent losing siblings (e.g. fov_angle when rotation changes)
        if (previewMeta.gis && meta.gis) {
            meta = {
                ...meta,
                ...previewMeta,
                gis: { ...meta.gis, ...previewMeta.gis }
            };
        } else {
            meta = { ...meta, ...previewMeta };
        }
    }

    return meta;
};

export const FeaturePopupContent = React.memo(({ f, metadata, displayType, indexInGroup }: any) => {
    const coords = getParsedCoordinates(f);
    if (!coords || !Array.isArray(coords)) return null;

    const isPoint = f.geom_type === 'Point' || f.geom_type === undefined;
    const notes = getFeatureNote({ ...f, metadata });

    return (
        <div className="p-1 min-w-[200px]">
            <div className="font-bold text-lg border-b pb-1 mb-2 text-cyan-700 flex items-center justify-between">
                <span>{getCleanName(f, indexInGroup)}</span>
            </div>
            <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-center text-gray-500">
                    <span>Loại:</span>
                    <span className="font-medium bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-700">{displayType}</span>
                </div>

                {!isPoint && (f.length || metadata.gis?.lengthKm) && (
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-500">Chiều dài:</span>
                        <span className="font-mono">
                            {f.length
                                ? (f.length / 1000).toFixed(3)
                                : (metadata.gis?.lengthKm || 0).toFixed(3)} KM
                        </span>
                    </div>
                )}

                {!isPoint && (f.area || metadata.gis?.areaKm2) && (
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-gray-500">Diện tích:</span>
                        <span className="font-mono">
                            {f.area
                                ? (f.area / 1000000).toFixed(4)
                                : (metadata.gis?.areaKm2 || 0).toFixed(4)} KM²
                        </span>
                    </div>
                )}

                <hr className="my-1 border-gray-100" />

                {isPoint && Array.isArray(coords) && coords.length >= 2 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="bg-cyan-50 p-1.5 rounded">
                            <div className="text-[10px] text-cyan-600 uppercase font-bold">Kinh độ</div>
                            <div className="font-mono text-xs">{(coords[0] as number).toFixed(5)}</div>
                        </div>
                        <div className="bg-cyan-50 p-1.5 rounded">
                            <div className="text-[10px] text-cyan-600 uppercase font-bold">Vĩ độ</div>
                            <div className="font-mono text-xs">{(coords[1] as number).toFixed(5)}</div>
                        </div>
                    </div>
                )}

                {notes && (
                    <div className="mt-3 p-2 bg-amber-50 border-l-2 border-amber-400 text-amber-900 text-xs italic rounded-r">
                        {notes}
                    </div>
                )}
            </div>
        </div>
    );
});

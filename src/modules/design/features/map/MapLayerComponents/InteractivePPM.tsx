import React, { useState, useCallback } from 'react';
import { useMapEvents } from 'react-leaflet';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
    getPointCoordinates,
    getEffectiveMountingHeight,
    getEffectiveCameraSpecs,
    getFeatureMetadataValue
} from '@TOOL/utils/featureUtils';
import { calculatePPMAtPoint, SENSOR_SIZES, calculateHFOV, getDORICategory } from '@TOOL/utils/cameraMath';
import { createPortal } from 'react-dom';

const metadataNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

export const InteractivePPM: React.FC = () => {
    const showDORILayers = useDesignSync(s => s.showDORILayers);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const state = useDesignSync(s => s.state);
    const previewMetadata = useDesignSync(s => s.previewMetadata);

    const [ppmInfo, setPpmInfo] = useState<{ ppm: number; lat: number; lng: number; x: number; y: number } | null>(null);

    // Get selected camera data (similar to DORIOverlay)
    const getCameraData = useCallback(() => {
        if (!selectedFeatureId || !state) return null;
        const feature = state.features[selectedFeatureId];
        if (!feature) return null;

        const isPreviewing = previewMetadata?.id === selectedFeatureId;
        const baseMeta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata) : (feature.metadata || {});
        const metadata = isPreviewing ? { ...baseMeta, ...previewMetadata.metadata } : baseMeta;

        const isCamera = (
            feature.properties?.iconKey === 'cctv' ||
            getFeatureMetadataValue(feature, 'type', 'type', metadata) === 'camera' ||
            getFeatureMetadataValue(feature, 'specs.focal_length', 'focal_length', metadata) ||
            getFeatureMetadataValue(feature, 'specs.hfov', 'hfov', metadata) ||
            getFeatureMetadataValue(feature, 'specs.resolution_x', 'resolution_x', metadata)
        );

        if (!isCamera) return null;

        const coords = getPointCoordinates(feature);
        if (!coords) return null;

        const { focalLength, sensorSize, resolutionX } = getEffectiveCameraSpecs(feature, state.settings, metadata);
        const installHeight = getEffectiveMountingHeight(feature, state.settings, metadata);
        const sensor = SENSOR_SIZES[sensorSize as keyof typeof SENSOR_SIZES] || SENSOR_SIZES['1/2.8"'];
        const calculatedHfov = calculateHFOV(sensor.width, focalLength);
        const hfov = metadataNumber(getFeatureMetadataValue(feature, 'specs.hfov', 'hfov', metadata), calculatedHfov);
        const targetHeight = metadataNumber(getFeatureMetadataValue(feature, 'specs.target_height', 'targetHeight', metadata), 1.7);

        return {
            lat: coords[1] as number,
            lng: coords[0] as number,
            resolutionX: Number(resolutionX),
            hfov: Number(hfov),
            installHeight: Number(installHeight),
            targetHeight: Number(targetHeight)
        };
    }, [selectedFeatureId, state, previewMetadata]);

    useMapEvents({
        mousemove(e) {
            if (!showDORILayers) {
                if (ppmInfo) setPpmInfo(null);
                return;
            }

            const camera = getCameraData();
            if (!camera) {
                if (ppmInfo) setPpmInfo(null);
                return;
            }

            const ppm = calculatePPMAtPoint(
                camera.lat, camera.lng,
                e.latlng.lat, e.latlng.lng,
                camera.resolutionX,
                camera.hfov,
                camera.installHeight,
                camera.targetHeight
            );

            setPpmInfo({
                ppm,
                lat: e.latlng.lat,
                lng: e.latlng.lng,
                x: e.originalEvent.clientX,
                y: e.originalEvent.clientY
            });
        },
        mouseout() {
            setPpmInfo(null);
        }
    });

    if (!ppmInfo || !showDORILayers) return null;

    const category = getDORICategory(ppmInfo.ppm);

    return createPortal(
        <div
            className="fixed pointer-events-none z-[10000] flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-[calc(100%+15px)] animate-in fade-in duration-200"
            style={{ left: ppmInfo.x, top: ppmInfo.y }}
        >
            <div className="bg-black/80 backdrop-blur-sm border border-white/20 px-2 py-1 rounded shadow-2xl flex flex-col items-center min-w-[80px]">
                <div className="flex gap-2 items-baseline">
                    <span className="text-[14px] font-black font-mono text-white">
                        {Math.round(ppmInfo.ppm)}
                    </span>
                    <span className="text-[8px] font-bold text-white/60 uppercase">PPM</span>
                </div>
                <div
                    className="w-full h-1 rounded-full mt-1"
                    style={{ backgroundColor: category.color }}
                />
                <span className="text-[7px] font-black uppercase tracking-wider mt-0.5" style={{ color: category.color }}>
                    {category.label}
                </span>
            </div>
            {/* Pointer arrow */}
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-black/80 shadow-lg" />
        </div>,
        document.body
    );
};

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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

const parseMetadata = (value: unknown) => {
    if (typeof value !== 'string') return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
};

export const InteractivePPM: React.FC = () => {
    const showDORILayers = useDesignSync(s => s.showDORILayers);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const state = useDesignSync(s => s.state);
    const previewMetadata = useDesignSync(s => s.previewMetadata);
    const rafRef = useRef<number | null>(null);
    const pendingEventRef = useRef<any>(null);

    const [ppmInfo, setPpmInfo] = useState<{ ppm: number; lat: number; lng: number; x: number; y: number } | null>(null);

    const camera = useMemo(() => {
        if (!showDORILayers || !selectedFeatureId || !state) return null;
        const feature = state.features[selectedFeatureId];
        if (!feature) return null;

        const isPreviewing = previewMetadata?.id === selectedFeatureId;
        const baseMeta = parseMetadata(feature.metadata);
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
    }, [showDORILayers, selectedFeatureId, state, previewMetadata]);

    const clearPpmInfo = useCallback(() => {
        pendingEventRef.current = null;
        if (rafRef.current !== null) {
            window.cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setPpmInfo(null);
    }, []);

    const flushMouseMove = useCallback(() => {
        rafRef.current = null;
        const event = pendingEventRef.current;
        pendingEventRef.current = null;
        if (!event || !camera) return;

        const ppm = calculatePPMAtPoint(
            camera.lat,
            camera.lng,
            event.latlng.lat,
            event.latlng.lng,
            camera.resolutionX,
            camera.hfov,
            camera.installHeight,
            camera.targetHeight
        );

        setPpmInfo({
            ppm,
            lat: event.latlng.lat,
            lng: event.latlng.lng,
            x: event.originalEvent.clientX,
            y: event.originalEvent.clientY
        });
    }, [camera]);

    useEffect(() => () => {
        if (rafRef.current !== null) {
            window.cancelAnimationFrame(rafRef.current);
        }
    }, []);

    useMapEvents({
        mousemove(e) {
            if (!showDORILayers || !camera) {
                if (ppmInfo) clearPpmInfo();
                return;
            }
            pendingEventRef.current = e;
            if (rafRef.current === null) {
                rafRef.current = window.requestAnimationFrame(flushMouseMove);
            }
        },
        mouseout() {
            clearPpmInfo();
        }
    });

    if (!ppmInfo || !showDORILayers) return null;

    const category = getDORICategory(ppmInfo.ppm);

    return createPortal(
        <div
            className="fixed pointer-events-none z-cad-tooltip flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-[calc(100%+15px)]"
            style={{ left: ppmInfo.x, top: ppmInfo.y }}
        >
            <div className="bg-black/80 border border-white/20 px-2 py-1 rounded flex flex-col items-center min-w-[80px]">
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
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-black/80" />
        </div>,
        document.body
    );
};

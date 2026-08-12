import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapCanvas, type PreviewMapController } from './basemapPreview/MapCanvas';
import { createGoogleSourceAdapter } from './basemapPreview/googleSource';
import { getGoogleTileProxyBaseUrl } from './basemapPreview/googleSource';
import { createLocalPackageAdapter } from './basemapPreview/localPackage';
import { MetadataDrawer } from './basemapPreview/MetadataDrawer';
import { FloatingControls } from './basemapPreview/FloatingControls';
import { LayerPopover } from './basemapPreview/LayerPopover';
import {
    DEFAULT_PREVIEW_USER_CONFIG,
    createPreviewFileReader,
    downloadPreviewPackage,
    getPreviewLaunchConfig,
    getPreviewIntegrationStatus,
    getPreviewUserConfig,
    isTauriPreview,
    pickDirectory,
    listenPreviewExtentEvents,
    listenPreviewStreetViewEvents,
    openPreviewStreetView,
    registerPreviewPackageRoot,
    savePreviewUserConfig,
    type PreviewLaunchConfig,
} from './basemapPreview/previewBridge';
import { normalizeExtentPayload } from './basemapPreview/extentPayload';
import { PREVIEW_SOURCE_OPTIONS } from './basemapPreview/sourceSelector';
import {
    DEFAULT_LAYER_VISIBILITY_STATE,
    type PreviewLayerId,
    type PreviewLayerVisibilityKey,
    type PreviewSourceAdapter,
    type PreviewStyleId,
    type PreviewUserConfig,
} from './basemapPreview/types';
import type { BasemapLayerCapabilities, BasemapLayerGroupId, BasemapLayerVisibility } from './basemapPreview/basemapLayers';
import type { PreviewPoint } from './basemapPreview/extent';
import { DEFAULT_STREET_VIEW_VIEWPOINT, normalizeStreetViewViewpoint, type StreetViewViewpoint } from './basemapPreview/streetView';

export function BasemapPreviewApp() {
    const [layer, setLayer] = useState<PreviewLayerId | null>(null);
    const [styleId, setStyleId] = useState<PreviewStyleId>('engineering');
    const [launchConfig, setLaunchConfig] = useState<PreviewLaunchConfig | null>(null);
    const [userConfig, setUserConfig] = useState<PreviewUserConfig | null>(null);
    const [integrationPort, setIntegrationPort] = useState<number | null>(null);
    const [adapter, setAdapter] = useState<PreviewSourceAdapter | null>(null);
    const [sourceError, setSourceError] = useState<string | null>(null);
    const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [mapError, setMapError] = useState<string | null>(null);
    const [layerCapabilities, setLayerCapabilities] = useState<BasemapLayerCapabilities | null>(null);
    const [layerUpdateState, setLayerUpdateState] = useState<'idle' | 'updating' | 'error'>('idle');
    const [layerUpdateError, setLayerUpdateError] = useState<string | null>(null);
    const [controller, setController] = useState<PreviewMapController | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedPoint, setSelectedPoint] = useState<PreviewPoint | null>(null);
    const [extentData, setExtentData] = useState<unknown | null>(null);
    const [, setExtentMessage] = useState<string | null>(null);
    const [streetViewViewpoint, setStreetViewViewpoint] = useState<StreetViewViewpoint | null>(null);
    const [streetViewStatus, setStreetViewStatus] = useState<string | null>(null);

    // Floating controls & measure state
    const [layerPopoverOpen, setLayerPopoverOpen] = useState(false);
    const [measureActive, setMeasureActive] = useState(false);
    const [measureDistanceText, setMeasureDistanceText] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const [launch, stored, integration] = await Promise.all([getPreviewLaunchConfig(), getPreviewUserConfig(), getPreviewIntegrationStatus()]);
                if (!active) return;
                setLaunchConfig(launch);
                setUserConfig(stored);
                setIntegrationPort(integration?.httpPort ?? null);
                setLayer(stored?.layer ?? null);
                if (integration?.error) setSourceError(integration.error);
            } catch (error) {
                if (active) setSourceError(error instanceof Error ? error.message : String(error));
            }
        })();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        setLayerCapabilities(null);
        setLayerUpdateState('idle');
        setLayerUpdateError(null);
        setSourceError(null);
        setMapError(null);
        if (!launchConfig || !userConfig || !layer) return undefined;

        const load = async () => {
            try {
                const nextAdapter = layer === 'local-package'
                    ? await createLocalPackageAdapter(createPreviewFileReader(userConfig.packageRoot ?? launchConfig.packageRoot))
                    : createGoogleSourceAdapter(layer, getGoogleTileProxyBaseUrl(integrationPort ?? userConfig.httpPort));
                if (active) setAdapter(nextAdapter);
            } catch (error) {
                if (active) setSourceError(error instanceof Error ? error.message : String(error));
            }
        };
        void load();
        return () => { active = false; };
    }, [launchConfig, layer, integrationPort, userConfig?.httpPort, userConfig?.packageRoot]);

    useEffect(() => {
        let active = true;
        let stop: (() => void) | undefined;
        void listenPreviewExtentEvents(
            payload => {
                if (!active) return;
                try {
                    const normalized = normalizeExtentPayload(payload);
                    setExtentData(normalized.geometry);
                    setExtentMessage(`Đã nhận đối tượng ${normalized.objectId} từ ${normalized.source ?? 'phần mềm gốc'}`);
                    if (userConfig?.autoZoom !== false) controller?.fitDataExtent(normalized.geometry);
                } catch (error) {
                    setExtentMessage(error instanceof Error ? error.message : String(error));
                }
            },
            error => {
                if (active) setExtentMessage(error instanceof Error ? error.message : typeof error === 'string' ? error : 'Lỗi nhận dữ liệu extent');
            },
        ).then(unlisten => { stop = unlisten; });
        return () => { active = false; stop?.(); };
    }, [controller, userConfig?.autoZoom]);

    useEffect(() => {
        if (controller && extentData && userConfig?.autoZoom !== false) {
            controller.fitDataExtent(extentData);
        }
    }, [controller, extentData, userConfig?.autoZoom]);

    useEffect(() => {
        let active = true;
        let stop: (() => void) | undefined;
        void listenPreviewStreetViewEvents(
            payload => {
                if (!active) return;
                if (payload.status === 'error') {
                    setStreetViewStatus(`Street View: ${payload.message ?? 'lỗi nguồn'}`);
                    return;
                }
                if (payload.status === 'closed') {
                    setStreetViewStatus('Street View đã đóng');
                    setStreetViewViewpoint(null);
                    controller?.setStreetViewViewpoint(null);
                    return;
                }
                if (payload.viewpoint) {
                    const next = normalizeStreetViewViewpoint(payload.viewpoint);
                    setStreetViewViewpoint(next);
                    controller?.setStreetViewViewpoint(next);
                    setSelectedPoint(next.point);
                    setStreetViewStatus(payload.status === 'ready' ? 'Street View đang đồng bộ' : 'Pegman đã cập nhật');
                }
            },
            error => { if (active) setStreetViewStatus(`Street View: ${error instanceof Error ? error.message : String(error)}`); },
        ).then(unlisten => { stop = unlisten; });
        return () => { active = false; stop?.(); };
    }, [controller]);

    const reader = useMemo(
        () => createPreviewFileReader(userConfig?.packageRoot ?? launchConfig?.packageRoot ?? null),
        [launchConfig?.packageRoot, userConfig?.packageRoot],
    );
    const handleControllerChange = useCallback((next: PreviewMapController | null) => setController(next), []);
    const handleMapStateChange = useCallback((state: 'loading' | 'ready' | 'error', message?: string) => {
        setMapState(state);
        setMapError(message ?? null);
    }, []);
    const handleCapabilitiesChange = useCallback((capabilities: BasemapLayerCapabilities | null) => {
        setLayerCapabilities(capabilities);
    }, []);
    const handlePointSelect = useCallback((point: PreviewPoint) => {
        const viewpoint = normalizeStreetViewViewpoint({ point, ...DEFAULT_STREET_VIEW_VIEWPOINT });
        setSelectedPoint(point);
        setExtentData(point);
        setStreetViewViewpoint(viewpoint);
        controller?.setStreetViewViewpoint(viewpoint);
        setStreetViewStatus(null);
        setExtentMessage(`Đã chọn điểm ${point[1].toFixed(6)}, ${point[0].toFixed(6)}`);
    }, [controller]);
    const handleOpenStreetView = useCallback(async () => {
        if (!selectedPoint) {
            setExtentMessage('Hãy chọn một điểm trên bản đồ trước khi mở Pegman');
            return;
        }
        const next = streetViewViewpoint ?? normalizeStreetViewViewpoint({ point: selectedPoint, ...DEFAULT_STREET_VIEW_VIEWPOINT });
        try {
            setStreetViewViewpoint(next);
            controller?.setStreetViewViewpoint(next);
            setStreetViewStatus('Đang mở Street View…');
            await openPreviewStreetView(next);
        } catch (error) {
            setStreetViewStatus(`Street View: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [selectedPoint, streetViewViewpoint, controller]);

    const handleFitExtent = useCallback(() => {
        if (extentData && controller?.fitDataExtent(extentData)) {
            setExtentMessage('Đã zoom đến vùng dữ liệu');
            return;
        }
        controller?.resetVietnamExtent();
        setExtentMessage('Đã reset toàn cảnh Việt Nam');
    }, [controller, extentData]);

    const handleLayerSelect = useCallback(async (nextLayer: PreviewLayerId) => {
        const updated = { ...(userConfig ?? DEFAULT_PREVIEW_USER_CONFIG), layer: nextLayer };
        setUserConfig(updated);
        setLayer(nextLayer);
        setSourceError(null);
        try {
            await savePreviewUserConfig(updated);
        } catch (error) {
            setSourceError(error instanceof Error ? error.message : String(error));
        }
    }, [userConfig]);

    const updateUserConfig = useCallback((changes: Partial<PreviewUserConfig>) => {
        setUserConfig(previous => ({ ...(previous ?? DEFAULT_PREVIEW_USER_CONFIG), ...changes }));
    }, []);

    const saveCurrentUserConfig = useCallback(() => {
        if (userConfig) void savePreviewUserConfig(userConfig).catch(error => {
            setSourceError(error instanceof Error ? error.message : String(error));
        });
    }, [userConfig]);

    const activeVisibilityKey: PreviewLayerVisibilityKey | null = layer === 'google-street'
        ? 'googleStreet'
        : layer === 'google-hybrid'
            ? 'googleHybrid'
            : layer === 'local-package'
                ? 'localPackage'
                : null;
    const activeLayerVisibility = activeVisibilityKey
        ? (userConfig?.layerVisibility?.[activeVisibilityKey] ?? DEFAULT_LAYER_VISIBILITY_STATE[activeVisibilityKey])
        : DEFAULT_LAYER_VISIBILITY_STATE.googleStreet;
    const googleTileProxyBaseUrl = getGoogleTileProxyBaseUrl(integrationPort ?? userConfig?.httpPort);

    const handleToggleLayer = useCallback((key: BasemapLayerGroupId, enabled: boolean) => {
        if (!activeVisibilityKey) return;
        const base = userConfig ?? DEFAULT_PREVIEW_USER_CONFIG;
        const currentVisibility = base.layerVisibility?.[activeVisibilityKey] ?? DEFAULT_LAYER_VISIBILITY_STATE[activeVisibilityKey];
        const updatedVisibility: BasemapLayerVisibility = { ...currentVisibility, [key]: enabled };
        const updatedConfig: PreviewUserConfig = {
            ...base,
            layerVisibility: { ...base.layerVisibility, [activeVisibilityKey]: updatedVisibility },
        };
        setUserConfig(updatedConfig);
        setLayerUpdateState('updating');
        setLayerUpdateError(null);
        try {
            controller?.setBasemapLayerVisibility(updatedVisibility);
        } catch (error) {
            setLayerUpdateState('error');
            setLayerUpdateError(error instanceof Error ? error.message : String(error));
            return;
        }
        void savePreviewUserConfig(updatedConfig)
            .then(() => setLayerUpdateState('idle'))
            .catch(error => {
                setLayerUpdateState('error');
                setLayerUpdateError(error instanceof Error ? error.message : String(error));
            });
    }, [activeVisibilityKey, controller, userConfig]);

    const retryLayerUpdate = useCallback(() => {
        if (!activeVisibilityKey) return;
        const config = userConfig ?? DEFAULT_PREVIEW_USER_CONFIG;
        const visibility = config.layerVisibility[activeVisibilityKey];
        setLayerUpdateState('updating');
        setLayerUpdateError(null);
        try {
            controller?.setBasemapLayerVisibility(visibility);
        } catch (error) {
            setLayerUpdateState('error');
            setLayerUpdateError(error instanceof Error ? error.message : String(error));
            return;
        }
        void savePreviewUserConfig(config)
            .then(() => setLayerUpdateState('idle'))
            .catch(error => {
                setLayerUpdateState('error');
                setLayerUpdateError(error instanceof Error ? error.message : String(error));
            });
    }, [activeVisibilityKey, controller, userConfig]);

    const handlePickWatcherFolder = useCallback(async () => {
        try {
            const folder = await pickDirectory('Chọn thư mục theo dõi dữ liệu đối tượng');
            if (!folder) return;
            updateUserConfig({ watcherFolder: folder });
            await savePreviewUserConfig({ ...(userConfig ?? DEFAULT_PREVIEW_USER_CONFIG), watcherFolder: folder });
        } catch (error) {
            setSourceError(error instanceof Error ? error.message : String(error));
        }
    }, [updateUserConfig, userConfig]);

    const handlePickPackage = useCallback(async () => {
        if (!isTauriPreview()) {
            setSourceError('File picker chỉ khả dụng trong executable Windows preview');
            return;
        }
        try {
            const selected = await pickDirectory('Chọn thư mục Basemap package');
            if (!selected) return;
            const registeredRoot = await registerPreviewPackageRoot(selected);
            await createLocalPackageAdapter(createPreviewFileReader(registeredRoot));
            const updated = { ...(userConfig ?? DEFAULT_PREVIEW_USER_CONFIG), packageRoot: selected, layer: 'local-package' as const };
            setUserConfig(updated);
            setLayer('local-package');
            await savePreviewUserConfig(updated);
        } catch (error) {
            setSourceError(error instanceof Error ? error.message : String(error));
        }
    }, [userConfig]);

    const handleDownloadPackage = useCallback(async () => {
        if (!userConfig?.downloadUrl) {
            setSourceError('Khai báo link .pdb trước khi tải package');
            return;
        }
        try {
            const directory = userConfig.downloadDirectory ?? await pickDirectory('Chọn thư mục lưu package .pdb');
            if (!directory) return;
            const packageRoot = await downloadPreviewPackage(userConfig.downloadUrl, directory);
            await createLocalPackageAdapter(createPreviewFileReader(packageRoot));
            const updated = { ...userConfig, packageRoot, layer: 'local-package' as const, downloadDirectory: directory };
            setUserConfig(updated);
            setLayer('local-package');
            await savePreviewUserConfig(updated);
            setSourceError(null);
        } catch (error) {
            setSourceError(error instanceof Error ? error.message : String(error));
        }
    }, [userConfig]);

    const handleToggleMeasure = useCallback(() => {
        setMeasureActive(prev => !prev);
    }, []);

    const handleClearMeasure = useCallback(() => {
        controller?.clearMeasure();
        setMeasureDistanceText(null);
    }, [controller]);

    return (
        <main className="preview-shell">
            <div className="preview-map-frame">
                {adapter && layer ? (
                    <MapCanvas
                        adapter={adapter}
                        reader={reader}
                        styleId={styleId}
                        layerVisibility={activeLayerVisibility}
                        googleTileProxyBaseUrl={googleTileProxyBaseUrl}
                        measureActive={measureActive}
                        onControllerChange={handleControllerChange}
                        onPointSelect={handlePointSelect}
                        onStateChange={handleMapStateChange}
                        onCapabilitiesChange={handleCapabilitiesChange}
                        onMeasureDistanceChange={setMeasureDistanceText}
                    />
                ) : layer ? (
                    <div className="map-loading">{sourceError ?? 'Đang khởi tạo nguồn bản đồ…'}</div>
                ) : (
                    <LayerChooser onSelect={handleLayerSelect} />
                )}

                {/* Floating Action Controls (Top-Right & Bottom-Right) */}
                <FloatingControls
                    measureActive={measureActive}
                    layerPopoverOpen={layerPopoverOpen}
                    measureDistanceText={measureDistanceText}
                    onOpenStreetView={() => void handleOpenStreetView()}
                    onZoomIn={() => controller?.zoomIn()}
                    onZoomOut={() => controller?.zoomOut()}
                    onFitExtent={handleFitExtent}
                    onToggleLayerPopover={() => setLayerPopoverOpen(prev => !prev)}
                    onToggleMeasure={handleToggleMeasure}
                    onClearMeasure={handleClearMeasure}
                />

                {streetViewStatus && (
                    <div className="street-view-status" role="status">
                        {streetViewStatus}
                    </div>
                )}

                {/* Layer Switcher Popover */}
                <LayerPopover
                    open={layerPopoverOpen}
                    layer={layer}
                    styleId={styleId}
                    userConfig={userConfig}
                    layerCapabilities={layerCapabilities}
                    layerVisibility={activeLayerVisibility}
                    layerUpdateState={layerUpdateState}
                    layerUpdateError={layerUpdateError}
                    onClose={() => setLayerPopoverOpen(false)}
                    onSelectLayer={mode => void handleLayerSelect(mode)}
                    onSelectStyle={setStyleId}
                    onToggleLayer={handleToggleLayer}
                    onRetryLayerUpdate={retryLayerUpdate}
                    onPickPackage={() => void handlePickPackage()}
                    onDownloadPackage={() => void handleDownloadPackage()}
                    onPickWatcherFolder={() => void handlePickWatcherFolder()}
                    onUpdateUserConfig={updateUserConfig}
                    onSaveUserConfig={saveCurrentUserConfig}
                    onOpenMetadata={() => setDrawerOpen(true)}
                />

                <MetadataDrawer
                    open={drawerOpen}
                    adapter={adapter}
                    launchConfig={launchConfig}
                    styleId={styleId}
                    mapState={mapState}
                    error={sourceError ?? mapError}
                    onClose={() => setDrawerOpen(false)}
                />
            </div>
        </main>
    );
}

function LayerChooser({ onSelect }: { onSelect(layer: PreviewLayerId): void }) {
    return (
        <section className="layer-chooser" aria-label="Chọn lớp nền bản đồ">
            <p className="eyebrow">VIETNAM BASEMAP</p>
            <h2>Chọn lớp nền để bắt đầu</h2>
            <div className="layer-chooser-options">
                {PREVIEW_SOURCE_OPTIONS.map(option => (
                    <button key={option.mode} type="button" className="source-option" onClick={() => onSelect(option.mode)}>
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}

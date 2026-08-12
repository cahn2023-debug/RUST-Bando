import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapCanvas, type PreviewMapController } from './basemapPreview/MapCanvas';
import { createGoogleSourceAdapter } from './basemapPreview/googleSource';
import { createLocalPackageAdapter } from './basemapPreview/localPackage';
import { MetadataDrawer } from './basemapPreview/MetadataDrawer';
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
import { PREVIEW_STYLES, type PreviewLayerId, type PreviewSourceAdapter, type PreviewStyleId, type PreviewUserConfig } from './basemapPreview/types';
import type { PreviewPoint } from './basemapPreview/extent';
import { formatGeolocationError } from './basemapPreview/geolocation';
import { DEFAULT_STREET_VIEW_VIEWPOINT, normalizeStreetViewViewpoint, type StreetViewViewpoint } from './basemapPreview/streetView';

export function BasemapPreviewApp() {
    const [layer, setLayer] = useState<PreviewLayerId | null>(null);
    const [styleId, setStyleId] = useState<PreviewStyleId>('engineering');
    const [launchConfig, setLaunchConfig] = useState<PreviewLaunchConfig | null>(null);
    const [userConfig, setUserConfig] = useState<PreviewUserConfig | null>(null);
    const [adapter, setAdapter] = useState<PreviewSourceAdapter | null>(null);
    const [sourceError, setSourceError] = useState<string | null>(null);
    const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [mapError, setMapError] = useState<string | null>(null);
    const [controller, setController] = useState<PreviewMapController | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedPoint, setSelectedPoint] = useState<PreviewPoint | null>(null);
    const [extentData, setExtentData] = useState<unknown | null>(null);
    const [extentMessage, setExtentMessage] = useState<string | null>(null);
    const [streetViewViewpoint, setStreetViewViewpoint] = useState<StreetViewViewpoint | null>(null);
    const [streetViewStatus, setStreetViewStatus] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const [launch, stored, integration] = await Promise.all([getPreviewLaunchConfig(), getPreviewUserConfig(), getPreviewIntegrationStatus()]);
                if (!active) return;
                setLaunchConfig(launch);
                setUserConfig(stored);
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
        setAdapter(null);
        setSourceError(null);
        setMapError(null);
        if (!launchConfig || !userConfig || !layer) return undefined;

        const load = async () => {
            try {
                const nextAdapter = layer === 'local-package'
                    ? await createLocalPackageAdapter(createPreviewFileReader(userConfig.packageRoot ?? launchConfig.packageRoot))
                    : createGoogleSourceAdapter(layer);
                if (active) setAdapter(nextAdapter);
            } catch (error) {
                if (active) setSourceError(error instanceof Error ? error.message : String(error));
            }
        };
        void load();
        return () => { active = false; };
    }, [launchConfig, layer, userConfig?.packageRoot]);

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
    const handlePointSelect = useCallback((point: PreviewPoint) => {
        setSelectedPoint(point);
        setExtentData(point);
        setStreetViewViewpoint(normalizeStreetViewViewpoint({ point, ...DEFAULT_STREET_VIEW_VIEWPOINT }));
        setStreetViewStatus(null);
        setExtentMessage(`Đã chọn điểm ${point[1].toFixed(6)}, ${point[0].toFixed(6)}`);
    }, []);
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
    }, [selectedPoint, streetViewViewpoint]);
    const handleFitExtent = useCallback(() => {
        if (!extentData) {
            setExtentMessage('Chưa có dữ liệu đối tượng để zoom extend');
            return;
        }
        setExtentMessage(controller?.fitDataExtent(extentData)
            ? 'Đã zoom đến vùng dữ liệu'
            : 'Dữ liệu đối tượng không có extent hợp lệ');
    }, [controller, extentData]);
    const handleLocate = useCallback(() => {
        if (!navigator.geolocation) {
            setExtentMessage('Thiết bị không hỗ trợ định vị');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => {
                const point: PreviewPoint = [position.coords.longitude, position.coords.latitude];
                controller?.setDeviceLocation(point);
                setExtentMessage(`Đã định vị ${point[1].toFixed(6)}, ${point[0].toFixed(6)}`);
            },
            error => setExtentMessage(formatGeolocationError(error)),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
        );
    }, [controller]);
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
    const statusLabel = sourceError ? 'Nguồn lỗi' : mapState === 'ready' ? 'Sẵn sàng' : mapState === 'error' ? 'Lỗi tải tile' : 'Đang tải';

    return (
        <main className="preview-shell">
            <div className="preview-map-frame">
                {adapter && layer ? (
                    <MapCanvas
                        key={`${layer}:${styleId}:${adapter.metadata.version}`}
                        adapter={adapter}
                        reader={reader}
                        styleId={styleId}
                        onControllerChange={handleControllerChange}
                        onPointSelect={handlePointSelect}
                        onStateChange={handleMapStateChange}
                    />
                ) : layer ? (
                    <div className="map-loading">{sourceError ?? 'Đang khởi tạo nguồn bản đồ…'}</div>
                ) : (
                    <LayerChooser onSelect={handleLayerSelect} />
                )}
                <header className="preview-toolbar">
                    <div>
                        <p className="eyebrow">VIETNAM BASEMAP</p>
                        <h1>Basemap Preview</h1>
                    </div>
                    <div className="toolbar-actions">
                        <span className={sourceError || mapError ? 'status-badge error' : 'status-badge'}>{statusLabel}</span>
                        <div className="toolbar-actions-right">
                            <button type="button" className="pegman-button" onClick={() => void handleOpenStreetView()} aria-label="Mở Pegman Street View" title="Mở Pegman Street View">🧍 Pegman</button>
                            <button type="button" className="metadata-button" onClick={() => setDrawerOpen(true)}>Thông tin</button>
                        </div>
                    </div>
                </header>
                <div className="preview-controls" aria-label="Điều khiển bản đồ">
                    <div className="source-selector" aria-label="Chọn lớp nền bản đồ">
                        {PREVIEW_SOURCE_OPTIONS.map(option => (
                            <button
                                key={option.mode}
                                type="button"
                                className={layer === option.mode ? 'source-option active' : 'source-option'}
                                aria-pressed={layer === option.mode}
                                onClick={() => void handleLayerSelect(option.mode)}
                            >
                                <strong>{option.label}</strong>
                                <span>{option.description}</span>
                            </button>
                        ))}
                        {layer === 'local-package' && <>
                            <button type="button" className="package-picker" onClick={() => void handlePickPackage()}>Chọn local package</button>
                            <label className="download-url-field">
                                Link tải .pdb
                                <input
                                    value={userConfig?.downloadUrl ?? ''}
                                    onChange={event => setUserConfig(previous => ({ ...(previous ?? DEFAULT_PREVIEW_USER_CONFIG), downloadUrl: event.target.value }))}
                                    onBlur={() => userConfig && void savePreviewUserConfig(userConfig)}
                                    placeholder="https://…/vietnam-basemap.pdb"
                                />
                            </label>
                            <button type="button" className="package-picker" onClick={() => void handleDownloadPackage()}>Tải package .pdb thủ công</button>
                        </>}
                    </div>
                    <div className="integration-settings" aria-label="Cấu hình tích hợp">
                        <label>
                            Cổng localhost
                            <input
                                type="number"
                                min={1}
                                max={65535}
                                value={userConfig?.httpPort ?? DEFAULT_PREVIEW_USER_CONFIG.httpPort}
                                onChange={event => updateUserConfig({ httpPort: Number(event.target.value) })}
                                onBlur={saveCurrentUserConfig}
                            />
                        </label>
                        <label className="checkbox-setting">
                            <input
                                type="checkbox"
                                checked={userConfig?.autoZoom !== false}
                                onChange={event => {
                                    const autoZoom = event.target.checked;
                                    updateUserConfig({ autoZoom });
                                    void savePreviewUserConfig({ ...(userConfig ?? DEFAULT_PREVIEW_USER_CONFIG), autoZoom });
                                }}
                            />
                            Tự động zoom khi nhận dữ liệu
                        </label>
                        <button type="button" className="package-picker" onClick={() => void handlePickWatcherFolder()}>
                            {userConfig?.watcherFolder ? 'Đổi thư mục theo dõi' : 'Chọn thư mục theo dõi'}
                        </button>
                        {userConfig?.watcherFolder && <span className="setting-value">{userConfig.watcherFolder}</span>}
                    </div>
                    <div className="style-selector" aria-label="Chọn style bản đồ">
                        {PREVIEW_STYLES.map(option => (
                            <button key={option} type="button" className={styleId === option ? 'style-option active' : 'style-option'} onClick={() => setStyleId(option)}>
                                {option}
                            </button>
                        ))}
                    </div>
                    <div className="viewport-controls">
                        <button type="button" onClick={() => controller?.zoomIn()} aria-label="Phóng to">＋</button>
                        <button type="button" onClick={() => controller?.zoomOut()} aria-label="Thu nhỏ">−</button>
                        <button type="button" onClick={handleFitExtent} aria-label="Zoom extend">Zoom extend</button>
                        <button type="button" onClick={handleLocate} aria-label="Định vị">Định vị</button>
                        <button type="button" onClick={() => controller?.resetVietnamExtent()}>Toàn cảnh Việt Nam</button>
                    </div>
                    <p className="extent-status" role="status">
                        {streetViewStatus ?? extentMessage ?? (selectedPoint ? 'Đã chọn điểm trên bản đồ' : 'Chọn điểm trên bản đồ hoặc chờ dữ liệu từ phần mềm gốc')}
                    </p>
                    {(sourceError || mapError) && <p className="map-error" role="alert">{sourceError ?? mapError}</p>}
                </div>
                <div className="preview-attribution">{adapter?.metadata.attribution ?? 'Đang tải attribution…'}</div>
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

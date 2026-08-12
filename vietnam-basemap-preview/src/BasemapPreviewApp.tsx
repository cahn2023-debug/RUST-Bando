import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapCanvas, type PreviewMapController } from './basemapPreview/MapCanvas';
import { createGoogleSourceAdapter } from './basemapPreview/googleSource';
import { createLocalPackageAdapter } from './basemapPreview/localPackage';
import { MetadataDrawer } from './basemapPreview/MetadataDrawer';
import { createPreviewFileReader, getPreviewLaunchConfig, isTauriPreview, type PreviewLaunchConfig } from './basemapPreview/previewBridge';
import { PREVIEW_SOURCE_OPTIONS } from './basemapPreview/sourceSelector';
import { PREVIEW_STYLES, type PreviewSourceAdapter, type PreviewSourceMode, type PreviewStyleId } from './basemapPreview/types';
import { open } from '@tauri-apps/plugin-dialog';

export function BasemapPreviewApp() {
    const [sourceMode, setSourceMode] = useState<PreviewSourceMode>('online');
    const [styleId, setStyleId] = useState<PreviewStyleId>('engineering');
    const [launchConfig, setLaunchConfig] = useState<PreviewLaunchConfig | null>(null);
    const [adapter, setAdapter] = useState<PreviewSourceAdapter | null>(null);
    const [sourceError, setSourceError] = useState<string | null>(null);
    const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [mapError, setMapError] = useState<string | null>(null);
    const [controller, setController] = useState<PreviewMapController | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        let active = true;
        void getPreviewLaunchConfig().then(config => {
            if (!active) return;
            setLaunchConfig(config);
            setSourceMode(config.source);
        }).catch(error => {
            if (active) setSourceError(error instanceof Error ? error.message : String(error));
        });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        setAdapter(null);
        setSourceError(null);
        setMapError(null);
        if (!launchConfig) return undefined;
        const load = async () => {
            try {
                const nextAdapter = sourceMode === 'online'
                    ? createGoogleSourceAdapter()
                    : await createLocalPackageAdapter(createPreviewFileReader(launchConfig.packageRoot));
                if (active) setAdapter(nextAdapter);
            } catch (error) {
                if (active) setSourceError(error instanceof Error ? error.message : String(error));
            }
        };
        void load();
        return () => { active = false; };
    }, [launchConfig, sourceMode]);

    const reader = useMemo(
        () => createPreviewFileReader(launchConfig?.packageRoot ?? null),
        [launchConfig?.packageRoot],
    );
    const handleControllerChange = useCallback((next: PreviewMapController | null) => setController(next), []);
    const handleMapStateChange = useCallback((state: 'loading' | 'ready' | 'error', message?: string) => {
        setMapState(state);
        setMapError(message ?? null);
    }, []);
    const statusLabel = sourceError ? 'Nguồn lỗi' : mapState === 'ready' ? 'Sẵn sàng' : mapState === 'error' ? 'Lỗi tải tile' : 'Đang tải';
    const handlePickPackage = useCallback(async () => {
        if (!isTauriPreview()) {
            setSourceError('File picker chỉ khả dụng trong executable Windows preview');
            return;
        }
        try {
            const selected = await open({ directory: true, multiple: false, title: 'Chọn thư mục Basemap package' });
            if (typeof selected !== 'string') return;
            setLaunchConfig(previous => ({
                ...(previous ?? { source: 'offline', configOrigin: 'file picker' }),
                packageRoot: selected,
                source: 'offline',
                configOrigin: 'file picker',
            }));
            setSourceMode('offline');
        } catch (error) {
            setSourceError(error instanceof Error ? error.message : String(error));
        }
    }, []);

    return (
        <main className="preview-shell">
            <div className="preview-map-frame">
                {adapter ? (
                    <MapCanvas
                        key={`${sourceMode}:${styleId}:${adapter.metadata.version}`}
                        adapter={adapter}
                        reader={reader}
                        styleId={styleId}
                        onControllerChange={handleControllerChange}
                        onStateChange={handleMapStateChange}
                    />
                ) : <div className="map-loading">{sourceError ?? 'Đang khởi tạo nguồn bản đồ…'}</div>}
                <header className="preview-toolbar">
                    <div>
                        <p className="eyebrow">VIETNAM BASEMAP</p>
                        <h1>Basemap Preview</h1>
                    </div>
                    <div className="toolbar-actions">
                        <span className={sourceError || mapError ? 'status-badge error' : 'status-badge'}>{statusLabel}</span>
                        <button type="button" className="metadata-button" onClick={() => setDrawerOpen(true)}>Thông tin</button>
                    </div>
                </header>
                <div className="preview-controls" aria-label="Điều khiển bản đồ">
                    <div className="source-selector" aria-label="Chọn nguồn bản đồ">
                    {PREVIEW_SOURCE_OPTIONS.map(option => (
                        <button
                            key={option.mode}
                            type="button"
                            className={sourceMode === option.mode ? 'source-option active' : 'source-option'}
                            aria-pressed={sourceMode === option.mode}
                            onClick={() => setSourceMode(option.mode)}
                        >
                            <strong>{option.label}</strong>
                            <span>{option.description}</span>
                        </button>
                    ))}
                        {sourceMode === 'offline' && <button type="button" className="package-picker" onClick={() => void handlePickPackage()}>Chọn local package</button>}
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
                        <button type="button" onClick={() => controller?.resetVietnamExtent()}>Toàn cảnh Việt Nam</button>
                    </div>
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

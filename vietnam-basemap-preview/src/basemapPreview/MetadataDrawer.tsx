import type { PreviewLaunchConfig } from './previewBridge';
import type { PreviewSourceAdapter, PreviewStyleId } from './types';

interface MetadataDrawerProps {
    open: boolean;
    adapter: PreviewSourceAdapter | null;
    launchConfig: PreviewLaunchConfig | null;
    styleId: PreviewStyleId;
    mapState: 'loading' | 'ready' | 'error';
    error: string | null;
    onClose(): void;
}

export function MetadataDrawer({ open, adapter, launchConfig, styleId, mapState, error, onClose }: MetadataDrawerProps) {
    if (!open) return null;
    const tileError = adapter?.getTileError()?.message ?? null;
    const health = error ?? tileError ?? (mapState === 'ready' ? 'Nguồn đang hoạt động' : mapState === 'loading' ? 'Đang kiểm tra nguồn' : 'Nguồn không sẵn sàng');

    return (
        <aside className="metadata-drawer" role="dialog" aria-modal="true" aria-label="Thông tin Basemap Preview">
            <div className="drawer-header">
                <div>
                    <p className="eyebrow">READ-ONLY</p>
                    <h2>Thông tin nguồn</h2>
                </div>
                <button type="button" className="drawer-close" onClick={onClose} aria-label="Đóng thông tin">×</button>
            </div>
            <dl className="metadata-list">
                <MetadataRow label="Mode" value={adapter?.metadata.mode === 'offline' ? 'Local / offline' : 'Online / LAN'} />
                <MetadataRow label="Source" value={adapter?.metadata.name ?? 'Chưa khởi tạo'} />
                <MetadataRow label="External" value={adapter?.metadata.external ? 'Google external preview' : 'Basemap package'} />
                <MetadataRow label="Style" value={styleId} />
                <MetadataRow label="Version" value={adapter?.metadata.version ?? '—'} />
                <MetadataRow label="Manifest" value={adapter?.manifest ? `${adapter.manifest.id} · contract ${adapter.manifest.contractVersion}` : 'Không có manifest'} />
                <MetadataRow label="Launch config" value={launchConfig?.configOrigin ?? '—'} />
                <MetadataRow label="Health" value={health} emphasis={mapState === 'error' || Boolean(error || tileError)} />
            </dl>
            <div className="metadata-attribution">
                <span>Attribution</span>
                <p>{adapter?.metadata.attribution ?? 'Chưa có attribution'}</p>
            </div>
            <p className="read-only-note">Preview chỉ đọc. Không có activate, rollback, release mutation hoặc dữ liệu nghiệp vụ.</p>
        </aside>
    );
}

function MetadataRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
    return (
        <div className="metadata-row">
            <dt>{label}</dt>
            <dd className={emphasis ? 'metadata-value error' : 'metadata-value'}>{value}</dd>
        </div>
    );
}

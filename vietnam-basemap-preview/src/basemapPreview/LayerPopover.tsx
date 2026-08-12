import { useEffect, useRef, useState } from 'react';
import { PREVIEW_SOURCE_OPTIONS } from './sourceSelector';
import { PREVIEW_STYLES, type PreviewLayerId, type PreviewStyleId, type PreviewUserConfig } from './types';
import { DEFAULT_PREVIEW_USER_CONFIG } from './previewBridge';

interface LayerPopoverProps {
    open: boolean;
    layer: PreviewLayerId | null;
    styleId: PreviewStyleId;
    userConfig: PreviewUserConfig | null;
    onClose(): void;
    onSelectLayer(layer: PreviewLayerId): void;
    onSelectStyle(style: PreviewStyleId): void;
    onPickPackage(): void;
    onDownloadPackage(): void;
    onPickWatcherFolder(): void;
    onUpdateUserConfig(changes: Partial<PreviewUserConfig>): void;
    onSaveUserConfig(): void;
    onOpenMetadata(): void;
}

export function LayerPopover({
    open,
    layer,
    styleId,
    userConfig,
    onClose,
    onSelectLayer,
    onSelectStyle,
    onPickPackage,
    onDownloadPackage,
    onPickWatcherFolder,
    onUpdateUserConfig,
    onSaveUserConfig,
    onOpenMetadata,
}: LayerPopoverProps) {
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        if (!open) return undefined;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (!target.closest('.layer-toggle-btn')) {
                    onClose();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div ref={popoverRef} className="layer-popover-card" role="dialog" aria-label="Lựa chọn nền bản đồ">
            <div className="popover-header">
                <h3>Lớp nền bản đồ</h3>
                <button type="button" className="popover-close-btn" onClick={onClose} aria-label="Đóng popover">
                    ✕
                </button>
            </div>

            <div className="popover-section">
                <span className="popover-section-title">Nguồn bản đồ</span>
                <div className="source-options-grid">
                    {PREVIEW_SOURCE_OPTIONS.map(option => (
                        <button
                            key={option.mode}
                            type="button"
                            className={layer === option.mode ? 'source-popover-item active' : 'source-popover-item'}
                            onClick={() => onSelectLayer(option.mode)}
                        >
                            <strong>{option.label}</strong>
                            <span>{option.description}</span>
                        </button>
                    ))}
                </div>

                {layer === 'local-package' && (
                    <div className="local-package-box">
                        <button type="button" className="package-picker-btn" onClick={onPickPackage}>
                            📁 Chọn local package
                        </button>
                        <label className="download-url-label">
                            Link tải package .pdb
                            <input
                                type="text"
                                value={userConfig?.downloadUrl ?? ''}
                                onChange={e => onUpdateUserConfig({ downloadUrl: e.target.value })}
                                onBlur={onSaveUserConfig}
                                placeholder="https://…/vietnam-basemap.pdb"
                            />
                        </label>
                        <button type="button" className="package-picker-btn" onClick={onDownloadPackage}>
                            ⬇ Tải package .pdb
                        </button>
                    </div>
                )}
            </div>

            <div className="popover-section">
                <span className="popover-section-title">Phong cách (Style)</span>
                <div className="style-chips">
                    {PREVIEW_STYLES.map(option => (
                        <button
                            key={option}
                            type="button"
                            className={styleId === option ? 'style-chip active' : 'style-chip'}
                            onClick={() => onSelectStyle(option)}
                        >
                            {option === 'engineering' ? 'Kỹ thuật' : option === 'light' ? 'Sáng' : 'Tối'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="popover-section">
                <button
                    type="button"
                    className="settings-toggle-btn"
                    onClick={() => setShowSettings(!showSettings)}
                >
                    ⚙ Cấu hình tích hợp {showSettings ? '▲' : '▼'}
                </button>

                {showSettings && (
                    <div className="popover-settings-body">
                        <label className="popover-setting-row">
                            <span>Cổng HTTP:</span>
                            <input
                                type="number"
                                min={1}
                                max={65535}
                                value={userConfig?.httpPort ?? DEFAULT_PREVIEW_USER_CONFIG.httpPort}
                                onChange={e => onUpdateUserConfig({ httpPort: Number(e.target.value) })}
                                onBlur={onSaveUserConfig}
                            />
                        </label>

                        <label className="checkbox-setting-row">
                            <input
                                type="checkbox"
                                checked={userConfig?.autoZoom !== false}
                                onChange={e => {
                                    onUpdateUserConfig({ autoZoom: e.target.checked });
                                    onSaveUserConfig();
                                }}
                            />
                            <span>Tự động zoom khi nhận dữ liệu</span>
                        </label>

                        <button type="button" className="package-picker-btn" onClick={onPickWatcherFolder}>
                            {userConfig?.watcherFolder ? 'Đổi thư mục theo dõi' : 'Chọn thư mục theo dõi'}
                        </button>
                        {userConfig?.watcherFolder && (
                            <span className="folder-path-preview">{userConfig.watcherFolder}</span>
                        )}
                    </div>
                )}
            </div>

            <div className="popover-footer">
                <button
                    type="button"
                    className="metadata-popover-btn"
                    onClick={() => {
                        onOpenMetadata();
                        onClose();
                    }}
                >
                    ℹ Thông tin chi tiết (Metadata)
                </button>
            </div>
        </div>
    );
}

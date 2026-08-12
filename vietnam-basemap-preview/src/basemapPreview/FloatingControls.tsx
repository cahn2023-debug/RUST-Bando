interface FloatingControlsProps {
    measureActive: boolean;
    layerPopoverOpen: boolean;
    measureDistanceText: string | null;
    onOpenStreetView(): void;
    onZoomIn(): void;
    onZoomOut(): void;
    onFitExtent(): void;
    onToggleLayerPopover(): void;
    onToggleMeasure(): void;
    onClearMeasure(): void;
}

export function FloatingControls({
    measureActive,
    layerPopoverOpen,
    measureDistanceText,
    onOpenStreetView,
    onZoomIn,
    onZoomOut,
    onFitExtent,
    onToggleLayerPopover,
    onToggleMeasure,
    onClearMeasure,
}: FloatingControlsProps) {
    return (
        <>
            {/* Top-Right Controls: Circular Pegman Button (Yellow Head + Cyan Horizontal Oval Body) */}
            <div className="floating-controls-top-right">
                <button
                    type="button"
                    className="floating-btn pegman-floating-btn"
                    onClick={onOpenStreetView}
                    aria-label="Mở Google Street View (Pegman)"
                    title="Mở Google Street View (Pegman)"
                >
                    <svg
                        className="pegman-topdown-icon"
                        viewBox="0 0 24 24"
                        width="24"
                        height="24"
                        fill="none"
                    >
                        {/* Mũi tên góc nhìn chỉ hướng phía trên */}
                        <path d="M12 2L15 5.5H9L12 2Z" fill="#ffcf5a" />
                        {/* Thân người: Hình ô van ngang màu xanh (#65d6c3) */}
                        <ellipse cx="12" cy="15.5" rx="7" ry="3.5" fill="#65d6c3" />
                        {/* Đầu người: Hình ô van/tròn màu vàng ở giữa (#ffcf5a) */}
                        <ellipse cx="12" cy="10" rx="3.8" ry="3.8" fill="#ffcf5a" />
                    </svg>
                </button>
            </div>

            {/* Bottom-Right Controls */}
            <div className="floating-controls-bottom-right">
                {measureActive && measureDistanceText && (
                    <div className="measure-distance-badge">
                        <span>Đo: <strong>{measureDistanceText}</strong></span>
                        <button type="button" className="measure-clear-btn" onClick={onClearMeasure} title="Xóa đường đo">
                            ✕
                        </button>
                    </div>
                )}

                <div className="floating-btn-group">
                    {/* Zoom In */}
                    <button
                        type="button"
                        className="floating-btn"
                        onClick={onZoomIn}
                        aria-label="Phóng to"
                        title="Phóng to (+)"
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>

                    {/* Zoom Out */}
                    <button
                        type="button"
                        className="floating-btn"
                        onClick={onZoomOut}
                        aria-label="Thu nhỏ"
                        title="Thu nhỏ (-)"
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>

                    <div className="btn-divider" />

                    {/* Zoom Extent */}
                    <button
                        type="button"
                        className="floating-btn"
                        onClick={onFitExtent}
                        aria-label="Zoom extent / Fit bounds"
                        title="Zoom extent (Vùng dữ liệu / Khôi phục toàn cảnh)"
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="8" />
                            <line x1="12" y1="2" x2="12" y2="6" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                            <line x1="2" y1="12" x2="6" y2="12" />
                            <line x1="18" y1="12" x2="22" y2="12" />
                        </svg>
                    </button>

                    {/* Layer Positioning */}
                    <button
                        type="button"
                        className={layerPopoverOpen ? 'floating-btn layer-toggle-btn active' : 'floating-btn layer-toggle-btn'}
                        onClick={onToggleLayerPopover}
                        aria-label="Định vị layer / Nền bản đồ"
                        title="Định vị layer & Nền bản đồ"
                        aria-expanded={layerPopoverOpen}
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                            <polyline points="2 17 12 22 22 17" />
                            <polyline points="2 12 12 17 22 12" />
                        </svg>
                    </button>

                    {/* Measure Tool */}
                    <button
                        type="button"
                        className={measureActive ? 'floating-btn active' : 'floating-btn'}
                        onClick={onToggleMeasure}
                        aria-label="Thước đo khoảng cách"
                        title="Thước đo khoảng cách"
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12h20M6 12v-3M10 12v-2M14 12v-3M18 12v-2" />
                        </svg>
                    </button>
                </div>
            </div>
        </>
    );
}

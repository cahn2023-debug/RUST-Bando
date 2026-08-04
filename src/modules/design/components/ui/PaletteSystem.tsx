import React, { Component, ErrorInfo, ReactNode, useEffect } from "react";
import { PALETTE_SIDEBAR_WIDTH, useLayoutStore } from "@IMPLEMENT/stores/useLayoutStore";
import { PalettePanel } from "@DESIGN/features/map/Palette/PalettePanel";
import { VerticalResizeHandle } from "@DESIGN/components/ui/VerticalResizeHandle";
import { ResizeHandle } from "@DESIGN/components/ui/ResizeHandle";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PaletteRegistry } from "@DESIGN/features/map/Palette/PaletteRegistry";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";

interface PaletteSystemProps {
    isOneObjectSelected: boolean;
}

interface PaletteBoundaryProps {
    paletteId: string;
    children: ReactNode;
}

interface PaletteBoundaryState {
    error: Error | null;
}

class PaletteErrorBoundary extends Component<PaletteBoundaryProps, PaletteBoundaryState> {
    public state: PaletteBoundaryState = { error: null };

    public static getDerivedStateFromError(error: Error): PaletteBoundaryState {
        return { error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`[PaletteSystem] Failed to render palette ${this.props.paletteId}:`, error, errorInfo);
    }

    public componentDidUpdate(prevProps: PaletteBoundaryProps) {
        if (prevProps.paletteId !== this.props.paletteId && this.state.error) {
            this.setState({ error: null });
        }
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.error) {
            return (
                <div className="h-full min-h-[120px] bg-cad-bg border border-cad-danger/40 p-3 flex flex-col justify-center gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-cad-danger">
                            Palette failed to load
                        </p>
                        <p className="mt-1 text-[9px] font-mono text-cad-text-muted break-words">
                            {this.state.error.message}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="self-start px-3 py-1.5 bg-cad-danger/20 hover:bg-cad-danger/30 border border-cad-danger/50 text-cad-danger text-[9px] font-black uppercase tracking-widest transition-colors"
                    >
                        Reload workspace
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export const PaletteSystem: React.FC<PaletteSystemProps> = React.memo(({
    isOneObjectSelected: _isOneObjectSelected
}) => {
    const layoutColumns = useLayoutStore(s => s.layoutColumns);
    const paletteConfigs = useLayoutStore(s => s.paletteConfigs);
    const updatePaletteFlex = useLayoutStore(s => s.updatePaletteFlex);
    const updatePaletteWidth = useLayoutStore(s => s.updatePaletteWidth);
    const updatePaletteHeight = useLayoutStore(s => s.updatePaletteHeight);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const selectedFeature = useDesignSync(s => selectedFeatureId ? s.state?.features?.[selectedFeatureId] : null);
    const togglePalette = useLayoutStore(s => s.togglePalette);

    useEffect(() => {
        if (!selectedFeature) return;

        let metadata: any = {};
        try {
            metadata = typeof selectedFeature.metadata === 'string'
                ? JSON.parse(selectedFeature.metadata || '{}')
                : selectedFeature.metadata;
        } catch {
            metadata = {};
        }
        const isIntersection = metadata?.network?.role === 'intersection';
        const networkConfig = paletteConfigs['network-graph'];

        if (isIntersection && networkConfig && !networkConfig.isVisible && !networkConfig.userClosed) {
            togglePalette('network-graph');
        }
    }, [paletteConfigs, selectedFeature, togglePalette]);

    const renderPaletteContent = (id: string) => {
        const RegisteredComponent = PaletteRegistry.getComponent(id);
        if (!RegisteredComponent) return <div className="p-4 text-xs text-cad-muted">Unknown Palette: {id}</div>;

        return (
            <PaletteErrorBoundary paletteId={id}>
                <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="animate-spin text-cad-accent" size={16} /></div>}>
                    <RegisteredComponent />
                </Suspense>
            </PaletteErrorBoundary>
        );
    };

    const rightLayoutColumns = layoutColumns
        .map(column => column.filter(id => {
            const config = paletteConfigs[id];
            return config?.isVisible && !config?.isFloating && config?.dockPosition !== 'bottom';
        }))
        .filter(column => column.length > 0);
    const bottomPalettes = layoutColumns
        .flat()
        .filter(id => paletteConfigs[id]?.dockPosition === 'bottom' && paletteConfigs[id]?.isVisible && !paletteConfigs[id]?.isFloating);

    const bottomHeight = bottomPalettes.reduce((sum, id) => sum + (paletteConfigs[id]?.height || 320), 0);

    return (
        <>
        <div
            className="flex shrink-0 palette-container flex-row-reverse overflow-x-auto transition-all duration-150 ease-in-out pointer-events-auto h-full min-h-0"
            style={{ height: bottomHeight > 0 ? `calc(100% - ${bottomHeight}px)` : '100%' }}
        >
            {rightLayoutColumns.map((column, colIdx) => {
                const visiblePalettes = column.filter(id => {
                    return paletteConfigs[id]?.isVisible && !paletteConfigs[id]?.isFloating && paletteConfigs[id]?.dockPosition !== 'bottom';
                });
                if (visiblePalettes.length === 0) return null;

                const firstPaletteId = visiblePalettes[0];
                const columnWidth = firstPaletteId ? (paletteConfigs[firstPaletteId].width || 350) : 350;

                return (
                    <div
                        key={colIdx}
                        className="flex flex-col h-full min-h-0 border-l border-cad-border shrink-0 transition-[width] duration-150 ease-in-out overflow-hidden relative"
                        style={{ width: columnWidth }}
                    >
                        <ResizeHandle
                            direction="right"
                            onResize={(deltaX) => {
                                if (firstPaletteId) {
                                    const currentW = paletteConfigs[firstPaletteId].width || 350;
                                    const newW = Math.max(250, Math.min(650, currentW - deltaX));
                                    updatePaletteWidth(firstPaletteId, newW);
                                }
                            }}
                        />
                        {visiblePalettes.map((id, idx) => (
                            <React.Fragment key={id}>
                                {idx > 0 && (
                                    <VerticalResizeHandle
                                        onResize={(deltaY) => {
                                            const prevId = visiblePalettes[idx - 1];
                                            const currentId = id;
                                            const prevFlex = paletteConfigs[prevId].flex ?? 1;
                                            const currentFlex = paletteConfigs[currentId].flex ?? 1;
                                            const sensitivity = 0.0025;
                                            updatePaletteFlex(prevId, Math.max(0.1, prevFlex + deltaY * sensitivity));
                                            updatePaletteFlex(currentId, Math.max(0.1, currentFlex - deltaY * sensitivity));
                                        }}
                                    />
                                )}
                                <PalettePanel id={id} fillDock={visiblePalettes.length === 1}>
                                    <div className="flex-1 min-h-0 overflow-hidden p-1.5 custom-scrollbar h-full flex flex-col w-full min-w-0">
                                        {renderPaletteContent(id)}
                                    </div>
                                </PalettePanel>
                            </React.Fragment>
                        ))}
                    </div>
                );
            })}

            {Object.keys(paletteConfigs).filter(id => {
                return paletteConfigs[id].isFloating && paletteConfigs[id].isVisible;
            }).map(id => (
                <PalettePanel key={id} id={id}>
                    <div className="flex-1 min-h-0 overflow-hidden p-1.5 custom-scrollbar h-full flex flex-col w-full min-w-0">
                        {renderPaletteContent(id)}
                    </div>
                </PalettePanel>
            ))}
        </div>
        {bottomPalettes.length > 0 && (
            <div
                className="absolute left-0 bottom-0 z-cad-panel pointer-events-auto border-t border-cad-border bg-cad-surface flex flex-col min-h-0 overflow-hidden"
                style={{ height: bottomHeight, right: PALETTE_SIDEBAR_WIDTH }}
            >
                <VerticalResizeHandle
                    onResize={(deltaY) => {
                        const bottomId = bottomPalettes[0];
                        if (bottomId) {
                            const currentH = paletteConfigs[bottomId].height || 320;
                            const newH = Math.max(150, Math.min(600, currentH - deltaY));
                            updatePaletteHeight(bottomId, newH);
                        }
                    }}
                />
                {bottomPalettes.map(id => (
                    <PalettePanel key={id} id={id} fillDock={bottomPalettes.length === 1}>
                        <div className="flex-1 min-h-0 overflow-hidden p-1.5 custom-scrollbar h-full flex flex-col w-full min-w-0">
                            {renderPaletteContent(id)}
                        </div>
                    </PalettePanel>
                ))}
            </div>
        )}
        </>
    );
});

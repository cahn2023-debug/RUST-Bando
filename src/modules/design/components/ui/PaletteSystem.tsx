import React, { useEffect } from "react";
import { useLayoutStore } from "@IMPLEMENT/stores/useLayoutStore";
import { PalettePanel } from "@DESIGN/features/map/Palette/PalettePanel";
import { VerticalResizeHandle } from "@DESIGN/components/ui/VerticalResizeHandle";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PaletteRegistry } from "@DESIGN/features/map/Palette/PaletteRegistry";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";

interface PaletteSystemProps {
    isOneObjectSelected: boolean;
}

export const PaletteSystem: React.FC<PaletteSystemProps> = React.memo(({
    isOneObjectSelected: _isOneObjectSelected
}) => {
    const layoutColumns = useLayoutStore(s => s.layoutColumns);
    const paletteConfigs = useLayoutStore(s => s.paletteConfigs);
    const updatePaletteFlex = useLayoutStore(s => s.updatePaletteFlex);
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
            <Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="animate-spin text-cad-accent" size={16} /></div>}>
                <RegisteredComponent />
            </Suspense>
        );
    };

    const rightLayoutColumns = layoutColumns
        .map(column => column.filter(id => paletteConfigs[id]?.dockPosition !== 'bottom'))
        .filter(column => column.length > 0);
    const bottomPalettes = layoutColumns
        .flat()
        .filter(id => paletteConfigs[id]?.dockPosition === 'bottom' && paletteConfigs[id]?.isVisible && !paletteConfigs[id]?.isFloating);

    const bottomHeight = bottomPalettes.reduce((sum, id) => sum + (paletteConfigs[id]?.height || 320), 0);

    return (
        <>
        <div 
            className="flex shrink-0 palette-container flex-row-reverse overflow-x-auto transition-all duration-300 ease-in-out"
            style={{ height: bottomHeight > 0 ? `calc(100% - ${bottomHeight}px)` : '100%' }}
        >
            {rightLayoutColumns.map((column, colIdx) => {
                const visiblePalettes = column.filter(id => {
                    return paletteConfigs[id]?.isVisible && !paletteConfigs[id]?.isFloating && paletteConfigs[id]?.dockPosition !== 'bottom';
                });
                if (visiblePalettes.length === 0) return null;

                return (
                    <div key={colIdx} className="flex flex-col h-full border-l border-cad-border shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden" style={{ width: visiblePalettes[0] ? (paletteConfigs[visiblePalettes[0]].width || 350) : 350 }}>
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
                                <PalettePanel id={id}>
                                    <div className="flex-1 overflow-hidden p-1.5 custom-scrollbar h-full">
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
                    <div className="flex-1 overflow-hidden p-1.5 custom-scrollbar h-full">
                        {renderPaletteContent(id)}
                    </div>
                </PalettePanel>
            ))}
        </div>
        {bottomPalettes.length > 0 && (
            <div className="absolute left-0 right-[32px] bottom-0 z-cad-panel pointer-events-auto">
                {bottomPalettes.map(id => (
                    <PalettePanel key={id} id={id}>
                        <div className="flex-1 overflow-hidden p-1.5 custom-scrollbar h-full">
                            {renderPaletteContent(id)}
                        </div>
                    </PalettePanel>
                ))}
            </div>
        )}
        </>
    );
});

import React from "react";
import {
    Save, FolderUp, RefreshCw, Layers, Settings, Zap, Cpu,
    Undo2, Redo2, Sliders, Camera, Video, Calculator,
    MousePointer2, Move, MapPin, BarChart2, Printer, FileDown,
    Network, Briefcase, Activity, FileText
} from "lucide-react";
import { ToolGroup, ToolButton, RibbonSeparator } from "./RibbonComponents";
import { VisibilityTool } from "@DESIGN/features/map/MapLayerComponents/VisibilityTool";
import { SystemConfigPanel } from "@DESIGN/features/map/Palette/SystemConfigPanel";
import { PaletteProvider } from "@DESIGN/features/map/Palette/PaletteContext";
import { Intersection, PolylineIcon } from "@DESIGN/components/icons/MapIcons";
import { useDrawingInteraction } from "@DESIGN/hooks/useDrawingInteraction";
import { Portal } from "./Portal";

interface CommonRibbonProps {
    enableAi: boolean;
    aiStatusLabel?: string;
    setEnableAi: (v: boolean) => void;
    onReleaseAiMemory: () => void;
    onForceSave?: () => void;
    togglePalette?: (id: string) => void;
    activePaletteId?: string | null;
}

export const HomeRibbonTools = ({ enableAi, aiStatusLabel, setEnableAi, onReleaseAiMemory, onForceSave, togglePalette, activePaletteId }: CommonRibbonProps) => (
    <>
        <ToolGroup label="FILE SYSTEM">
            <ToolButton icon={Save} label="SAVE" onClick={onForceSave} />
            <ToolButton icon={RefreshCw} label="SYNC" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="LAYERS & VIEWS">
            <ToolButton icon={Layers} label="LAYERS" />
            <ToolButton icon={Settings} label="CONFIG" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="AI ASSISTANT">
            <ToolButton
                onClick={() => {
                    setEnableAi(!enableAi);
                    togglePalette?.('ai-assistant');
                }}
                active={enableAi || activePaletteId === 'ai-assistant'}
                icon={Zap}
                label={aiStatusLabel || (enableAi ? "AI READY" : "AI OFF")}
                opacity={enableAi ? "animate-pulse" : "opacity-60"}
            />
            <ToolButton
                icon={Cpu}
                label="RELEASE"
                onClick={onReleaseAiMemory}
                disabled={!enableAi}
            />
        </ToolGroup>
    </>
);

export const DesignRibbonTools = ({
    enableAi, aiStatusLabel, setEnableAi, onReleaseAiMemory,
    onImport,
    undo, redo,
    showSystemConfig, setShowSystemConfig, systemConfigRef,
    togglePalette, activePaletteId,
    drawingMode, setDrawingMode, selectedGroupId,
    onOpenStandalone, onExport, onOpenReport
}: CommonRibbonProps & {
    onImport: () => void;
    undo: () => void; redo: () => void;
    showSystemConfig: boolean; setShowSystemConfig: (v: boolean) => void; systemConfigRef: React.RefObject<HTMLDivElement | null>;
    togglePalette: (id: string) => void; activePaletteId: string | null;
    drawingMode: 'none' | 'point' | 'polyline' | 'image' | 'intersection' | 'move' | 'print_area';
    setDrawingMode: (m: 'none' | 'point' | 'polyline' | 'image' | 'intersection' | 'move' | 'print_area') => void;
    selectedGroupId: string | null;
    onOpenStandalone: (view: any) => void; onExport: () => void; onOpenReport: () => void;
}) => {
    const { finishDrawingSession } = useDrawingInteraction();

    const [configCoords, setConfigCoords] = React.useState<{ top: string; left: string; maxHeight: string }>({
        top: '100px',
        left: '20px',
        maxHeight: 'calc(100dvh - 140px)'
    });

    React.useEffect(() => {
        if (!showSystemConfig || !systemConfigRef.current) return;
        const updateCoords = () => {
            if (!systemConfigRef.current) return;
            const rect = systemConfigRef.current.getBoundingClientRect();
            setConfigCoords({
                top: `${rect.bottom + 8}px`,
                left: `${rect.left}px`,
                maxHeight: `calc(100dvh - ${rect.bottom + 24}px)`
            });
        };
        updateCoords();
        window.addEventListener('resize', updateCoords);
        return () => window.removeEventListener('resize', updateCoords);
    }, [showSystemConfig, systemConfigRef]);

    const handleToolModeChange = async (nextMode: 'none' | 'point' | 'polyline' | 'image' | 'intersection' | 'move' | 'print_area') => {
        if (drawingMode === nextMode) return;

        if (drawingMode === 'polyline' && nextMode !== 'polyline') {
            await finishDrawingSession();
        }

        if (nextMode !== 'none') {
            setDrawingMode(nextMode);
        }
    };

    return (
    <>
        <ToolGroup label="HISTORY">
            <ToolButton onClick={onImport} icon={FolderUp} label="IMPORT" />
            <ToolButton onClick={undo} icon={Undo2} label="UNDO" />
            <ToolButton onClick={redo} icon={Redo2} label="REDO" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="PALETTES">
            <div className="relative" ref={systemConfigRef}>
                <ToolButton
                    onClick={() => setShowSystemConfig(!showSystemConfig)}
                    active={showSystemConfig}
                    icon={Settings}
                    label="CẤU HÌNH"
                />
                {showSystemConfig && (
                    <Portal>
                        <div
                            role="presentation"
                            className="fixed z-cad-dropdown shadow-2xl flex flex-col min-w-[450px] overflow-hidden rounded-xl"
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                                top: configCoords.top,
                                left: configCoords.left,
                                maxHeight: configCoords.maxHeight
                            }}
                        >
                            <PaletteProvider value={{
                                id: 'system-config-dropdown',
                                isPinned: true,
                                onPin: () => { },
                                onClose: () => setShowSystemConfig(false),
                                dragHandleProps: { onMouseDown: () => { } }
                            }}>
                                <SystemConfigPanel onClose={() => setShowSystemConfig(false)} />
                            </PaletteProvider>
                        </div>
                    </Portal>
                )}
            </div>
            <ToolButton onClick={() => togglePalette('spec-panel')} active={activePaletteId === 'spec-panel'} icon={Sliders} label="THÔNG SỐ" />
            <ToolButton onClick={() => togglePalette('device-config')} active={activePaletteId === 'device-config'} icon={Camera} label="THIẾT BỊ" />
            <ToolButton onClick={() => togglePalette('camera-view')} active={activePaletteId === 'camera-view'} icon={Video} label="GÓC NHÌN" />
            <ToolButton onClick={() => togglePalette('network-graph')} active={activePaletteId === 'network-graph'} icon={Network} label="NETWORK" />
            <ToolButton onClick={() => togglePalette('summary-panel')} active={activePaletteId === 'summary-panel'} icon={Calculator} label="TỔNG HỢP" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="DRAWING TOOLS">
            <ToolButton onClick={() => void handleToolModeChange('none')} active={drawingMode === 'none'} icon={MousePointer2} label="CHỌN" />
            <ToolButton onClick={() => void handleToolModeChange('move')} active={drawingMode === 'move'} icon={Move} label="DI CHUYỂN" />
            <ToolButton onClick={() => void handleToolModeChange('intersection')} active={drawingMode === 'intersection'} disabled={!selectedGroupId} icon={Intersection} label="NÚT GIAO" />
            <ToolButton onClick={() => void handleToolModeChange('point')} active={drawingMode === 'point'} disabled={!selectedGroupId} icon={MapPin} label="ĐIỂM" />
            <ToolButton onClick={() => void handleToolModeChange('polyline')} active={drawingMode === 'polyline'} disabled={!selectedGroupId} icon={PolylineIcon} label="POLYLINE" />
            <ToolButton onClick={() => void handleToolModeChange('image')} active={drawingMode === 'image'} disabled={!selectedGroupId} icon={Camera} label="CAMERA" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="VISIBILITY">
            <VisibilityTool />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="DATA">
            <ToolButton onClick={onOpenReport} icon={FileText} label="BÁO CÁO" />
            <ToolButton onClick={() => onOpenStandalone('analysis')} icon={BarChart2} label="ANALYSIS" />
            <ToolButton onClick={() => onOpenStandalone('print')} icon={Printer} label="PRINT" />
            <ToolButton onClick={onExport} icon={FileDown} label="EXPORT" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="AI ASSISTANT">
            <ToolButton
                onClick={() => {
                    setEnableAi(!enableAi);
                    togglePalette?.('ai-assistant');
                }}
                active={enableAi || activePaletteId === 'ai-assistant'}
                icon={Zap}
                label={aiStatusLabel || (enableAi ? "AI READY" : "AI OFF")}
                opacity={enableAi ? "animate-pulse" : "opacity-60"}
            />
            <ToolButton
                icon={Cpu}
                label="RELEASE"
                onClick={onReleaseAiMemory}
                disabled={!enableAi}
            />
        </ToolGroup>
    </>
    );
};

export const ContractRibbonTools = ({
    enableAi, aiStatusLabel, setEnableAi, onReleaseAiMemory,
    contractType, onContractTypeChange, togglePalette, activePaletteId
}: CommonRibbonProps & {
    contractType?: string;
    onContractTypeChange?: (v: any) => void;
}) => (
    <>
        <ToolGroup label="CONTRACT SUB-MODULES">
            <ToolButton icon={Layers} label="INVESTOR" active={contractType === 'INVESTOR'} onClick={() => onContractTypeChange?.('INVESTOR')} />
            <ToolButton icon={Briefcase} label="SUBCONTRACTORS" active={contractType === 'SUBCONTRACTOR'} onClick={() => onContractTypeChange?.('SUBCONTRACTOR')} />
            <ToolButton icon={Activity} label="FINANCE" active={contractType === 'FINANCE'} onClick={() => onContractTypeChange?.('FINANCE')} />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="ACTIONS">
            <ToolButton icon={Save} label="SAVE" />
            <ToolButton icon={RefreshCw} label="SYNC" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="AI ASSISTANT">
            <ToolButton
                onClick={() => {
                    setEnableAi(!enableAi);
                    togglePalette?.('ai-assistant');
                }}
                active={enableAi || activePaletteId === 'ai-assistant'}
                icon={Zap}
                label={aiStatusLabel || (enableAi ? "AI READY" : "AI OFF")}
                opacity={enableAi ? "animate-pulse" : "opacity-60"}
            />
            <ToolButton
                icon={Cpu}
                label="RELEASE"
                onClick={onReleaseAiMemory}
                disabled={!enableAi}
            />
        </ToolGroup>
    </>
);

export const GraphRibbonTools = ({
    enableAi, setEnableAi, onReleaseAiMemory, togglePalette, activePaletteId
}: CommonRibbonProps) => (
    <>
        <ToolGroup label="GRAPH ACTIONS">
            <ToolButton icon={RefreshCw} label="SYNC" onClick={() => console.log("Syncing Graph...")} />
            <ToolButton icon={FileDown} label="EXPORT" />
            <ToolButton icon={Layers} label="ZOOM TO FIT" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="VISUALIZATION">
            <ToolButton icon={Activity} label="REALTIME" active={true} />
            <ToolButton icon={FileText} label="RELATIONS" />
        </ToolGroup>
        <RibbonSeparator />
        <ToolGroup label="AI ASSISTANT">
            <ToolButton
                onClick={() => {
                    setEnableAi(!enableAi);
                    togglePalette?.('ai-assistant');
                }}
                active={enableAi || activePaletteId === 'ai-assistant'}
                icon={Zap}
                label={enableAi ? "AI READY" : "AI OFF"}
                opacity={enableAi ? "animate-pulse" : "opacity-60"}
            />
            <ToolButton
                icon={Cpu}
                label="RELEASE"
                onClick={onReleaseAiMemory}
                disabled={!enableAi}
            />
        </ToolGroup>
    </>
);

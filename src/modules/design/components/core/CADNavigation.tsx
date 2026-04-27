import { ZoomIn, ZoomOut, Maximize2, Crosshair } from "lucide-react";
import { cn } from "@TOOL/utils/cn";

interface CADNavigationProps {
    onLocateMe: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomExtend: () => void;
}

export function CADNavigation({
    onLocateMe,
    onZoomIn,
    onZoomOut,
    onZoomExtend
}: CADNavigationProps) {
    return (
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-30 pointer-events-auto">
            <button
                onClick={onLocateMe}
                title="Xác định vị trí"
                className="p-2 border backdrop-blur-sm transition-all rounded-sm mb-2 bg-cad-surface/80 border-cad-border text-cad-text-secondary hover:text-cyan-400 hover:border-cyan-400 hover:bg-cad-elevated"
            >
                <Crosshair size={14} />
            </button>
            <CADNavButton icon={ZoomIn} onClick={onZoomIn} title="Zoom In" />
            <CADNavButton icon={ZoomOut} onClick={onZoomOut} title="Zoom Out" />
            <CADNavButton icon={Maximize2} onClick={onZoomExtend} title="Zoom Extend" />
        </div>
    );
}

function CADNavButton({ icon: Icon, onClick, title }: { icon: React.ElementType, onClick?: () => void, title?: string }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={cn(
                "p-2 bg-cad-surface/80 border border-cad-border text-cad-text-secondary hover:text-cad-accent hover:bg-cad-elevated backdrop-blur-sm transition-all rounded-sm"
            )}
        >
            <Icon size={14} />
        </button>
    );
}

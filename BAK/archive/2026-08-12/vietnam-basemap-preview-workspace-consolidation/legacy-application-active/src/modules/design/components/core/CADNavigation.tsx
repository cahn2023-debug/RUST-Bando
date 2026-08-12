import { ZoomIn, ZoomOut, Maximize2, Crosshair, Ruler } from "lucide-react";
import { cn } from "@SHARED/utils/cn";

interface CADNavigationProps {
    onLocateMe: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomExtend: () => void;
    isMeasureActive?: boolean;
    onToggleMeasure: () => void;
}

export function CADNavigation({
    onLocateMe,
    onZoomIn,
    onZoomOut,
    onZoomExtend,
    isMeasureActive = false,
    onToggleMeasure
}: CADNavigationProps) {
    return (
        <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-30 pointer-events-auto">
            <button
                onClick={onLocateMe}
                title="Xác định vị trí"
                className="p-2 border backdrop-blur-sm transition-all rounded-sm mb-2 bg-cad-surface/80 border-cad-border text-cad-text-secondary hover:text-cad-active hover:border-cad-active hover:bg-cad-elevated"
            >
                <Crosshair size={14} />
            </button>
            <CADNavButton icon={ZoomIn} onClick={onZoomIn} title="Zoom In" />
            <CADNavButton icon={ZoomOut} onClick={onZoomOut} title="Zoom Out" />
            <CADNavButton icon={Maximize2} onClick={onZoomExtend} title="Zoom Extend" />
            <CADNavButton icon={Ruler} onClick={onToggleMeasure} title="Đo khoảng cách" active={isMeasureActive} />
        </div>
    );
}

function CADNavButton({ icon: Icon, onClick, title, active = false }: { icon: React.ElementType, onClick?: () => void, title?: string, active?: boolean }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={cn(
                "p-2 bg-cad-surface/80 border border-cad-border text-cad-text-secondary hover:text-cad-accent hover:bg-cad-elevated backdrop-blur-sm transition-all rounded-sm",
                active && "border-cad-accent bg-cad-accent/15 text-cad-accent"
            )}
        >
            <Icon size={14} />
        </button>
    );
}

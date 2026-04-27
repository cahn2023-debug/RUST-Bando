import { PaletteSystem } from "@DESIGN/components/ui/PaletteSystem";
import { PaletteSidebar } from "@DESIGN/features/map/Palette/PaletteSidebar";
import { FilePreview } from "@IMPLEMENT/features/files/FilePreview";
import { useLayoutStore } from "@IMPLEMENT/stores/useLayoutStore";

interface ProjectOverlayLayerProps {
    activeTab: string;
    selectedFile: any;
    setSelectedFile: (file: any) => void;
    fileContent: string;
    showRawFile: boolean;
    setShowRawFile: (show: boolean) => void;
    handleOpenExternally: () => Promise<void>;
}

/**
 * Orchestrates global UI overlays like the palette system, 
 * file previewer, and drag-and-drop hints.
 */
export function ProjectOverlayLayer({
    activeTab,
    selectedFile,
    setSelectedFile,
    fileContent,
    showRawFile,
    setShowRawFile,
    handleOpenExternally
}: ProjectOverlayLayerProps) {
    const { draggingPaletteId } = useLayoutStore();

    const isMapTab = ['DESIGN', 'IMPLEMENT'].includes(activeTab);

    return (
        <>
            {/* Palette System (Floating/Docked Panels) */}
            {isMapTab && (
                <PaletteSystem isOneObjectSelected={false} />
            )}

            {/* Palette Sidebar (Toggle buttons) */}
            {isMapTab && <PaletteSidebar />}

            {/* Drag-and-drop docking hint */}
            {draggingPaletteId && (
                <div className="fixed top-0 right-0 bottom-0 w-[400px] bg-cad-accent/10 border-l-2 border-dashed border-cad-accent z-[150] pointer-events-none animate-pulse flex items-center justify-center">
                    <div className="bg-cad-bg/80 px-4 py-2 border border-cad-accent text-cad-accent text-[10px] font-black uppercase tracking-widest rounded-sm shadow-xl">
                        Thả để gắn bảng (Dock)
                    </div>
                </div>
            )}

            {/* File Previewer Overlay */}
            {selectedFile && (showRawFile || activeTab !== 'CONTRACT') && (
                <FilePreview
                    selectedFile={selectedFile}
                    fileContent={fileContent}
                    onClose={() => {
                        setSelectedFile(null);
                        setShowRawFile(false);
                    }}
                    onOpenExternally={handleOpenExternally}
                    onEditorMount={() => { }}
                />
            )}
        </>
    );
}

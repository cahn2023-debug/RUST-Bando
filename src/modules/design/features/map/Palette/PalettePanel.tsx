import React, { useRef, useEffect } from 'react';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';
import { cn } from '@TOOL/utils/cn';
import { PaletteProvider } from '@DESIGN/features/map/Palette/PaletteContext';

interface PalettePanelProps {
    id: string;
    children: React.ReactNode;
    fillDock?: boolean;
}

export const PalettePanel = React.memo(({ id, children, fillDock = false }: PalettePanelProps) => {
    // 1. Optimized Granular Selectors
    const config = useLayoutStore(s => s.paletteConfigs[id]);
    const setPinned = useLayoutStore(s => s.setPinned);
    const closePalette = useLayoutStore(s => s.closePalette);
    const expandPalette = useLayoutStore(s => s.expandPalette);
    const updatePaletteWidth = useLayoutStore(s => s.updatePaletteWidth);
    const updatePaletteHeight = useLayoutStore(s => s.updatePaletteHeight);
    const updatePaletteSizeAndPosition = useLayoutStore(s => s.updatePaletteSizeAndPosition);
    const setFloating = useLayoutStore(s => s.setFloating);
    const updatePalettePosition = useLayoutStore(s => s.updatePalettePosition);
    const setDraggingPalette = useLayoutStore(s => s.setDraggingPalette);

    const containerRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);

    if (!config) return null;

    // 2. Computed values based on config
    const { isPinned, isVisible, isFloating, position } = config;
    const isBottomDocked = !isFloating && config.dockPosition === 'bottom';

    // 3. Unified Resize handler
    const rafRef = useRef<number | null>(null);

    const handleResize = (direction: string) => (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!config) return;

        isResizing.current = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = config.width;
        const startHeight = config.height || 400;
        const startPosX = position.x;
        const startPosY = position.y;

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing.current) return;

            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;

                let newWidth = startWidth;
                let newHeight = startHeight;
                let newX = startPosX;
                let newY = startPosY;

                if (isFloating) {
                    if (direction.includes('e')) newWidth = Math.max(250, startWidth + deltaX);
                    else if (direction.includes('w')) {
                        newWidth = Math.max(250, startWidth - deltaX);
                        newX = startPosX + (startWidth - newWidth);
                    }

                    if (direction.includes('s')) newHeight = Math.max(200, startHeight + deltaY);
                    else if (direction.includes('n')) {
                        newHeight = Math.max(200, startHeight - deltaY);
                        newY = startPosY + (startHeight - newHeight);
                    }
                    updatePaletteSizeAndPosition(id, newWidth, newHeight, newX, newY);
                } else if (isBottomDocked && direction === 'n') {
                    newHeight = Math.max(180, Math.min(window.innerHeight * 0.75, startHeight - deltaY));
                    updatePaletteHeight(id, newHeight);
                } else if (direction === 'w') {
                    const deltaXDocked = startX - moveEvent.clientX;
                    newWidth = Math.max(250, Math.min(600, startWidth + deltaXDocked));
                    updatePaletteWidth(id, newWidth);
                }
            });
        };

        const onMouseUp = () => {
            isResizing.current = false;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        const cursorMap: Record<string, string> = {
            'n': 'ns-resize', 's': 'ns-resize', 'e': 'ew-resize', 'w': 'ew-resize',
            'ne': 'nesw-resize', 'sw': 'nesw-resize', 'nw': 'nwse-resize', 'se': 'nwse-resize'
        };
        document.body.style.cursor = cursorMap[direction] || 'default';
    };

    const handleHeaderMouseDown = (e: React.MouseEvent) => {
        if (!config) return;
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const startPosX = isFloating ? position.x : (window.innerWidth - config.width - 32);
        const startPosY = isFloating ? position.y : 100;

        let hasDetached = isFloating;

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                const deltaX = moveEvent.clientX - startMouseX;
                const deltaY = moveEvent.clientY - startMouseY;

                if (!hasDetached && (Math.abs(deltaX) > 20 || Math.abs(deltaY) > 20)) {
                    hasDetached = true;
                    const initialX = Math.max(0, Math.min(startPosX + deltaX, window.innerWidth - config.width));
                    const initialY = Math.max(0, Math.min(startPosY + deltaY, window.innerHeight - 32));
                    setFloating(id, true, { x: initialX, y: initialY });
                    return;
                }

                if (hasDetached) {
                    const newX = startPosX + deltaX;
                    const newY = startPosY + deltaY;
                    const finalX = Math.max(0, Math.min(newX, window.innerWidth - config.width));
                    const finalY = Math.max(0, Math.min(newY, window.innerHeight - 32));
                    updatePalettePosition(id, finalX, finalY);

                    if (moveEvent.clientX > window.innerWidth - 60) setDraggingPalette(id);
                    else setDraggingPalette(null);
                }
            });
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (upEvent.clientX > window.innerWidth - 60) setFloating(id, false);
            setDraggingPalette(null);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // 4. Handle Window Resize Bounds
    useEffect(() => {
        if (!isFloating || !isVisible || !config) return;

        const checkBounds = () => {
            const maxX = window.innerWidth - config.width;
            const maxY = window.innerHeight - 32;

            if (position.x > maxX || position.y > maxY || position.x < 0 || position.y < 0) {
                const finalX = Math.max(0, Math.min(position.x, maxX));
                const finalY = Math.max(0, Math.min(position.y, maxY));
                updatePalettePosition(id, finalX, finalY);
            }
        };

        window.addEventListener('resize', checkBounds);
        checkBounds(); // Initial check

        return () => window.removeEventListener('resize', checkBounds);
    }, [id, isFloating, isVisible, config?.width, position.x, position.y, updatePalettePosition]);

    if (!config || !isVisible) return null;

    return (
        <PaletteProvider value={{
            id,
            isPinned,
            onPin: () => setPinned(id, !isPinned),
            onClose: () => closePalette(id),
            dragHandleProps: {
                onMouseDown: handleHeaderMouseDown
            }
        }}>
            <div
                ref={containerRef}
                className={cn(
                    "bg-cad-surface border border-cad-border flex flex-col overflow-hidden transition-shadow duration-300 ease-in-out z-cad-floating will-change-layout",
                    isFloating ? "fixed shadow-2xl rounded-sm" : "relative transition-all",
                    !isFloating && isBottomDocked ? "border-t" : "border-l",
                    !isFloating && !isPinned ? "shadow-2xl" : "",
                    isVisible ? "opacity-100 scale-100" : "opacity-0 scale-x-0 w-0 pointer-events-none"
                )}
                style={{
                    width: isBottomDocked ? '100%' : config.width,
                    left: isFloating ? position.x : undefined,
                    top: isFloating ? position.y : undefined,
                    height: isFloating ? (config.height || 400) : (isBottomDocked ? (fillDock ? '100%' : (config.height || 320)) : undefined),
                    flex: !isFloating ? (fillDock ? '1 1 0%' : (!isBottomDocked ? `${config.flex ?? 1} 1 0%` : undefined)) : undefined,
                    maxHeight: isFloating ? '90vh' : '100%',
                    minHeight: isFloating ? '200px' : '0'
                }}
                onMouseLeave={() => !isPinned && !isFloating && expandPalette(null)}
                onMouseDownCapture={() => expandPalette(id)}
            >
                {/* Resize Handles */}
                {isFloating ? (
                    <>
                        {/* Edges */}
                        <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-cad-accent/50 z-10" onMouseDown={handleResize('n')} />
                        <div className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-cad-accent/50 z-10" onMouseDown={handleResize('s')} />
                        <div className="absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize hover:bg-cad-accent/50 z-10" onMouseDown={handleResize('w')} />
                        <div className="absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize hover:bg-cad-accent/50 z-10" onMouseDown={handleResize('e')} />

                        {/* Corners */}
                        <div className="absolute top-0 left-0 w-2 h-2 cursor-nwse-resize z-20" onMouseDown={handleResize('nw')} />
                        <div className="absolute top-0 right-0 w-2 h-2 cursor-nesw-resize z-20" onMouseDown={handleResize('ne')} />
                        <div className="absolute bottom-0 left-0 w-2 h-2 cursor-nesw-resize z-20" onMouseDown={handleResize('sw')} />
                        <div className="absolute bottom-0 right-0 w-2 h-2 cursor-nwse-resize z-20" onMouseDown={handleResize('se')} />
                    </>
                ) : isBottomDocked ? (
                    <div
                        className="absolute left-0 right-0 top-0 h-1 cursor-ns-resize hover:bg-cad-accent transition-colors z-10"
                        onMouseDown={handleResize('n')}
                    />
                ) : (
                    <div
                        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-cad-accent transition-colors z-10"
                        onMouseDown={handleResize('w')}
                    />
                )}

                {/* Content Area - Header removed from here */}
                <div className="flex-1 min-h-0 w-full overflow-hidden relative flex flex-col">
                    {children}
                </div>
            </div>
        </PaletteProvider>
    );
});

import React from 'react';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';
import { cn } from '@TOOL/utils/cn';
import { Calculator, Camera, Layers, Network, Settings, Video } from 'lucide-react';

const paletteIcons = {
    Calculator,
    Camera,
    Layers,
    Network,
    Settings,
    Video,
} as const;

export const PaletteSidebar: React.FC = () => {
    const { layoutColumns, paletteConfigs, activePaletteId, expandPalette, togglePalette } = useLayoutStore();

    return (
        <div className="relative z-50 flex h-full shrink-0 flex-col overflow-visible border-l border-cad-border bg-cad-bg">
            {/* Tab Container */}
            <div className="flex w-[36px] flex-col items-center gap-2 py-2">
                {layoutColumns.flat().map((id) => {
                    const config = paletteConfigs[id];
                    if (!config) return null;

                    const IconComponent = paletteIcons[config.icon as keyof typeof paletteIcons] || Layers;
                    const isActive = activePaletteId === id;

                    return (
                        <div
                            key={id}
                            className={cn(
                                "group relative flex w-full cursor-pointer items-center justify-center transition-all",
                                isActive ? "text-cad-accent" : "text-cad-text-muted hover:text-white"
                            )}
                            onMouseEnter={() => !config.isPinned && expandPalette(id)}
                            onClick={() => togglePalette(id)}
                        >
                            <div className="flex flex-col items-center gap-2.5">
                                <div className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition-colors",
                                    isActive ? "cad-icon-button-active text-black" : "bg-cad-surface text-cad-text-secondary group-hover:bg-cad-elevated group-hover:text-cad-text-primary"
                                )}>
                                    <IconComponent size={16} strokeWidth={1.85} />
                                </div>

                                {/* Tag styled vertical text */}
                                <div className={cn(
                                    "flex items-center justify-center rounded-full border border-cad-border px-1 py-3 transition-all",
                                    isActive ? "border-cad-accent bg-cad-accent/10" : "bg-cad-elevated/50 group-hover:bg-cad-elevated"
                                )}>
                                    <span
                                        className={cn(
                                            "text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap",
                                            isActive ? "text-cad-accent" : "text-cad-text-muted"
                                        )}
                                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                                    >
                                        {config.title}
                                    </span>
                                </div>
                            </div>

                            {/* Active Indicator Pin */}
                            {config.isPinned && isActive && (
                                <div className="absolute bottom-1 right-0 top-1 w-0.5 rounded-l-full bg-cad-accent shadow-[0_0_10px_rgba(16,185,129,0.32)]" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

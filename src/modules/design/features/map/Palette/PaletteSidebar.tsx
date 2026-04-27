import React from 'react';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';
import { cn } from '@TOOL/utils/cn';
import * as LucideIcons from 'lucide-react';

export const PaletteSidebar: React.FC = () => {
    const { layoutColumns, paletteConfigs, activePaletteId, expandPalette, togglePalette } = useLayoutStore();

    return (
        <div className="flex flex-col h-full bg-cad-bg border-l border-cad-border shrink-0 z-50 overflow-visible relative">
            {/* Tab Container */}
            <div className="flex flex-col gap-2 py-2 w-[32px] items-center">
                {layoutColumns.flat().map((id) => {
                    const config = paletteConfigs[id];
                    if (!config) return null;

                    const IconComponent = (LucideIcons as any)[config.icon] || LucideIcons.Layers;
                    const isActive = activePaletteId === id;

                    return (
                        <div
                            key={id}
                            className={cn(
                                "relative flex items-center justify-center w-full cursor-pointer transition-all group",
                                isActive ? "text-cad-accent" : "text-cad-text-muted hover:text-white"
                            )}
                            onMouseEnter={() => !config.isPinned && expandPalette(id)}
                            onClick={() => togglePalette(id)}
                        >
                            <div className="flex flex-col items-center gap-3">
                                <div className={cn(
                                    "p-1.5 rounded-md transition-colors",
                                    isActive ? "bg-cad-accent text-black" : "bg-cad-surface group-hover:bg-cad-elevated"
                                )}>
                                    <IconComponent size={14} />
                                </div>

                                {/* Tag styled vertical text */}
                                <div className={cn(
                                    "px-1 py-3 rounded-full border border-cad-border flex items-center justify-center transition-all",
                                    isActive ? "bg-cad-accent/10 border-cad-accent" : "bg-cad-elevated/50 group-hover:bg-cad-elevated"
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
                                <div className="absolute right-0 top-1 bottom-1 w-0.5 bg-cad-accent rounded-l-full shadow-[0_0_8px_rgba(var(--cad-accent-rgb),0.5)]" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

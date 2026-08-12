import React from 'react';
import { DORI_LEVELS } from '@SHARED/utils/cameraMath';
import { Info } from 'lucide-react';

export const DORILegend: React.FC = () => {
    return (
        <div className="bg-cad-surface/90 backdrop-blur-md border border-cad-border p-3 rounded-lg shadow-xl pointer-events-auto">
            <div className="flex items-center gap-2 mb-2 border-b border-cad-border pb-1.5">
                <Info size={14} className="text-cad-accent" />
                <span className="text-[10px] font-black uppercase tracking-tighter text-cad-text-primary">
                    DORI Visibility Scale
                </span>
            </div>

            <div className="flex flex-col gap-2">
                {DORI_LEVELS.map((level) => (
                    <div key={level.label} className="flex items-center gap-3 group">
                        <div
                            className="w-3 h-3 rounded-sm shadow-inner ring-1 ring-white/10"
                            style={{ backgroundColor: level.color }}
                        />
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-cad-text-primary leading-none group-hover:text-cad-accent transition-colors">
                                {level.label}
                            </span>
                            <span className="text-[8px] text-cad-text-muted font-mono">
                                ≥ {level.minPpm} PPM
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-3 pt-2 border-t border-cad-border/50">
                <p className="text-[7px] text-cad-text-muted leading-tight uppercase font-medium opacity-60">
                    Pixels per meter (PPM) based on BS EN 62676-4:2015 standard.
                </p>
            </div>
        </div>
    );
};

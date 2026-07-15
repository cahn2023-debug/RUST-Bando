import React from "react";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    description?: string;
    color?: string;
}

const BG_COLOR_MAP: Record<string, string> = {
    "text-cad-accent": "bg-cad-accent",
    "text-emerald-500": "bg-emerald-500",
    "text-amber-500": "bg-amber-500",
    "text-blue-500": "bg-blue-500",
};

export const StatsCard: React.FC<StatsCardProps> = ({
    icon: Icon,
    label,
    value,
    description,
    color = "text-cad-accent",
}) => {
    const bgColor = BG_COLOR_MAP[color] || "bg-cad-accent";

    return (
        <div className="cad-card p-4 flex flex-col gap-3 group hover:border-cad-accent/50 transition-all">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-widest text-cad-text-secondary uppercase">
                    {label}
                </span>
                <Icon size={16} className={`${color} group-hover:scale-110 transition-transform`} />
            </div>
            <div className="flex flex-col">
                <span className="text-2xl font-mono font-bold tracking-tighter text-cad-text-primary">
                    {value}
                </span>
                {description && (
                    <span className="text-[9px] font-mono text-cad-text-muted uppercase mt-1">
                        {description}
                    </span>
                )}
            </div>
            <div className="h-[2px] w-full bg-cad-bg overflow-hidden mt-1 rounded-full">
                <div
                    className={`h-full ${bgColor} opacity-30 group-hover:opacity-100 transition-all duration-500`}
                    style={{ width: '40%' }}
                />
            </div>
        </div>
    );
};

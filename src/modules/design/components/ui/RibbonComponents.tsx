import React from "react";
import { cn } from "@TOOL/utils/cn";

export function ToolGroup({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="flex gap-4" role="group" aria-label={label}>{children}</div>
            <span className="text-[9px] font-mono text-cad-text-muted tracking-widest uppercase" aria-hidden="true">{label}</span>
        </div>
    );
}

interface ToolButtonProps {
    icon: React.ElementType;
    label: string;
    active?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    opacity?: string;
}

export function ToolButton({ icon: Icon, label, active, onClick, disabled, opacity }: ToolButtonProps) {
    return (
        <button
            onClick={disabled ? undefined : onClick}
            aria-label={label}
            aria-pressed={active}
            aria-disabled={disabled}
            className={cn(
                "flex flex-col items-center gap-1 group transition-all",
                active ? "text-cad-accent" : "text-cad-text-primary hover:text-cad-accent",
                disabled && "opacity-30 cursor-not-allowed",
                opacity
            )}
            disabled={disabled}
        >
            <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors group-hover:bg-cad-surface group-hover:text-cad-text-primary",
                active && "cad-icon-button-active shadow-sm"
            )}>
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <span className="text-[9px] font-mono font-bold leading-none uppercase" aria-hidden="true">{label}</span>
        </button>
    );
}

export const RibbonSeparator = () => (
    <div className="w-[1px] h-10 bg-cad-border self-center" />
);

import React from "react";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@CORE/stores/useAuthStore";

export const AppLoader: React.FC = () => {
    return (
        <div className="cad-shell-window items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-cad-accent shadow-[0_10px_30px_rgba(16,185,129,0.18)] animate-pulse">
                    <span className="text-black font-black text-2xl italic">P</span>
                </div>
                <Loader2 className="animate-spin text-cad-accent" size={24} />
                <p className="text-[10px] font-mono text-cad-text-muted uppercase tracking-[0.2em] animate-pulse">
                    Initializing Core System...
                </p>
                <div className="mt-4 flex flex-col items-center gap-1 opacity-40">
                    <p className="text-[8px] font-mono text-cad-text-muted italic">Verifying secure session tokens...</p>
                </div>
                <button
                    onClick={() => useAuthStore.setState({ initialized: true, loading: false })}
                    className="cad-button cad-button-ghost mt-8 px-4 py-1.5 text-[8px] opacity-40 hover:opacity-100"
                >
                    FORCE INITIALIZATION BYPASS
                </button>
            </div>
        </div>
    );
};

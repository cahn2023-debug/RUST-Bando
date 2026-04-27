import React from "react";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";

export const AppLoader: React.FC = () => {
    return (
        <div className="h-screen w-screen flex items-center justify-center bg-cad-bg">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-cad-accent flex items-center justify-center rounded-lg animate-pulse shadow-lg shadow-cad-accent/10">
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
                    className="mt-8 px-4 py-1.5 border border-cad-border text-[8px] font-mono text-cad-text-muted hover:text-white hover:border-cad-accent transition-all opacity-30 hover:opacity-100 hover:bg-white/5"
                >
                    FORCE INITIALIZATION BYPASS
                </button>
            </div>
        </div>
    );
};

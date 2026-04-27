import React from "react";
import { Search, PlusCircle } from "lucide-react";

interface ExplorerHeaderProps {
    treeSearchQuery: string;
    setTreeSearchQuery: (query: string) => void;
    onCreateRegion: (e: React.MouseEvent) => void;
}

export function ExplorerHeader({
    treeSearchQuery,
    setTreeSearchQuery,
    onCreateRegion
}: ExplorerHeaderProps) {
    return (
        <div className="flex items-center gap-1.5">
            <div className="relative group/search flex items-center flex-1 bg-cad-bg border border-cad-border focus-within:border-cad-accent transition-all rounded-sm overflow-hidden">
                <div className="pl-2 px-1 text-cad-text-muted group-focus-within/search:text-cad-accent">
                    <Search size={10} />
                </div>
                <input
                    type="text"
                    value={treeSearchQuery}
                    onChange={(e) => setTreeSearchQuery(e.target.value)}
                    placeholder="Lọc tên..."
                    className="w-full bg-transparent text-[9px] font-mono py-1 pr-2 text-cad-text-primary placeholder:text-cad-text-muted outline-none uppercase"
                />
                {treeSearchQuery && (
                    <button
                        onClick={() => setTreeSearchQuery("")}
                        className="px-2 text-cad-text-muted hover:text-white"
                    >
                        ×
                    </button>
                )}
            </div>

            <button
                onClick={onCreateRegion}
                className="h-[22px] px-1.5 flex items-center justify-center bg-cad-bg border border-cad-border hover:border-cad-accent hover:text-cad-accent transition-all rounded-sm text-cad-text-muted"
                title="Thêm dự án mới (+)"
            >
                <PlusCircle size={12} />
            </button>
        </div>
    );
}

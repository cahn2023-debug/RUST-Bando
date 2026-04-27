import { useState } from "react";
import { Search, File, Folder, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface PmpV2SearchFile {
    id: string;
    filename: string;
    rel_path: string;
}

export function GlobalSearchV2() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PmpV2SearchFile[]>([]);
    const [searching, setSearching] = useState(false);

    const handleSearch = async (val: string) => {
        setQuery(val);
        if (val.length < 2) {
            setResults([]);
            return;
        }

        setSearching(true);
        try {
            const data = await invoke<PmpV2SearchFile[]>("search_pmp_v2", { query: val });
            setResults(data);
        } catch (err) {
            console.error("Search failed:", err);
        } finally {
            setSearching(false);
        }
    };

    return (
        <div className="px-4 py-3 border-b border-cad-border/30 bg-cad-header/20">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cad-text-muted" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Tìm kiếm tài liệu (FTS5)..."
                    className="w-full bg-black/40 border border-cad-border/50 rounded-sm py-1.5 pl-9 pr-8 text-xs text-white placeholder:text-cad-text-muted/50 focus:outline-none focus:border-cad-accent transition-colors"
                />
                {query && (
                    <button
                        onClick={() => handleSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-cad-text-muted hover:text-white"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {results.length > 0 && (
                <div className="mt-2 max-h-60 overflow-y-auto custom-scrollbar bg-cad-surface border border-cad-border shadow-2xl rounded-sm z-50">
                    {results.map((file) => (
                        <button
                            key={file.id}
                            className="w-full text-left px-3 py-2 hover:bg-cad-accent/10 border-b border-cad-border/20 last:border-0 transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <File size={12} className="text-cad-accent" />
                                <span className="text-xs font-bold text-white truncate">{file.filename}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 opacity-60">
                                <Folder size={10} className="text-cad-text-muted" />
                                <span className="text-[10px] text-cad-text-muted truncate">{file.rel_path}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {searching && (
                <div className="mt-1 text-[10px] text-cad-accent animate-pulse px-1">Đang tìm kiếm...</div>
            )}
        </div>
    );
}

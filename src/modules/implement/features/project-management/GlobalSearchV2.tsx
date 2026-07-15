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
        <div className="border-b border-cad-border/30 bg-cad-header/20 px-4 py-3">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cad-text-muted" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Tìm kiếm tài liệu (FTS5)..."
                    className="cad-search w-full"
                />
                {query && (
                    <button
                        onClick={() => handleSearch("")}
                        className="cad-icon-button absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {results.length > 0 && (
                <div className="cad-card cad-scrollbar z-50 mt-2 max-h-60 overflow-y-auto">
                    {results.map((file) => (
                        <button
                            key={file.id}
                            className="group w-full border-b border-cad-border/20 px-3 py-2 text-left transition-colors last:border-0 hover:bg-cad-accent/10"
                        >
                            <div className="flex items-center gap-2">
                                <File size={12} className="text-cad-accent" />
                                <span className="truncate text-xs font-bold text-cad-text-primary">{file.filename}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 opacity-60">
                                <Folder size={10} className="text-cad-text-muted" />
                                <span className="truncate text-[10px] text-cad-text-muted">{file.rel_path}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {searching && (
                <div className="mt-1 px-1 text-[10px] text-cad-accent animate-pulse">Đang tìm kiếm...</div>
            )}
        </div>
    );
}

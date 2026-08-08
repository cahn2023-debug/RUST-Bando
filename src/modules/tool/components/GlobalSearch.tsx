import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@/contracts/tauri-api/runtime";
import { Search, File, CheckSquare, Layers, Folder, Command, X } from "lucide-react";
import { clsx } from "clsx";

interface SearchResult {
    entity_id: string;
    entity_type: string;
    project_id: string;
    name: string;
    rank: number;
}

export const GlobalSearch: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSearch = useCallback(async (q: string) => {
        if (!q.trim()) {
            setResults([]);
            return;
        }
        setIsLoading(true);
        try {
            const data = await invoke<SearchResult[]>("search_universal", { query: q });
            setResults(data);
            setSelectedIndex(0);
        } catch (e) {
            console.error("Search failed:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleSearch(query);
        }, 150);
        return () => clearTimeout(timer);
    }, [query, handleSearch]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setQuery("");
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setResults([]);
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [isOpen]);

    const handleNavigate = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
        }
    };

    const handleSelect = (item: SearchResult) => {
        console.log("Selected entity:", item);
        // TODO: Map navigation logic based on entity_type
        setIsOpen(false);
    };

    const getIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'file': return <File className="w-3 h-3 text-blue-400" />;
            case 'task': return <CheckSquare className="w-3 h-3 text-green-400" />;
            case 'feature': return <Layers className="w-3 h-3 text-purple-400" />;
            case 'project': return <Folder className="w-3 h-3 text-cad-warn" />;
            default: return <Search className="w-3 h-3 text-gray-400" />;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-cad-overlay flex items-start justify-center pt-[15vh] px-4 font-sans pointer-events-none">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
                onClick={() => setIsOpen(false)}
            />

            {/* Search Box */}
            <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] pointer-events-auto ring-1 ring-white/5">
                <div className="flex items-center px-4 h-14 border-b border-white/5">
                    <Search className="w-4 h-4 text-white/30 mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleNavigate}
                        placeholder="Search for tasks, files, blueprints..."
                        className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-white/20"
                    />
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cad-text-primary/5 border border-cad-text-primary/10 text-[10px] text-cad-text-primary/40 font-bold uppercase tracking-tighter">
                        <Command className="w-2.5 h-2.5" />
                        <span>K</span>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="ml-3 p-1 rounded-md hover:bg-cad-text-primary/5 text-cad-text-primary/20 hover:text-cad-text-primary/60 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {isLoading && results.length === 0 ? (
                        <div className="px-4 py-8 flex flex-col items-center justify-center gap-3">
                            <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Omni-Searching...</span>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-1">
                            {results.map((item, idx) => (
                                <div
                                    key={`${item.entity_type}-${item.entity_id}`}
                                    onClick={() => handleSelect(item)}
                                    // onMouseEnter={() => setSelectedIndex(idx)}
                                    className={clsx(
                                        "px-3 py-2.5 rounded-lg border flex items-center gap-3 cursor-pointer transition-all duration-150",
                                        idx === selectedIndex
                                            ? "bg-cad-text-primary/5 border-cad-text-primary/20 shadow-sm"
                                            : "bg-transparent border-transparent hover:bg-cad-text-primary/5"
                                    )}
                                >
                                    <div className={clsx(
                                        "p-2 rounded-lg bg-black/40 border border-white/5 group-hover:border-white/10 transition-colors",
                                        idx === selectedIndex && "border-white/20"
                                    )}>
                                        {getIcon(item.entity_type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-white/80 line-clamp-1">{item.name}</div>
                                        <div className="text-[9px] font-black uppercase tracking-widest text-white/30 truncate mt-0.5">
                                            {item.entity_type} • {item.project_id.slice(0, 8)}
                                        </div>
                                    </div>
                                    {idx === selectedIndex && (
                                        <div className="text-[10px] text-white/20 animate-pulse">
                                            ↵ Enter
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : query.length > 0 ? (
                        <div className="px-4 py-8 text-center">
                            <div className="text-white/20 text-[10px] font-black uppercase tracking-[0.2em]">No entities found</div>
                        </div>
                    ) : (
                        <div className="px-4 py-6 text-center select-none">
                            <p className="text-white/20 text-[9px] font-bold uppercase tracking-widest mb-4">Quick Filters</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {['Tasks', 'Blueprints', 'Contracts', 'Materials'].map(f => (
                                    <button
                                        key={f}
                                        className="px-2 py-1 rounded bg-cad-text-primary/5 border border-cad-text-primary/10 text-[9px] font-bold text-cad-text-primary/40 hover:text-cad-text-primary/60 hover:border-cad-text-primary/20 transition-all uppercase tracking-tighter"
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-4 py-2 border-t border-cad-text-primary/5 bg-cad-text-primary/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 grayscale opacity-50">
                            <kbd className="px-1 py-0.5 rounded border border-cad-text-primary/20 text-[9px] text-cad-text-primary/60 bg-cad-text-primary/5">↑↓</kbd>
                            <span className="text-[9px] text-white/30 font-bold uppercase">Navigate</span>
                        </div>
                        <div className="flex items-center gap-1.5 grayscale opacity-50">
                            <kbd className="px-1 py-0.5 rounded border border-cad-text-primary/20 text-[9px] text-cad-text-primary/60 bg-cad-text-primary/5">↵</kbd>
                            <span className="text-[9px] text-white/30 font-bold uppercase">Open</span>
                        </div>
                    </div>
                    <div className="text-[9px] text-white/20 font-black tracking-widest uppercase">
                        Omni-Search v4.0.2
                    </div>
                </div>
            </div>
        </div>
    );
};

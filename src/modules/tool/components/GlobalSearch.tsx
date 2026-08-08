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
    const searchRequestIdRef = useRef(0);

    const handleSearch = useCallback(async (q: string) => {
        const requestId = ++searchRequestIdRef.current;
        const trimmedQuery = q.trim();

        if (!trimmedQuery) {
            setResults([]);
            setSelectedIndex(0);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const data = await invoke<SearchResult[]>("search_universal", { query: trimmedQuery });
            if (requestId !== searchRequestIdRef.current) return;
            setResults(data);
            setSelectedIndex(0);
        } catch (e) {
            if (requestId !== searchRequestIdRef.current) return;
            console.error("Search failed:", e);
            setResults([]);
        } finally {
            if (requestId === searchRequestIdRef.current) {
                setIsLoading(false);
            }
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
        if (results.length === 0) return;

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
            <button
                type="button"
                aria-label="Close search"
                className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
                onClick={() => setIsOpen(false)}
            />

            {/* Search Box */}
            <div role="dialog" aria-modal="true" aria-label="Global search" className="relative w-full max-w-xl overflow-hidden rounded-xl border border-cad-border bg-cad-bg shadow-xl ring-1 ring-cad-border/50 pointer-events-auto">
                <div className="flex h-14 items-center border-b border-cad-border px-4">
                    <Search className="mr-3 h-4 w-4 text-cad-text-muted" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        aria-label="Search tasks, files, and blueprints"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleNavigate}
                        placeholder="Search for tasks, files, blueprints..."
                        className="flex-1 border-none bg-transparent text-sm text-cad-text-primary outline-none placeholder:text-cad-text-muted"
                    />
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cad-text-primary/5 border border-cad-text-primary/10 text-[10px] text-cad-text-primary/40 font-bold uppercase tracking-tighter">
                        <Command className="w-2.5 h-2.5" />
                        <span>K</span>
                    </div>
                    <button
                        type="button"
                        aria-label="Close search"
                        onClick={() => setIsOpen(false)}
                        className="ml-3 p-1 rounded-md hover:bg-cad-text-primary/5 text-cad-text-primary/20 hover:text-cad-text-primary/60 transition-colors"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {isLoading && results.length === 0 ? (
                        <div className="px-4 py-8 flex flex-col items-center justify-center gap-3">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-cad-border border-t-cad-text-secondary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-cad-text-muted">Omni-Searching...</span>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-1">
                            {results.map((item, idx) => (
                                <button
                                    type="button"
                                    aria-current={idx === selectedIndex ? 'true' : undefined}
                                    key={`${item.entity_type}-${item.entity_id}`}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                    className={clsx(
                                        "flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
                                        idx === selectedIndex
                                            ? "border-cad-border bg-cad-text-primary/5 shadow-sm"
                                            : "bg-transparent border-transparent hover:bg-cad-text-primary/5"
                                    )}
                                >
                                    <div className={clsx(
                                        "rounded-lg border border-cad-border/50 bg-cad-bg p-2 transition-colors",
                                        idx === selectedIndex && "border-cad-border"
                                    )}>
                                        {getIcon(item.entity_type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="line-clamp-1 text-xs font-bold text-cad-text-primary">{item.name}</div>
                                        <div className="mt-0.5 truncate text-[9px] font-black uppercase tracking-widest text-cad-text-muted">
                                            {item.entity_type} • {item.project_id.slice(0, 8)}
                                        </div>
                                    </div>
                                    {idx === selectedIndex && (
                                        <div className="animate-pulse text-[10px] text-cad-text-muted">
                                            ↵ Enter
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : query.length > 0 ? (
                        <div className="px-4 py-8 text-center">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cad-text-muted">No entities found</div>
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
                    <div className="text-[9px] font-black uppercase tracking-widest text-cad-text-muted">
                        Omni-Search v4.0.2
                    </div>
                </div>
            </div>
        </div>
    );
};

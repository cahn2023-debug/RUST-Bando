import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, X, Loader2, MapPin, Navigation } from 'lucide-react';
import { useMapSearch, SearchResult } from '@IMPLEMENT/hooks/useMapSearch';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

const SEARCH_INPUT_ID = 'map-search-input';
const SEARCH_RESULTS_ID = 'map-search-results';
const LOCAL_GROUP_ID = 'map-search-group-local';
const EXTERNAL_GROUP_ID = 'map-search-group-external';

export const MapSearchBar: React.FC = () => {
    const { query, setQuery, results, loading } = useMapSearch();
    const zoomTo = useDesignSync(s => s.zoomTo);
    const setSearchResultMarker = useDesignSync(s => s.setSearchResultMarker);
    const isAnyDialogOpen = useDesignSync(s => s.isAnyDialogOpen);

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleSelect = useCallback((result: SearchResult) => {
        if (result.type === 'local') {
            zoomTo(result.id, 'feature');
        } else {
            const [lat, lng] = result.coordinates;
            setSearchResultMarker({
                lat,
                lng,
                name: result.name
            });
            zoomTo(result.id, 'location', [lat, lng]);
        }
        setIsOpen(false);
        setQuery('');
    }, [setQuery, setSearchResultMarker, zoomTo]);

    const handleQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(event.target.value);
        setIsOpen(true);
    }, [setQuery]);

    const handleFocus = useCallback(() => setIsOpen(true), []);

    const handleClear = useCallback(() => {
        setQuery('');
        setIsOpen(false);
    }, [setQuery]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const localResults = useMemo(() => results.filter(r => r.type === 'local'), [results]);
    const externalResults = useMemo(() => results.filter(r => r.type === 'external'), [results]);

    const isListOpen = isOpen && query.length >= 2 && (results.length > 0 || loading);

    if (isAnyDialogOpen) return null;

    return (
        <div ref={containerRef} className="absolute top-4 left-4 z-cad-map-control w-80">
            <div className="relative flex items-center bg-cad-surface rounded-lg shadow-lg border border-cad-border overflow-hidden">
                <div className="pl-3 py-2 text-cad-text-muted" aria-hidden="true">
                    <Search size={18} />
                </div>
                <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
                    Tìm kiếm trên bản đồ
                </label>
                <input
                    id={SEARCH_INPUT_ID}
                    type="text"
                    aria-controls={isListOpen ? SEARCH_RESULTS_ID : undefined}
                    autoComplete="off"
                    className="w-full pl-2 pr-10 py-2.5 text-sm outline-none bg-transparent text-cad-text-primary"
                    placeholder="Tìm địa chỉ, camera, nút giao..."
                    value={query}
                    onChange={handleQueryChange}
                    onFocus={handleFocus}
                />
                <div className="absolute right-2 flex items-center gap-1">
                    {loading && <Loader2 size={16} aria-hidden="true" className="animate-spin text-cad-accent" />}
                    {query && (
                        <button
                            type="button"
                            onClick={handleClear}
                            aria-label="Xóa từ khóa tìm kiếm"
                            className="p-1 hover:bg-cad-text-primary/10 rounded-full text-cad-text-muted cursor-pointer"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            {isListOpen && (
                <div
                    id={SEARCH_RESULTS_ID}
                    role="region"
                    aria-label="Kết quả tìm kiếm"
                    aria-live="polite"
                    aria-busy={loading || undefined}
                    className="mt-2 bg-cad-surface rounded-lg shadow-xl border border-cad-border overflow-hidden max-h-[400px] overflow-y-auto"
                >
                    {loading && results.length === 0 ? (
                        <div className="px-4 py-8 text-center text-cad-text-muted text-sm">
                            <Loader2 size={24} className="animate-spin mx-auto mb-2 text-cad-accent" />
                            Đang tìm kiếm...
                        </div>
                    ) : (
                        <>
                            {localResults.length > 0 && (
                                <div className="py-1" role="group" aria-labelledby={LOCAL_GROUP_ID}>
                                    <div
                                        id={LOCAL_GROUP_ID}
                                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cad-text-muted bg-cad-elevated"
                                    >
                                        Kết quả bản đồ
                                    </div>
                                    {localResults.map(result => (
                                        <button
                                            key={result.id}
                                            type="button"
                                            onClick={() => handleSelect(result)}
                                            className="w-full flex items-center px-3 py-2 hover:bg-cad-text-primary/10 text-left transition-colors cursor-pointer"
                                        >
                                            <div className="w-8 h-8 rounded bg-cad-accent/10 flex items-center justify-center text-cad-accent mr-3 flex-shrink-0" aria-hidden="true">
                                                <Navigation size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-cad-text-primary truncate">
                                                    {result.name}
                                                </div>
                                                <div className="text-[11px] text-cad-text-muted truncate">
                                                    {result.subType} • {result.id.slice(0, 8)}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {externalResults.length > 0 && (
                                <div className="py-1 border-t border-cad-border" role="group" aria-labelledby={EXTERNAL_GROUP_ID}>
                                    <div
                                        id={EXTERNAL_GROUP_ID}
                                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cad-text-muted bg-cad-elevated"
                                    >
                                        Địa chỉ & Vị trí
                                    </div>
                                    {externalResults.map(result => (
                                        <button
                                            key={result.id}
                                            type="button"
                                            onClick={() => handleSelect(result)}
                                            className="w-full flex items-center px-3 py-2 hover:bg-cad-text-primary/10 text-left transition-colors cursor-pointer"
                                        >
                                            <div className="w-8 h-8 rounded bg-cad-elevated flex items-center justify-center text-cad-text-muted mr-3 flex-shrink-0" aria-hidden="true">
                                                <MapPin size={14} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-cad-text-primary leading-tight mb-0.5">
                                                    {result.name}
                                                </div>
                                                <div className="text-[11px] text-cad-text-muted">
                                                    {result.subType}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results.length === 0 && !loading && (
                                <div className="px-4 py-6 text-center text-cad-text-muted text-sm italic">
                                    Không tìm thấy kết quả phù hợp
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

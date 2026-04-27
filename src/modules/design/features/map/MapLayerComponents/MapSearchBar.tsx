import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, MapPin, Navigation } from 'lucide-react';
import { useMapSearch, SearchResult } from '@IMPLEMENT/hooks/useMapSearch';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';

export const MapSearchBar: React.FC = () => {
    const { query, setQuery, results, loading } = useMapSearch();
    const zoomTo = useDesignSync(s => s.zoomTo);
    const setSearchResultMarker = useDesignSync(s => s.setSearchResultMarker);
    const isAnyDialogOpen = useDesignSync(s => s.isAnyDialogOpen);

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleSelect = (result: SearchResult) => {
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
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (isAnyDialogOpen) return null;

    const localResults = results.filter(r => r.type === 'local');
    const externalResults = results.filter(r => r.type === 'external');

    return (
        <div ref={containerRef} className="absolute top-4 left-4 z-[950] w-80">
            <div className="relative flex items-center bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
                <div className="pl-3 py-2 text-slate-400">
                    <Search size={18} />
                </div>
                <input
                    type="text"
                    className="w-full pl-2 pr-10 py-2.5 text-sm outline-none bg-transparent text-slate-900"
                    placeholder="Tìm địa chỉ, camera, nút giao..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                <div className="absolute right-2 flex items-center gap-1">
                    {loading && <Loader2 size={16} className="animate-spin text-blue-500" />}
                    {query && (
                        <button
                            onClick={() => {
                                setQuery('');
                                setIsOpen(false);
                            }}
                            className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {isOpen && query.length >= 2 && (results.length > 0 || loading) && (
                <div className="mt-2 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
                    {loading && results.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-500 text-sm">
                            <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-400" />
                            Đang tìm kiếm...
                        </div>
                    ) : (
                        <>
                            {localResults.length > 0 && (
                                <div className="py-1">
                                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
                                        Kết quả bản đồ
                                    </div>
                                    {localResults.map(result => (
                                        <button
                                            key={result.id}
                                            onClick={() => handleSelect(result)}
                                            className="w-full flex items-center px-3 py-2 hover:bg-slate-100 text-left transition-colors"
                                        >
                                            <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-500 mr-3 flex-shrink-0">
                                                <Navigation size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-slate-900 truncate">
                                                    {result.name}
                                                </div>
                                                <div className="text-[11px] text-slate-500 truncate">
                                                    {result.subType} • {result.id.slice(0, 8)}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {externalResults.length > 0 && (
                                <div className="py-1 border-t border-slate-100">
                                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
                                        Địa chỉ & Vị trí
                                    </div>
                                    {externalResults.map(result => (
                                        <button
                                            key={result.id}
                                            onClick={() => handleSelect(result)}
                                            className="w-full flex items-center px-3 py-2 hover:bg-slate-100 text-left transition-colors"
                                        >
                                            <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 mr-3 flex-shrink-0">
                                                <MapPin size={14} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-slate-900 leading-tight mb-0.5">
                                                    {result.name}
                                                </div>
                                                <div className="text-[11px] text-slate-500">
                                                    {result.subType}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results.length === 0 && !loading && (
                                <div className="px-4 py-6 text-center text-slate-400 text-sm italic">
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

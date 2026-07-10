import { useState, useEffect } from 'react';
import {
    X, Search, FileDown, Download, Maximize2, Minimize2,
    ChevronLeft, ChevronRight, RefreshCcw,
    Minus, Square, Copy, CheckSquare, Eye,
    ArrowUp, ArrowDown, ListFilter, Plus
} from 'lucide-react';
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    ColumnDef,
    SortingState,
    RowSelectionState,
    ColumnFiltersState,
    VisibilityState,
    Table
} from '@tanstack/react-table';
import { cn } from '@TOOL/utils/cn';

interface BatchActionField {
    label: string;
    value: string;
    options?: string[]; // If select type
}

interface AnalysisTableProps<TData> {
    data: TData[];
    columns: ColumnDef<TData>[];
    projectId?: string | number;
    title?: string;
    isStandalone?: boolean;
    onClose?: () => void;
    onUpdate?: (id: string, key: string, value: string | number | boolean) => Promise<void>;
    batchFields?: BatchActionField[];
    onBatchUpdate?: (selectedIds: string[], field: string, value: string | number | boolean) => Promise<void>;
    onExport?: (table: Table<TData>) => Promise<void>;
    onImport?: () => Promise<void>;
    onAddColumn?: () => void;
    renderExtraActions?: () => React.ReactNode;
    initialPageSize?: number;
}

export function AnalysisTable<TData extends { id: string | number }>({
    data,
    columns,
    projectId,
    title = "Phân tích dữ liệu",
    isStandalone = false,
    onClose,
    onUpdate: _onUpdate, // Mark as unused to avoid TS error
    batchFields = [],
    onBatchUpdate,
    onExport,
    onImport,
    onAddColumn,
    renderExtraActions,
    initialPageSize = 50
}: AnalysisTableProps<TData>) {
    const [globalFilter, setGlobalFilter] = useState('');
    const [sorting, setSorting] = useState<SortingState>([]);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

    const [isMaximized, setIsMaximized] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [openVisibilityMenu, setOpenVisibilityMenu] = useState(false);
    const [batchField, setBatchField] = useState('');
    const [batchValue, setBatchValue] = useState('');

    const selectedCount = Object.keys(rowSelection).length;
    // lastCheckedRef removed as it is currently unused

    // Sync with Tauri window if standalone
    useEffect(() => {
        if (isStandalone) {
            import('@tauri-apps/api/webviewWindow').then(m => {
                const win = m.getCurrentWebviewWindow();
                win.isMaximized().then(setIsMaximized);
                const unlisten = win.onResized(async () => {
                    const maximized = await win.isMaximized();
                    setIsMaximized(maximized);
                });
                return () => { unlisten.then(u => u()); };
            });
        }
    }, [isStandalone]);

    const table = useReactTable({
        data,
        columns,
        state: { globalFilter, sorting, rowSelection, columnFilters, columnVisibility },
        onGlobalFilterChange: setGlobalFilter,
        onSortingChange: setSorting,
        onRowSelectionChange: setRowSelection,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableRowSelection: true,
        enableColumnFilters: true,
        columnResizeMode: 'onChange',
        initialState: {
            pagination: {
                pageSize: initialPageSize,
            }
        }
    });

    const handleBatchEdit = async () => {
        if (!batchField || !onBatchUpdate || selectedCount === 0) return;

        const selectedIds = Object.keys(rowSelection)
            .map(idx => {
                const row = table.getRowModel().rowsById[idx];
                return row ? String(row.original.id) : null;
            })
            .filter((id): id is string => id !== null);

        await onBatchUpdate(selectedIds, batchField, batchValue);
        setRowSelection({});
        setBatchField('');
        setBatchValue('');
    };

    return (
        <div className={cn(
            "z-[100] flex flex-col animate-in fade-in duration-200",
            isStandalone ? "h-full w-full min-h-0 min-w-0 relative bg-cad-surface" : (
                isFullscreen ? "fixed inset-0 bg-cad-surface" : "fixed inset-10 rounded-xl shadow-2xl border border-cad-border overflow-hidden bg-cad-surface"
            )
        )}>
            {/* Header */}
            <div
                onMouseDown={(e) => {
                    if (isStandalone && (e.currentTarget === e.target || (e.target as HTMLElement).hasAttribute('data-tauri-drag-region'))) {
                        import('@tauri-apps/api/webviewWindow').then(m => {
                            m.getCurrentWebviewWindow().startDragging();
                        });
                    }
                }}
                data-tauri-drag-region={isStandalone ? "true" : undefined}
                className="h-14 border-b border-cad-border bg-cad-elevated flex items-center justify-between px-6 shrink-0 shadow-sm select-none"
            >
                <div data-tauri-drag-region={isStandalone ? "true" : undefined} className="flex items-center gap-4">
                    <div className="p-2 bg-cad-accent/10 rounded-lg text-cad-accent">
                        <RefreshCcw size={20} />
                    </div>
                    <h2 className="text-lg font-bold text-cad-text-primary uppercase tracking-tight">{title}</h2>
                    {projectId && (
                        <>
                            <div className="h-6 w-[1px] bg-cad-border" />
                            <span className="text-[10px] font-mono text-cad-text-muted bg-cad-surface px-2 py-1 rounded border border-cad-border">
                                PID: {projectId} | {data.length} ITEMS
                            </span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {onAddColumn && (
                        <button
                            onClick={onAddColumn}
                            className="flex items-center gap-2 px-4 py-2 bg-cad-accent/10 border border-cad-accent/30 text-cad-accent rounded-lg text-xs font-bold hover:bg-cad-accent hover:text-white transition-all tracking-tight uppercase"
                        >
                            <Plus size={14} /> Thêm cột
                        </button>
                    )}

                    {renderExtraActions?.()}

                    <div className="relative">
                        <button
                            id="btn-col-visibility"
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 bg-cad-surface border border-cad-border text-cad-text-secondary rounded-lg text-[11px] font-bold hover:bg-cad-elevated hover:text-cad-text-primary transition-all uppercase group whitespace-nowrap",
                                openVisibilityMenu && "bg-cad-elevated border-cad-accent/30 text-cad-accent"
                            )}
                            onClick={() => setOpenVisibilityMenu(!openVisibilityMenu)}
                        >
                            <Eye size={14} className="opacity-70 group-hover:opacity-100" />
                            Cột hiển thị
                        </button>

                        {openVisibilityMenu && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-cad-elevated border border-cad-border rounded-lg shadow-xl z-[9999] p-2 flex flex-col gap-1 max-h-[400px] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-150">
                                <div className="px-2 py-1 text-[10px] font-bold text-cad-text-muted border-b border-cad-border mb-1 uppercase tracking-wider">Chọn cột hiển thị</div>
                                {table.getAllLeafColumns().map(column => {
                                    if (column.id === 'select' || column.id === 'index_stt') return null;
                                    return (
                                        <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-cad-accent/5 rounded cursor-pointer group transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={column.getIsVisible()}
                                                onChange={column.getToggleVisibilityHandler()}
                                                className="w-3.5 h-3.5 text-cad-accent rounded-sm border-cad-border bg-cad-surface"
                                            />
                                            <span className="text-xs font-medium text-cad-text-primary group-hover:text-cad-accent truncate uppercase">
                                                {String(column.columnDef.header)}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cad-text-muted group-focus-within:text-cad-accent transition-colors" />
                        <input
                            type="text"
                            value={globalFilter}
                            onChange={e => setGlobalFilter(e.target.value)}
                            placeholder="Tìm kiếm..."
                            className="bg-cad-surface border border-cad-border rounded-lg pl-10 pr-4 py-2 text-sm w-48 focus:w-80 focus:ring-4 focus:ring-cad-accent/10 focus:border-cad-accent outline-none transition-all font-medium text-cad-text-primary"
                        />
                    </div>

                    <div className="flex bg-cad-surface border border-cad-border rounded-lg overflow-hidden">
                        {isStandalone && (
                            <>
                                <button
                                    onClick={() => import('@tauri-apps/api/webviewWindow').then(m => m.getCurrentWebviewWindow().minimize())}
                                    className="p-2.5 hover:bg-cad-elevated text-cad-text-secondary transition-colors border-r border-cad-border"
                                >
                                    <Minus size={16} />
                                </button>
                                <button
                                    onClick={() => import('@tauri-apps/api/webviewWindow').then(m => m.getCurrentWebviewWindow().toggleMaximize())}
                                    className="p-2.5 hover:bg-cad-elevated text-cad-text-secondary transition-colors border-r border-cad-border"
                                >
                                    {isMaximized ? <Copy size={14} className="rotate-180" /> : <Square size={14} />}
                                </button>
                            </>
                        )}
                        {!isStandalone && onClose && (
                            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2.5 hover:bg-cad-elevated text-cad-text-secondary transition-colors border-r border-cad-border">
                                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                            </button>
                        )}
                        {onClose && (
                            <button onClick={onClose} className="p-2.5 hover:bg-rose-500 hover:text-white text-cad-text-secondary transition-colors">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Table Area */}
            <div className="flex-1 overflow-hidden flex flex-col bg-cad-surface relative">
                {/* Batch Actions */}
                {selectedCount > 0 && onBatchUpdate && batchFields.length > 0 && (
                    <div className="h-12 bg-cad-accent/10 border-b border-cad-accent/30 px-6 flex items-center gap-4 shrink-0 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2">
                            <CheckSquare size={14} className="text-cad-accent" />
                            <span className="text-xs font-bold text-cad-accent">{selectedCount} đã chọn</span>
                        </div>
                        <div className="h-5 w-[1px] bg-cad-accent/30" />
                        <select
                            value={batchField}
                            onChange={e => setBatchField(e.target.value)}
                            className="bg-cad-surface border border-cad-border rounded px-2 py-1 text-xs font-medium text-cad-text-primary outline-none focus:border-cad-accent"
                        >
                            <option value="">-- Chọn trường --</option>
                            {batchFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>

                        {batchField && batchFields.find(f => f.value === batchField)?.options ? (
                            <select
                                value={batchValue}
                                onChange={e => setBatchValue(e.target.value)}
                                className="bg-cad-surface border border-cad-border rounded px-2 py-1 text-xs font-medium text-cad-text-primary outline-none focus:border-cad-accent"
                            >
                                <option value="">-- Chọn giá trị --</option>
                                {batchFields.find(f => f.value === batchField)?.options?.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={batchValue}
                                onChange={e => setBatchValue(e.target.value)}
                                placeholder="Nhập giá trị..."
                                className="bg-cad-surface border border-cad-border rounded px-2 py-1 text-xs font-medium text-cad-text-primary outline-none focus:border-cad-accent w-48"
                            />
                        )}

                        <button
                            onClick={handleBatchEdit}
                            disabled={!batchField || !batchValue}
                            className="px-4 py-1 bg-cad-accent text-black text-[10px] font-black rounded uppercase hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            Cập nhật hàng loạt
                        </button>

                        <button
                            onClick={() => setRowSelection({})}
                            className="text-[10px] font-bold text-cad-text-muted hover:text-cad-accent uppercase tracking-widest pl-2"
                        >
                            Bỏ chọn
                        </button>
                    </div>
                )}

                {/* The Table */}
                <div className="flex-1 overflow-auto custom-scrollbar bg-cad-bg relative group/table">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead className="sticky top-0 z-20 shadow-sm">
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id} className="bg-cad-elevated/95 backdrop-blur-md border-b border-cad-border">
                                    {headerGroup.headers.map(header => (
                                        <th
                                            key={header.id}
                                            colSpan={header.colSpan}
                                            className="px-4 py-3 text-[10px] font-black text-cad-text-muted uppercase tracking-widest relative group/h"
                                            style={{ width: header.getSize() }}
                                        >
                                            <div
                                                className={cn(
                                                    "flex items-center gap-2 select-none",
                                                    header.column.getCanSort() && "cursor-pointer hover:text-cad-accent"
                                                )}
                                                onClick={header.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                {{
                                                    asc: <ArrowUp size={10} className="text-cad-accent" />,
                                                    desc: <ArrowDown size={10} className="text-cad-accent" />,
                                                }[header.column.getIsSorted() as string] ?? null}
                                            </div>

                                            {/* Resize Handle */}
                                            <div
                                                onMouseDown={header.getResizeHandler()}
                                                onTouchStart={header.getResizeHandler()}
                                                className={cn(
                                                    "absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-cad-accent/50 transition-colors",
                                                    header.column.getIsResizing() ? "bg-cad-accent w-0.5" : "bg-transparent"
                                                )}
                                            />
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-cad-border/30">
                            {table.getRowModel().rows.map(row => (
                                <tr
                                    key={row.id}
                                    className={cn(
                                        "hover:bg-cad-accent/5 transition-colors group/row border-l-2 border-transparent",
                                        row.getIsSelected() && "bg-cad-accent/10 border-l-cad-accent"
                                    )}
                                    onClick={() => {
                                        // Selection handling logic here if needed
                                    }}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td
                                            key={cell.id}
                                            className="px-4 py-2 text-xs text-cad-text-primary overflow-hidden whitespace-nowrap overflow-ellipsis border-r border-cad-border/10 last:border-r-0"
                                            style={{ width: cell.column.getSize() }}
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {table.getRowModel().rows.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="flex flex-col items-center opacity-20">
                                <ListFilter size={48} className="mb-4 text-cad-text-muted" />
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-cad-text-muted">Không có dữ liệu</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer / Pagination */}
                <div className="h-12 border-t border-cad-border bg-cad-elevated flex items-center justify-between px-6 shrink-0 shadow-inner">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-cad-text-muted uppercase">Trang</span>
                            <div className="flex items-center bg-cad-surface border border-cad-border rounded px-2 py-0.5">
                                <span className="text-xs font-black text-cad-accent">{table.getState().pagination.pageIndex + 1}</span>
                                <span className="mx-1.5 text-cad-text-muted">/</span>
                                <span className="text-xs font-bold text-cad-text-secondary">{table.getPageCount()}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                                className="p-1 px-2 bg-cad-surface border border-cad-border rounded text-cad-text-secondary hover:text-cad-accent disabled:opacity-30 disabled:hover:text-cad-text-secondary transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                                className="p-1 px-2 bg-cad-surface border border-cad-border rounded text-cad-text-secondary hover:text-cad-accent disabled:opacity-30 disabled:hover:text-cad-text-secondary transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 mr-2">
                            <span className="text-[10px] font-bold text-cad-text-muted uppercase">Hàng mỗi trang:</span>
                            <select
                                value={table.getState().pagination.pageSize}
                                onChange={e => {
                                    table.setPageSize(Number(e.target.value));
                                }}
                                className="bg-cad-surface border border-cad-border rounded px-1.5 py-0.5 text-xs font-bold text-cad-text-primary outline-none focus:border-cad-accent"
                            >
                                {[50, 100, 200, 500].map(pageSize => (
                                    <option key={pageSize} value={pageSize}>
                                        {pageSize}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {onExport && (
                            <button
                                onClick={() => onExport(table)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-cad-elevated border border-cad-border text-cad-text-secondary hover:text-white hover:bg-cad-bg rounded text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                <FileDown size={14} /> Xuất Excel
                            </button>
                        )}
                        {onImport && (
                            <button
                                onClick={onImport}
                                className="flex items-center gap-2 px-4 py-1.5 bg-cad-elevated border border-cad-border text-cad-text-secondary hover:text-white hover:bg-cad-bg rounded text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                <Download size={14} /> Nhập Excel
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useRef, useMemo, useCallback, type KeyboardEvent, type ClipboardEvent, type MouseEvent } from 'react';
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

type CellPosition = {
    rowIndex: number;
    columnId: string;
};

type CellRange = {
    start: CellPosition;
    end: CellPosition;
};

type RowContextMenu<TData> = {
    x: number;
    y: number;
    row: TData;
};

interface BatchActionField {
    label: string;
    value: string;
    options?: string[]; // If select type
}

export type DataSourceStatus = 'unlinked' | 'synced' | 'modified' | 'error';

interface AnalysisTableProps<TData> {
    data: TData[];
    columns: ColumnDef<TData>[];
    projectId?: string | number;
    title?: string;
    isStandalone?: boolean;
    showWindowControls?: boolean;
    onClose?: () => void;
    onUpdate?: (id: string, key: string, value: string | number | boolean) => Promise<void>;
    batchFields?: BatchActionField[];
    onBatchUpdate?: (selectedIds: string[], field: string, value: string | number | boolean) => Promise<void>;
    onExport?: (table: Table<TData>) => Promise<void>;
    onImport?: () => Promise<void>;
    onUpdateData?: () => Promise<void>;
    isUpdatingData?: boolean;
    dataSourceStatus?: DataSourceStatus;
    onRelinkWorkbook?: () => Promise<void>;
    onAddColumn?: () => void;
    renderExtraActions?: () => React.ReactNode;
    initialPageSize?: number;
    onGoToRowLocation?: (row: TData) => void;
}

const NON_NAVIGABLE_COLUMN_IDS = new Set(['select', 'Action']);
const READONLY_COLUMN_IDS = new Set([
    'select',
    'Action',
    'id',
    'index_stt',
    'group',
    'region',
    'layer',
    'technical_geom',
    'coordinates_summary',
    'length',
    'area',
]);

export function AnalysisTable<TData extends { id: string | number }>({
    data,
    columns,
    projectId,
    title = "Phân tích dữ liệu",
    isStandalone = false,
    showWindowControls = true,
    onClose,
    onUpdate,
    batchFields = [],
    onBatchUpdate,
    onExport,
    onImport,
    onUpdateData,
    isUpdatingData = false,
    dataSourceStatus,
    onRelinkWorkbook,
    onAddColumn,
    renderExtraActions,
    initialPageSize = 50,
    onGoToRowLocation
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
    const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
    const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
    const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
    const [rowContextMenu, setRowContextMenu] = useState<RowContextMenu<TData> | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

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

    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRowContextMenu(null);
    }, [data.length, isStandalone]);

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

    const visibleRows = table.getRowModel().rows;
    const navigableColumns = useMemo(
        () => table.getVisibleLeafColumns().filter(column => !NON_NAVIGABLE_COLUMN_IDS.has(column.id)),
        [table, columnVisibility, columns]
    );

    const getColumnIndex = useCallback((columnId: string) => {
        return navigableColumns.findIndex(column => column.id === columnId);
    }, [navigableColumns]);

    const isEditableColumn = useCallback((columnId: string) => {
        return Boolean(onUpdate) && !READONLY_COLUMN_IDS.has(columnId);
    }, [onUpdate]);

    const normalizeCell = useCallback((cell: CellPosition | null): CellPosition | null => {
        if (!cell || visibleRows.length === 0 || navigableColumns.length === 0) return null;
        const rowIndex = Math.max(0, Math.min(visibleRows.length - 1, cell.rowIndex));
        const currentColumnIndex = getColumnIndex(cell.columnId);
        const columnIndex = currentColumnIndex >= 0 ? currentColumnIndex : 0;
        return { rowIndex, columnId: navigableColumns[columnIndex].id };
    }, [getColumnIndex, navigableColumns, visibleRows.length]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveCell(prev => normalizeCell(prev));
        setSelectedRange(prev => {
            if (!prev) return null;
            const start = normalizeCell(prev.start);
            const end = normalizeCell(prev.end);
            return start && end ? { start, end } : null;
        });
    }, [normalizeCell]);

    const getCellKey = (rowIndex: number, columnId: string) => `${rowIndex}::${columnId}`;

    const getRangeBounds = useCallback((range: CellRange) => {
        const startColumnIndex = getColumnIndex(range.start.columnId);
        const endColumnIndex = getColumnIndex(range.end.columnId);
        return {
            minRow: Math.min(range.start.rowIndex, range.end.rowIndex),
            maxRow: Math.max(range.start.rowIndex, range.end.rowIndex),
            minColumn: Math.min(startColumnIndex, endColumnIndex),
            maxColumn: Math.max(startColumnIndex, endColumnIndex),
        };
    }, [getColumnIndex]);

    const isSameCell = (a: CellPosition | null, b: CellPosition | null) => (
        Boolean(a && b && a.rowIndex === b.rowIndex && a.columnId === b.columnId)
    );

    const isCellInRange = useCallback((rowIndex: number, columnId: string) => {
        if (!selectedRange) return false;
        const columnIndex = getColumnIndex(columnId);
        if (columnIndex < 0) return false;
        const bounds = getRangeBounds(selectedRange);
        return rowIndex >= bounds.minRow
            && rowIndex <= bounds.maxRow
            && columnIndex >= bounds.minColumn
            && columnIndex <= bounds.maxColumn;
    }, [getColumnIndex, getRangeBounds, selectedRange]);

    const setCellSelection = useCallback((cell: CellPosition, extendRange: boolean) => {
        const nextCell = normalizeCell(cell);
        if (!nextCell) return;

        if (extendRange && activeCell) {
            setSelectedRange({ start: activeCell, end: nextCell });
        } else {
            setSelectedRange(null);
        }
        setActiveCell(nextCell);
    }, [activeCell, normalizeCell]);

    const moveActiveCell = useCallback((rowDelta: number, columnDelta: number, extendRange = false) => {
        if (visibleRows.length === 0 || navigableColumns.length === 0) return;

        const current = normalizeCell(activeCell) ?? { rowIndex: 0, columnId: navigableColumns[0].id };
        const currentColumnIndex = Math.max(0, getColumnIndex(current.columnId));
        const nextColumnIndex = Math.max(0, Math.min(navigableColumns.length - 1, currentColumnIndex + columnDelta));
        const nextRowIndex = Math.max(0, Math.min(visibleRows.length - 1, current.rowIndex + rowDelta));
        setCellSelection({ rowIndex: nextRowIndex, columnId: navigableColumns[nextColumnIndex].id }, extendRange);
    }, [activeCell, getColumnIndex, navigableColumns, normalizeCell, setCellSelection, visibleRows.length]);

    const beginEditCell = useCallback((cell: CellPosition | null) => {
        const targetCell = normalizeCell(cell);
        if (!targetCell || !isEditableColumn(targetCell.columnId)) return;

        setEditingCell(targetCell);
        window.setTimeout(() => {
            const cellElement = cellRefs.current.get(getCellKey(targetCell.rowIndex, targetCell.columnId));
            const editableElement = cellElement?.querySelector<HTMLElement>('[data-editable-cell]');
            const focusableElement = editableElement ?? cellElement?.querySelector<HTMLElement>('input, select, textarea, [tabindex]');
            if (!focusableElement) return;

            focusableElement.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            focusableElement.focus();
            setEditingCell(null);
        }, 0);
    }, [isEditableColumn, normalizeCell]);

    const getCopyRange = useCallback((): CellRange | null => {
        if (selectedRange) return selectedRange;
        const normalizedActive = normalizeCell(activeCell);
        return normalizedActive ? { start: normalizedActive, end: normalizedActive } : null;
    }, [activeCell, normalizeCell, selectedRange]);

    const copySelectionToClipboard = useCallback(async () => {
        const range = getCopyRange();
        if (!range) return;

        const bounds = getRangeBounds(range);
        const lines: string[] = [];
        for (let rowIndex = bounds.minRow; rowIndex <= bounds.maxRow; rowIndex += 1) {
            const row = visibleRows[rowIndex];
            if (!row) continue;

            const values: string[] = [];
            for (let columnIndex = bounds.minColumn; columnIndex <= bounds.maxColumn; columnIndex += 1) {
                const column = navigableColumns[columnIndex];
                values.push(String(row.getValue(column.id) ?? ''));
            }
            lines.push(values.join('\t'));
        }

        await navigator.clipboard?.writeText(lines.join('\n'));
    }, [getCopyRange, getRangeBounds, navigableColumns, visibleRows]);

    const parseClipboardTable = (text: string) => (
        text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
            .map(line => line.split('\t'))
    );

    const pasteClipboardText = useCallback(async (text: string) => {
        const startCell = normalizeCell(activeCell);
        if (!startCell || !onUpdate || !text) return;

        const rows = parseClipboardTable(text);
        const startColumnIndex = getColumnIndex(startCell.columnId);
        if (startColumnIndex < 0) return;

        for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
            const row = visibleRows[startCell.rowIndex + rowOffset];
            if (!row) break;

            for (let columnOffset = 0; columnOffset < rows[rowOffset].length; columnOffset += 1) {
                const column = navigableColumns[startColumnIndex + columnOffset];
                if (!column || !isEditableColumn(column.id)) continue;

                const allowedOptions = (column.columnDef.meta as { options?: string[] } | undefined)?.options;
                const nextValue = rows[rowOffset][columnOffset];
                if (allowedOptions && !allowedOptions.includes(nextValue)) continue;

                await onUpdate(String(row.original.id), column.id, nextValue);
            }
        }
    }, [activeCell, getColumnIndex, isEditableColumn, navigableColumns, normalizeCell, onUpdate, visibleRows]);

    const handleTableKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select')) return;

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
            event.preventDefault();
            void copySelectionToClipboard();
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            return;
        }

        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                moveActiveCell(-1, 0, event.shiftKey);
                break;
            case 'ArrowDown':
                event.preventDefault();
                moveActiveCell(1, 0, event.shiftKey);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                moveActiveCell(0, -1, event.shiftKey);
                break;
            case 'ArrowRight':
                event.preventDefault();
                moveActiveCell(0, 1, event.shiftKey);
                break;
            case 'Tab':
                event.preventDefault();
                moveActiveCell(0, event.shiftKey ? -1 : 1);
                break;
            case 'Enter':
                event.preventDefault();
                beginEditCell(activeCell);
                break;
            case 'Escape':
                event.preventDefault();
                setSelectedRange(null);
                setEditingCell(null);
                break;
        }
    }, [activeCell, beginEditCell, copySelectionToClipboard, moveActiveCell]);

    const handleTablePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select')) return;

        const text = event.clipboardData.getData('text/plain');
        if (!text) return;

        event.preventDefault();
        void pasteClipboardText(text);
    }, [pasteClipboardText]);

    const handleTableMouseDownCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-row-context-menu]')) return;
        if (rowContextMenu) setRowContextMenu(null);

        const activeElement = document.activeElement as HTMLElement | null;
        if (!activeElement || !scrollContainerRef.current?.contains(activeElement)) return;
        if (!activeElement.matches('input, textarea, select')) return;
        if (activeElement.contains(target)) return;

        activeElement.blur();
    }, [rowContextMenu]);

    const openRowContextMenu = useCallback((event: MouseEvent<HTMLElement>, row: TData) => {
        if (!onGoToRowLocation) return;

        event.preventDefault();
        const containerRect = scrollContainerRef.current?.getBoundingClientRect();
        const x = containerRect ? event.clientX - containerRect.left : event.clientX;
        const y = containerRect ? event.clientY - containerRect.top : event.clientY;
        setRowContextMenu({ x, y, row });
    }, [onGoToRowLocation]);

    const handleGoToRowLocation = useCallback(() => {
        if (!rowContextMenu) return;
        onGoToRowLocation?.(rowContextMenu.row);
        setRowContextMenu(null);
    }, [onGoToRowLocation, rowContextMenu]);

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
            "z-cad-modal flex flex-col animate-in fade-in duration-200",
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
                className="h-14 border-b border-cad-border/50 bg-cad-elevated/50 backdrop-blur-md flex items-center justify-between px-6 shrink-0 select-none"
            >
                <div data-tauri-drag-region={isStandalone ? "true" : undefined} className="flex items-center gap-4">
                    <div className="p-2 bg-cad-accent/10 rounded-lg text-cad-accent">
                        <RefreshCcw size={18} />
                    </div>
                    <h2 className="text-base font-bold text-cad-text-primary uppercase tracking-tight">{title}</h2>
                    {projectId && (
                        <>
                            <div className="h-6 w-[1px] bg-cad-border/60" />
                            <span className="text-[10px] font-mono text-cad-text-muted bg-cad-surface/55 px-2.5 py-1 rounded border border-cad-border/50">
                                PID: {projectId} | {data.length} ITEMS
                            </span>
                        </>
                    )}

                    {dataSourceStatus && (
                        <div className="flex items-center gap-2 ml-2">
                            {dataSourceStatus === 'synced' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cad-accent/10 border border-cad-accent/30 text-cad-accent">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cad-accent animate-pulse" /> Đã đồng bộ
                                </span>
                            )}
                            {dataSourceStatus === 'modified' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cad-warn/10 border border-cad-warn/30 text-cad-warn">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cad-warn" /> Có thay đổi
                                </span>
                            )}
                            {dataSourceStatus === 'unlinked' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cad-elevated border border-cad-border text-cad-text-muted">
                                    Chưa liên kết Excel
                                </span>
                            )}
                            {dataSourceStatus === 'error' && (
                                <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-cad-danger/10 border border-cad-danger/30 text-cad-danger">
                                        Lỗi / Mất file
                                    </span>
                                    {onRelinkWorkbook && (
                                        <button
                                            onClick={onRelinkWorkbook}
                                            className="text-[10px] font-bold text-cad-accent underline hover:text-cad-accent/80 cursor-pointer"
                                        >
                                            Chọn lại workbook
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {onAddColumn && (
                        <button
                            onClick={onAddColumn}
                            className="flex items-center gap-2 px-4 py-2 bg-cad-accent/10 border border-cad-accent/30 hover:border-cad-accent/60 text-cad-accent hover:bg-cad-accent hover:text-black rounded-lg text-xs font-semibold transition-all duration-200 tracking-wider uppercase cursor-pointer hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                        >
                            <Plus size={14} /> Thêm cột
                        </button>
                    )}

                    {renderExtraActions?.()}

                    <div className="relative">
                        <button
                            id="btn-col-visibility"
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 bg-cad-surface border border-cad-border hover:border-cad-border/80 text-cad-text-secondary rounded-lg text-xs font-semibold hover:bg-cad-elevated hover:text-cad-text-primary transition-all uppercase group whitespace-nowrap cursor-pointer select-none",
                                openVisibilityMenu && "bg-cad-elevated border-cad-accent/40 text-cad-accent"
                            )}
                            onClick={() => setOpenVisibilityMenu(!openVisibilityMenu)}
                        >
                            <Eye size={14} className="opacity-70 group-hover:opacity-100" />
                            Cột hiển thị
                        </button>

                        {openVisibilityMenu && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-cad-elevated border border-cad-border rounded-lg shadow-xl z-cad-dropdown p-2 flex flex-col gap-1 max-h-[400px] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-150">
                                <div className="px-2 py-1 text-[10px] font-bold text-cad-text-muted border-b border-cad-border mb-1 uppercase tracking-wider">Chọn cột hiển thị</div>
                                {table.getAllLeafColumns().map(column => {
                                    if (column.id === 'select' || column.id === 'index_stt') return null;
                                    return (
                                        <label key={column.id} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-cad-accent/5 rounded cursor-pointer group transition-colors select-none">
                                            <div className="relative flex items-center justify-center shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={column.getIsVisible()}
                                                    onChange={column.getToggleVisibilityHandler()}
                                                    className="peer appearance-none w-3.5 h-3.5 rounded border border-cad-border group-hover:border-cad-accent checked:bg-cad-accent checked:border-cad-accent outline-none cursor-pointer transition-all"
                                                />
                                                <svg
                                                    className="absolute w-2 h-2 pointer-events-none stroke-black stroke-[3.5] fill-none opacity-0 peer-checked:opacity-100 transition-opacity"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            </div>
                                            <span className="text-xs font-semibold text-cad-text-primary group-hover:text-cad-accent truncate uppercase transition-colors">
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
                            className="bg-cad-surface border border-cad-border hover:border-cad-border/80 focus:border-cad-accent rounded-lg pl-10 pr-4 py-2 text-xs w-48 focus:w-80 focus:ring-4 focus:ring-cad-accent/10 outline-none transition-all font-medium text-cad-text-primary"
                        />
                    </div>

                    <div className="flex bg-cad-surface border border-cad-border rounded-lg overflow-hidden">
                        {isStandalone && showWindowControls && (
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
                        {onClose && (!isStandalone || showWindowControls) && (
                            <button onClick={onClose} className="p-2.5 hover:bg-cad-danger hover:text-white text-cad-text-secondary transition-colors">
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
                    <div className="h-12 bg-cad-accent/10 border-b border-cad-accent/20 px-6 flex items-center gap-4 shrink-0 animate-in slide-in-from-top-2 duration-200 backdrop-blur-sm select-none">
                        <div className="flex items-center gap-2">
                            <CheckSquare size={14} className="text-cad-accent animate-pulse" />
                            <span className="text-xs font-bold text-cad-accent">{selectedCount} đã chọn</span>
                        </div>
                        <div className="h-5 w-[1px] bg-cad-accent/20" />
                        <select
                            value={batchField}
                            onChange={e => setBatchField(e.target.value)}
                            className="bg-cad-surface border border-cad-border hover:border-cad-accent/40 rounded px-2.5 py-1 text-xs font-semibold text-cad-text-primary outline-none focus:border-cad-accent transition-all cursor-pointer appearance-none pr-6 bg-[image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_4px_center] bg-[size:16px_16px] bg-no-repeat min-w-[140px]"
                        >
                            <option value="">-- Chọn trường --</option>
                            {batchFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>

                        {batchField && batchFields.find(f => f.value === batchField)?.options ? (
                            <select
                                value={batchValue}
                                onChange={e => setBatchValue(e.target.value)}
                                className="bg-cad-surface border border-cad-border hover:border-cad-accent/40 rounded px-2.5 py-1 text-xs font-semibold text-cad-text-primary outline-none focus:border-cad-accent transition-all cursor-pointer appearance-none pr-6 bg-[image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_4px_center] bg-[size:16px_16px] bg-no-repeat min-w-[140px]"
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
                                className="bg-cad-surface border border-cad-border hover:border-cad-accent/40 rounded px-2.5 py-1 text-xs font-semibold text-cad-text-primary outline-none focus:border-cad-accent transition-all w-48 font-medium"
                            />
                        )}

                        <button
                            onClick={handleBatchEdit}
                            disabled={!batchField || !batchValue}
                            className="px-4 py-1.5 bg-cad-accent text-black text-[10px] font-black rounded uppercase hover:brightness-110 disabled:opacity-50 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all cursor-pointer flex items-center gap-2 select-none"
                        >
                            Cập nhật hàng loạt
                        </button>

                        <button
                            onClick={() => setRowSelection({})}
                            className="text-[10px] font-bold text-cad-text-secondary hover:text-cad-accent hover:underline uppercase tracking-widest pl-2 cursor-pointer transition-colors"
                        >
                            Bỏ chọn
                        </button>
                    </div>
                )}

                {/* The Table */}
                <div
                    ref={scrollContainerRef}
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                    tabIndex={0}
                    onKeyDown={handleTableKeyDown}
                    onPaste={handleTablePaste}
                    onMouseDownCapture={handleTableMouseDownCapture}
                    className="flex-1 overflow-auto custom-scrollbar bg-cad-bg relative group/table outline-none focus:ring-1 focus:ring-cad-accent/30"
                >
                    <table className="text-left border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
                        <thead>
                            {table.getHeaderGroups().map((headerGroup, groupIndex) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => {
                                        // Calculate rowSpan for non-grouped column headers in multi-level headers
                                        const isMultiLevel = table.getHeaderGroups().length > 1;
                                        const isPlaceholder = header.isPlaceholder;
                                        const isLeaf = !header.subHeaders || header.subHeaders.length === 0;
                                        const rowSpan = (isMultiLevel && groupIndex === 0 && isLeaf && !isPlaceholder) ? table.getHeaderGroups().length : 1;

                                        // Skip rendering leaf headers in row 2 if they were merged by rowSpan in row 1
                                        if (isMultiLevel && groupIndex > 0 && isLeaf && header.column.depth === 0) {
                                            return null;
                                        }

                                        const topStickyOffset = groupIndex * 36; // 36px height per header level

                                        return (
                                            <th
                                                key={header.id}
                                                colSpan={header.colSpan}
                                                rowSpan={rowSpan}
                                                className="sticky z-30 bg-cad-elevated border-r border-b border-cad-border/70 px-3 py-2 text-[11px] font-bold text-cad-text-primary uppercase tracking-wider relative group/h shadow-sm text-center align-middle"
                                                style={{
                                                    top: `${topStickyOffset}px`,
                                                    width: header.getSize(),
                                                    minWidth: header.getSize(),
                                                    maxWidth: header.getSize()
                                                }}
                                            >
                                                {!isPlaceholder && (
                                                    <div
                                                        className={cn(
                                                            "flex items-center justify-center gap-2 select-none h-full w-full",
                                                            header.column.getCanSort() && "cursor-pointer hover:text-cad-accent"
                                                        )}
                                                        onClick={header.column.getToggleSortingHandler()}
                                                    >
                                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                                        {{
                                                            asc: <ArrowUp size={10} className="text-cad-accent shrink-0" />,
                                                            desc: <ArrowDown size={10} className="text-cad-accent shrink-0" />,
                                                        }[header.column.getIsSorted() as string] ?? null}
                                                    </div>
                                                )}

                                                {/* Resize Handle */}
                                                <div
                                                    onMouseDown={header.getResizeHandler()}
                                                    onTouchStart={header.getResizeHandler()}
                                                    className={cn(
                                                        "absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-cad-accent/50 transition-colors z-40",
                                                        header.column.getIsResizing() ? "bg-cad-accent w-0.5" : "bg-transparent"
                                                    )}
                                                />
                                            </th>
                                        );
                                    })}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {visibleRows.map((row, rowIndex) => (
                                <tr
                                    key={row.id}
                                    className={cn(
                                        "hover:bg-cad-accent/5 transition-colors group/row",
                                        row.getIsSelected() && "bg-cad-accent/10"
                                    )}
                                    onClick={() => {
                                        // Selection handling logic here if needed
                                    }}
                                    onContextMenu={(event) => openRowContextMenu(event, row.original)}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td
                                            key={cell.id}
                                            ref={(node) => {
                                                const key = getCellKey(rowIndex, cell.column.id);
                                                if (node) cellRefs.current.set(key, node);
                                                else cellRefs.current.delete(key);
                                            }}
                                            onClick={(event) => {
                                                if (NON_NAVIGABLE_COLUMN_IDS.has(cell.column.id)) return;
                                                setCellSelection({ rowIndex, columnId: cell.column.id }, event.shiftKey);
                                                scrollContainerRef.current?.focus({ preventScroll: true });
                                            }}
                                            onDoubleClick={() => {
                                                beginEditCell({ rowIndex, columnId: cell.column.id });
                                            }}
                                            onContextMenu={(event) => openRowContextMenu(event, row.original)}
                                            className={cn(
                                                "h-9 px-3 py-1.5 text-xs text-cad-text-primary overflow-hidden whitespace-nowrap overflow-ellipsis border-r border-b border-cad-border/30 bg-cad-bg relative select-none",
                                                isCellInRange(rowIndex, cell.column.id) && "bg-cad-accent/10",
                                                isSameCell(activeCell, { rowIndex, columnId: cell.column.id }) && "ring-2 ring-inset ring-cad-accent bg-cad-accent/15 z-10",
                                                isSameCell(editingCell, { rowIndex, columnId: cell.column.id }) && "bg-cad-accent/20"
                                            )}
                                            style={{ width: cell.column.getSize(), minWidth: cell.column.getSize(), maxWidth: cell.column.getSize() }}
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

                    {rowContextMenu && (
                        <div
                            data-row-context-menu
                            className="absolute z-cad-dropdown min-w-40 rounded-md border border-cad-border bg-cad-elevated shadow-xl shadow-black/30 p-1"
                            style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
                            onMouseDown={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={handleGoToRowLocation}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-cad-text-primary hover:bg-cad-accent/10 hover:text-cad-accent rounded transition-colors"
                            >
                                Đi tới vị trí
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer / Pagination */}
                <div className="h-12 border-t border-cad-border/50 bg-cad-elevated/50 flex items-center justify-between px-6 shrink-0 backdrop-blur-md select-none">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-bold text-cad-text-secondary uppercase tracking-wider">Trang</span>
                            <div className="flex items-center bg-cad-bg/50 border border-cad-border/75 rounded-md px-2.5 py-0.5 shadow-inner">
                                <span className="text-xs font-black text-cad-accent">{table.getState().pagination.pageIndex + 1}</span>
                                <span className="mx-1.5 text-cad-text-muted text-[10px]">/</span>
                                <span className="text-xs font-bold text-cad-text-secondary">{table.getPageCount()}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                                className="p-1.5 bg-cad-surface border border-cad-border hover:border-cad-border/80 rounded-md text-cad-text-secondary hover:text-cad-accent disabled:opacity-20 disabled:hover:text-cad-text-secondary transition-all cursor-pointer hover:bg-cad-elevated select-none"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                                className="p-1.5 bg-cad-surface border border-cad-border hover:border-cad-border/80 rounded-md text-cad-text-secondary hover:text-cad-accent disabled:opacity-20 disabled:hover:text-cad-text-secondary transition-all cursor-pointer hover:bg-cad-elevated select-none"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 mr-2">
                            <span className="text-[10px] font-bold text-cad-text-secondary uppercase tracking-wider">Hàng mỗi trang:</span>
                            <select
                                value={table.getState().pagination.pageSize}
                                onChange={e => {
                                    table.setPageSize(Number(e.target.value));
                                }}
                                className="bg-cad-surface border border-cad-border hover:border-cad-border/80 rounded-md px-2 py-0.5 text-xs font-bold text-cad-text-primary outline-none focus:border-cad-accent cursor-pointer transition-all appearance-none pr-6 bg-[image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%239CA3AF%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_4px_center] bg-[size:16px_16px] bg-no-repeat"
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
                                className="flex items-center gap-2 px-4 py-2 bg-cad-surface hover:bg-cad-elevated border border-cad-border hover:border-cad-border/80 text-cad-text-secondary hover:text-cad-text-primary rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer select-none"
                            >
                                <FileDown size={14} className="text-cad-text-muted group-hover:text-cad-text-primary" /> Xuất Excel
                            </button>
                        )}
                        {onUpdateData ? (
                            <button
                                onClick={onUpdateData}
                                disabled={isUpdatingData || dataSourceStatus === 'unlinked'}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 bg-cad-accent text-black hover:brightness-110 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer select-none shadow-md hover:shadow-[0_0_12px_rgba(16,185,129,0.3)] disabled:opacity-40 disabled:pointer-events-none",
                                    isUpdatingData && "animate-pulse"
                                )}
                            >
                                <RefreshCcw size={14} className={cn(isUpdatingData && "animate-spin")} />
                                {isUpdatingData ? "Đang đồng bộ..." : "Update Data"}
                            </button>
                        ) : onImport && (
                            <button
                                onClick={onImport}
                                className="flex items-center gap-2 px-4 py-2 bg-cad-surface hover:bg-cad-elevated border border-cad-border hover:border-cad-border/80 text-cad-text-secondary hover:text-cad-text-primary rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer select-none"
                            >
                                <Download size={14} className="text-cad-text-muted group-hover:text-cad-text-primary" /> Nhập Excel
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

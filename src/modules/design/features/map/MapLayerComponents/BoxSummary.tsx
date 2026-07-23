import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, Image as ImageIcon, Trash2
} from "lucide-react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { DeleteConfirmationModal } from "@DESIGN/components/ui/DeleteConfirmationModal";
import { safeString } from "@TOOL/utils/featureUtils";
import { EditableText } from "@DESIGN/components/core/CADPanels/EditableText";
import { confirmUserAction } from '@TOOL/utils/userConfirmation';

interface BoxSummaryProps {
  inline?: boolean;
}

export const BoxSummary: React.FC<BoxSummaryProps> = ({ inline = true }) => {
  const {
    boxSelection, setBoxSelection, selectFeature, selectedFeatureId,
    deleteFeature, state, selectionSet, toggleSelection, selectAll,
    clearSelection, deleteSelectedFeatures, dispatchEvent
  } = useDesignSync();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; isBatch?: boolean } | null>(null);

  // Resizable columns state
  const [columnWidths, setColumnWidths] = useState({
    content: 150,
    type: 60,
    lng: 100,
    lat: 100,
    note: 200,
    actions: 100
  });

  const resizingColumn = useRef<string | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  const onMouseDown = (e: React.MouseEvent, col: keyof typeof columnWidths) => {
    resizingColumn.current = col;
    startX.current = e.pageX;
    startWidth.current = columnWidths[col];
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn.current) return;
      const diff = e.pageX - startX.current;
      const col = resizingColumn.current as keyof typeof columnWidths;
      const newWidth = Math.max(40, startWidth.current + diff);
      setColumnWidths(prev => ({ ...prev, [col]: newWidth }));
    };

    const handleMouseUp = () => {
      if (resizingColumn.current) {
        resizingColumn.current = null;
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleUpdate = async (id: string, field: 'name' | 'note' | 'lng' | 'lat', value: string) => {
    const feature = state?.features[id];
    if (!feature) return;

    const payload: any = { id };

    if (field === 'name') {
      payload.name = value;
    } else if (field === 'note') {
      const meta = typeof feature.metadata === 'string' ? JSON.parse(feature.metadata || '{}') : (feature.metadata || {});
      const newMeta = { ...meta, note: value };
      payload.metadata = JSON.stringify(newMeta);
    } else if (field === 'lng' || field === 'lat') {
      try {
        const val = parseFloat(value);
        if (isNaN(val)) return;

        const coords = typeof feature.coordinates === 'string' ? JSON.parse(feature.coordinates) : feature.coordinates;
        let nextCoords = coords;

        // Handle Point or first point of Line/Polygon
        if (Array.isArray(coords)) {
          if (typeof coords[0] === 'number') {
            // It's a single Point [lng, lat]
            nextCoords = field === 'lng'
              ? [val, coords[1]]
              : [coords[0], val];
          } else if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
            // It's a line/polygon [[lng, lat], ...] or multi-point
            nextCoords = coords.map((point: unknown, index: number) => {
              if (index !== 0 || !Array.isArray(point)) return point;
              return field === 'lng'
                ? [val, point[1]]
                : [point[0], val];
            });
          }
        }
        payload.coordinates = JSON.stringify(nextCoords);
      } catch (e) {
        console.error("Failed to update coordinates:", e);
      }
    }

    if (Object.keys(payload).length > 1) {
      if (!confirmUserAction(`Xác nhận cập nhật ${field === 'lng' || field === 'lat' ? 'vị trí' : 'dữ liệu'} của đối tượng "${feature.name}"?`)) return;
      await dispatchEvent({ type: 'FeatureUpdated', payload });
    }
  };

  if (!boxSelection) {
    return null;
  }

  // Debug for user if they experience issues
  if (boxSelection.count > 0 && (!boxSelection.items || boxSelection.items.length === 0)) {
    console.warn("[BoxSummary] boxSelection has count but items are missing!", boxSelection);
  }

  const items = boxSelection.items || [];
  const totalCount = boxSelection.count || items.length;

  // Breakdown by type - Ưu tiên dùng stats từ store (chính xác 100%)
  const typeCounts = boxSelection.byType || items.reduce((acc, item) => {
    acc[item.displayType] = (acc[item.displayType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleRowClick = (item: any) => {
    selectFeature(item.id);
    // zoomTo(item.id, 'feature'); // Disabled by user request to keep view constant

    // Also ensure the group is selected so it highlights in sidebar if needed
    if (state?.features?.[item.id]) {
      useDesignSync.getState().setSelectedGroup(state.features[item.id].group_id);
    }
  };

  const handleToggleView = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleDelete = (id: string, name: string) => {
    setItemToDelete({ id, name });
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      if (itemToDelete.isBatch) {
        deleteSelectedFeatures();
      } else {
        deleteFeature(itemToDelete.id);
      }
      setItemToDelete(null);
      setShowDeleteModal(false);
    }
  };

  const isAllSelected = items.length > 0 && items.every(item => selectionSet.has(item.id));

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      selectAll(items.map(i => i.id));
    } else {
      clearSelection();
    }
  };

  const handleDeleteSelected = () => {
    if (selectionSet.size > 0) {
      setItemToDelete({ id: 'batch', name: `${selectionSet.size} đối tượng đã chọn`, isBatch: true });
      setShowDeleteModal(true);
    }
  };

  const handleExport = () => {
    const headers = ["STT", "NỘI DUNG", "LOẠI", "X (Kinh độ)", "Y (Vĩ độ)", "GHI CHÚ"];
    const rows = items.map((item, idx) => {
      return [
        idx + 1,
        item.name || item.id,
        item.displayType,
        item.lng,
        item.lat,
        item.note
      ].join("\t");
    });
    const tsvContent = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(tsvContent);
    alert("Đã sao chép " + totalCount + " đối tượng vào bộ nhớ tạm (Định dạng Excel TSV).");
  };

  return (
    <div className={inline ? "flex flex-col h-full bg-cad-bg" : "summary-overlay"}>
      {/* Header aligned with image */}
      <div className="px-3 py-2 border-b border-cad-border flex justify-between items-center bg-cad-header/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cad-accent opacity-80" />
          <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-cad-accent/90">SELECTION SUMMARY</h2>
        </div>
        <div className="flex items-center gap-1">
          {selectionSet.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="text-[9px] font-bold text-red-500 hover:text-red-400 transition-colors uppercase tracking-widest px-2 flex items-center gap-1"
            >
              <Trash2 className="w-2.5 h-2.5" /> DELETE ({selectionSet.size})
            </button>
          )}
          <button
            onClick={() => { setBoxSelection(null); clearSelection(); }}
            className="text-[9px] font-bold text-cad-text-secondary hover:text-cad-accent transition-colors uppercase tracking-widest px-2"
          >
            CLEAR
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Main stats block */}
        <div className="p-6 flex flex-col items-center justify-center border-b border-cad-border/20 bg-gradient-to-b from-cad-surface/30 to-transparent">
          <div className="text-6xl font-black text-cad-accent tracking-tighter leading-none">{totalCount}</div>
          <div className="text-[10px] text-cad-text-secondary font-bold uppercase tracking-[0.3em] mt-3">Entities Selected</div>
        </div>

        {/* Type Breakdown section */}
        <div className="px-4 py-3 border-b border-cad-border/10">
          <div className="text-[9px] font-bold text-cad-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
            <div className="w-1 h-3 bg-cad-accent/50 rounded-full"></div>
            Breakdown by type
          </div>
          <div className="space-y-2">
            {Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-[10px] group px-1">
                <span className="text-cad-text-secondary uppercase font-medium">{type}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1 bg-cad-border/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cad-accent/60 group-hover:bg-cad-accent transition-all duration-500"
                      style={{ width: `${(count / totalCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-cad-text font-bold w-4 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Explanatory text as in image */}
        <div className="px-4 py-2 bg-cad-elevated/20 flex justify-between items-center">
          <p className="text-[8px] text-cad-text-muted/60 leading-relaxed uppercase tracking-widest italic">
            Dữ liệu bao gồm các thông số kỹ thuật, tọa độ WGS84 và ghi chú khảo sát của toàn bộ {totalCount} đối tượng.
          </p>
          {totalCount > 500 && (
            <span className="text-[8px] text-amber-500 font-bold uppercase tracking-tighter bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              Chỉ hiển thị 500 dòng đầu tiên
            </span>
          )}
        </div>

        {/* Detailed Grid */}
        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 z-10 bg-cad-surface shadow-sm text-white">
              <tr>
                <th className="px-1 py-2.5 text-[9px] font-black tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50 text-center w-[30px]">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-cad-border bg-cad-bg text-cad-accent focus:ring-cad-accent cursor-pointer"
                  />
                </th>
                <th className="px-1 py-2.5 text-[9px] font-black text-cad-text-muted uppercase tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50 w-[30px]">STT</th>

                <th className="relative px-2 py-2.5 text-[9px] font-black text-cad-text-muted uppercase tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50" style={{ width: columnWidths.content }}>
                  Nội dung
                  <div onMouseDown={(e) => onMouseDown(e, 'content')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-cad-accent/40 z-20 group" title="Kéo để chỉnh độ rộng">
                    <div className="absolute right-0 top-0 h-full w-[1px] bg-cad-border/30 group-hover:bg-cad-accent" />
                  </div>
                </th>

                <th className="relative px-1 py-2.5 text-[9px] font-black text-cad-text-muted uppercase tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50" style={{ width: columnWidths.type }}>
                  Loại
                  <div onMouseDown={(e) => onMouseDown(e, 'type')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-cad-accent/40 z-20 group" title="Kéo để chỉnh độ rộng">
                    <div className="absolute right-0 top-0 h-full w-[1px] bg-cad-border/30 group-hover:bg-cad-accent" />
                  </div>
                </th>

                <th className="relative px-1 py-2.5 text-[9px] font-black text-cad-text-muted uppercase tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50" style={{ width: columnWidths.lng }}>
                  X (Kinh độ)
                  <div onMouseDown={(e) => onMouseDown(e, 'lng')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-cad-accent/40 z-20 group" title="Kéo để chỉnh độ rộng">
                    <div className="absolute right-0 top-0 h-full w-[1px] bg-cad-border/30 group-hover:bg-cad-accent" />
                  </div>
                </th>

                <th className="relative px-1 py-2.5 text-[9px] font-black text-cad-text-muted uppercase tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50" style={{ width: columnWidths.lat }}>
                  Y (Vĩ độ)
                  <div onMouseDown={(e) => onMouseDown(e, 'lat')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-cad-accent/40 z-20 group" title="Kéo để chỉnh độ rộng">
                    <div className="absolute right-0 top-0 h-full w-[1px] bg-cad-border/30 group-hover:bg-cad-accent" />
                  </div>
                </th>

                <th className="relative px-2 py-2.5 text-[9px] font-black text-cad-text-muted uppercase tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50" style={{ width: columnWidths.note }}>
                  Ghi chú
                  <div onMouseDown={(e) => onMouseDown(e, 'note')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-cad-accent/40 z-20 group" title="Kéo để chỉnh độ rộng">
                    <div className="absolute right-0 top-0 h-full w-[1px] bg-cad-border/30 group-hover:bg-cad-accent" />
                  </div>
                </th>

                <th className="relative px-2 py-2.5 text-[9px] font-black text-cad-text-muted uppercase tracking-tighter border-b border-cad-border/50 bg-cad-elevated/50" style={{ width: columnWidths.actions }}>
                  Thao tác
                  <div onMouseDown={(e) => onMouseDown(e, 'actions')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-cad-accent/40 z-20 group" title="Kéo để chỉnh độ rộng">
                    <div className="absolute right-0 top-0 h-full w-[1px] bg-cad-border/30 group-hover:bg-cad-accent" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 500).map((item, idx) => {
                const isSelected = item.id === selectedFeatureId;
                const isExpanded = expandedItems.has(item.id);
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      onClick={() => handleRowClick(item)}
                      className={`cursor-pointer border-b border-cad-border/10 transition-colors ${isSelected ? 'bg-indigo-500/20 border-l-2 border-l-indigo-500' :
                        selectionSet.has(item.id) ? 'bg-cad-accent/10' : 'hover:bg-cad-accent/5'
                        }`}
                    >
                      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectionSet.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          className="rounded border-cad-border bg-cad-bg text-cad-accent focus:ring-cad-accent cursor-pointer"
                        />
                      </td>
                      <td className="px-1.5 py-1 text-[10px] font-mono text-cad-text-muted/60 text-center">{idx + 1}</td>
                      <td className="px-1.5 py-1 text-[10px] font-bold text-cad-text-secondary" style={{ width: columnWidths.content }}>
                        <div
                          style={{
                            maxWidth: columnWidths.content - 10,
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            overflow: 'hidden'
                          }}
                          className="whitespace-normal break-words"
                        >
                          <EditableText
                            value={safeString(item.name)}
                            onSave={(val: any) => handleUpdate(item.id, 'name', val)}
                          />
                        </div>
                      </td>
                      <td className="px-1.5 py-1 text-[10px] text-cad-accent/70 font-black truncate text-center bg-cad-accent/5 rounded-sm" style={{ width: columnWidths.type }}>{item.displayType}</td>
                      <td className="px-1.5 py-1 text-[10px] font-mono text-emerald-400/90 hover:bg-emerald-400/10 rounded transition-colors" style={{ width: columnWidths.lng }}>
                        <EditableText
                          value={item.lng.toFixed(5)}
                          onSave={(val: any) => handleUpdate(item.id, 'lng', val)}
                        />
                      </td>
                      <td className="px-1.5 py-1 text-[10px] font-mono text-emerald-400/90 hover:bg-emerald-400/10 rounded transition-colors" style={{ width: columnWidths.lat }}>
                        <EditableText
                          value={item.lat.toFixed(5)}
                          onSave={(val: any) => handleUpdate(item.id, 'lat', val)}
                        />
                      </td>
                      <td className="px-1.5 py-1 text-[10px] text-cad-text-muted/60 italic" style={{ width: columnWidths.note }}>
                        <div
                          style={{
                            maxWidth: columnWidths.note - 10,
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            overflow: 'hidden'
                          }}
                          className="whitespace-normal break-words leading-relaxed"
                        >
                          <EditableText
                            value={item.note || ""}
                            onSave={(val: any) => handleUpdate(item.id, 'note', val)}
                            placeholder="Ghi chú..."
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {isSelected && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={(e) => handleToggleView(e, item.id)}
                              className="px-2 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-400 text-[8px] font-black uppercase rounded border border-indigo-500/20 transition-all"
                            >
                              {isExpanded ? 'Ẩn' : 'View'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.name || item.id); }}
                              className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[8px] font-black uppercase rounded border border-red-500/20 transition-all"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* Expanded Section with Smooth Height Transition */}
                    <tr>
                      <td colSpan={8} className="p-0 border-none">
                        <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                          <div className="overflow-hidden">
                            <div className="bg-cad-elevated/40 border-b border-cad-border/20 px-8 py-5">
                              <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-3">
                                  <label className="text-[9px] font-black text-cad-accent uppercase tracking-[0.2em] flex items-center gap-2">
                                    <div className="w-1 h-3 bg-cad-accent rounded-full"></div>
                                    Tọa độ chi tiết (WGS84)
                                  </label>
                                  <div className="bg-black/40 p-3 rounded-lg border border-cad-border/20 shadow-inner space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-mono">
                                      <span className="text-cad-text-muted">Kinh độ (Longitude):</span>
                                      <span className="text-emerald-400 font-bold tracking-wider">{item.lng.toFixed(8)}°</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[10px] font-mono">
                                      <span className="text-cad-text-muted">Vĩ độ (Latitude):</span>
                                      <span className="text-emerald-400 font-bold tracking-wider">{item.lat.toFixed(8)}°</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <label className="text-[9px] font-black text-cad-text-muted uppercase tracking-[0.2em]">Thông tin khảo sát</label>
                                  <div className="bg-black/20 p-3 rounded-lg border border-cad-border/10 min-h-[50px] flex items-center">
                                    <p className="text-[10px] text-cad-text-secondary leading-relaxed italic">
                                      {safeString(item.note) || "Không có dữ liệu khảo sát bổ sung cho đối tượng này."}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-cad-surface border-t border-cad-border">
          <button
            onClick={handleExport}
            className="w-full py-3 bg-cad-accent hover:bg-emerald-500 text-[#0f172a] rounded-sm text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all flex items-center justify-center gap-2 group"
          >
            <ImageIcon className="w-4 h-4 group-hover:scale-110 transition-transform" /> COPY TO EXCEL (TSV)
          </button>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        itemName={itemToDelete?.name}
      />
    </div>
  );
};

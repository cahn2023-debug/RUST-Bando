import React from "react";
import { Trash2, Eye, EyeOff } from "lucide-react";
import { cn } from "@TOOL/utils/cn";
import { FeatureIcon } from "@DESIGN/components/core/CADPanels/FeatureIcon";
import { getCleanName, getParsedMetadata } from "@TOOL/utils/featureUtils";
import type { FeatureState } from "@CONTRACT/types";

export interface FeatureItemProps {
  feature: FeatureState;
  index: number | string;
  level: number;
  levelOffset: number;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onZoomTo: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  groupType?: string;
  groupName?: string;
  children?: React.ReactNode;
  checked?: boolean;
  onToggleCheck?: () => void;
  visible?: boolean;
  onToggleVisible?: (e: React.MouseEvent) => void;
  hovered?: boolean;
  // Drag & Drop Target
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
  dragId?: string;
  dragType?: string;
  showNotes?: boolean;
  showQr?: boolean;
  showCode?: boolean;
}

export const FeatureItem = React.memo(({
  feature,
  index,
  level,
  levelOffset,
  selected,
  expanded,
  hasChildren,
  onSelect,
  onToggleExpand,
  onZoomTo,
  onDragStart: _onDragStart,
  onDragEnd: _onDragEnd,
  onContextMenu,
  onDelete,
  groupType,
  groupName,
  children,
  checked,
  onToggleCheck,
  visible = true,
  onToggleVisible,
  hovered,
  onDragOver: _onDragOver,
  onDragLeave: _onDragLeave,
  onDrop: _onDrop,
  isDropTarget,
  onMouseDown,
  dragId,
  dragType,
  showNotes = true,
  showQr = true,
  showCode = true
}: FeatureItemProps) => {
  return (
    <div
      className="flex flex-col"
      data-drag-id={dragId}
      data-drag-type={dragType}
    >
      <div
        id={`sidebar-feature-${feature.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          if (hasChildren) {
            onToggleExpand();
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onZoomTo();
        }}
        className={cn(
          "group/feat flex items-center justify-between py-1 px-1 relative transition-all cursor-pointer rounded-sm select-none",
          selected && "bg-emerald-500/10 border-r-2 border-r-emerald-500",
          hovered && !selected && "bg-white/5 ring-1 ring-white/5",
          isDropTarget && "ring-1 ring-emerald-500 bg-emerald-500/10"
        )}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
      >

        <div className="flex items-center gap-0 overflow-hidden relative z-10 flex-1">
          <div className="w-3 shrink-0">
            {/* Grip placeholder or empty space to match TreeItem */}
          </div>

          <div className="flex-1 flex items-center gap-0.5 min-w-0" style={{ paddingLeft: (level + 1 + levelOffset) * 16 }}>
            <span className="w-3 shrink-0 flex items-center justify-center -ml-1">
              {hasChildren && (
                <span className="text-white text-[9px] font-bold text-center">
                  {expanded ? '▼' : '▶'}
                </span>
              )}
            </span>

            {onToggleCheck && (
              <input
                type="checkbox"
                checked={checked}
                onChange={() => { }} // Controlled by onClick
                onClick={(e) => { e.stopPropagation(); onToggleCheck(); }}
                className="rounded border-cad-border bg-cad-bg text-cad-accent focus:ring-cad-accent cursor-pointer shrink-0 w-3 h-3"
              />
            )}

            <div className="flex-1 flex items-center gap-0.5">

              {showCode && (
                <div className="w-5 shrink-0 flex items-center justify-center">
                  <span className={cn(
                    "text-[8px] font-bold shrink-0 min-w-[12px] h-3.5 flex items-center justify-center rounded px-0.5 transition-all",
                    selected ? "bg-emerald-500 text-black" : "bg-white/5 text-white/40 group-hover/feat:text-white/60"
                  )}>
                    {typeof index === 'number' ? index + 1 : index}
                  </span>
                </div>
              )}

              <div className="w-5 shrink-0 flex items-center justify-center">
                <FeatureIcon
                  feature={feature}
                  selected={selected}
                  groupType={groupType}
                  groupName={groupName}
                />
              </div>

              <span className={cn(
                "truncate flex items-center gap-1 transition-colors",
                selected ? "text-emerald-400 font-bold" : "text-white/70 group-hover/feat:text-white/90"
              )}>
                <span className="text-[9px]">{getCleanName(feature, String(index))}</span>
                {showNotes && feature.note && (
                  <span className="text-[8px] opacity-40 italic truncate max-w-[80px]">
                    - {feature.note}
                  </span>
                )}
                {showQr && (getParsedMetadata(feature).qr || getParsedMetadata(feature).ma_qr) && (
                  <span className="text-[7px] bg-emerald-500/20 px-1 rounded text-emerald-400 font-mono uppercase">
                    QR
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-1 transition-opacity",
          !visible ? "opacity-100" : "opacity-0 group-hover/feat:opacity-100"
        )}>
          {onToggleVisible && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisible(e); }}
              className={cn(
                "p-0.5 rounded transition-colors",
                visible ? "hover:bg-cad-accent hover:text-black" : "text-cad-accent hover:bg-cad-accent/20"
              )}
              title={visible ? "Ẩn trên bản đồ" : "Hiện trên bản đồ"}
            >
              {visible ? <Eye size={10} /> : <EyeOff size={10} className="opacity-80" />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 hover:bg-red-500 hover:text-white rounded transition-colors"
            title="Xóa Feature"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
});

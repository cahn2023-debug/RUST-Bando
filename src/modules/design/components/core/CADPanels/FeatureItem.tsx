import React from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2 } from "lucide-react";
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
  onSelect: (e: React.MouseEvent) => void;
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
  customAction?: React.ReactNode;
  hovered?: boolean;
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
  customAction,
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
  showCode = true,
}: FeatureItemProps) => {
  return (
    <div className="flex flex-col" data-drag-id={dragId} data-drag-type={dragType}>
      <div
        id={`sidebar-feature-${feature.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(e);
          if (hasChildren) {
            onToggleExpand();
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onZoomTo();
        }}
        className={cn(
          "group/feat relative flex cursor-pointer select-none items-center justify-between rounded-sm px-1 py-1 transition-all",
          selected && "border-r-2 border-r-cad-accent bg-cad-accent/10",
          hovered && !selected && "bg-white/5 ring-1 ring-white/5",
          isDropTarget && "bg-cad-accent/10 ring-1 ring-cad-accent/70"
        )}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
      >
        <div className="relative z-10 flex flex-1 items-center gap-0 overflow-hidden">
          <div className="w-3 shrink-0" />

          <div className="flex min-w-0 flex-1 items-center gap-0.5" style={{ paddingLeft: (level + 1 + levelOffset) * 16 }}>
            <span className="-ml-1 flex w-3 shrink-0 items-center justify-center">
              {hasChildren ? (
                expanded ? <ChevronDown size={12} className="cad-icon-secondary" /> : <ChevronRight size={12} className="cad-icon-secondary" />
              ) : null}
            </span>

            {onToggleCheck && (
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {}}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCheck();
                }}
                className="h-3 w-3 shrink-0 cursor-pointer rounded border-cad-border bg-cad-bg text-cad-accent focus:ring-cad-accent"
              />
            )}

            <div className="flex flex-1 items-center gap-0.5">
              {showCode && (
                <div className="flex w-5 shrink-0 items-center justify-center">
                  <span
                    className={cn(
                      "flex h-3.5 min-w-[12px] shrink-0 items-center justify-center rounded px-0.5 text-[8px] font-bold transition-all",
                      selected ? "bg-cad-accent text-black" : "bg-cad-elevated text-cad-text-secondary"
                    )}
                  >
                    {typeof index === "number" ? index + 1 : index}
                  </span>
                </div>
              )}

              <div className="flex w-5 shrink-0 items-center justify-center">
                <FeatureIcon feature={feature} selected={selected} groupType={groupType} groupName={groupName} />
              </div>

              <span
                className={cn(
                  "flex items-center gap-1 truncate transition-colors",
                  selected ? "font-bold text-cad-active" : "text-cad-text-primary group-hover/feat:text-cad-accent"
                )}
              >
                <span className="text-[9px]">{getCleanName(feature, String(index))}</span>
                {showNotes && feature.note && (
                  <span className="max-w-[80px] truncate text-[8px] italic opacity-40">
                    - {feature.note}
                  </span>
                )}
                {showQr && Boolean(getParsedMetadata(feature).qr || getParsedMetadata(feature).ma_qr) && (
                  <span className="rounded bg-cad-accent/20 px-1 font-mono text-[7px] uppercase text-cad-active">
                    QR
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-1 transition-opacity",
            !visible ? "opacity-100" : "opacity-0 group-hover/feat:opacity-100"
          )}
        >
          {customAction}
          {onToggleVisible && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisible(e);
              }}
              className={cn(
                "rounded p-1 transition-colors",
                visible ? "text-cad-text-secondary hover:bg-cad-accent hover:text-black" : "text-cad-accent hover:bg-cad-accent/20"
              )}
              title={visible ? "Hide on map" : "Show on map"}
            >
              {visible ? <Eye size={12} /> : <EyeOff size={12} className="opacity-80" />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-cad-text-secondary transition-colors hover:bg-red-500 hover:text-white"
            title="Delete feature"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
});

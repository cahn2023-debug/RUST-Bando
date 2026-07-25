import React from "react";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { cn } from "@TOOL/utils/cn";
import { EditableText } from "@DESIGN/components/core/CADPanels/EditableText";

export interface TreeItemProps {
  name: string;
  expanded: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  onRename?: (newName: string) => void;
  visible?: boolean;
  onToggleVisible?: (e: React.MouseEvent) => void;
  customAction?: React.ReactNode;
  level?: number;
  icon?: React.ReactNode;
  className?: string;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  // Drag & Drop
  draggable?: boolean;
  dragType?: string;
  dragId?: string;
  onDragStart?: (e: React.DragEvent, type: string, id: string) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  onToggleCheck?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  hasChildren?: boolean;
  /** Reflected as `aria-selected` on the treeitem row. Optional: leaf/plain rows omit it. */
  selected?: boolean;
}


export const TreeItem = React.memo(({
  name,
  expanded,
  onClick,
  children,
  onRename,
  visible = true,
  onToggleVisible,
  customAction,
  level = 0,
  icon,
  className,
  draggable: _draggable = false,
  dragType,
  dragId,
  onDragStart: _onDragStart,
  onDragEnd: _onDragEnd,
  onDragOver: _onDragOver,
  onDragLeave: _onDragLeave,
  onDrop: _onDrop,
  isDropTarget,
  onDoubleClick,
  onContextMenu,
  checked,
  indeterminate,
  onToggleCheck,
  onMouseDown,
  hasChildren,
  selected
}: TreeItemProps) => {
  const checkboxRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = !!indeterminate;
    }
  }, [indeterminate]);

  // Keyboard equivalent of the row click. Guarded on `currentTarget` so Enter typed
  // inside the rename input (or Space on a nested action button) never toggles the row.
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onClick();
  }, [onClick]);

  return (
    <div
      className="mb-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
      data-drag-id={dragId}
      data-drag-type={dragType}
      role="treeitem"
      aria-expanded={(children || hasChildren) ? expanded : undefined}
      aria-selected={selected}
      aria-level={level + 1}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          "flex items-center justify-between hover:bg-cad-accent/5 px-2 py-1 relative rounded-sm cursor-pointer group transition-all select-none",
          expanded && "bg-cad-accent/[0.02] border-b border-cad-border",
          isDropTarget && "ring-1 ring-cad-accent bg-cad-accent/10",
          className
        )}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-0 flex-1 min-w-0">
          <div className="w-2 shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-40 transition-opacity">
            <GripVertical size={8} aria-hidden="true" className="text-cad-text-primary shrink-0 cursor-grab active:cursor-grabbing" />
          </div>

          <div className="flex-1 flex items-center gap-1.5 min-w-0" style={{ paddingLeft: level * 14 }}>
            <span
              aria-hidden="true"
              className={cn(
                "text-cad-text-secondary text-[8px] transition-transform w-3 font-bold shrink-0 text-center -ml-0.5",
                expanded ? "rotate-0 opacity-80" : "-rotate-90 opacity-50"
              )}
            >
              {(children || hasChildren) ? '▼' : ''}
            </span>

            {onToggleCheck && (
              <input
                ref={checkboxRef}
                type="checkbox"
                checked={checked}
                aria-label={`Chọn ${name}`}
                onChange={() => { }}
                onClick={(e) => { e.stopPropagation(); onToggleCheck(); }}
                className="rounded-sm border-cad-border bg-cad-bg text-cad-accent focus:ring-cad-accent cursor-pointer shrink-0 w-3 h-3"
              />
            )}

            <div className="shrink-0 flex items-center justify-center w-5 scale-90 opacity-80 group-hover:opacity-100 transition-opacity">
              {icon}
            </div>
            {onRename ? (
              <EditableText
                value={name}
                onSave={onRename}
                className={cn(
                  "truncate tracking-tight transition-colors",
                  level === 0 ? "text-[10px] uppercase font-bold text-cad-accent" :
                    level === 1 ? "text-[9.5px] uppercase font-bold text-cad-text-primary" :
                      "text-[9px] font-medium text-cad-text-secondary"
                )}
              />
            ) : (
              <span className={cn(
                "truncate tracking-tight transition-colors select-none",
                level === 0 ? "text-[10px] uppercase font-bold text-cad-accent" :
                  level === 1 ? "text-[9.5px] uppercase font-bold text-cad-text-primary" :
                    "text-[9px] font-medium text-cad-text-secondary"
              )}>
                {name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className={cn(
            "flex items-center gap-1 transition-all duration-200",
            !visible ? "opacity-100" : "opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0"
          )}>
            {customAction}
            {onToggleVisible && (
              <button
                type="button"
                className="text-cad-text-primary/40 hover:text-cad-text-primary p-0.5 transition-colors cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cad-accent"
                onClick={(e) => { e.stopPropagation(); onToggleVisible(e); }}
                title={visible ? "Ẩn" : "Hiện"}
                aria-label={visible ? `Ẩn ${name}` : `Hiện ${name}`}
                aria-pressed={!visible}
              >
                {visible
                  ? <Eye size={10} aria-hidden="true" className="text-cad-accent" />
                  : <EyeOff size={10} aria-hidden="true" className="opacity-80 text-cad-accent" />}
              </button>
            )}
          </div>
        </div>
      </div>
      {expanded && children && (
        <div className="relative">
          {/* Vertical Guide Line */}
          <div
            className="absolute top-0 bottom-0 border-l border-cad-border/20 z-0 pointer-events-none"
            style={{ left: `${14 + level * 16}px` }}
          />
          <div className="relative z-10">
            {children}
          </div>
        </div>
      )}
    </div>
  );
});

import { FileText } from "lucide-react";
import { cn } from "@SHARED/utils/cn";

export function FileItem({ name, onSelect, onContextMenu, isActive, path }: { name: string, type?: 'doc' | 'excel' | 'code' | 'image' | 'pdf', onSelect?: () => void, onContextMenu?: (e: React.MouseEvent) => void, isActive?: boolean, path?: string }) {
  const Icon = FileText;

  return (
    <div
      draggable={!!path}
      onDragStart={(e) => {
        if (path) {
          e.dataTransfer.setData("application/file-path", path);
        }
      }}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(); }}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e);
        }
      }}
      className={cn(
        "flex items-center gap-2 py-1 pl-4 pr-2 hover:bg-cad-elevated rounded-sm cursor-pointer group transition-all",
        isActive && "bg-cad-elevated border-l-2 border-cad-accent"
      )}
    >
      <Icon size={12} className={cn("shrink-0", isActive ? "text-cad-accent" : "text-cad-text-muted")} />
      <span className={cn("text-[11px] cursor-pointer truncate transition-colors w-full uppercase font-medium", isActive ? "text-white" : "text-cad-text-primary")}>{name}</span>
    </div>
  );
}

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";

export function FolderTree({ name, expanded = false, children, onContextMenu }: { name: string, expanded?: boolean, children?: React.ReactNode, onContextMenu?: (e: React.MouseEvent) => void }) {
  const [isOpen, setIsOpen] = useState(expanded);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e);
    }
  };

  return (
    <div className="select-none mb-0">
      <div
        className="flex items-center gap-1.5 py-1 px-1.5 hover:bg-cad-elevated rounded-sm cursor-pointer group transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        onContextMenu={handleContextMenu}
      >
        <div className="text-cad-text-muted shrink-0 w-4 transition-colors flex justify-center mt-0.5">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
        <Folder size={12} className="text-cad-accent shrink-0 opacity-70" />
        <span className="text-[11px] text-cad-text-primary uppercase font-bold truncate transition-colors">{name}</span>
      </div>
      {isOpen && children && (
        <div className="ml-4 pl-1.5 border-l border-cad-border">
          {children}
        </div>
      )}
    </div>
  );
}

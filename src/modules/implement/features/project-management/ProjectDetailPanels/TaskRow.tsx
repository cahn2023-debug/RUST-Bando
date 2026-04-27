import { CheckCircle2, Circle, Folder, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@TOOL/utils/cn";
import { Task } from "@CONTRACT/types";

interface TaskRowProps {
  task: Task;
  index: number;
  onToggle: () => void;
  onSelect: (p: string) => void;
  onDelete: () => void;
}

export function TaskRow({ task, index, onToggle, onSelect, onDelete }: TaskRowProps) {
  const isFolder = task.status === 'folder';
  return (
    <div
      className={cn(
        "flex h-9 border-b border-cad-border text-[11px] items-center cursor-pointer group transition-colors relative",
        isFolder ? "bg-cad-bg/40" : "hover:bg-cad-elevated"
      )}
      onClick={() => task.target_file_path && onSelect(task.target_file_path)}
    >
      <div className="w-8 shrink-0 text-center font-mono text-[9px] text-cad-text-muted border-r border-cad-border h-full flex items-center justify-center">{index + 1}</div>
      <div className="flex-1 flex items-center gap-3 px-3 truncate">
        {!isFolder && (
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="shrink-0 text-cad-text-muted hover:text-cad-accent">
            {task.is_completed ? <CheckCircle2 size={13} className="text-cad-accent" /> : <Circle size={13} />}
          </button>
        )}
        {isFolder && <Folder size={13} className="text-cad-text-muted shrink-0" />}
        <span className={cn("truncate font-bold uppercase tracking-tight", task.is_completed ? "line-through text-cad-text-muted" : "text-cad-text-primary")}>{task.name}</span>
      </div>
      <div className="w-32 shrink-0 text-[9px] font-mono text-cad-text-muted text-center border-l border-cad-border h-full flex items-center justify-center bg-cad-bg/20">
        {task.start_date ? format(new Date(task.start_date), 'MM.dd') : '--'} - {task.end_date ? format(new Date(task.end_date), 'MM.dd') : '--'}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="w-8 shrink-0 flex items-center justify-center text-cad-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity border-l border-cad-border h-full"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

import { FileIcon } from "lucide-react";
import { Task } from "@CONTRACT/types";

interface KanbanViewProps {
  tasks: Task[];
  onUpdateStatus: (id: string, s: string) => void;
  onClick: (path: string) => void;
}

export function KanbanView({ tasks, onUpdateStatus, onClick }: KanbanViewProps) {
  const statuses = ['todo', 'in_progress', 'done'];
  return (
    <div className="flex-1 overflow-x-auto bg-cad-bg p-4 flex gap-4 custom-scrollbar">
      {statuses.map(status => {
        const columnTasks = tasks.filter(t => t.status === status);
        return (
          <div
            key={status}
            className="w-72 shrink-0 flex flex-col bg-cad-surface border border-cad-border rounded-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("taskId");
              if (id) onUpdateStatus(id, status);
            }}
          >
            <div className="p-3 border-b border-cad-border flex items-center justify-between bg-cad-bg/30">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-cad-accent">
                {status.replace('_', ' ')}
              </h4>
              <span className="text-[9px] font-mono bg-cad-elevated px-1.5 py-0.5 rounded text-cad-text-muted">{columnTasks.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 custom-scrollbar">
              {columnTasks.map(t => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("taskId", t.id)}
                  className="bg-cad-bg border border-cad-border p-3 hover:border-cad-accent transition-all cursor-grab active:cursor-grabbing group"
                  onClick={() => t.target_file_path && onClick(t.target_file_path)}
                >
                  <div className="text-[11px] font-bold text-white mb-2 uppercase tracking-tight">{t.name}</div>
                  {t.target_file_path && (
                    <div className="flex items-center gap-1.5 text-[9px] text-cad-accent font-mono">
                      <FileIcon size={10} /> <span className="truncate">{t.target_file_path.split(/[/\\]/).pop()}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

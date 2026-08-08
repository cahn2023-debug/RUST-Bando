import { Folder, FileIcon, Trash2 } from "lucide-react";
import { cn } from "@SHARED/utils/cn";
import { useEffect, useRef, useState } from "react";
import { DeleteConfirmationModal } from "@DESIGN/components/ui/DeleteConfirmationModal";

interface TaskItem {
   id: string;
   name: string;
   status: string;
   parent_id?: string | null;
   target_file_path?: string;
   is_completed?: boolean;
}

interface ProjectTasksSidebarProps {
   tasks: TaskItem[];
   onAdd: (showInput: boolean) => void;
   onAddGroup: () => void;
   onDrop: (e: React.DragEvent, groupId: string | null) => void;
   onSelect: (path: string) => void;
   onDeleteTask: (id: string) => Promise<void>;
   adding: boolean;
   newName: string;
   setNewName: (name: string) => void;
   onSubmit: (e: React.FormEvent) => void;
}

export function ProjectTasksSidebar({
   tasks, onAdd, onAddGroup, onDrop, onSelect, onDeleteTask,
   adding, newName, setNewName, onSubmit
}: ProjectTasksSidebarProps) {
   const newTaskInputRef = useRef<HTMLInputElement>(null);
   const [deleteModalConfig, setDeleteModalConfig] = useState<{ isOpen: boolean; id: string | null; itemName: string; message: string }>({
      isOpen: false,
      id: null,
      itemName: "",
      message: ""
   });
   useEffect(() => {
      if (adding) newTaskInputRef.current?.focus();
   }, [adding]);
   const groups = tasks.filter((t: TaskItem) => t.status === 'folder');
   const unassigned = tasks.filter((t: TaskItem) => t.status !== 'folder' && !t.parent_id);

   return (
      <div className="flex flex-col gap-4">
         <div className="flex justify-between items-center bg-cad-bg/30 p-2 rounded-sm border border-cad-border">
            <span className="text-[10px] font-black text-cad-text-muted uppercase">Structure</span>
            <button onClick={onAddGroup} className="text-[9px] font-black text-cad-accent uppercase hover:underline">+ New Group</button>
         </div>

         <div className="flex flex-col gap-3">
            {[...groups, { id: "unassigned", name: "Unassigned", status: "folder" } as TaskItem].map((g: TaskItem) => {
               const isUnassigned = g.id === "unassigned";
               const groupTasks = isUnassigned ? unassigned : tasks.filter((t: TaskItem) => t.parent_id === g.id);
               return (
                  <div
                     key={g.id}
                     className="bg-cad-bg/50 border border-cad-border p-2 rounded-sm min-h-[50px]"
                     onDragOver={(e) => e.preventDefault()}
                     onDrop={(e) => onDrop(e, isUnassigned ? null : g.id)}
                  >
                     <div className="flex items-center justify-between gap-2 mb-2 group">
                        <div className="flex items-center gap-2">
                           <Folder size={12} className={isUnassigned ? "text-cad-text-muted" : "text-cad-accent"} />
                           <span className="text-[10px] font-black text-white uppercase">{g.name}</span>
                        </div>
                        {!isUnassigned && (
                           <button
                              onClick={() => {
                                 setDeleteModalConfig({
                                    isOpen: true,
                                    id: g.id,
                                    itemName: g.name,
                                    message: "Bạn có chắc chắn muốn xóa nhóm này và tất cả các mục bên trong? Hành động này không thể hoàn tác."
                                 });
                              }}
                              className="text-cad-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                           >
                              <Trash2 size={10} />
                           </button>
                        )}
                     </div>
                     <div className="flex flex-col gap-1">
                        {groupTasks.map((t: TaskItem) => (
                           <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("taskId", t.id)}
                              onClick={() => t.target_file_path && onSelect(t.target_file_path)}
                              className="bg-cad-surface px-2 py-1.5 border border-cad-border hover:border-cad-accent cursor-pointer flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2 overflow-hidden">
                                 <span className={cn("text-[9px] font-bold uppercase truncate", t.is_completed ? "text-cad-text-muted line-through" : "text-white")}>{t.name}</span>
                                 {t.target_file_path && <FileIcon size={10} className="text-cad-accent opacity-50" />}
                              </div>
                              <button
                                 onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteModalConfig({
                                       isOpen: true,
                                       id: t.id,
                                       itemName: t.name,
                                       message: "Bạn có chắc chắn muốn xóa mục này?"
                                    });
                                 }}
                                 className="text-cad-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                 <Trash2 size={10} />
                              </button>
                           </div>
                        ))}
                     </div>
                  </div>
               );
            })}
         </div>

         {adding ? (
            <form onSubmit={onSubmit} className="bg-cad-bg p-3 border border-cad-accent">
               <input ref={newTaskInputRef} value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-cad-surface border border-cad-border p-2 text-[10px] text-white outline-none" placeholder="TASK NAME..." />
               <div className="flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => onAdd(false)} className="text-[9px] font-black text-cad-text-muted hover:text-white uppercase transition-all">Cancel</button>
                  <button type="submit" className="text-[9px] font-black bg-cad-accent text-black px-2 py-1 rounded-sm uppercase transition-all hover:bg-cad-accent/80">Save</button>
               </div>
            </form>
         ) : (
            <button onClick={() => onAdd(true)} className="w-full py-2 border border-cad-border border-dashed text-[10px] font-bold text-cad-text-muted hover:text-cad-accent hover:border-cad-accent transition-all uppercase">
               + NEW TASK
            </button>
         )}
         <DeleteConfirmationModal
            isOpen={deleteModalConfig.isOpen}
            onClose={() => setDeleteModalConfig({ ...deleteModalConfig, isOpen: false })}
            onConfirm={async () => {
               if (deleteModalConfig.id !== null) {
                  await onDeleteTask(deleteModalConfig.id);
                  setDeleteModalConfig({ ...deleteModalConfig, isOpen: false });
               }
            }}
            title="Xác nhận xóa"
            itemName={deleteModalConfig.itemName}
            message={deleteModalConfig.message}
         />
      </div>
   );
}

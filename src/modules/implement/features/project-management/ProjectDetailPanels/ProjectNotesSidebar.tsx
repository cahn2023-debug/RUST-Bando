import { format } from "date-fns";
import { X, FileIcon } from "lucide-react";

export function ProjectNotesSidebar({ notes, onAdd, onDelete, adding, newTitle, setNewTitle, onSubmit }: any) {
   return (
      <div className="flex flex-col gap-4">
         {adding ? (
            <form onSubmit={onSubmit} className="bg-cad-bg p-3 border border-cad-accent">
               {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
               <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-cad-surface border border-cad-border p-2 text-[10px] text-white outline-none" placeholder="NOTE TITLE..." />
               <div className="flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => onAdd(false)} className="text-[9px] font-black text-cad-text-muted hover:text-white uppercase transition-all">Cancel</button>
                  <button type="submit" className="text-[9px] font-black bg-cad-accent text-black px-2 py-1 rounded-sm uppercase transition-all hover:bg-cad-accent/80">Keep</button>
               </div>
            </form>
         ) : (
            <button onClick={() => onAdd(true)} className="w-full py-2 border border-cad-border border-dashed text-[10px] font-bold text-cad-text-muted hover:text-cad-accent hover:border-cad-accent transition-all uppercase">
               + RECORD NOTE
            </button>
         )}

         <div className="flex flex-col gap-2">
            {notes.map((n: any) => (
               <div key={n.id} className="bg-cad-bg/50 border border-cad-border p-3 hover:border-cad-accent transition-all group relative">
                  <button onClick={() => onDelete(n.id)} className="absolute top-2 right-2 text-cad-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={12}/></button>
                  <h4 className="text-[10px] font-black text-white uppercase mb-1">{n.title}</h4>
                  <div className="text-[8px] font-mono text-cad-text-muted uppercase">{format(new Date(n.created_at), 'MM/dd HH:mm')}</div>
                  {n.target_file_path && (
                     <div className="mt-2 text-[9px] font-mono text-cad-accent flex items-center gap-1">
                        <FileIcon size={10} /> {n.target_file_path.split(/[/\\]/).pop()}
                     </div>
                  )}
               </div>
            ))}
         </div>
      </div>
   );
}

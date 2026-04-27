import { Plus, FileText } from "lucide-react";

interface Props {
  x: number;
  y: number;
  text: string;
  onAddTask: (text: string) => void;
  onAddNote: (text: string) => void;
}

export function GlobalContextMenu({ x, y, text, onAddTask, onAddNote }: Props) {
  return (
    <div 
      className="fixed z-[200] bg-cad-surface border border-cad-accent rounded-sm shadow-2xl flex flex-col min-w-[180px] overflow-hidden"
      style={{ top: y, left: x }}
    >
      <button 
        className="px-4 py-2.5 text-left text-[10px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black transition-all flex items-center gap-3 uppercase"
        onClick={() => onAddTask(text)}
      >
        <Plus size={12} /> Add as Task
      </button>
      <div className="h-px bg-cad-border w-full" />
      <button 
        className="px-4 py-2.5 text-left text-[10px] font-black text-cad-text-primary hover:bg-cad-accent hover:text-black transition-all flex items-center gap-3 uppercase"
        onClick={() => onAddNote(text)}
      >
        <FileText size={12} /> Add as Note
      </button>
    </div>
  );
}

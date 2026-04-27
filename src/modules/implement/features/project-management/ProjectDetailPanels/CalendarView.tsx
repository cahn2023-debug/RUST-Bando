import { format, isSameMonth, subMonths, addMonths, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@TOOL/utils/cn";
import { Task } from "@CONTRACT/types";

interface CalendarViewProps {
   days: Date[];
   tasks: Task[];
   month: Date;
   onMonthChange: (d: Date) => void;
   onClick: (path: string) => void;
}

export function CalendarView({ days, tasks, month, onMonthChange, onClick }: CalendarViewProps) {
   return (
      <div className="flex-1 flex flex-col bg-cad-bg p-4 h-full">
         <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
               <button onClick={() => onMonthChange(subMonths(month, 1))} className="p-1 hover:bg-cad-elevated text-white"><ChevronLeft size={16} /></button>
               <h3 className="text-sm font-black text-white uppercase tracking-tighter w-40 text-center">{format(month, "MMMM yyyy")}</h3>
               <button onClick={() => onMonthChange(addMonths(month, 1))} className="p-1 hover:bg-cad-elevated text-white"><ChevronRight size={16} /></button>
            </div>
         </div>
         <div className="flex-1 border border-cad-border bg-cad-surface grid grid-cols-7 overflow-hidden rounded-sm">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
               <div key={day} className="py-2 text-center text-[9px] font-black text-cad-text-muted uppercase border-b border-cad-border bg-cad-bg/50">{day}</div>
            ))}
            {days.map((day, idx) => {
               const currentMonth = isSameMonth(day, month);
               const today = isSameDay(day, new Date());
               const dayTasks = tasks.filter(t => t.start_date && t.end_date && t.status !== 'folder' && new Date(t.start_date) <= day && new Date(t.end_date) >= day);
               return (
                  <div key={idx} className={cn("border-b border-r border-cad-border p-1 min-h-[80px] flex flex-col gap-1 transition-all", !currentMonth && "opacity-20 bg-cad-bg/50", today && "bg-cad-accent/5")}>
                     <div className={cn("text-[9px] font-mono text-right p-1", today ? "text-cad-accent font-bold" : "text-cad-text-muted")}>{format(day, "d")}</div>
                     <div className="flex-1 overflow-y-auto flex flex-col gap-1 no-scrollbar">
                        {dayTasks.map(t => (
                           <div key={t.id} onClick={() => t.target_file_path && onClick(t.target_file_path)} className={cn("text-[8px] px-1.5 py-0.5 rounded-sm truncate font-bold cursor-pointer uppercase tracking-tighter border", t.is_completed ? "bg-cad-elevated text-cad-text-muted line-through" : "bg-cad-accent/10 text-cad-accent border-cad-accent/20 hover:bg-cad-accent/20")}>
                              {t.name}
                           </div>
                        ))}
                     </div>
                  </div>
               );
            })}
         </div>
      </div>
   );
}

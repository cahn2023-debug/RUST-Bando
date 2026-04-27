import { useMemo } from "react";
import { addDays, differenceInDays, eachDayOfInterval, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
import { Globe } from "lucide-react";
import { cn } from "@TOOL/utils/cn";
import { Task, TaskDependency } from "@CONTRACT/types";

interface GanttTimelineProps {
  tasks: Task[];
  dependencies?: TaskDependency[];
  loading?: boolean;
  onUpdateTaskDates?: (task: Task, newStart: string, newEnd: string) => void;
}

export function GanttTimeline({ tasks, dependencies = [], loading = false, onUpdateTaskDates }: GanttTimelineProps) {
  if (loading) {
    return (
      <div className="min-w-fit h-full relative" style={{ width: 14 * 40 }}>
        <div className="sticky top-0 z-20 flex bg-[#252526] border-b border-[#2D2D2D] h-[26px]">
          {[...Array(14)].map((_, i) => <div key={i} className="shrink-0 h-full border-r border-[#2D2D2D]" style={{ width: 40 }} />)}
        </div>
        <div className="relative pt-0 flex flex-col w-full">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="relative h-10 w-full border-b border-[#2D2D2D] flex items-center">
              <div className="absolute h-3 bg-[#333333] rounded-sm animate-pulse" style={{ left: 40 + (i * 20), width: 120 + (i * 10) }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const timelineData = useMemo(() => {
    if (tasks.length === 0) return null;
    let minDate = new Date();
    let maxDate = new Date();
    tasks.forEach((t, i) => {
      if (t.start_date) {
        const d = new Date(t.start_date);
        if (i === 0 || d < minDate) minDate = d;
      }
      if (t.end_date) {
        const d = new Date(t.end_date);
        if (i === 0 || d > maxDate) maxDate = d;
      }
    });

    const start = addDays(startOfWeek(minDate), -7);
    const end = addDays(endOfWeek(maxDate), 14);
    const days = eachDayOfInterval({ start, end });
    return { start, end, days };
  }, [tasks]);

  if (!timelineData) {
    return <div className="h-full flex flex-col items-center justify-center opacity-70">
      <div className="w-10 h-10 rounded-full bg-[#333333] flex-center mb-3">
        <Globe size={20} className="text-[#888888]" />
      </div>
      <p className="text-[#CCCCCC] font-bold text-xs">Gantt View Unavailable</p>
      <p className="text-[#888888] text-[10px] mt-1">Add tasks with start/end dates.</p>
    </div>;
  }

  const { start: timelineStart, days } = timelineData;
  const DAY_WIDTH = 40;

  return (
    <div className="min-w-fit h-full relative" style={{ width: days.length * DAY_WIDTH }}>
      <div className="sticky top-0 z-20 flex bg-[#252526] border-b border-[#2D2D2D] h-[26px]">
        {days.map((day, idx) => {
          const isToday = isSameDay(day, new Date());
          return (
            <div key={idx} className={cn("shrink-0 h-full border-r border-[#2D2D2D] flex items-center justify-center relative", isToday && "bg-[#007ACC]/20")} style={{ width: DAY_WIDTH }}>
              <span className={cn("text-[9px] font-mono", isToday ? "font-bold text-[#007ACC]" : "text-[#888888]")}>
                {format(day, 'd')}
              </span>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0 top-[26px] flex pointer-events-none">
        {days.map((day, idx) => (
          <div key={idx} className={cn("shrink-0 border-r h-full", isSameDay(day, new Date()) ? "border-[#007ACC]/30 bg-[#007ACC]/5" : "border-[#2D2D2D]")} style={{ width: DAY_WIDTH }} />
        ))}
      </div>

      <div className="relative pt-0 flex flex-col w-full">
        {tasks.map((task) => {
          return (
            <div
              key={task.id}
              className="relative h-10 w-full border-b border-[#2D2D2D] flex items-center hover:bg-[#2A2D2E]"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("gantt-task")) {
                  e.preventDefault(); // allow drop
                }
              }}
              onDrop={(e) => {
                if (!onUpdateTaskDates || task.status === 'folder') return;
                const data = e.dataTransfer.getData("gantt-task");
                if (!data) return;
                const { id, duration, offsetX } = JSON.parse(data);
                if (id !== task.id) return; // Only allow dropping on its own row for now

                const rect = e.currentTarget.getBoundingClientRect();
                const dropX = e.clientX - rect.left - offsetX;

                let dayIdx = Math.floor(dropX / DAY_WIDTH);
                if (dayIdx < 0) dayIdx = 0;
                if (dayIdx >= days.length) dayIdx = days.length - 1;

                const newStart = new Date(days[dayIdx]);
                // duration already includes the +1 day logic, so subtract 1 for the end date calculation
                const newEnd = addDays(newStart, duration - 1);

                onUpdateTaskDates(task, newStart.toISOString(), newEnd.toISOString());
              }}
            >
              {task.start_date && task.end_date && (() => {
                const tStart = new Date(task.start_date);
                const tEnd = new Date(task.end_date);
                const offsetDays = differenceInDays(tStart, timelineStart);
                const durationDays = differenceInDays(tEnd, tStart) + 1;
                const left = offsetDays * DAY_WIDTH;
                const width = Math.max(durationDays * DAY_WIDTH, DAY_WIDTH / 2);

                return (
                  <div
                    draggable={task.status !== 'folder'}
                    onDragStart={(evt) => {
                      if (task.status === 'folder') return;
                      const rect = evt.currentTarget.getBoundingClientRect();
                      const offsetX = evt.clientX - rect.left;
                      evt.dataTransfer.setData("gantt-task", JSON.stringify({
                        id: task.id,
                        duration: durationDays,
                        offsetX: offsetX
                      }));
                    }}
                    className={cn("absolute h-[18px] rounded-sm cursor-pointer overflow-hidden border border-[rgba(255,255,255,0.1)] flex items-center transition-all", task.is_completed ? "opacity-30 grayscale hover:opacity-50" : "hover:brightness-110 z-10", task.status === 'folder' ? "bg-transparent border border-[#888888] text-[#888888] pointer-events-none" : "bg-[#007ACC] cursor-grab active:cursor-grabbing")}
                    style={{
                      left: `${left + 4}px`,
                      width: `${width - 8}px`,
                      background: task.status === 'folder' ? 'transparent' : (task.is_completed ? '#4CAF50' : '#007ACC')
                    }}
                  >
                    <span className="px-1.5 block truncate text-[9px] font-semibold flex-1" style={{ color: task.status === 'folder' ? '#CCCCCC' : 'white' }}>{task.name}</span>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <svg className="absolute top-[26px] left-0 pointer-events-none z-10" style={{ width: days.length * DAY_WIDTH, height: Math.max(tasks.length * 40, 100) }}>
        {dependencies.map(dep => {
          const fromIdx = tasks.findIndex(t => t.id === dep.from_task_id);
          const toIdx = tasks.findIndex(t => t.id === dep.to_task_id);
          if (fromIdx === -1 || toIdx === -1) return null;

          const fromTask = tasks[fromIdx];
          const toTask = tasks[toIdx];
          if (!fromTask.end_date || !toTask.start_date) return null;

          const fromEnd = new Date(fromTask.end_date);
          const toStart = new Date(toTask.start_date);

          const fromOffsetX = (differenceInDays(fromEnd, timelineStart) + 1) * DAY_WIDTH;
          const toOffsetX = differenceInDays(toStart, timelineStart) * DAY_WIDTH;

          const fromY = fromIdx * 40 + 20;
          const toY = toIdx * 40 + 20;

          const path = `M ${fromOffsetX} ${fromY} C ${fromOffsetX + 15} ${fromY}, ${toOffsetX - 15} ${toY}, ${toOffsetX} ${toY}`;

          return (
            <g key={dep.id}>
              <path d={path} fill="none" stroke="#007ACC" strokeWidth="1.5" strokeOpacity="0.5" />
              <polygon points={`${toOffsetX},${toY} ${toOffsetX - 5},${toY - 4} ${toOffsetX - 5},${toY + 4}`} fill="#007ACC" fillOpacity="0.8" />
            </g>
          );
        })}
      </svg>

      <div className="absolute top-[26px] bottom-0 w-px bg-[#007ACC] z-10 pointer-events-none" style={{ left: `${differenceInDays(new Date(), timelineStart) * DAY_WIDTH + (DAY_WIDTH / 2)}px` }} />
    </div>
  );
}

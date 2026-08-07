import { cn } from "@TOOL/utils/cn";

export interface KeytipBadgeProps {
  label: string;
  visible?: boolean;
  className?: string;
}

export function KeytipBadge({ label, visible = true, className }: KeytipBadgeProps) {
  if (!visible) return null;

  return (
    <span
      className={cn(
        "pointer-events-none select-none z-[9999] inline-flex items-center justify-center font-extrabold text-[10px] text-black bg-amber-400 border border-amber-500 rounded px-1 min-w-[16px] h-4 shadow-[0_2px_4px_rgba(0,0,0,0.4)] animate-in fade-in zoom-in-75 duration-75 uppercase tracking-tight",
        className
      )}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

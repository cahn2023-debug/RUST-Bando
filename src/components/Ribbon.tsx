import { Layout, FileText, Briefcase, Activity, Settings, Save, RefreshCw, Layers } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RibbonProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Ribbon({ activeTab, onTabChange }: RibbonProps) {
  const tabs = [
    { id: "HOME", label: "HOME", icon: Layout },
    { id: "DESIGN", label: "DESIGN", icon: FileText },
    { id: "IMPLEMENT", label: "IMPLEMENT", icon: Briefcase },
    { id: "OPERATE", label: "OPERATE", icon: Activity },
  ];

  return (
    <div className="flex flex-col bg-cad-surface border-b border-cad-border shrink-0 select-none">
      {/* Tab Bar */}
      <div className="flex px-4 pt-1 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-6 py-1.5 text-[11px] font-bold tracking-tight rounded-t-sm transition-colors relative font-display",
              activeTab === tab.id
                ? "bg-cad-elevated text-cad-accent border-x border-t border-cad-border"
                : "text-cad-text-secondary hover:text-cad-text-primary hover:bg-cad-elevated/50"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-cad-elevated" />
            )}
          </button>
        ))}
      </div>

      {/* Tool Groups (Simplified for Design mode) */}
      <div className="h-[80px] bg-cad-elevated flex items-center px-6 gap-8 border-t border-cad-border">
        <ToolGroup label="FILE SYSTEM">
          <ToolButton icon={Save} label="SAVE" />
          <ToolButton icon={RefreshCw} label="SYNC" />
        </ToolGroup>

        <div className="w-[1px] h-10 bg-cad-border self-center" />

        <ToolGroup label="LAYERS & VIEWS">
          <ToolButton icon={Layers} label="LAYERS" />
          <ToolButton icon={Settings} label="CONFIG" />
        </ToolGroup>

        {/* Dynamic Tools can be added here based on activeTab */}
      </div>
    </div>
  );
}

function ToolGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex gap-4">{children}</div>
      <span className="text-[9px] font-mono text-cad-text-muted tracking-widest">{label}</span>
    </div>
  );
}

function ToolButton({ icon: Icon, label, active }: { icon: any; label: string; active?: boolean }) {
  return (
    <button className={cn(
      "flex flex-col items-center gap-1 group transition-all",
      active ? "text-cad-accent" : "text-cad-text-primary hover:text-cad-accent"
    )}>
      <div className={cn(
        "p-2 rounded group-hover:bg-cad-surface transition-colors",
        active && "bg-cad-surface border border-cad-border"
      )}>
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <span className="text-[9px] font-mono font-bold leading-none">{label}</span>
    </button>
  );
}

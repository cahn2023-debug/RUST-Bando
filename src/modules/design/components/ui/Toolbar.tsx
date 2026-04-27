import React from 'react';
import { ListTodo, Columns, CalendarDays, Plus, Settings, Layers, Eye } from 'lucide-react';
import { useLayoutStore } from '@IMPLEMENT/stores/useLayoutStore';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ToolbarProps {
  activeTab: string;
  viewMode: 'tasks' | 'kanban' | 'calendar';
  setViewMode: (v: 'tasks' | 'kanban' | 'calendar') => void;
  onAddTask?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ activeTab, viewMode, setViewMode, onAddTask }) => {
  const togglePalette = useLayoutStore((state: { togglePalette: (id: string) => void }) => state.togglePalette);

  if (activeTab === 'CONTRACT' || activeTab === 'DESIGN') return null;

  return (
    <div className={`h-14 bg-cad-surface border-b border-cad-border flex justify-between items-center px-4 gap-2 z-[100] relative shadow-sm`}>

      {/* Left side: View Toggle or Design Tools */}
      <div className="flex items-center gap-3">
        {activeTab === 'IMPLEMENT' && (
          <div className="flex items-center gap-2">
            <ViewToggle current={viewMode} onChange={setViewMode} />
            {onAddTask && (
              <>
                <div className="w-[1px] h-5 bg-cad-border mx-1"></div>
                <button onClick={onAddTask} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white bg-cad-accent/10 border border-cad-accent/30 hover:bg-cad-accent hover:text-black rounded-lg transition-all shadow-sm group">
                  <Plus size={12} className="group-hover:scale-110 transition-transform" />
                  <span className="uppercase tracking-widest">ADD TASK</span>
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'DESIGN' && <DesignToolbarTools togglePalette={togglePalette} />}
      </div>
    </div>
  );
};

function ToolbarButton({ active, onClick, icon: Icon, label, tooltip, activeColorClass = "text-cad-accent border-cad-accent/30 bg-cad-accent/10" }: {
  active?: boolean;
  onClick?: () => void;
  icon: React.ElementType;
  label?: string;
  tooltip?: string;
  activeColorClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold border rounded-lg transition-all uppercase tracking-widest group",
        active ? activeColorClass : "text-cad-text-muted border-cad-border hover:text-cad-text-secondary"
      )}
      title={tooltip}
    >
      <Icon size={14} />
      {label && <span>{label}</span>}
    </button>
  );
}

function DesignToolbarTools({ togglePalette }: { togglePalette: (id: string) => void }) {
  const { showFeatureGroups, setShowFeatureGroups, showDORILayers, setShowDORILayers } = useDesignSync();

  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] font-black text-cad-text-muted uppercase tracking-[0.2em] px-2 py-1 rounded bg-white/5 border border-white/5 mr-2">
        Design Mode
      </div>

      <ToolbarButton
        active={showFeatureGroups}
        onClick={() => setShowFeatureGroups(!showFeatureGroups)}
        icon={Layers}
        label="Gom nhóm"
        tooltip={showFeatureGroups ? "Tắt gom nhóm (Show all)" : "Bật gom nhóm (Cluster)"}
      />

      <ToolbarButton
        active={showDORILayers}
        onClick={() => setShowDORILayers(!showDORILayers)}
        icon={Eye}
        label="DORI"
        tooltip={showDORILayers ? "Ẩn vùng phủ camera" : "Hiện vùng phủ camera"}
        activeColorClass="text-orange-400 border-orange-400/30 bg-orange-400/10"
      />

      <div className="w-[1px] h-5 bg-cad-border mx-1"></div>

      <button
        onClick={() => togglePalette('system-config')}
        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-cad-accent hover:bg-cad-accent hover:text-black border border-cad-accent/30 rounded-lg transition-all uppercase tracking-widest group"
      >
        <Settings size={14} className="group-hover:rotate-90 transition-transform duration-500" />
        <span>System Config</span>
      </button>
    </div>
  );
}

function ViewToggle({ current, onChange }: { current: string, onChange: (v: string) => void }) {
  const modes = [
    { id: 'tasks', label: 'Timeline', icon: <ListTodo size={12} /> },
    { id: 'kanban', label: 'Board', icon: <Columns size={12} /> },
    { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={12} /> }
  ];
  return (
    <div className="flex bg-[#0f1115] p-1 rounded-xl border border-cad-border shadow-inner">
      {modes.map(m => {
        const isActive = current === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-[10px] font-black rounded-lg transition-all duration-300 uppercase tracking-widest",
              isActive
                ? "bg-cad-surface text-white shadow-md border border-cad-border/50"
                : "text-cad-text-muted hover:text-cad-text-secondary hover:bg-white/5 transparent border border-transparent"
            )}
          >
            {m.icon}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

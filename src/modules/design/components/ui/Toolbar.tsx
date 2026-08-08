import React from 'react';
import { ListTodo, Columns, CalendarDays, Plus, Settings, Layers, Eye } from 'lucide-react';
import { useLayoutStore } from '@CORE/stores/useLayoutStore';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { Button } from '@DESIGN/components/ui/Button';
import { cn } from '@SHARED/utils/cn';

interface ToolbarProps {
  activeTab: string;
  viewMode: ViewToggleMode;
  setViewMode: (v: ViewToggleMode) => void;
  onAddTask?: () => void;
}

type ViewToggleMode = 'tasks' | 'kanban' | 'calendar';

export const Toolbar: React.FC<ToolbarProps> = ({ activeTab, viewMode, setViewMode, onAddTask }) => {
  const togglePalette = useLayoutStore((state: { togglePalette: (id: string) => void }) => state.togglePalette);

  if (activeTab === 'CONTRACT' || activeTab === 'DESIGN') return null;

  return (
    <div className={`h-10 bg-cad-surface border-b border-cad-border flex justify-between items-center px-4 gap-2 z-cad-panel relative shadow-sm`}>

      {/* Left side: View Toggle or Design Tools */}
      <div className="flex items-center gap-3">
        {activeTab === 'IMPLEMENT' && (
          <div className="flex items-center gap-2">
            <ViewToggle current={viewMode} onChange={setViewMode} />
            {onAddTask && (
              <>
                <div className="w-[1px] h-5 bg-cad-border mx-1"></div>
                <Button
                  onClick={onAddTask}
                  variant="accent"
                  size="sm"
                  icon={Plus}
                  className="px-3 py-1.5 rounded-lg shadow-sm uppercase tracking-widest hover:bg-cad-accent hover:text-black"
                >
                  ADD TASK
                </Button>
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
      <div className="text-[10px] font-black text-cad-text-muted uppercase tracking-[0.2em] px-2 py-1 rounded bg-cad-elevated border border-cad-border mr-2">
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
        activeColorClass="text-cad-accent border-cad-accent/30 bg-cad-accent/10"
      />

      <div className="w-[1px] h-5 bg-cad-border mx-1"></div>

      <button
        onClick={() => togglePalette('system-config')}
        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-cad-accent hover:bg-cad-accent hover:text-black border border-cad-accent/30 rounded-lg transition-all uppercase tracking-widest group"
      >
        <Settings size={14} className="group-hover:rotate-90 transition-transform duration-200" />
        <span>System Config</span>
      </button>
    </div>
  );
}

function ViewToggle({ current, onChange }: { current: ViewToggleMode, onChange: (v: ViewToggleMode) => void }) {
  const modes: Array<{ id: ViewToggleMode; label: string; icon: React.ReactNode }> = [
    { id: 'tasks', label: 'Timeline', icon: <ListTodo size={12} /> },
    { id: 'kanban', label: 'Board', icon: <Columns size={12} /> },
    { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={12} /> }
  ];
  return (
    <div className="flex bg-cad-bg p-1 rounded-xl border border-cad-border shadow-inner">
      {modes.map(m => {
        const isActive = current === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-[10px] font-black rounded-lg transition-all duration-200 uppercase tracking-widest",
              isActive
                ? "bg-cad-surface text-cad-text-primary shadow-md border border-cad-border/50"
                : "text-cad-text-muted hover:text-cad-text-secondary hover:bg-cad-text-primary/5 transparent border border-transparent"
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

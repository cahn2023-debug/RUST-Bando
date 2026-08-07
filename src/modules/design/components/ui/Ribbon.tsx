import { useState, useEffect, useRef, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Layout, FileText, Briefcase, Activity, Layers, ShieldCheck, BarChart3 } from "lucide-react";

import { Project } from "@CONTRACT/types";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import { useSettingsStore } from "@IMPLEMENT/stores/useSettingsStore";
import { useLayoutStore } from "@IMPLEMENT/stores/useLayoutStore";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";
import { safeInvoke } from "@IMPLEMENT/lib/tauri";
import { ImportDialog } from "@IMPLEMENT/features/files/ImportDialog";
import { ReportExportDialog } from "@DESIGN/features/reports/word/ReportExportDialog";
import { HomeRibbonTools, DesignRibbonTools, ContractRibbonTools } from "./RibbonTabContent";
import { useRibbonActions } from "@IMPLEMENT/hooks/useRibbonActions";
import { useClickOutside } from "@IMPLEMENT/hooks/useClickOutside";
import { cn } from "@TOOL/utils/cn";
import { exportProjectData } from "@IMPLEMENT/services/exportService";
import { announce, moveFocus } from "@TOOL/utils/accessibility";

import { KeytipBadge } from "./KeytipBadge";

interface RibbonProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  project?: Project | null;
  onForceSave?: () => void;
  contractType?: 'INVESTOR' | 'SUBCONTRACTOR' | 'FINANCE';
  onContractTypeChange?: (type: 'INVESTOR' | 'SUBCONTRACTOR' | 'FINANCE') => void;
  keytipsActive?: boolean;
}

export function Ribbon({ activeTab, onTabChange, project, onForceSave, contractType, onContractTypeChange, keytipsActive = false }: RibbonProps) {
  const { t } = useTranslation();
  const undo = useDesignSync(s => s.undo);
  const redo = useDesignSync(s => s.redo);
  const isCoordinatePanelOpen = useDesignSync(s => s.isCoordinatePanelOpen);
  const toggleCoordinatePanel = useDesignSync(s => s.toggleCoordinatePanel);
  const drawingMode = useDesignSync(s => s.drawingMode);
  const setDrawingMode = useDesignSync(s => s.setDrawingMode);
  const selectedGroupId = useDesignSync(s => s.selectedGroupId);
  const setAnyDialogOpen = useDesignSync(s => s.setAnyDialogOpen);

  const { enableAi, setEnableAi } = useSettingsStore();
  const [aiStatusLabel, setAiStatusLabel] = useState("AI OFF");
  const { togglePalette, activePaletteId } = useLayoutStore();
  const { openStandaloneWindow, onReleaseAiMemory } = useRibbonActions(project);

  const { user } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [showSystemConfig, setShowSystemConfig] = useState(false);
  const systemConfigRef = useRef<HTMLDivElement>(null);

  useClickOutside(systemConfigRef, () => setShowSystemConfig(false), showSystemConfig);

  useEffect(() => {
    setAnyDialogOpen(isImportOpen || isReportOpen);
  }, [isImportOpen, isReportOpen, setAnyDialogOpen]);

  useEffect(() => {
    const checkRole = async () => {
      if (user?.email) {
        try {
          const config = await safeInvoke<any>('get_app_config');
          if (config?.admins && config.admins[user.email] === 'Admin') {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        } catch (e) {
          console.error("Failed to check admin role:", e);
        }
      }
    };
    checkRole();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await safeInvoke<any>('get_ai_status');
        if (cancelled) return;
        const label = !status?.enabled
          ? "AI OFF"
          : status?.downloading
            ? "DOWNLOADING"
            : status?.local_ready
              ? "LOCAL READY"
              : status?.cloud_ready
                ? "CLOUD READY"
                : "MODEL REQUIRED";
        setAiStatusLabel(label);
      } catch (error) {
        if (!cancelled) {
          setAiStatusLabel(enableAi ? "MODEL REQUIRED" : "AI OFF");
        }
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enableAi]);

  const tabs = [
    { id: "HOME", label: t('project.newProject'), icon: Layout, keytip: "H" },
    { id: "DESIGN", label: t('project.design'), icon: FileText, keytip: "D" },
    { id: "IMPLEMENT", label: t('project.operate'), icon: Briefcase, keytip: "I" },
    { id: "CONTRACT", label: t('project.contracts'), icon: Activity, keytip: "C" },
    { id: "RESOURCES", label: t('project.resources'), icon: Layers, keytip: "R" },
    { id: "ANALYTICS", label: "ANALYTICS", icon: BarChart3, keytip: "Y" },
  ];

  if (isAdmin) {
    tabs.push({ id: "ADMIN", label: "ADMIN", icon: ShieldCheck, keytip: "A" });
  }

  /** Keyboard navigation for ribbon tabs — arrow keys move between tabs. */
  const handleTabKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const currentButton = e.currentTarget;
    const tabBar = currentButton.parentElement;
    if (!tabBar) return;

    switch (e.key) {
      case "ArrowRight": {
        e.preventDefault();
        const next = moveFocus(currentButton, "next", tabBar);
        if (next) next.click();
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        const prev = moveFocus(currentButton, "previous", tabBar);
        if (prev) prev.click();
        break;
      }
      case "Home": {
        e.preventDefault();
        const first = moveFocus(currentButton, "first", tabBar);
        if (first) first.click();
        break;
      }
      case "End": {
        e.preventDefault();
        const last = moveFocus(currentButton, "last", tabBar);
        if (last) last.click();
        break;
      }
    }
  };

  return (
    <div
      role="navigation"
      aria-label="Ribbon navigation"
      className="flex flex-col bg-cad-surface border-b border-cad-border shrink-0 select-none"
    >
      <div
        role="tablist"
        aria-label="Ribbon tabs"
        className="flex items-end gap-1 px-4 pt-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => {
              onTabChange(tab.id);
              announce(`Switched to ${tab.label} tab`);
            }}
            onKeyDown={handleTabKeyDown}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 rounded-t-sm px-5 text-[10px] font-black uppercase tracking-[0.16em] transition-colors font-display",
              activeTab === tab.id
                ? "border-x border-t border-cad-border bg-cad-elevated text-cad-accent"
                : "text-cad-text-secondary hover:bg-cad-elevated/50 hover:text-cad-text-primary"
            )}
          >
            <div className="flex items-center gap-2">
              <tab.icon
                size={14}
                className={cn(
                  "shrink-0 transition-colors",
                  activeTab === tab.id ? "text-cad-accent" : "text-cad-text-muted"
                )}
                aria-hidden="true"
              />
              {tab.label}
              {keytipsActive && (
                <div className="absolute -bottom-2.5 right-2">
                  <KeytipBadge label={tab.keytip} />
                </div>
              )}
            </div>
            {activeTab === tab.id && <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-cad-elevated" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div
        role="toolbar"
        aria-label={`${activeTab} tools`}
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="flex h-[80px] items-center gap-8 overflow-x-auto border-t border-cad-border bg-cad-elevated px-6 no-scrollbar"
      >
        {activeTab === 'ADMIN' ? (
          <div className="flex items-center gap-6 animate-in slide-in-from-left duration-300">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-cad-accent uppercase tracking-[0.2em] mb-1">{t('settings.settings')}</span>
              <span className="text-[9px] font-bold text-cad-text-muted uppercase">{t('project.projectSettings')}</span>
            </div>
            <div className="h-8 w-[1px] bg-cad-border" />
            <div className="flex items-center gap-2 rounded-md border border-cad-accent/10 bg-cad-accent/5 px-3 py-1.5">
              <ShieldCheck size={14} className="cad-icon-accent" />
              <span className="text-[10px] font-bold text-white uppercase italic">{t('settings.general')}</span>
            </div>
          </div>
        ) : activeTab === 'HOME' || activeTab === 'IMPLEMENT' || activeTab === 'RESOURCES' ? (
          <HomeRibbonTools
            enableAi={enableAi}
            aiStatusLabel={aiStatusLabel}
            setEnableAi={setEnableAi}
            onReleaseAiMemory={onReleaseAiMemory}
            onForceSave={onForceSave}
            togglePalette={togglePalette}
            activePaletteId={activePaletteId}
          />
        ) : activeTab === 'DESIGN' ? (
          <DesignRibbonTools
            enableAi={enableAi} aiStatusLabel={aiStatusLabel} setEnableAi={setEnableAi} onReleaseAiMemory={onReleaseAiMemory}
            onForceSave={onForceSave}
            onImport={() => setIsImportOpen(true)}
            undo={undo} redo={redo}
            showSystemConfig={showSystemConfig} setShowSystemConfig={setShowSystemConfig} systemConfigRef={systemConfigRef}
            togglePalette={togglePalette} activePaletteId={activePaletteId}
            drawingMode={drawingMode} setDrawingMode={setDrawingMode} selectedGroupId={selectedGroupId}
            toggleCoordinatePanel={toggleCoordinatePanel} isCoordinatePanelOpen={isCoordinatePanelOpen}
            onOpenStandalone={openStandaloneWindow}
            onOpenReport={() => setIsReportOpen(true)}
            onExport={async () => {
              const { state } = useDesignSync.getState();
              if (state) {
                await exportProjectData(state, project?.name || 'Project', project || undefined);
              }
            }}
          />
        ) : activeTab === 'CONTRACT' ? (
          <ContractRibbonTools
            enableAi={enableAi} aiStatusLabel={aiStatusLabel} setEnableAi={setEnableAi} onReleaseAiMemory={onReleaseAiMemory}
            contractType={contractType} onContractTypeChange={onContractTypeChange}
            togglePalette={togglePalette}
            activePaletteId={activePaletteId}
          />
        ) : null}
      </div>

      {isImportOpen && (
        <ImportDialog
          project={project}
          onClose={() => setIsImportOpen(false)}
          onSuccess={(id) => console.log("Imported dataset:", id)}
        />
      )}

      {isReportOpen && (
        <ReportExportDialog
          projectName={project?.name || "Project"}
          onClose={() => setIsReportOpen(false)}
        />
      )}
    </div>
  );
}

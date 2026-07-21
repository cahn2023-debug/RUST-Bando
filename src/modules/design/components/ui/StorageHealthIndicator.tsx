import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw, Zap } from "lucide-react";
import { useDesignSync } from "@IMPLEMENT/stores/useDesignSync";
import {
  getProjectStorageHealth,
  optimizeProjectStorage,
  ProjectStorageHealth,
  ProjectStorageOptimizationResult,
  STORAGE_HEALTH_REFRESH_EVENT,
} from "@IMPLEMENT/services/projectStorageService";

const DB_WARN_BYTES = 100 * 1024 * 1024;
const WAL_WARN_BYTES = 16 * 1024 * 1024;
const FREELIST_WARN_BYTES = 16 * 1024 * 1024;

const formatBytes = (bytes?: number | null) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

const needsOptimization = (health: ProjectStorageHealth | null) => {
  if (!health) return false;
  return (
    health.integrityStatus !== "ok" ||
    health.databaseSizeBytes > DB_WARN_BYTES ||
    health.walSizeBytes > WAL_WARN_BYTES ||
    health.freelistBytes > FREELIST_WARN_BYTES ||
    health.largeEventCount > 0 ||
    health.legacyMediaRefCount > 0
  );
};

export function StorageHealthIndicator() {
  const projectId = useDesignSync((s) => s.projectId);
  const projectPath = useDesignSync((s) => s.projectPath);
  const initialize = useDesignSync((s) => s.initialize);
  const [health, setHealth] = useState<ProjectStorageHealth | null>(null);
  const [lastOptimization, setLastOptimization] = useState<ProjectStorageOptimizationResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setHealth(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const next = await getProjectStorageHealth(String(projectId));
      setHealth(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleRefresh = () => {
      void refresh();
    };
    window.addEventListener(STORAGE_HEALTH_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(STORAGE_HEALTH_REFRESH_EVENT, handleRefresh);
  }, [refresh]);

  const warning = needsOptimization(health);
  const totalBytes = (health?.databaseSizeBytes || 0) + (health?.walSizeBytes || 0);
  const topTables = useMemo(
    () => [...(health?.tableSizes || [])].sort((a, b) => b.bytes - a.bytes).slice(0, 5),
    [health?.tableSizes]
  );

  const handleOptimize = async () => {
    if (!projectId || isOptimizing) return;
    setIsOptimizing(true);
    setError(null);
    try {
      const result = await optimizeProjectStorage(String(projectId));
      setLastOptimization(result);
      const next = await getProjectStorageHealth(String(projectId));
      setHealth(next);
      await initialize(String(projectId), projectPath ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsOptimizing(false);
    }
  };

  if (!projectId) return null;

  return (
    <div className="relative">
      <button
        className="cad-icon-button relative"
        title="Storage Health"
        onClick={() => setIsOpen((value) => !value)}
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
        {warning && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cad-warn" />}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-9 z-[2300] w-[340px] border border-cad-border bg-cad-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-cad-border px-3 py-2">
            <div className="flex items-center gap-2">
              {warning ? <AlertTriangle size={15} className="text-cad-warn" /> : <CheckCircle2 size={15} className="text-cad-accent" />}
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-cad-text-primary">
                Storage Health
              </span>
            </div>
            <button className="cad-icon-button h-6 w-6" title="Refresh" onClick={() => void refresh()}>
              <RefreshCw size={13} />
            </button>
          </div>

          <div className="space-y-2 p-3 text-[11px] text-cad-text-secondary">
            <div className="grid grid-cols-2 gap-2">
              <Metric label=".pmp" value={formatBytes(health?.databaseSizeBytes)} />
              <Metric label="WAL" value={formatBytes(health?.walSizeBytes)} warn={(health?.walSizeBytes || 0) > WAL_WARN_BYTES} />
              <Metric label="Free" value={formatBytes(health?.freelistBytes)} warn={(health?.freelistBytes || 0) > FREELIST_WARN_BYTES} />
              <Metric label="Media" value={formatBytes(health?.mediaAssetsSizeBytes)} />
              <Metric label="Snapshot" value={formatBytes(health?.snapshotBytes)} />
              <Metric label="Events" value={formatBytes(health?.eventPayloadBytes)} />
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-cad-border pt-2">
              <Metric label="Features" value={String(health?.featureCount ?? 0)} />
              <Metric label="Assets" value={String(health?.mediaAssetCount ?? 0)} />
              <Metric label="Legacy" value={String(health?.legacyMediaRefCount ?? 0)} warn={(health?.legacyMediaRefCount || 0) > 0} />
            </div>

            <div className="border-t border-cad-border pt-2">
              <div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.12em] text-cad-text-muted">
                <span>Tables</span>
                <span>{formatBytes(totalBytes)}</span>
              </div>
              <div className="space-y-1">
                {topTables.map((table) => (
                  <div key={table.name} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                    <span className="truncate text-cad-text-secondary">{table.name}</span>
                    <span className="shrink-0 text-cad-text-primary">{formatBytes(table.bytes)}</span>
                  </div>
                ))}
              </div>
            </div>

            {lastOptimization && (
              <div className="border-t border-cad-border pt-2 font-mono text-[10px] text-cad-accent">
                Optimized: {formatBytes(lastOptimization.before.databaseSizeBytes)} {'->'} {formatBytes(lastOptimization.after.databaseSizeBytes)}
              </div>
            )}

            {error && (
              <div className="border border-cad-warn/40 bg-cad-warn/10 px-2 py-1 text-[10px] text-cad-warn">
                {error}
              </div>
            )}

            <button
              className="flex h-8 w-full items-center justify-center gap-2 border border-cad-accent/50 bg-cad-accent/10 text-[10px] font-black uppercase tracking-[0.12em] text-cad-accent disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleOptimize()}
              disabled={isOptimizing || health?.integrityStatus !== "ok"}
              title="Optimize Project Storage"
            >
              {isOptimizing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              Optimize Project Storage
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-cad-border bg-cad-bg px-2 py-1">
      <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-cad-text-muted">{label}</div>
      <div className={warn ? "font-mono text-[11px] text-cad-warn" : "font-mono text-[11px] text-cad-text-primary"}>
        {value}
      </div>
    </div>
  );
}

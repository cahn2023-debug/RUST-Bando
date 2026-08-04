export type StartupMilestone =
  | "host-mounted"
  | "container-sized"
  | "constructor-start"
  | "constructor-end"
  | "map-created"
  | "first-render"
  | "first-source-data"
  | "first-raster-tile"
  | "interactive"
  | "overlay-context-ready"
  | "project-bind-start"
  | "first-feature";

interface TelemetryEntry {
  milestone: StartupMilestone;
  timestamp: number;
  elapsedMs: number;
  details?: Record<string, any>;
}

const startupTimings: Map<StartupMilestone, TelemetryEntry> = new Map();
let startTime: number | null = null;

export function markMapStartup(milestone: StartupMilestone, details?: Record<string, any>): void {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (startTime === null || milestone === "host-mounted") {
    startTime = now;
  }
  const elapsedMs = Math.round(now - (startTime || now));

  const entry: TelemetryEntry = {
    milestone,
    timestamp: now,
    elapsedMs,
    details,
  };

  startupTimings.set(milestone, entry);

  if (typeof performance !== "undefined" && performance.mark) {
    try {
      performance.mark(`map-startup:${milestone}`);
    } catch {
      // Ignore performance mark failures
    }
  }

  console.info(`[MapStartup] +${elapsedMs}ms - ${milestone}`, details || "");
}

export function getMapStartupReport(): Record<string, number> {
  const report: Record<string, number> = {};
  startupTimings.forEach((entry, key) => {
    report[key] = entry.elapsedMs;
  });
  return report;
}

export function clearMapStartupTelemetry(): void {
  startupTimings.clear();
  startTime = null;
}

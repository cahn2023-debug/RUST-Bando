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
  | "first-feature"
  | "project-bind-complete";

export interface RAFViolation {
  durationMs: number;
  featureCount: number;
  timestamp: number;
}

export interface StartupReport {
  milestones: Record<StartupMilestone, number>;
  totalStartupTime: number;
  rafViolations: RAFViolation[];
}

interface TelemetryEntry {
  milestone: StartupMilestone;
  timestamp: number;
  elapsedMs: number;
  details?: Record<string, any>;
}

const startupTimings: Map<StartupMilestone, TelemetryEntry> = new Map();
let startTime: number | null = null;

// Module-level RAF violations array
const rafViolations: RAFViolation[] = [];

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

/** Ghi lại RAF frame vượt budget (> 16ms). */
export function recordRAFViolation(durationMs: number, featureCount: number): void {
  rafViolations.push({
    durationMs,
    featureCount,
    timestamp: typeof performance !== "undefined" ? performance.now() : Date.now(),
  });
}

/** Trả về báo cáo đầy đủ startup performance. */
export function getStartupReport(): StartupReport {
  const milestonesObj = {} as Record<StartupMilestone, number>;
  startupTimings.forEach((entry, key) => {
    milestonesObj[key] = entry.elapsedMs;
  });

  const mapCreated = startupTimings.get("map-created")?.elapsedMs ?? 0;
  const firstFeature = startupTimings.get("first-feature")?.elapsedMs ?? 0;

  return {
    milestones: milestonesObj,
    totalStartupTime: firstFeature - mapCreated,
    rafViolations: [...rafViolations],
  };
}

/** Reset toàn bộ telemetry — dùng cho test hoặc project reload. */
export function resetTelemetry(): void {
  startupTimings.clear();
  rafViolations.length = 0;
  startTime = null;
}

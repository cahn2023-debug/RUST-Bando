/**
 * Data colors — the single home for colors that encode DATA MEANING, not UI chrome.
 *
 * These hex values are intentionally theme-independent: a blue fiber strand is blue
 * in light mode and in dark mode, because the color IS the identity of the strand.
 * Changing them changes what the drawing means.
 *
 * Everything else in `src/modules/design` must use the `cad-*` theme tokens.
 * See `design-system/MASTER.md` §2.
 */

/* ------------------------------------------------------------------ *
 * Fiber optics — TIA/EIA-598-C standard strand & buffer tube coloring
 * Order is significant: index 0 = strand/tube #1.
 * ------------------------------------------------------------------ */

export interface FiberColor {
  /** Standard English color name as used in TIA-598-C. */
  name: string;
  hex: string;
  /** Tailwind text class giving readable contrast on top of `hex`. */
  textClass: string;
}

export const TIA_598_COLORS: readonly FiberColor[] = [
  { name: 'Blue', hex: '#2563eb', textClass: 'text-white' },
  { name: 'Orange', hex: '#f97316', textClass: 'text-white' },
  { name: 'Green', hex: '#16a34a', textClass: 'text-white' },
  { name: 'Brown', hex: '#8b5a2b', textClass: 'text-white' },
  { name: 'Slate', hex: '#64748b', textClass: 'text-white' },
  { name: 'White', hex: '#ffffff', textClass: 'text-zinc-950' },
  { name: 'Red', hex: '#dc2626', textClass: 'text-white' },
  { name: 'Black', hex: '#111827', textClass: 'text-white' },
  { name: 'Yellow', hex: '#facc15', textClass: 'text-zinc-950' },
  { name: 'Violet', hex: '#7c3aed', textClass: 'text-white' },
  { name: 'Rose', hex: '#ec4899', textClass: 'text-white' },
  { name: 'Aqua', hex: '#06b6d4', textClass: 'text-zinc-950' },
] as const;

/** Resolve a 1-based strand/tube position to its standard color, wrapping every 12. */
export const fiberColorAt = (position1Based: number): FiberColor =>
  TIA_598_COLORS[(Math.max(1, position1Based) - 1) % TIA_598_COLORS.length];

/* ------------------------------------------------------------------ *
 * Geometry rendering on the map
 * ------------------------------------------------------------------ */

export const GEOMETRY_COLORS = {
  /** Default stroke for lines/polylines when the feature carries no explicit color. */
  defaultLine: '#10b981',
  /** Default fill/stroke for point & polygon features with no explicit color. */
  defaultFeature: '#EF4444',
  /** Selection highlight — must read as "selected" over any underlying data color. */
  selected: '#22d3ee',
  /** Halo drawn around the actively selected feature. */
  selectedHalo: '#c7f9ff',
  /** Measurement / rubber-band drawing guides. */
  measurement: '#facc15',
} as const;

/* ------------------------------------------------------------------ *
 * Camera coverage simulation (DORI) & Street View HUD
 * These are diagram colors: they label coverage zones and view frusta.
 * ------------------------------------------------------------------ */

export const CAMERA_COLORS = {
  /** Camera field-of-view frustum / coverage cone. */
  frustum: '#f472b6',
  /** Alternate frustum used by the static preview HUD. */
  frustumAlt: '#ec4899',
  /** Direction / bearing indicator. */
  bearing: '#f97316',
  /** HUD backdrop — near-black, stays dark in both themes (it is a video overlay). */
  hudBackdrop: '#030712',
  hudBackdropDeep: '#080d1a',
  hudBackdropNight: '#0d1424',
  /** HUD grid / reticle strokes, from strongest to faintest. */
  hudGridStrong: '#475569',
  hudGrid: '#334155',
  hudGridFaint: '#1e293b',
  /** HUD label text tiers. */
  hudLabel: '#94a3b8',
  hudLabelMuted: '#64748b',
  hudLabelDim: '#4b5563',
  hudPanel: '#1f2937',
  hudPanelDeep: '#111827',
} as const;

/* ------------------------------------------------------------------ *
 * Diagram accents used inside the fiber splice / ODF schematic
 * ------------------------------------------------------------------ */

export const DIAGRAM_COLORS = {
  /** Schematic canvas background — an instrument panel, not app chrome. */
  canvas: '#0f141a',
  /** Trace highlighting an active/traced path. */
  activeTrace: '#22d3ee',
  /** Trace flagged as needing attention. */
  warnTrace: '#f59e0b',
  /** Connection verified OK. */
  okTrace: '#22c55e',
} as const;

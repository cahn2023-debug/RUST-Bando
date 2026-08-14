/**
 * Print colors — the single home for colors rendered onto the print canvas.
 *
 * Print output goes to paper, so it is always a light color scheme regardless of the
 * app's active theme. These values must NOT be swapped for `cad-*` theme tokens:
 * doing so would produce a black-background printout in dark mode.
 *
 * This file covers the printed artifact only. The Print dialog's own UI chrome uses
 * the normal `cad-*` theme tokens. See `design-system/MASTER.md` §2.
 */

export const PRINT_COLORS = {
  /** Paper background. */
  paper: '#ffffff',
  /** Frame, border and hairline strokes on the sheet. */
  stroke: '#000000',
  /** Title block / primary printed text. */
  text: '#1a1a1a',
  /** Secondary printed text: scale bar labels, captions, metadata. */
  textMuted: '#666666',
} as const;

/**
 * Colors for the on-screen *preview* of the printed sheet. The preview mimics paper,
 * so it is also theme-independent — the sheet must look like the sheet in both themes.
 */
export const PRINT_PREVIEW_COLORS = {
  /** The map viewport region drawn on the sheet before capture. */
  viewport: '#1a1a1a',
  /** Captured-image backdrop behind the map preview. */
  viewportFilled: '#111111',
  /** Placeholder text/icon tint shown when no print area is selected. */
  placeholder: '#333333',
  /** Light scrollbar track/thumb inside the paper preview. */
  scrollTrack: '#fafafa',
  scrollThumb: '#eeeeee',
} as const;

# Design System: RUST CAD Dark

## 1. Visual Theme
Quiet, technical, dense, and operator-focused. The app stays in a CAD-dark language: deep charcoal surfaces, restrained green accents, sharp hierarchy, and compact spacing.

## 2. Color Palette
- Deep Graphite `#0F1115` - base app background
- Header Slate `#101217` - top chrome and shell rails
- Surface Slate `#171B21` - panels, cards, modal bodies
- Elevated Slate `#20252D` - selected sections and active surfaces
- Border Slate `#2B313B` - separators and outlines
- Signal Green `#10B981` - primary action and active state
- Active Mint `#34D399` - hover / live feedback
- Amber Notice `#F59E0B` - warnings and attention states
- Primary Text `#E5E7EB` - main content
- Secondary Text `#9CA3AF` - supporting labels
- Muted Text `#4B5563` - low-priority metadata

## 3. Typography
Inter for body and UI, Space Grotesk for display headers, Roboto Mono for technical fields. Uppercase is used sparingly for machine-like labels, not for body copy.

## 4. Component Rules
- Buttons: compact, squared-to-soft corners, one primary accent per surface.
- Cards / panels: dark surfaces with 1px borders, low-shadow elevation, no bright glass blobs.
- Inputs: dark fill, clear border, visible focus ring, no oversized rounding.
- Tabs / ribbon: dense horizontal rails with clear active states and keyboard support.

## 5. Layout
Use full-width shells with fixed-height chrome, dense content bands, and stable spacing. Keep panel widths, button heights, and icon sizes consistent across modules. Prefer scan-friendly grids and split panes over decorative framing.

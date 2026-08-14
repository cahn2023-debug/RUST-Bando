# Design System Master File (RUST CAD Product)

> **SINGLE SOURCE OF TRUTH.** This file is the only authoritative design spec for
> `src/modules/design`. If a page-specific file exists at
> `design-system/pages/[page-name].md`, its rules override this file for that page only.
>
> Deprecated / conflicting specs (do **not** use): `design-system/rust-cad/MASTER.md`,
> `design-system/bando-network-graph/MASTER.md`, `docs/DESIGN.md`, `DESIGN.md` (root).
> Those files are stubs pointing back here.

---

**Project:** RUST CAD Product
**Stack:** React 18 + Tailwind CSS v4 + TypeScript + Zustand
**Implementation:** `src/modules/design/index.css` (tokens), `src/modules/design/stores/themeStore.ts` (theme state)
**Last reconciled:** 2026-07-25

---

## 1. Dual Theme System Tokens

Tokens are declared as raw CSS variables (`--cad-*`) under `:root` / `[data-theme="..."]`,
then mapped into Tailwind v4 via `@theme` as `--color-cad-*`. Consume them **only** through
Tailwind utilities (`bg-cad-surface`, `text-cad-text-muted`, `border-cad-border`) or
`var(--color-cad-*)` in raw CSS. Never write a raw hex for UI chrome.

### CAD Dark Mode (default)

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-cad-header` | `#101217` | Top header, window controls, ribbon rail |
| `--color-cad-bg` | `#0F1115` | Main application backdrop |
| `--color-cad-surface` | `#171B21` | Panels, sidebar cards |
| `--color-cad-elevated` | `#20252D` | Modals, active rows, dropdowns |
| `--color-cad-border` | `#2B313B` | Dividers, element borders |
| `--color-cad-accent` | `#10B981` | Primary green action / active |
| `--color-cad-active` | `#34D399` | Hover states, focus rings |
| `--color-cad-warn` | `#F59E0B` | Warning badges & alerts |
| `--color-cad-danger` | `#F87171` | Destructive action, error state |
| `--color-cad-text-primary` | `#E5E7EB` | Main headings & body text |
| `--color-cad-text-secondary` | `#9CA3AF` | Subtitles & field labels |
| `--color-cad-text-muted` | `#4B5563` | De-emphasized metadata |

### CAD Light Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-cad-header` | `#F1F5F9` | Top header, light slate |
| `--color-cad-bg` | `#F8FAFC` | Main application light backdrop |
| `--color-cad-surface` | `#FFFFFF` | White panels, sidebar cards |
| `--color-cad-elevated` | `#F1F5F9` | Light slate elevated cards & rows |
| `--color-cad-border` | `#CBD5E1` | Light gray borders |
| `--color-cad-accent` | `#059669` | Emerald green primary action |
| `--color-cad-active` | `#10B981` | Bright emerald hover |
| `--color-cad-warn` | `#D97706` | Warning amber |
| `--color-cad-danger` | `#DC2626` | Destructive action, error state |
| `--color-cad-text-primary` | `#0F172A` | Slate-900 high contrast text |
| `--color-cad-text-secondary` | `#334155` | Slate-700 secondary text |
| `--color-cad-text-muted` | `#64748B` | Slate-500 muted text |

### Interaction state convention

State is expressed with opacity modifiers on existing tokens, never with new hexes.

| State | Convention |
|-------|-----------|
| Hover (surface) | `hover:bg-cad-elevated`, or `hover:bg-cad-text-primary/5` on transparent chrome |
| Hover (accent) | `hover:bg-cad-active` |
| Active / selected | `bg-cad-accent/10 text-cad-accent border-cad-accent/30` |
| Focus ring | `:focus-visible` global ring, 2px `--color-cad-accent` + 2px `--color-cad-bg` offset |
| Disabled | `disabled:opacity-50 disabled:pointer-events-none` |
| Danger | `text-cad-danger`, `hover:bg-cad-danger/10` |

> Do not use `hover:bg-white/5` — it is invisible in light mode. Use `hover:bg-cad-text-primary/5`.

---

## 2. Non-Theme Color Domains

Three domains are legitimately outside the theme system. Each has exactly one home file;
hexes are forbidden everywhere else.

| Domain | Home | Why exempt |
|--------|------|-----------|
| Map / fiber data colors | `src/modules/design/features/map/styles/dataColors.ts` | Encodes data meaning (tube/fiber/layer identity), must stay stable across themes |
| Print canvas colors | `src/modules/design/features/print/printColors.ts` | Output is paper; always light regardless of app theme |
| Third-party overrides | `src/modules/design/index.css` (Leaflet / Google Street View blocks) | Forced light values to defeat vendor + extension inversion |

---

## 3. Spacing Scale

Tailwind's default 4px scale is the spec. The app is dense: prefer the low end.

| Purpose | Class | Value |
|---------|-------|-------|
| Icon-to-label gap | `gap-1` / `gap-1.5` | 4–6px |
| Inline control gap | `gap-2` | 8px |
| Intra-panel padding | `p-2` / `p-3` | 8–12px |
| Panel section padding | `p-4` | 16px |
| Dialog body padding | `p-5` / `p-6` | 20–24px |
| Section separation | `gap-6` | 24px |

Avoid values above `p-6` inside application chrome. No arbitrary `p-[13px]`-style values.

---

## 4. Chrome Dimensions (fixed, do not drift)

| Element | Height | Class |
|---------|--------|-------|
| Title bar | 40px | `h-10` |
| Window control button | 36px | `w-9 h-9` |
| Toolbar / command rail | 40px | `h-10` |
| Ribbon tab strip | 36px | `h-9` |
| Ribbon content band | 80px | `h-[80px]` |
| Status bar | 22px | `h-[22px]` |
| Standard row / icon button | 32px | `h-8` |
| Compact row | 24px | `h-6` |
| Hairline divider | 1px | `h-[1px]` |

Icon sizes use the `cad-icon-{xs,sm,md,lg,xl}` utilities (12/14/16/18/20px). Do not
hand-size icons with `w-[15px]`.

---

## 5. Z-Index Scale

Leaflet occupies 200–1000 internally (panes 200–700, controls 1000), so **all app chrome
that sits above the map must start above 1000**. Use the `z-cad-*` utilities; raw `z-[9999]`
is forbidden.

Tailwind v4 generates z-index utilities from the `--z-index-*` namespace, so the tokens are
declared as `--z-index-cad-*` and consumed as `z-cad-*` (declaring them `--z-cad-*` produces
no utility class at all — a silent failure).

| Token | Utility | Value | Usage |
|-------|---------|-------|-------|
| `--z-index-cad-map-control` | `z-cad-map-control` | `1100` | Buttons/search anchored over the map canvas |
| `--z-index-cad-panel` | `z-cad-panel` | `2000` | Docked panels, explorer, property panel |
| `--z-index-cad-floating` | `z-cad-floating` | `2200` | Draggable palettes, floating panels |
| `--z-index-cad-dropdown` | `z-cad-dropdown` | `3000` | Menus, comboboxes, context menus |
| `--z-index-cad-overlay` | `z-cad-overlay` | `4000` | Modal scrim |
| `--z-index-cad-modal` | `z-cad-modal` | `4100` | Modal body |
| `--z-index-cad-modal-nested` | `z-cad-modal-nested` | `4200` | Modal launched from a modal |
| `--z-index-cad-toast` | `z-cad-toast` | `5000` | Transient notifications, progress |
| `--z-index-cad-tooltip` | `z-cad-tooltip` | `5500` | Tooltips |
| `--z-index-cad-debug` | `z-cad-debug` | `6000` | Performance / diagnostic overlays |

Anything rendered through `<Portal>` lands in `#portal-root` (a fixed layer at `z-index: 99999`),
so portal children only compete with each other — still use the tokens for predictable ordering.

---

## 6. Typography

- **UI & body:** Inter, "Segoe UI", Roboto, sans-serif → `font-sans`
- **Display / ribbon labels:** same stack → `font-display`
- **Technical values, coordinates, IDs:** "Roboto Mono", monospace → `font-mono`
- Dense data grids and tree views: 11–12px. Ribbon/tab labels: 10px, `font-black`,
  `tracking-[0.16em]`, uppercase. Body copy is never uppercase.
- Contrast: WCAG AA minimum (4.5:1 normal text, 3:1 large text) in **both** themes.

---

## 7. Component Rules

- **Buttons:** use the shared `Button` primitive. One primary accent per surface.
  Variants: `primary`, `secondary`, `ghost`, `danger`. Sizes: `sm` (24px), `md` (32px).
- **Icon buttons:** square, `cad-icon-button`, always carry an `aria-label`.
- **Panels / cards:** `cad-panel`, `cad-card`, `cad-panel-strong` — dark surface, 1px border,
  low shadow. No bright glass blobs.
- **Inputs:** `cad-input` / `cad-select` / `cad-textarea` — filled, bordered, visible focus ring.
- **Tabs / ribbon:** dense horizontal rails, explicit active state, full keyboard support
  (arrow keys move between tabs, `Home`/`End` jump to ends).
- **Modals:** scrim + `cad-dialog`, focus trapped, `Escape` closes, focus returns to the
  invoking control on close.

---

## 8. i18n Rules

- All user-visible strings go through `useTranslation()` from `react-i18next`.
- This includes `title`, `placeholder`, `aria-label`, `alt`, and default entity names.
- Strings live in `src/modules/i18n/locales/{vi,en}/common.json`, namespaced by module.
- Never build sentences by concatenating translated fragments or nesting ternaries —
  use i18next interpolation and pluralization.
- All files UTF-8; Vietnamese diacritics must round-trip intact.

---

## 9. Accessibility Baseline

- Every interactive element is reachable and operable by keyboard.
- Icon-only controls have `aria-label`; decorative icons/dividers have `aria-hidden="true"`.
- Modals: `role="dialog"`, `aria-modal="true"`, labelled by their title, focus trapped.
- Tab sets use `role="tablist"` / `role="tab"` / `aria-selected`.
- Focus is always visible — never `outline: none` without a replacement ring.
- Full WCAG conformance requires manual screen-reader testing; automated checks cover part of it.

---

## 10. Pre-Delivery Checklist

- [ ] No raw hex in `src/modules/design` outside the three exempt files in §2
      (enforced by the `no-restricted-syntax` ESLint rule).
- [ ] No `z-[…]` arbitrary values; `z-cad-*` tokens only.
- [ ] No `dark:` Tailwind variants — theming is `data-theme` + CSS variables.
- [ ] Verified in **both** light and dark mode.
- [ ] No emoji icons — SVG from `lucide-react`.
- [ ] `cursor-pointer` on all interactive buttons/cards.
- [ ] All user-visible strings translated (vi + en).
- [ ] Icon-only buttons have `aria-label`.
- [ ] `npm run typecheck && npm run lint && npm run test:ci` pass.

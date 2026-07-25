# Design System Master File (RUST CAD Product)

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** RUST CAD Product
**Generated:** 2026-07-24
**Stack:** React + Tailwind CSS v4 + TypeScript

---

## 1. Dual Theme System Tokens

### CAD Dark Mode (Default)
| Token | Hex / Value | Usage |
|-------|-------------|-------|
| `--color-cad-header` | `#101217` | Top header, window controls |
| `--color-cad-bg` | `#0F1115` | Main application backdrop |
| `--color-cad-surface` | `#171B21` | Panels, sidebar cards |
| `--color-cad-elevated` | `#20252D` | Modals, active rows, dropdowns |
| `--color-cad-border` | `#2B313B` | Dividers, element borders |
| `--color-cad-accent` | `#10B981` | Primary green action / active |
| `--color-cad-active` | `#34D399` | Hover states, focus rings |
| `--color-cad-warn` | `#F59E0B` | Warning badges & alerts |
| `--color-cad-text-primary` | `#E5E7EB` | Main headings & body text |
| `--color-cad-text-secondary` | `#9CA3AF` | Subtitles & field labels |
| `--color-cad-text-muted` | `#4B5563` | De-emphasized metadata |

### CAD Light Mode
| Token | Hex / Value | Usage |
|-------|-------------|-------|
| `--color-cad-header` | `#F1F5F9` | Top header, light slate |
| `--color-cad-bg` | `#F8FAFC` | Main application light backdrop |
| `--color-cad-surface` | `#FFFFFF` | White panels, sidebar cards |
| `--color-cad-elevated` | `#F1F5F9` | Light slate elevated cards & rows |
| `--color-cad-border` | `#E2E8F0` | Light gray borders |
| `--color-cad-accent` | `#059669` | Emerald green primary action |
| `--color-cad-active` | `#10B981` | Bright emerald hover |
| `--color-cad-warn` | `#D97706` | Warning amber |
| `--color-cad-text-primary` | `#0F172A` | Slate-900 high contrast text |
| `--color-cad-text-secondary` | `#475569` | Slate-600 secondary text |
| `--color-cad-text-muted` | `#94A3B8` | Slate-400 muted text |

---

## 2. Typography Rules
- **UI & Body:** Inter, "Segoe UI", Roboto, sans-serif
- **Code & Tech Specs:** "Roboto Mono", monospace
- **Text Contrast:** AA level minimum (4.5:1 ratio for normal text).

---

## 3. i18n & Language Guidelines
- Always use `useTranslation()` from `react-i18next`.
- Store strings in `src/modules/i18n/locales/{vi,en}/common.json`.
- All text must be valid UTF-8 encoded.

---

## 4. Pre-Delivery Checklist
- [x] Dual Theme CSS Variables defined in `src/modules/design/index.css`.
- [x] Zustand Theme Store managing `light` / `dark` / `system`.
- [x] No emoji icons — use SVG icons from `lucide-react`.
- [x] `cursor-pointer` on all interactive buttons/cards.
- [x] All Vietnamese diacritics rendered accurately without encoding corruption.

# Accessibility (A11y) — WCAG 2.1 AA Compliance

Phase 5 accessibility foundation for Project Manager. All components target **WCAG 2.1 Level AA** compliance.

---

## 1. Compliance Plan

### Target: WCAG 2.1 Level AA

| Principle | Key Requirements | Status |
|-----------|-----------------|--------|
| **Perceivable** | Text alternatives, color contrast (4.5:1 normal, 3:1 large), adaptable content | In progress |
| **Operable** | Full keyboard access, no keyboard traps, visible focus, skip navigation | In progress |
| **Understandable** | Predictable navigation, input assistance, error identification | In progress |
| **Robust** | Compatible with assistive technologies, valid HTML/ARIA | In progress |

### Non-Goals (Phase 5)
- WCAG 2.1 AAA compliance (beyond AA minimums)
- Mobile touch accessibility (desktop-only app)
- International keyboard layouts beyond US English

### Enforcement
- `eslint-plugin-jsx-a11y` rules are set to **error** level in `.vscode/settings.json`
- CI will fail builds on accessibility rule violations
- Manual screen reader testing with NVDA/JAWS on Windows

---

## 2. ARIA Usage Guidelines

### Utility Module
All ARIA helpers are in `src/TOOL/utils/accessibility.ts`.

```typescript
import { buildAriaProps, announce, setAriaAttribute } from "@TOOL/utils/accessibility";

// Build ARIA props object
const aria = buildAriaProps({
  label: "Save project",
  disabled: isSaving,
  expanded: isOpen,
  live: "polite",
});

// Announce to screen readers
announce("Project saved successfully");
announce("Error: invalid file format", "assertive");
```

### ARIA Attribute Reference

| Attribute | When to Use | Example |
|-----------|-------------|---------|
| `aria-label` | When no visible text label exists | `<button aria-label="Close window">` |
| `aria-labelledby` | When a visible element already labels this | `<div aria-labelledby="heading-1">` |
| `aria-describedby` | For supplementary descriptions | `<input aria-describedby="hint-1">` |
| `aria-expanded` | Toggle buttons, accordions, menus | `<button aria-expanded={isOpen}>` |
| `aria-haspopup` | Buttons that open popups | `<button aria-haspopup="true">` |
| `aria-disabled` | Disabled interactive elements | `<button aria-disabled={isLoading}>` |
| `aria-pressed` | Toggle buttons (on/off state) | `<button aria-pressed={isActive}>` |
| `aria-selected` | Tabs, listbox options | `<button role="tab" aria-selected={isSelected}>` |
| `aria-live` | Dynamic content regions | `<div aria-live="polite">` |
| `aria-hidden` | Decorative/hidden elements | `<Icon aria-hidden="true" />` |

### Rules
1. **Icons must have `aria-hidden="true"`** when accompanied by visible text, or a meaningful `aria-label` when they are the sole content.
2. **Images must have descriptive `alt` text** — decorative images use `alt=""` with `aria-hidden="true"`.
3. **Never use `aria-hidden="true"` on focusable elements** — this creates an accessibility violation.
4. **Prefer `aria-label` over generic titles** — "Save project" is better than "Save".

---

## 3. Keyboard Shortcuts

### Global Navigation

| Key | Action | Scope |
|-----|--------|-------|
| `Tab` | Move focus forward | Global |
| `Shift+Tab` | Move focus backward | Global |
| `Enter` | Activate focused element | Global |
| `Space` | Activate focused button/toggle | Global |
| `Escape` | Close modal/dialog/menu | Modal contexts |

### Ribbon Tabs

| Key | Action |
|-----|--------|
| `ArrowLeft` | Move to previous tab |
| `ArrowRight` | Move to next tab |
| `Home` | Move to first tab |
| `End` | Move to last tab |

### Title Bar Toolbars

| Key | Action |
|-----|--------|
| `ArrowLeft` | Move to previous button in toolbar |
| `ArrowRight` | Move to next button in toolbar |

### Implementation

Keyboard handlers are centralized in `src/TOOL/utils/accessibility.ts`:

```typescript
import { createKeyboardHandler, createRovingTabHandler } from "@TOOL/utils/accessibility";

// Simple key-to-callback mapping
const handler = createKeyboardHandler({
  onEnter: () => save(),
  onEscape: () => closeModal(),
  onArrowDown: () => moveFocus(current, "next"),
});

// Roving tab index for toolbars/lists
const rovingHandler = createRovingTabHandler(items, {
  direction: "horizontal",
  wrap: true,
  onActivate: (item, index) => selectItem(item),
});
```

---

## 4. Focus Management Strategy

### Focus Visible
The app uses a `data-focus-visible` attribute to show focus rings **only for keyboard users**. Mouse users will not see focus rings on click.

Initialize at app root:
```typescript
import { initFocusVisibleBehavior } from "@TOOL/utils/accessibility";

// In App.tsx or main entry
initFocusVisibleBehavior();
```

CSS for focus-visible (add to global stylesheet):
```css
[data-focus-visible="true"] {
  outline: 2px solid #A70000;
  outline-offset: 2px;
}

/* Or using Tailwind utilities on components */
.focus-visible\:ring-2:focus-visible {
  --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
}
```

### Focus Traps
Modals and dialogs must trap focus:

```typescript
import { createFocusTrap } from "@TOOL/utils/accessibility";

useEffect(() => {
  const cleanup = createFocusTrap(modalRef.current, {
    autoFocus: true,
    restoreFocus: true,
    onEscape: () => onClose(),
  });
  return cleanup;
}, [onClose]);
```

### Focus Restoration
When dialogs close, focus returns to the element that opened them (handled by `createFocusTrap` with `restoreFocus: true`).

### Skip Link
Initialize at app root for keyboard users to skip directly to main content:

```typescript
import { createSkipLink } from "@TOOL/utils/accessibility";

// In App.tsx
useEffect(() => {
  createSkipLink("main-content");
}, []);
```

### Focus Order
All interactive elements must follow a logical DOM order that matches visual order:
1. Title bar (banner)
2. Ribbon navigation (navigation/tablist)
3. Main content area (main)
4. Status bar (contentinfo)

---

## 5. Color Contrast Standards

### Minimum Contrast Ratios (WCAG 2.1 AA)

| Content Type | Minimum Ratio | Checker Function |
|--------------|---------------|-----------------|
| Normal text (< 18px / < 14px bold) | **4.5:1** | `meetsWCAGAA(fg, bg, "normal")` |
| Large text (>= 18px or >= 14px bold) | **3:1** | `meetsWCAGAA(fg, bg, "large")` |
| UI components & graphical objects | **3:1** | `meetsWCAGAA(fg, bg, "large")` |

### Utility Functions

```typescript
import {
  contrastRatio,
  meetsWCAGAA,
  meetsWCAGAAA,
  suggestTextColor,
  parseColor,
  relativeLuminance,
} from "@TOOL/utils/accessibility";

// Check contrast
const isValid = meetsWCAGAA("#767676", "#FFFFFF", "normal"); // false — too low

// Get contrast ratio
const ratio = contrastRatio("#A70000", "#FFFFFF"); // ~5.74

// Get recommended text color for a background
const textColor = suggestTextColor("#2B2B2B"); // "#FFFFFF"
```

### Theme Considerations
The app uses a dark theme (`#2B2B2B` surface, `#1A1A1A` borders). All text colors must be validated against these backgrounds:

| Foreground | Background | Ratio | Pass AA? |
|------------|------------|-------|----------|
| `#FFFFFF` | `#2B2B2B` | ~12.6:1 | Yes |
| `#A0A0A0` (cad-text-secondary) | `#2B2B2B` | ~4.6:1 | Yes |
| `#666666` (cad-text-muted) | `#2B2B2B` | ~2.8:1 | No — review |

**Action item**: Audit `cad-text-muted` color — it may fail AA on dark backgrounds and should be lightened for accessible contexts.

---

## 6. Component Audit Checklist

### Completed (Phase 5)
- [x] `Button` — ARIA labels, keyboard support, focus-visible, loading state
- [x] `TitleBar` — `role="banner"`, toolbar grouping, all buttons labeled
- [x] `Ribbon` — `role="tablist"`/`role="tab"`/`role="toolbar"`, arrow navigation
- [x] `ToolButton` — `aria-pressed`, `aria-label`, icon `aria-hidden`
- [x] `RibbonComponents.ToolGroup` — `role="group"` with label

### Pending
- [ ] `StatusBar` — `role="contentinfo"`, live regions for status updates
- [ ] `PaletteSystem` — focus trap, roving tabindex
- [ ] `ImportDialog` — focus trap, escape to close, aria-modal
- [ ] `DeleteConfirmationModal` — focus trap, role="alertdialog"
- [ ] `ErrorBoundary` — screen reader announcement on error
- [ ] `CommandLine` — aria-live for output, form labeling
- [ ] `IconSelector` — roving tabindex, arrow navigation
- [ ] All `<img>` elements — alt text audit
- [ ] All `<input>` elements — label association

---

## 7. Testing

### Automated
```bash
# Run eslint with a11y rules
npm run lint

# Check for jsx-a11y violations
npx eslint src --ext .ts,.tsx --plugin jsx-a11y
```

### Manual
1. **Keyboard-only navigation**: Unplug mouse, navigate entire app with Tab/Arrow/Enter/Escape
2. **Screen reader testing**: Test with NVDA (free, Windows) or JAWS
3. **Color contrast**: Use browser DevTools or the utility functions above
4. **Focus visibility**: Verify focus ring appears for keyboard, not for mouse

### Recommended Tools
- **NVDA** (NonVisual Desktop Access) — free Windows screen reader
- **axe DevTools** — browser extension for automated a11y testing
- **WAVE** — web accessibility evaluation tool
- **Color Contrast Analyzer** — Microsoft/Chrome extension

---

## 8. References

- [WCAG 2.1 Specification](https://www.w3.org/TR/WCAG21/)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y)

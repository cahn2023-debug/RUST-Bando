/**
 * Accessibility utilities for WCAG 2.1 AA compliance.
 * Provides ARIA helpers, keyboard event handlers, focus management,
 * color contrast checking, and screen reader announcement.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ARIAAttribute =
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-hidden'
  | 'aria-expanded'
  | 'aria-haspopup'
  | 'aria-live'
  | 'aria-atomic'
  | 'aria-relevant'
  | 'aria-busy'
  | 'aria-controls'
  | 'aria-current'
  | 'aria-disabled'
  | 'aria-invalid'
  | 'aria-required'
  | 'aria-roledescription'
  | 'aria-sort'
  | 'aria-valuemin'
  | 'aria-valuemax'
  | 'aria-valuenow'
  | 'aria-valuetext'
  | 'aria-checked'
  | 'aria-selected'
  | 'aria-orientation'
  | 'aria-multiselectable'
  | 'aria-level'
  | 'aria-posinset'
  | 'aria-setsize'
  | 'aria-colcount'
  | 'aria-colindex'
  | 'aria-rowcount'
  | 'aria-rowindex';

export interface ARIAProps {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  hidden?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  live?: 'polite' | 'assertive' | 'off';
  atomic?: boolean;
  busy?: boolean;
  role?: string;
}

export type FocusDirection = 'next' | 'previous' | 'first' | 'last';

export interface FocusTrapOptions {
  /** CSS selector for the trap container (default: '[data-focus-trap]') */
  containerSelector?: string;
  /** CSS selector for focusable elements (default: standard focusable set) */
  focusableSelector?: string;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Auto-focus the first element on activation */
  autoFocus?: boolean;
  /** Restore focus to the previously focused element on deactivation */
  restoreFocus?: boolean;
}

export interface KeyboardHandlerOptions {
  /** Called when Enter is pressed */
  onEnter?: (e: KeyboardEvent) => void;
  /** Called when Space is pressed */
  onSpace?: (e: KeyboardEvent) => void;
  /** Called when Escape is pressed */
  onEscape?: (e: KeyboardEvent) => void;
  /** Called when ArrowUp is pressed */
  onArrowUp?: (e: KeyboardEvent) => void;
  /** Called when ArrowDown is pressed */
  onArrowDown?: (e: KeyboardEvent) => void;
  /** Called when ArrowLeft is pressed */
  onArrowLeft?: (e: KeyboardEvent) => void;
  /** Called when ArrowRight is pressed */
  onArrowRight?: (e: KeyboardEvent) => void;
  /** Called when Tab is pressed */
  onTab?: (e: KeyboardEvent) => void;
  /** Called for any other key */
  onOther?: (e: KeyboardEvent) => void;
}

// ---------------------------------------------------------------------------
// Color Contrast
// ---------------------------------------------------------------------------

/** Parse a hex color string (#RGB, #RGBA, #RRGGBB, #RRGGBBAA) to RGBA components. */
export function parseColor(hex: string): { r: number; g: number; b: number; a: number } {
  const cleaned = hex.replace('#', '');
  let r: number, g: number, b: number, a: number;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
    a = 1;
  } else if (cleaned.length === 4) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
    a = parseInt(cleaned[3] + cleaned[3], 16) / 255;
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
    a = 1;
  } else if (cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
    a = parseInt(cleaned.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return { r, g, b, a };
}

/**
 * Calculate relative luminance per WCAG 2.1 spec.
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1.
 * Returns a value between 1 and 21.
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function contrastRatio(color1: string, color2: string): number {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);

  // Blend with white background based on alpha
  const blendWithWhite = (c: { r: number; g: number; b: number; a: number }) => ({
    r: Math.round(c.r * c.a + 255 * (1 - c.a)),
    g: Math.round(c.g * c.a + 255 * (1 - c.a)),
    b: Math.round(c.b * c.a + 255 * (1 - c.a)),
  });

  const b1 = blendWithWhite(c1);
  const b2 = blendWithWhite(c2);

  const l1 = relativeLuminance(b1.r, b1.g, b1.b);
  const l2 = relativeLuminance(b2.r, b2.g, b2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 AA minimum contrast ratios. */
export const WCAG_AA_THRESHOLD = {
  /** Normal text (< 18px or < 14px bold) */
  normal: 4.5,
  /** Large text (>= 18px or >= 14px bold) */
  large: 3.0,
  /** UI components and graphical objects */
  uiComponent: 3.0,
};

/** WCAG 2.1 AAA minimum contrast ratios. */
export const WCAG_AAA_THRESHOLD = {
  normal: 7.0,
  large: 4.5,
};

/** Check if a color pair meets WCAG 2.1 AA requirements. */
export function meetsWCAGAA(
  foreground: string,
  background: string,
  textType: 'normal' | 'large' = 'normal'
): boolean {
  const ratio = contrastRatio(foreground, background);
  return ratio >= WCAG_AA_THRESHOLD[textType];
}

/** Check if a color pair meets WCAG 2.1 AAA requirements. */
export function meetsWCAGAAA(
  foreground: string,
  background: string,
  textType: 'normal' | 'large' = 'normal'
): boolean {
  const ratio = contrastRatio(foreground, background);
  return ratio >= WCAG_AAA_THRESHOLD[textType];
}

/**
 * Suggest a contrasting text color (black or white) based on background luminance.
 * Returns '#000000' or '#FFFFFF'.
 */
export function suggestTextColor(backgroundColor: string): string {
  const { r, g, b, a } = parseColor(backgroundColor);
  // Blend with white
  const blended = {
    r: Math.round(r * a + 255 * (1 - a)),
    g: Math.round(g * a + 255 * (1 - a)),
    b: Math.round(b * a + 255 * (1 - a)),
  };
  const luminance = relativeLuminance(blended.r, blended.g, blended.b);
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

// ---------------------------------------------------------------------------
// ARIA Helpers
// ---------------------------------------------------------------------------

/** Build an ARIA attributes object from a typed config. */
export function buildAriaProps(props: ARIAProps): Record<string, string | boolean | undefined> {
  const result: Record<string, string | boolean | undefined> = {};
  if (props.label !== undefined) result['aria-label'] = props.label;
  if (props.labelledBy !== undefined) result['aria-labelledby'] = props.labelledBy;
  if (props.describedBy !== undefined) result['aria-describedby'] = props.describedBy;
  if (props.hidden !== undefined) result['aria-hidden'] = props.hidden;
  if (props.expanded !== undefined) result['aria-expanded'] = props.expanded;
  if (props.disabled !== undefined) result['aria-disabled'] = props.disabled;
  if (props.required !== undefined) result['aria-required'] = props.required;
  if (props.invalid !== undefined) result['aria-invalid'] = props.invalid;
  if (props.live !== undefined) result['aria-live'] = props.live;
  if (props.atomic !== undefined) result['aria-atomic'] = props.atomic;
  if (props.busy !== undefined) result['aria-busy'] = props.busy;
  if (props.role !== undefined) result['role'] = props.role;
  return result;
}

/** Set an ARIA attribute on an element. */
export function setAriaAttribute(
  element: HTMLElement,
  attribute: ARIAAttribute | 'role',
  value: string | boolean
): void {
  element.setAttribute(attribute, String(value));
}

/** Remove an ARIA attribute from an element. */
export function removeAriaAttribute(
  element: HTMLElement,
  attribute: ARIAAttribute | 'role'
): void {
  element.removeAttribute(attribute);
}

// ---------------------------------------------------------------------------
// Screen Reader Announcements
// ---------------------------------------------------------------------------

let announcementContainer: HTMLDivElement | null = null;

/**
 * Announce a message to screen readers via an ARIA live region.
 * Creates a persistent off-screen live region on first call.
 *
 * @param message - The text to announce
 * @param priority - 'polite' (default) or 'assertive'
 */
export function announce(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  if (typeof document === 'undefined') return;

  if (!announcementContainer) {
    announcementContainer = document.createElement('div');
    announcementContainer.setAttribute('aria-live', priority);
    announcementContainer.setAttribute('aria-atomic', 'true');
    announcementContainer.setAttribute('role', 'status');
    announcementContainer.style.position = 'absolute';
    announcementContainer.style.width = '1px';
    announcementContainer.style.height = '1px';
    announcementContainer.style.padding = '0';
    announcementContainer.style.margin = '-1px';
    announcementContainer.style.overflow = 'hidden';
    announcementContainer.style.clip = 'rect(0, 0, 0, 0)';
    announcementContainer.style.whiteSpace = 'nowrap';
    announcementContainer.style.border = '0';
    document.body.appendChild(announcementContainer);
  }

  // Update the live region's aria-live in case priority changed
  announcementContainer.setAttribute('aria-live', priority);

  // Clear and set message with a small delay to ensure screen readers pick up the change
  announcementContainer.textContent = '';
  requestAnimationFrame(() => {
    if (announcementContainer) {
      announcementContainer.textContent = message;
    }
  });
}

/** Remove the announcement container from the DOM. */
export function cleanupAnnouncer(): void {
  if (announcementContainer && announcementContainer.parentNode) {
    announcementContainer.parentNode.removeChild(announcementContainer);
    announcementContainer = null;
  }
}

// ---------------------------------------------------------------------------
// Focus Management
// ---------------------------------------------------------------------------

const DEFAULT_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), details, summary, iframe, object, embed, [contenteditable]';

/**
 * Get all focusable elements within a container.
 */
export function getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(DEFAULT_FOCUSABLE_SELECTOR)
  );
  return elements.filter(
    (el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden')
  );
}

/**
 * Move focus to a specific element.
 */
export function focusElement(element: HTMLElement | null, options?: FocusOptions): void {
  if (element) {
    element.focus(options);
  }
}

/**
 * Move focus relative to the current element within a container.
 */
export function moveFocus(
  currentElement: HTMLElement,
  direction: FocusDirection,
  container: HTMLElement = document.body
): HTMLElement | null {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return null;

  const currentIndex = focusable.indexOf(currentElement);

  let targetIndex: number;
  switch (direction) {
    case 'next':
      targetIndex = (currentIndex + 1) % focusable.length;
      break;
    case 'previous':
      targetIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
      break;
    case 'first':
      targetIndex = 0;
      break;
    case 'last':
      targetIndex = focusable.length - 1;
      break;
    default:
      return null;
  }

  const target = focusable[targetIndex];
  if (target) {
    focusElement(target, { preventScroll: false });
  }
  return target;
}

/**
 * Create a focus trap within a container.
 * Returns a cleanup function to deactivate the trap.
 */
export function createFocusTrap(
  container: HTMLElement = document.body,
  options: FocusTrapOptions = {}
): () => void {
  const {
    focusableSelector = DEFAULT_FOCUSABLE_SELECTOR,
    onEscape,
    autoFocus = true,
    restoreFocus = true,
  } = options;

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden')
  );

  if (autoFocus && focusable.length > 0) {
    focusable[0].focus();
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (onEscape) {
        onEscape();
      } else {
        cleanup();
      }
      return;
    }

    if (e.key !== 'Tab') return;

    const currentFocusable = Array.from(
      container.querySelectorAll<HTMLElement>(focusableSelector)
    ).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    if (currentFocusable.length === 0) return;

    const firstElement = currentFocusable[0];
    const lastElement = currentFocusable[currentFocusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if focus is on first element, wrap to last
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if focus is on last element, wrap to first
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  const cleanup = (): void => {
    document.removeEventListener('keydown', handleKeyDown);
    if (restoreFocus && previouslyFocused) {
      previouslyFocused.focus({ preventScroll: true });
    }
  };

  return cleanup;
}

// ---------------------------------------------------------------------------
// Keyboard Event Handlers
// ---------------------------------------------------------------------------

/**
 * Create a keyboard event handler that maps keys to callbacks.
 * Returns the handler function.
 */
export function createKeyboardHandler(
  options: KeyboardHandlerOptions
): (e: React.KeyboardEvent | KeyboardEvent) => void {
  return (e: React.KeyboardEvent | KeyboardEvent): void => {
    const key = e.key;

    switch (key) {
      case 'Enter':
        if (options.onEnter) options.onEnter(e as KeyboardEvent);
        break;
      case ' ':
        e.preventDefault();
        if (options.onSpace) options.onSpace(e as KeyboardEvent);
        break;
      case 'Escape':
        if (options.onEscape) options.onEscape(e as KeyboardEvent);
        break;
      case 'ArrowUp':
        if (options.onArrowUp) options.onArrowUp(e as KeyboardEvent);
        break;
      case 'ArrowDown':
        if (options.onArrowDown) options.onArrowDown(e as KeyboardEvent);
        break;
      case 'ArrowLeft':
        if (options.onArrowLeft) options.onArrowLeft(e as KeyboardEvent);
        break;
      case 'ArrowRight':
        if (options.onArrowRight) options.onArrowRight(e as KeyboardEvent);
        break;
      case 'Tab':
        if (options.onTab) options.onTab(e as KeyboardEvent);
        break;
      default:
        if (options.onOther) options.onOther(e as KeyboardEvent);
        break;
    }
  };
}

/**
 * Handle keyboard navigation for a group of items (e.g., toolbar buttons, list items).
 * Supports ArrowLeft/ArrowRight or ArrowUp/ArrowDown navigation with optional wrapping.
 */
export function createRovingTabHandler(
  items: HTMLElement[],
  options?: {
    direction?: 'horizontal' | 'vertical' | 'both';
    wrap?: boolean;
    onActivate?: (item: HTMLElement, index: number) => void;
  }
): (e: React.KeyboardEvent | KeyboardEvent, currentIndex: number) => void {
  const { direction = 'horizontal', wrap = true, onActivate } = options || {};

  return (e: React.KeyboardEvent | KeyboardEvent, currentIndex: number): void => {
    const key = e.key;
    let newIndex = currentIndex;

    const isHorizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const isVertical = key === 'ArrowUp' || key === 'ArrowDown';

    if (direction === 'horizontal' && isHorizontal) {
      if (key === 'ArrowRight') newIndex = currentIndex + 1;
      else newIndex = currentIndex - 1;
    } else if (direction === 'vertical' && isVertical) {
      if (key === 'ArrowDown') newIndex = currentIndex + 1;
      else newIndex = currentIndex - 1;
    } else if (direction === 'both' && (isHorizontal || isVertical)) {
      if (key === 'ArrowRight' || key === 'ArrowDown') newIndex = currentIndex + 1;
      else newIndex = currentIndex - 1;
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      onActivate?.(items[currentIndex], currentIndex);
      return;
    } else {
      return;
    }

    e.preventDefault();

    if (wrap) {
      newIndex = ((newIndex % items.length) + items.length) % items.length;
    } else {
      newIndex = Math.max(0, Math.min(items.length - 1, newIndex));
    }

    if (items[newIndex]) {
      items[newIndex].focus();
    }
  };
}

/**
 * Utility: make an element keyboard-activatable (responds to Enter and Space).
 * Call this in a useEffect or ref callback.
 */
export function makeKeyboardActivatable(
  element: HTMLElement | null,
  onClick: () => void
): void {
  if (!element) return;

  const handler = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  element.addEventListener('keydown', handler);
}

// ---------------------------------------------------------------------------
// Utility: Visibly Focused Indicator
// ---------------------------------------------------------------------------

/**
 * Add a visible focus indicator class when an element receives focus via keyboard.
 * Removes the class on mouse/touch interactions.
 *
 * Usage: call this once at app root to enable global focus-visible behavior.
 */
export function initFocusVisibleBehavior(): void {
  if (typeof document === 'undefined') return;

  let hadKeyboardEvent = true;
  const KEYBOARD_MATCHING_KEYS = ['Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Shift', 'Control', 'Alt', 'Meta'];

  document.addEventListener('keydown', (e) => {
    if (KEYBOARD_MATCHING_KEYS.includes(e.key)) {
      hadKeyboardEvent = true;
    }
  }, true);

  document.addEventListener('mousedown', () => {
    hadKeyboardEvent = false;
  }, true);

  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    if (target && hadKeyboardEvent) {
      target.setAttribute('data-focus-visible', 'true');
    }
  }, true);

  document.addEventListener('focusout', (e) => {
    const target = e.target as HTMLElement;
    if (target) {
      target.removeAttribute('data-focus-visible');
    }
  }, true);
}

// ---------------------------------------------------------------------------
// Utility: Skip Link
// ---------------------------------------------------------------------------

/**
 * Create a "Skip to main content" link for keyboard users.
 * Call once at app initialization.
 */
export function createSkipLink(
  targetId: string = 'main-content',
  linkText: string = 'Skip to main content'
): HTMLAnchorElement {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = linkText;
  skipLink.className = 'skip-link';
  skipLink.style.position = 'absolute';
  skipLink.style.top = '-100px';
  skipLink.style.left = '0';
  skipLink.style.zIndex = '9999';
  skipLink.style.padding = '12px 24px';
  skipLink.style.backgroundColor = '#000';
  skipLink.style.color = '#fff';
  skipLink.style.textDecoration = 'none';
  skipLink.style.fontWeight = 'bold';
  skipLink.style.transition = 'top 0.2s';

  skipLink.addEventListener('focus', () => {
    skipLink.style.top = '0';
  });

  skipLink.addEventListener('blur', () => {
    skipLink.style.top = '-100px';
  });

  document.body.insertBefore(skipLink, document.body.firstChild);
  return skipLink;
}

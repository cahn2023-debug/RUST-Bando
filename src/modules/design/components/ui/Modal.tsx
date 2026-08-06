import React, { useEffect, useId, useRef } from "react";
import { cn } from "@TOOL/utils/cn";
import { Portal } from "./Portal";

export type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  /** When true, renders the dialog through the portal. */
  isOpen: boolean;
  /** Called on Escape, overlay click, or explicit close by the caller. */
  onClose: () => void;
  /**
   * Id used for `aria-labelledby` on the dialog. When omitted the modal
   * generates a stable id — pass it to the content's heading element.
   */
  titleId?: string;
  children: React.ReactNode;
  /** Escape hatch: disables the built-in Escape-to-close (MASTER.md §7). */
  onEscDisabled?: boolean;
  /** Escape hatch: disables the focus trap for fullscreen/image viewers. */
  trapFocusDisabled?: boolean;
  /** Escape hatch: disables closing when the overlay backdrop is clicked. */
  overlayClickDisabled?: boolean;
  /** Element to focus on open. Defaults to the dialog container itself. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Width preset (default `md`). */
  size?: ModalSize;
  /** Extra classes applied to the dialog panel. */
  className?: string;
}

/**
 * Width presets. Sizes mirror the `max-w-*` scale used by existing dialogs so
 * callers can keep their current footprint when migrating.
 */
const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

/**
 * The shared modal primitive for `src/modules/design`.
 *
 * Renders the overlay + dialog shell defined in `index.css` (`.cad-overlay`,
 * `.cad-dialog`) with sensible defaults (MASTER.md §7):
 * - Focus is moved into the dialog on open and restored to the trigger on close.
 * - Escape closes; Tab cycles focus within the dialog (focus trap).
 * - Clicking the backdrop closes.
 *
 * All behaviors can be opted out via `onEscDisabled`, `trapFocusDisabled` and
 * `overlayClickDisabled` for fullscreen/image viewer use cases.
 */
export function Modal({
  isOpen,
  onClose,
  titleId,
  children,
  onEscDisabled = false,
  trapFocusDisabled = false,
  overlayClickDisabled = false,
  initialFocusRef,
  size = "md",
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const generatedTitleId = useId();
  const resolvedTitleId = titleId ?? generatedTitleId;

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    if (!trapFocusDisabled) {
      (initialFocusRef?.current ?? dialog)?.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onEscDisabled) return;
        e.stopPropagation();
        onClose();
        return;
      }

      if (trapFocusDisabled || !dialog) return;

      if (e.key === "Tab") {
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onClose, onEscDisabled, trapFocusDisabled, initialFocusRef]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-cad-overlay flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div
          className="cad-overlay"
          onClick={overlayClickDisabled ? undefined : onClose}
          aria-hidden="true"
        />

        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={resolvedTitleId}
          tabIndex={trapFocusDisabled ? undefined : -1}
          className={cn(
            "cad-dialog relative z-cad-modal w-full animate-in zoom-in-95 duration-300",
            sizeClasses[size],
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

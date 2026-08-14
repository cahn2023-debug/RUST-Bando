import React, { forwardRef, MouseEvent } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@SHARED/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Optional icon displayed before the label */
  icon?: LucideIcon;
  /** Optional icon displayed after the label */
  trailingIcon?: LucideIcon;
  /** Loading state — disables button and shows spinner */
  loading?: boolean;
  /** Click handler with typed event */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Accessible label for icon-only buttons (required when children is empty) */
  ariaLabel?: string;
}

/**
 * Variant styles. All colors come from `cad-*` theme tokens so both light and dark
 * mode work without `dark:` variants. See `design-system/MASTER.md` §1.
 *
 * Note: hover on transparent chrome uses `cad-text-primary/10`, never `white/10`,
 * which is invisible in light mode.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-cad-accent text-black border border-cad-accent hover:bg-cad-active disabled:bg-cad-accent/40",
  secondary:
    "bg-cad-elevated text-cad-text-primary border border-cad-border hover:bg-cad-surface disabled:opacity-40",
  ghost:
    "bg-transparent text-cad-text-muted border border-transparent hover:bg-cad-text-primary/10 hover:text-cad-text-primary disabled:opacity-40",
  danger:
    "bg-cad-danger text-white border border-cad-danger hover:bg-cad-danger/80 disabled:bg-cad-danger/40",
  accent:
    "bg-cad-accent/10 text-cad-accent border border-cad-accent/30 hover:bg-cad-accent/20 disabled:opacity-40",
};

/**
 * Sizes match the chrome dimensions in MASTER.md §4: `sm` = 24px (compact row),
 * `md` = 32px (standard row / icon button), `lg` = 40px (toolbar height).
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-[10px] gap-1",
  md: "h-8 px-3 text-[11px] gap-1.5",
  lg: "h-10 px-4 text-xs gap-2",
};

/** Icon-only buttons are square: same height, no horizontal padding. */
const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: "h-6 w-6 p-0",
  md: "h-8 w-8 p-0",
  lg: "h-10 w-10 p-0",
};

const iconSizeMap: Record<ButtonSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

/**
 * The shared button primitive for `src/modules/design`.
 *
 * Native `<button>` already handles Enter/Space activation and focus, so this component
 * deliberately adds no keyboard handling of its own. The focus ring comes from the global
 * `:focus-visible` rule in `index.css`, which is theme-aware.
 *
 * - Colors: `cad-*` tokens only, so light and dark mode both work (MASTER.md §1).
 * - Sizes: match fixed chrome heights (MASTER.md §4) — sm 24px, md 32px, lg 40px.
 * - Icon-only buttons render square and require `ariaLabel` (MASTER.md §9).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon: Icon,
    trailingIcon: TrailingIcon,
    loading = false,
    disabled = false,
    ariaLabel,
    className,
    children,
    onClick,
    type = "button",
    onKeyDown,
    ...rest
  },
  ref
) {
  const hasTextContent = !!children && (typeof children !== "string" || children.trim().length > 0);
  const isIconOnly = !hasTextContent && (!!Icon || !!TrailingIcon);

  const effectiveLabel = ariaLabel || (typeof children === "string" ? children : undefined);

  if (import.meta.env.DEV && isIconOnly && !effectiveLabel) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Button] An icon-only button was rendered without `ariaLabel`. " +
        "Screen readers will announce it as an unlabelled button."
    );
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    if (disabled || loading) return;
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-label={effectiveLabel}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm font-bold",
        "transition-colors duration-150 ease-in-out",
        "cursor-pointer select-none",
        "disabled:pointer-events-none",
        variantClasses[variant],
        isIconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
        className
      )}
      onClick={handleClick}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {loading && (
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {Icon && (
        <Icon
          size={iconSizeMap[size]}
          aria-hidden="true"
          className="shrink-0"
        />
      )}
      {hasTextContent && <span>{children}</span>}
      {TrailingIcon && (
        <TrailingIcon
          size={iconSizeMap[size]}
          aria-hidden="true"
          className="shrink-0"
        />
      )}
    </button>
  );
});

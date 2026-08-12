import React from "react";

export interface CustomIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
}

/**
 * Custom Cabinet Icon (Tủ cáp) — Specsheet 24x24 / 1.75px stroke / round cap-join
 * Hình chữ nhật đứng có khe cáp ngang
 */
export function CabinetIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.75,
  className,
  ...props
}: CustomIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Outer Cabinet Box */}
      <rect x="5" y="3" width="14" height="18" rx="2" />
      {/* Door Slot Lines */}
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
      {/* Lock Indicator */}
      <circle cx="15" cy="16" r="0.75" fill={color} />
    </svg>
  );
}

/**
 * Custom Splice Closure Icon (Măng xông) — Specsheet 24x24 / 1.75px stroke / round cap-join
 * Hình capsule con nhộng nằm ngang
 */
export function SpliceIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 1.75,
  className,
  ...props
}: CustomIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Horizontal Capsule Body */}
      <rect x="4" y="8" width="16" height="8" rx="4" />
      {/* Splice Joint Ribs */}
      <line x1="9" y1="8" x2="9" y2="16" />
      <line x1="15" y1="8" x2="15" y2="16" />
      {/* Left/Right Cable Entry Stub */}
      <line x1="1" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="23" y2="12" />
    </svg>
  );
}

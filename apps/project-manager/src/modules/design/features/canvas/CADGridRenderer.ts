/**
 * CADGridRenderer.ts
 * Bộ vẽ lưới kỹ thuật CAD thích ứng (Adaptive CAD Grid) & Thước tỉ lệ tọa độ
 * Render mượt mà 60 FPS trực tiếp trên HTML5 Canvas 2D
 */

import { getMetersPerPixel, type ViewportState } from './CADCoordinateTransform';

const NICE_INTERVALS = [
  0.1, 0.2, 0.5,
  1, 2, 5,
  10, 20, 50,
  100, 200, 500,
  1000, 2000, 5000,
  10000, 20000, 50000,
  100000, 200000, 500000,
];

function getOptimalGridInterval(metersPerPixel: number, minPixelsBetweenLines = 40): number {
  const targetMeters = metersPerPixel * minPixelsBetweenLines;
  for (const interval of NICE_INTERVALS) {
    if (interval >= targetMeters) return interval;
  }
  return NICE_INTERVALS[NICE_INTERVALS.length - 1];
}

export function drawCADGrid(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState
): void {
  const { width, height, center, zoom } = viewport;
  const [centerLat] = center;
  const mpp = getMetersPerPixel(centerLat, zoom);

  // 1. Fill background with dark CAD canvas theme
  ctx.save();
  ctx.fillStyle = '#0b0f19'; // Deep Slate Dark CAD Background
  ctx.fillRect(0, 0, width, height);

  // 2. Compute grid step in meters and screen pixels
  const minorIntervalMeters = getOptimalGridInterval(mpp, 50);
  const majorIntervalMeters = minorIntervalMeters * 5;
  const minorStepPx = minorIntervalMeters / mpp;
  const majorStepPx = majorIntervalMeters / mpp;

  if (minorStepPx <= 4) {
    ctx.restore();
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;

  // Offsets from center (0,0 meters)
  const startX = centerX % minorStepPx;
  const startY = centerY % minorStepPx;

  // Draw Minor Grid Lines
  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';

  for (let x = startX; x <= width; x += minorStepPx) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = startY; y <= height; y += minorStepPx) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();

  // Draw Major Grid Lines
  const majorStartX = centerX % majorStepPx;
  const majorStartY = centerY % majorStepPx;

  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)'; // Soft Indigo grid lines

  for (let x = majorStartX; x <= width; x += majorStepPx) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = majorStartY; y <= height; y += majorStepPx) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();

  // Draw Coordinate Center Axis Crosshair
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'; // Cyan Center Axes
  // X axis (horizontal)
  ctx.moveTo(0, Math.round(centerY) + 0.5);
  ctx.lineTo(width, Math.round(centerY) + 0.5);
  // Y axis (vertical)
  ctx.moveTo(Math.round(centerX) + 0.5, 0);
  ctx.lineTo(Math.round(centerX) + 0.5, height);
  ctx.stroke();

  // 3. Draw Scale Bar HUD (Bottom-Right)
  drawScaleBar(ctx, width, height, mpp);

  ctx.restore();
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mpp: number
): void {
  const roundedMeters = getOptimalGridInterval(mpp, 100);
  const barWidthPx = roundedMeters / mpp;

  const barX = width - barWidthPx - 20;
  const barY = height - 20;

  const label = roundedMeters >= 1000 ? `${(roundedMeters / 1000).toFixed(1)} km` : `${Math.round(roundedMeters)} m`;

  ctx.save();
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = 'rgba(241, 245, 249, 0.75)';
  ctx.textAlign = 'center';
  ctx.fillText(label, barX + barWidthPx / 2, barY - 6);

  // Scale Bar ticks
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.85)';
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barWidthPx, barY);
  ctx.moveTo(barX, barY - 4);
  ctx.lineTo(barX, barY + 4);
  ctx.moveTo(barX + barWidthPx, barY - 4);
  ctx.lineTo(barX + barWidthPx, barY + 4);
  ctx.moveTo(barX + barWidthPx / 2, barY - 2);
  ctx.lineTo(barX + barWidthPx / 2, barY + 2);
  ctx.stroke();
  ctx.restore();
}

// Map icons from Bandoso_V4
import { LucideProps } from 'lucide-react';
import {
  normalizeFeatureColor,
  normalizeFeatureSize,
  normalizeIconKey,
} from '@TOOL/utils/featureSymbolStyle';

export interface IconProps extends LucideProps {
  className?: string;
}

export const CameraCCTV = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <g transform="rotate(45 12 12)">
      <path d="M16.7 4a2 2 0 0 0-1.4.6l-8.3 8.3a2 2 0 0 0 .6 2.8l2.9 2.9a2 2 0 0 0 2.8-.6l8.3-8.3A2 2 0 0 0 21 8.3L19.7 5a2 2 0 0 0-3-1Z" />
      <path d="m14 7 3.3 3.3" />
      <path d="M4.6 20.4 8 17" />
      <path d="M2 22h4" />
    </g>
  </svg>
);

export const CameraPTZ = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M12 2v2" />
    <path d="M9 4h6l1 2H8l1-2z" />
    <path d="M12 22a8 8 0 0 0 8-8c0-3.5-2-6.5-5-7.5" />
    <path d="M9 6.5C6 7.5 4 10.5 4 14a8 8 0 0 0 8 8" />
    <circle cx="12" cy="14" r="3" />
    <circle cx="12" cy="14" r="1" />
  </svg>
);

export const CameraSpeed = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <g>
      <g transform="scale(1, -1) translate(0, -24)">
        <path d="M10 2h4v4h-4z" />
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M16 6v12" />
        <path d="M20 6v12" />
        <circle cx="10" cy="12" r="2" />
      </g>
    </g>
  </svg>
);

export const CameraLPR = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <g>
      <g transform="scale(1, -1) translate(0, -24)">
        <rect width="18" height="12" x="3" y="8" rx="2" />
        <path d="M7 14h10" />
        <path d="M14 2v6" />
        <path d="M10 2v6" />
        <path d="M12 2v2" />
      </g>
    </g>
  </svg>
);

export const Intersection = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <g transform="rotate(45 12 12)">
      <path d="M8 2 L8 8 L2 8" />
      <path d="M16 2 L16 8 L22 8" />
      <path d="M22 16 L16 16 L16 22" />
      <path d="M8 22 L8 16 L2 16" />
    </g>
  </svg>
);

export const InfoCabinetIcon = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Top Plan View aspect ratio 2:1 (1.2m x 0.6m) */}
    <rect x="2" y="7" width="20" height="10" rx="1.5" fill="currentColor" fillOpacity="0.15" />
    <path d="M6 7v10" />
    <path d="M18 7v10" />
    <path d="M10 12h4" />
  </svg>
);

export const LightCabinetIcon = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Top Plan View aspect ratio 2:1 (1.0m x 0.5m) */}
    <rect x="3" y="7" width="18" height="10" rx="1" fill="currentColor" fillOpacity="0.15" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 7v2.5" />
    <path d="M12 14.5v2.5" />
  </svg>
);

export const PolylineIcon = ({ className, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M9 7h6a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h6" />
    <circle cx="7" cy="7" r="2" />
    <circle cx="17" cy="19" r="2" />
  </svg>
);

export const getIntersectionSvgString = (color: string, size: number = 40, index?: number | string) => {
  return getIconSvgString('intersection', color, size, index);
};

export const getIconSvgString = (type: string, color: string, size: number, index?: number | string, rotation: number = 0) => {
  const normalizedType = normalizeIconKey(type);
  const normalizedColor = normalizeFeatureColor(color);
  const normalizedSize = normalizeFeatureSize(size);
  const isWhite = ['#ffffff', 'white', '#fff', 'rgb(255, 255, 255)', 'rgba(255, 255, 255, 1)'].includes(normalizedColor.toLowerCase().trim());
  const textColor = isWhite ? '#111827' : '#ffffff';
  const textStrokeColor = isWhite ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';

  const common = `width="${normalizedSize}" height="${normalizedSize}" viewBox="0 0 24 24" fill="white" stroke="${normalizedColor}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"`;

  // High contrast text style for SVG with a thick white/black outline stroke
  const textStyle = `stroke="${textStrokeColor}" stroke-width="2.5" paint-order="stroke" font-family="Arial, sans-serif" font-weight="900" text-anchor="middle" fill="${textColor}"`;

  let iconContent = '';
  let textContent = '';

  const textX = 12;
  const textY = normalizedType === 'speed' ? 14.5 : (normalizedType === 'ptz' ? 18.5 : (normalizedType === 'lpr' ? 16.5 : 14.5));
  const fontSize = normalizedType === 'cctv' ? 8 : 9;

  const escapedIndex = index === undefined || index === ''
    ? ''
    : String(index)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  if (escapedIndex) {
    textContent = `<text x="${textX}" y="${textY}" font-size="${fontSize}" ${textStyle}>${escapedIndex}</text>`;
  }

  switch (normalizedType) {
    case 'info_cabinet':
      iconContent = `
        <rect x="2" y="7" width="20" height="10" rx="1.5" fill="white" stroke="${normalizedColor}" stroke-width="1.75" />
        <path d="M6 7v10" stroke="${normalizedColor}" />
        <path d="M18 7v10" stroke="${normalizedColor}" />
        <path d="M10 12h4" stroke="${normalizedColor}" />
      `;
      break;
    case 'light_cabinet':
      iconContent = `
        <rect x="3" y="7" width="18" height="10" rx="1" fill="white" stroke="${normalizedColor}" stroke-width="1.75" />
        <circle cx="12" cy="12" r="2.5" fill="${normalizedColor}" />
      `;
      break;
    case 'speed':
      iconContent = `
        <g transform="scale(1, -1) translate(0, -24)">
          <rect x="4" y="6" width="16" height="12" rx="2" fill="white" />
          <path d="M10 2h4v4h-4z" fill="white" />
          <path d="M16 6v12" />
          <path d="M20 6v12" />
        </g>
        ${index === undefined ? '<circle cx="10" cy="18" r="2" />' : ''}
      `;
      break;
    case 'ptz':
      iconContent = `
        <path d="M12 2v2" />
        <path d="M9 4h6l1 2H8l1-2z" fill="white" />
        <path d="M12 22a8 8 0 0 0 8-8c0-3.5-2-6.5-5-7.5" fill="white" />
        <path d="M9 6.5C6 7.5 4 10.5 4 14a8 8 0 0 0 8 8" fill="white" />
        ${index === undefined ? '<circle cx="12" cy="14" r="3" /><circle cx="12" cy="14" r="1" />' : ''}
      `;
      break;
    case 'cctv':
      iconContent = `
        <g transform="rotate(45 12 12)">
          <path d="M16.7 4a2 2 0 0 0-1.4.6l-8.3 8.3a2 2 0 0 0 .6 2.8l2.9 2.9a2 2 0 0 0 2.8-.6l8.3-8.3A2 2 0 0 0 21 8.3L19.7 5a2 2 0 0 0-3-1Z" fill="white" />
          <path d="m14 7 3.3 3.3" />
          <path d="M4.6 20.4 8 17" />
          <path d="M2 22h4" />
        </g>
      `;
      break;
    case 'intersection':
      iconContent = `
        <g transform="rotate(45 12 12)">
          <path d="M8 2 L8 8 L2 8" />
          <path d="M16 2 L16 8 L22 8" />
          <path d="M22 16 L16 16 L16 22" />
          <path d="M8 22 L8 16 L2 16" />
        </g>
      `;
      break;
    case 'lpr':
      iconContent = `
        <g transform="scale(1, -1) translate(0, -24)">
          <rect width="18" height="12" x="3" y="8" rx="2" fill="white" />
          <path d="M7 14h10" />
          <path d="M14 2v6" />
          <path d="M10 2v6" />
          <path d="M12 2v2" />
        </g>
      `;
      break;
    case 'default':
    case 'point_circle':
    default:
      iconContent = `
        <circle cx="12" cy="12" r="8.5" fill="${normalizedColor}" stroke="white" stroke-width="1.5" />
      `;
      break;
  }

  let iconBaseRotation = 0;
  if (normalizedType === 'cctv') {
    iconBaseRotation = -45; // Counteract native 45deg path tilt so rotation=0 points North (0deg)
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" ${common}>
      <g transform="rotate(${rotation + iconBaseRotation} 12 12)">
        ${iconContent}
      </g>
      ${textContent}
    </svg>`;
};


export default { CameraCCTV, CameraPTZ, CameraSpeed, CameraLPR, InfoCabinetIcon, LightCabinetIcon, Intersection, PolylineIcon, getIconSvgString, getIntersectionSvgString };

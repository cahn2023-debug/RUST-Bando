// Map icons from Bandoso_V4
import { LucideProps } from 'lucide-react';

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
  return `<div class="relative z-10 filter hover:scale-110 transition-transform" style="filter: brightness(1.2) saturate(1.2) drop-shadow(0 4px 6px rgba(0,0,0,0.4));">
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="transform origin-center">
          <g transform="rotate(45 12 12)">
            <path d="M8 2 L8 8 L2 8" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M16 2 L16 8 L22 8" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 16 L16 16 L16 22" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 22 L8 16 L2 16" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </g>
        </svg>
        ${index ? `<div class="absolute inset-0 flex items-center justify-center font-bold text-sm" style="color: ${color}; text-shadow: 0 0 2px white, 0 0 4px white, 1px 1px 1px rgba(0,0,0,0.4);">${index}</div>` : ''}
      </div>`;
}

export const getIconSvgString = (type: string, color: string, size: number, index?: number | string, rotation: number = 0) => {
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="white" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"`;

  // High contrast text style for SVG - Enhanced with thicker stroke and filter
  const textStyle = `stroke="white" stroke-width="1.2" paint-order="stroke" font-family="Arial, sans-serif" font-weight="900" text-anchor="middle" fill="${color}" filter="drop-shadow(0 0.5px 1px rgba(0,0,0,0.2))"`;

  let iconContent = '';
  let textContent = '';

  const textX = 12;
  const textY = type === 'speed' ? 14.5 : (type === 'ptz' ? 18.5 : (type === 'lpr' ? 16.5 : 14.5));
  const fontSize = type === 'cctv' || type === 'camera' ? 8 : 9;

  const brightenFilter = `filter: brightness(1.1) saturate(1.2) drop-shadow(0 2px 4px rgba(0,0,0,0.3));`;

  if (index !== undefined && index !== '') {
    textContent = `<text x="${textX}" y="${textY}" font-size="${fontSize}" ${textStyle}>${index}</text>`;
  }

  switch (type) {
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
    case 'camera':
      iconContent = `
        <g transform="rotate(45 12 12)">
          <path d="M16.7 4a2 2 0 0 0-1.4.6l-8.3 8.3a2 2 0 0 0 .6 2.8l2.9 2.9a2 2 0 0 0 2.8-.6l8.3-8.3A2 2 0 0 0 21 8.3L19.7 5a2 2 0 0 0-3-1Z" fill="white" />
          <path d="m14 7 3.3 3.3" />
          <path d="M4.6 20.4 8 17" />
          <path d="M2 22h4" />
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
    default: return '';
  }

  let iconBaseRotation = 0;
  if (['cctv', 'camera', 'ptz', 'speed', 'lpr'].includes(type)) {
    iconBaseRotation = 0; // All cameras now match Treeview orientation
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" ${common} style="${brightenFilter}">
      <g transform="rotate(${rotation + iconBaseRotation} 12 12)">
        ${iconContent}
      </g>
      ${textContent}
    </svg>`;
};


export default { CameraCCTV, CameraPTZ, CameraSpeed, CameraLPR, Intersection, PolylineIcon, getIconSvgString, getIntersectionSvgString };

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
    <path d="M16.7 4a2 2 0 0 0-1.4.6l-8.3 8.3a2 2 0 0 0 .6 2.8l2.9 2.9a2 2 0 0 0 2.8-.6l8.3-8.3A2 2 0 0 0 21 8.3L19.7 5a2 2 0 0 0-3-1Z" />
    <path d="m14 7 3.3 3.3" />
    <path d="M4.6 20.4 8 17" />
    <path d="M2 22h4" />
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
    {/* Pendant Mount Top */}
    <path d="M12 2v2" />
    <path d="M9 4h6l1 2H8l1-2z" />
    {/* Main Dome Body */}
    <path d="M12 22a8 8 0 0 0 8-8c0-3.5-2-6.5-5-7.5" />
    <path d="M9 6.5C6 7.5 4 10.5 4 14a8 8 0 0 0 8 8" />
    {/* Lens/IR Window - Center focus */}
    <circle cx="12" cy="14" r="3" />
    {/* Inner lens detail */}
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
    {/* Mounting bracket */}
    <path d="M10 2h4v4h-4z" />
    {/* Main body - Boxy Tattile style */}
    <rect x="4" y="6" width="16" height="12" rx="2" />
    {/* Front Lens/Window */}
    <path d="M16 6v12" />
    {/* Radar/Sensor details */}
    <circle cx="10" cy="12" r="2" />
    {/* Flash/Infrared (optional detail) */}
    <path d="M20 6v12" /> 
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
    <rect width="18" height="12" x="3" y="8" rx="2" />
    <path d="M7 14h10" />
    <path d="M14 2v6" />
    <path d="M10 2v6" />
    <path d="M12 2v2" />
  </svg>
);

export const getIconSvgString = (type: string, color: string, size: number, index?: number | string) => {
  const commonAttrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="white" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"`;
  

  const speedPath = `
    <rect x="4" y="6" width="16" height="12" rx="2" fill="white" />
    <path d="M10 2h4v4h-4z" fill="white" />
    <path d="M16 6v12" />
    <path d="M20 6v12" />
    ${index !== undefined 
      ? `<text x="10" y="16" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="900" fill="${color}" stroke="none">${index}</text>`
      : '<circle cx="10" cy="12" r="2" />'} 
  `;

  const ptzPath = `
    <path d="M12 2v2" />
    <path d="M9 4h6l1 2H8l1-2z" fill="white" />
    <path d="M12 22a8 8 0 0 0 8-8c0-3.5-2-6.5-5-7.5" fill="white" />
    <path d="M9 6.5C6 7.5 4 10.5 4 14a8 8 0 0 0 8 8" fill="white" />
    ${index !== undefined 
      ? `<text x="12" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="900" fill="${color}" stroke="none">${index}</text>`
      : '<circle cx="12" cy="14" r="3" /><circle cx="12" cy="14" r="1" />'}
  `;

  const cctvPath = `
    <path d="M16.7 4a2 2 0 0 0-1.4.6l-8.3 8.3a2 2 0 0 0 .6 2.8l2.9 2.9a2 2 0 0 0 2.8-.6l8.3-8.3A2 2 0 0 0 21 8.3L19.7 5a2 2 0 0 0-3-1Z" fill="white" />
    <path d="m14 7 3.3 3.3" />
    <path d="M4.6 20.4 8 17" />
    <path d="M2 22h4" />
    ${index !== undefined 
      ? `<text x="13" y="14" transform="rotate(45 13 14)" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" font-weight="900" fill="${color}" stroke="none">${index}</text>`
      : ''}
  `;

  const lprPath = `
    <rect width="18" height="12" x="3" y="8" rx="2" fill="white" />
    <path d="M7 14h10" />
    <path d="M14 2v6" />
    <path d="M10 2v6" />
    <path d="M12 2v2" />
    ${index !== undefined 
      ? `<text x="12" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="900" fill="${color}" stroke="none">${index}</text>`
      : ''}
  `;

  let content = '';
  switch (type) {
    case 'speed': content = speedPath; break;
    case 'ptz': content = ptzPath; break;
    case 'cctv': content = cctvPath; break;
    case 'lpr': content = lprPath; break;
    default: return ''; 
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" ${commonAttrs}>${content}</svg>`;
};

export default { CameraCCTV, CameraPTZ, CameraSpeed, CameraLPR, getIconSvgString };

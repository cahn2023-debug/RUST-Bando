import type { FeatureMetadata, FeatureProperties, IconType } from '@CONTRACT/types';

const getNormalizedIcon = (icon: unknown): IconType => {
  switch (icon) {
    case 'cctv':
    case 'ptz':
    case 'speed':
    case 'lpr':
    case 'intersection':
      return icon;
    default:
      return 'default';
  }
};

export const getTypeForIcon = (icon: IconType): string => {
  switch (icon) {
    case 'cctv':
      return 'cctv';
    case 'ptz':
      return 'ptz';
    case 'speed':
      return 'speed';
    case 'lpr':
      return 'lpr';
    case 'intersection':
      return 'intersection';
    default:
      return 'point';
  }
};

export const buildFeaturePropertiesForPersistence = (
  properties: FeatureProperties | undefined,
  metadata: FeatureMetadata
): FeatureProperties => {
  const nextIcon = getNormalizedIcon(metadata.icon);
  const nextType = typeof metadata.type === 'string' && metadata.type ? metadata.type : getTypeForIcon(nextIcon);

  return {
    ...(properties || {}),
    icon: nextIcon,
    iconKey: nextIcon,
    type: nextType,
  };
};

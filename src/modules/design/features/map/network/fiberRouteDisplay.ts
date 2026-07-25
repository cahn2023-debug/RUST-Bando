import type { FeatureMetadata, FeatureProperties, FeatureState } from '@CONTRACT/types';
import { getParsedMetadata } from '@TOOL/utils/featureMetadata';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const getOrderValue = (feature: FeatureState): string => {
  const metadata = getParsedMetadata(feature) as FeatureMetadata & Record<string, unknown>;
  const properties = asRecord(feature.properties) as FeatureProperties | null;
  return asString(
    metadata.display_order
    ?? metadata.stt
    ?? metadata.STT
    ?? properties?.display_order
    ?? properties?.stt
    ?? properties?.STT
  ).trim();
};

const formatRouteFeature = (feature: FeatureState): string => {
  const order = getOrderValue(feature);
  const rawName = asString(feature.name).trim();
  const name = order && rawName.startsWith(`${order}.`)
    ? rawName.slice(order.length + 1).trim()
    : rawName;
  return order ? `${order}.${name || feature.id}` : (name || feature.id);
};

const getFallbackEndpointIds = (metadata: FeatureMetadata): string[] => {
  const network = metadata.network || {};
  return [
    network.from_feature_id,
    metadata.start_node_id,
    network.to_feature_id,
    metadata.end_node_id,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
};

export const getFiberRouteFeatureIds = (metadata: FeatureMetadata): string[] => {
  const snapLinks = metadata.snap_links;
  if (snapLinks && typeof snapLinks === 'object') {
    const ordered = Object.entries(snapLinks)
      .map(([key, value]) => {
        const match = /^v(\d+)$/.exec(key);
        return match && typeof value === 'string'
          ? { index: Number(match[1]), value }
          : null;
      })
      .filter((entry): entry is { index: number; value: string } => entry !== null)
      .sort((a, b) => a.index - b.index)
      .map(entry => entry.value);
    if (ordered.length > 0) return ordered;
  }

  return getFallbackEndpointIds(metadata);
};

export const buildFiberRouteDisplay = (
  feature: FeatureState,
  featuresById: Record<string, FeatureState> | undefined,
  metadata: FeatureMetadata = getParsedMetadata(feature) as FeatureMetadata
): string => {
  const routeIds = getFiberRouteFeatureIds(metadata);
  const routeParts: string[] = [];
  let previousId: string | null = null;

  for (const featureId of routeIds) {
    if (featureId === previousId) continue;
    previousId = featureId;
    const routeFeature = featuresById?.[featureId];
    if (!routeFeature) continue;
    routeParts.push(formatRouteFeature(routeFeature));
  }

  return routeParts.join(' - ');
};

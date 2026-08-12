import type { DesignEventType, FeatureGroupState, FeatureProperties, FeatureState } from '@CONTRACT/types';
import type { DisplayNetworkNode } from './NetworkGraphAggregation';
import type { NetworkConnectionDraft } from './NetworkEndpoint';
import { getNextFeatureDisplayOrder, syncDisplayOrderAliases } from '@TOOL/utils/featureMapping';
import { getParsedMetadata } from '@TOOL/utils/featureMetadata';
import { inferNetworkRole, isSourceRole } from './networkTopology';
import { getRepresentativeFeatureIdForEndpoint } from './NetworkEndpoint';

export interface BuildNetworkConnectionCreateEventsArgs {
    sourceNode: DisplayNetworkNode;
    targetNode: DisplayNetworkNode;
    draft: NetworkConnectionDraft;
    group: FeatureGroupState;
    selectedGroupId: string;
    activeParentFeatureId: string | null;
    featuresById: Record<string, FeatureState>;
    createId?: () => string;
}

export interface BuildNetworkConnectionCreateEventsResult {
    events: DesignEventType[];
    createdFeatureId: string;
    activeParentFeatureId: string | null;
}

export const buildNetworkConnectionCreateEvents = ({
    sourceNode,
    targetNode,
    draft,
    group,
    selectedGroupId,
    activeParentFeatureId,
    featuresById,
    createId = () => crypto.randomUUID(),
}: BuildNetworkConnectionCreateEventsArgs): BuildNetworkConnectionCreateEventsResult => {
    const events: DesignEventType[] = [];
    const createdFeatureId = createId();
    const fromEndpoint = draft.fromEndpoint;
    const toEndpoint = draft.toEndpoint;
    const fromFeatureId = fromEndpoint.type === 'feature'
        ? fromEndpoint.id
        : getRepresentativeFeatureIdForEndpoint(fromEndpoint, featuresById);
    const toFeatureId = toEndpoint.type === 'feature'
        ? toEndpoint.id
        : getRepresentativeFeatureIdForEndpoint(toEndpoint, featuresById);

    const metadata: Record<string, unknown> = syncDisplayOrderAliases({
        color: '#EF4444',
        infrastructure: {
            type: 'NetworkLink',
            line_style: 'dashed',
            icon_type: 'signal',
        },
        network: {
            from_feature_id: fromFeatureId,
            to_feature_id: toFeatureId,
            from_endpoint: fromEndpoint,
            to_endpoint: toEndpoint,
            direction_mode: 'auto',
        },
    }, getNextFeatureDisplayOrder(
        featuresById,
        selectedGroupId,
        activeParentFeatureId
    ));

    const sourceFeature = sourceNode.representative.feature;
    const targetFeature = targetNode.representative.feature;
    const sourceMeta = { ...(getParsedMetadata(sourceFeature) as Record<string, any>) };
    const targetMeta = { ...(getParsedMetadata(targetFeature) as Record<string, any>) };
    const sourceRole = inferNetworkRole(sourceFeature, sourceMeta as any);
    const targetRole = inferNetworkRole(targetFeature, targetMeta as any);
    const sourceFeatureIsSource = isSourceRole(sourceRole);
    const targetFeatureIsSource = isSourceRole(targetRole);

    const parentSourceFeature = sourceFeatureIsSource && !targetFeatureIsSource
        ? sourceFeature
        : targetFeatureIsSource && !sourceFeatureIsSource
            ? targetFeature
            : null;
    const parentDeviceFeature = parentSourceFeature?.id === sourceFeature.id
        ? targetFeature
        : parentSourceFeature?.id === targetFeature.id
            ? sourceFeature
            : null;

    if (parentSourceFeature && parentDeviceFeature) {
        const deviceMeta = { ...(getParsedMetadata(parentDeviceFeature) as Record<string, any>) };
        if (deviceMeta.parent_feature_id !== parentSourceFeature.id) {
            deviceMeta.parent_feature_id = parentSourceFeature.id;
            events.push({
                type: 'FeatureUpdated',
                payload: {
                    id: parentDeviceFeature.id,
                    metadata: JSON.stringify(deviceMeta),
                },
            });
        }
    }

    events.push({
        type: 'FeatureCreated',
        payload: {
            id: createdFeatureId,
            layer_id: group.layer_id,
            group_id: selectedGroupId,
            name: 'Tuyen Network Moi',
            geom_type: 'NetworkLink',
            coordinates: null,
            metadata: JSON.stringify(metadata),
            properties: {} as FeatureProperties,
        },
    });

    return {
        events,
        createdFeatureId,
        activeParentFeatureId: activeParentFeatureId || null,
    };
};

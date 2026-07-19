import type { DisplayNetworkNode } from './NetworkGraphAggregation';
import type { NetworkConnectionDraft } from './NetworkEndpoint';

export interface PrepareNetworkConnectionDraftResult {
    draft: NetworkConnectionDraft;
    groupId: string | null;
    activeParentFeatureId: string | null;
}

export const prepareNetworkConnectionDraft = (
    sourceNode: DisplayNetworkNode | null | undefined,
    targetNode: DisplayNetworkNode | null | undefined,
    tab: 'intersection' | 'route' | 'fiber'
): PrepareNetworkConnectionDraftResult | null => {
    if (!sourceNode || !targetNode) return null;

    const groupId = sourceNode.groupId || targetNode.groupId || null;
    const activeParentFeatureId = tab === 'intersection'
        ? sourceNode.ownerIntersectionId || targetNode.ownerIntersectionId || null
        : null;

    return {
        draft: {
            fromEndpoint: sourceNode.endpointRef,
            toEndpoint: targetNode.endpointRef,
        },
        groupId,
        activeParentFeatureId,
    };
};

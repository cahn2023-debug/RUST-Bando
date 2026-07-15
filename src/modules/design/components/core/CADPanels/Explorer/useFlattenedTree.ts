import { useMemo, useCallback } from "react";
import { getFeatureDisplayInfo, getParsedMetadata, calculateFeatureNumbers, isMatchSearch } from "@TOOL/utils/featureUtils";
import type { RegionState, LayerState, FeatureGroupState, FeatureState } from "@CONTRACT/types";

type TreeNodeData = RegionState | FeatureGroupState | FeatureState;

const getGroupKind = (group: FeatureGroupState): string =>
    group.group_type || group.type || 'default';

const hasStringId = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0;

const isNetworkLinkFeature = (feature: FeatureState): boolean => {
    const metadata = getParsedMetadata(feature);
    return !!metadata.infrastructure &&
        typeof metadata.infrastructure === 'object' &&
        (metadata.infrastructure as Record<string, unknown>).type === 'NetworkLink';
};

export interface FlatTreeItem {
    type: 'region' | 'group' | 'feature' | 'intersection-children-group';
    id: string;
    level: number;
    levelOffset: number;
    data: TreeNodeData | { id: string; name: string; parentFeatureId: string };
}

interface UseFlattenedTreeProps {
    regionsMap: Record<string, RegionState>;
    layersMap: Record<string, LayerState>;
    groupsMap: Record<string, FeatureGroupState>;
    featuresMap: Record<string, FeatureState>;
    expanded: Record<string, boolean>;
    treeSearchQuery: string;
    filterType: string | null;
    reverseOrder: boolean;
    sortField: 'name' | 'stt';
}

export function useFlattenedTree({
    regionsMap,
    layersMap,
    groupsMap,
    featuresMap,
    expanded,
    treeSearchQuery,
    filterType,
    reverseOrder,
    sortField
}: UseFlattenedTreeProps) {
    const designs = useMemo(() => Object.values(featuresMap), [featuresMap]);
    const featureNumbers = useMemo(() => calculateFeatureNumbers(designs, featuresMap), [designs, featuresMap]);

    const matchesSearch = useCallback((item: TreeNodeData) => {
        if (!treeSearchQuery || !treeSearchQuery.trim()) return true;
        return isMatchSearch(item, treeSearchQuery, featureNumbers);
    }, [treeSearchQuery, featureNumbers]);

    const {
        regionGroupsMap,
        groupFeaturesMap,
        regionIndependentFeaturesMap,
        featureChildrenMap,
        groupParentMap,
        allGroupsMap
    } = useMemo(() => {
        const lRegionMap: Record<string, string> = {};
        const rGroupsMap: Record<string, FeatureGroupState[]> = {};
        const gFeaturesMap: Record<string, FeatureState[]> = {};
        const rIndependentFeaturesMap: Record<string, FeatureState[]> = {};
        const fChildrenMap: Record<string, FeatureState[]> = {};
        const gParentMap: Record<string, FeatureGroupState[]> = {};

        const layers = Object.values(layersMap);
        const groups = Object.values(groupsMap);
        const features = Object.values(featuresMap).filter(feature => !isNetworkLinkFeature(feature));

        layers.forEach(l => {
            lRegionMap[l.id] = l.region_id;
        });

        const compareItems = (a: FeatureGroupState | FeatureState, b: FeatureGroupState | FeatureState) => {
            const aStt = featureNumbers[a.id] || getParsedMetadata(a).display_order;
            const bStt = featureNumbers[b.id] || getParsedMetadata(b).display_order;

            if (sortField === 'stt' && (aStt !== undefined || bStt !== undefined)) {
                if (aStt === undefined) return 1;
                if (bStt === undefined) return -1;
                return String(aStt).localeCompare(String(bStt), undefined, { numeric: true, sensitivity: 'base' });
            }

            const nameA = a.name || '';
            const nameB = b.name || '';
            if (nameA !== nameB) {
                return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
            }
            return a.id.localeCompare(b.id);
        };

        const sortedGroups = [...groups].sort(compareItems);
        sortedGroups.forEach(g => {
            const regionId = lRegionMap[g.layer_id];
            if (regionId && !g.parent_id) {
                if (!rGroupsMap[regionId]) rGroupsMap[regionId] = [];
                rGroupsMap[regionId].push(g);
            }

            const parentId = g.parent_id || 'root';
            if (!gParentMap[parentId]) gParentMap[parentId] = [];
            gParentMap[parentId].push(g);
        });

        const allGroupsMap = { ...groupsMap };

        const sortedFeatures = [...features].sort(compareItems);
        sortedFeatures.forEach(f => {
            const meta = getParsedMetadata(f);
            const parentFeatureId = hasStringId(meta.parent_feature_id) ? meta.parent_feature_id : null;

            if (parentFeatureId) {
                if (!fChildrenMap[parentFeatureId]) fChildrenMap[parentFeatureId] = [];
                fChildrenMap[parentFeatureId].push(f);
            } else if (f.group_id && groupsMap[f.group_id]) {
                if (!gFeaturesMap[f.group_id]) gFeaturesMap[f.group_id] = [];
                gFeaturesMap[f.group_id].push(f);
            } else {
                const regionId = lRegionMap[f.layer_id];
                if (regionId) {
                    // Restore: Automatic grouping for Intersections (Nút giao)
                    const displayInfo = getFeatureDisplayInfo(f);
                    if (displayInfo.isIntersection) {
                        const vGroupId = `virtual-intersection-${regionId}`;
                        if (!gFeaturesMap[vGroupId]) {
                            gFeaturesMap[vGroupId] = [];
                            // Ensure the virtual group is added to the region's group list if not already there
                            if (!rGroupsMap[regionId]) rGroupsMap[regionId] = [];
                            // Create a virtual group object
                            const virtualGroup = {
                                id: vGroupId,
                                name: "Danh sách Nút giao",
                                group_type: 'INTERSECTION',
                                layer_id: f.layer_id,
                                is_visible: true,
                                is_virtual: true,
                                metadata: ''
                            } satisfies FeatureGroupState;
                            allGroupsMap[vGroupId] = virtualGroup; // Add to augmented map
                            if (!rGroupsMap[regionId].some(g => g.id === vGroupId)) {
                                rGroupsMap[regionId].push(virtualGroup);
                            }
                        }
                        gFeaturesMap[vGroupId].push(f);
                    } else {
                        if (!rIndependentFeaturesMap[regionId]) rIndependentFeaturesMap[regionId] = [];
                        rIndependentFeaturesMap[regionId].push(f);
                    }
                }
            }
        });

        return {
            regionGroupsMap: rGroupsMap,
            groupFeaturesMap: gFeaturesMap,
            regionIndependentFeaturesMap: rIndependentFeaturesMap,
            featureChildrenMap: fChildrenMap,
            groupParentMap: gParentMap,
            allGroupsMap: allGroupsMap
        };
    }, [layersMap, groupsMap, featuresMap, sortField, featureNumbers]);

    const groupVisibilityMap = useMemo(() => {
        const map: Record<string, boolean> = {};
        if (!treeSearchQuery?.trim() && !filterType) return null;

        const isDescendantOfIntersection = (f: FeatureState): boolean => {
            const meta = getParsedMetadata(f);
            const parentId = hasStringId(meta.parent_feature_id) ? meta.parent_feature_id : null;
            if (!parentId) return false;
            const parent = featuresMap[parentId];
            if (!parent) return false;
            if (getFeatureDisplayInfo(parent).isIntersection) return true;
            return isDescendantOfIntersection(parent);
        };

        const matchesFilter = (f: FeatureState): boolean => {
            if (!filterType) return true;

            if (filterType === 'INTERSECTION') {
                return getFeatureDisplayInfo(f).isIntersection || isDescendantOfIntersection(f);
            }

            const ownInfo = getFeatureDisplayInfo(f);
            if (filterType === 'POLYLINE' && ownInfo.isLine) return true;
            if (['CCTV', 'PTZ', 'SPEED', 'LPR'].includes(filterType) && ownInfo.label === filterType) return true;

            const group = f.group_id ? allGroupsMap[f.group_id] || (f.group_id.startsWith('virtual-') ? allGroupsMap[f.group_id] : null) : null;
            if (group) {
                const gType = getGroupKind(group);
                if (gType === filterType) return true;
                const info = getFeatureDisplayInfo(f, gType, group.name);
                if (filterType === 'POLYLINE' && info.isLine) return true;
                if (['CCTV', 'PTZ', 'SPEED', 'LPR'].includes(filterType) && info.label === filterType) return true;
            }
            return false;
        };

        const matchesFilterOrHasMatchingDescendant = (f: FeatureState): boolean => {
            if (matchesFilter(f)) return true;
            const children = featureChildrenMap[f.id] || [];
            return children.some(child => matchesFilterOrHasMatchingDescendant(child));
        };

        const matchesSearchOrHasMatchingDescendant = (f: FeatureState): boolean => {
            if (matchesSearch(f)) return true;
            const children = featureChildrenMap[f.id] || [];
            return children.some(child => matchesSearchOrHasMatchingDescendant(child));
        };

        const checkGroup = (groupId: string): boolean => {
            if (map[groupId] !== undefined) return map[groupId];

            const group = allGroupsMap[groupId];
            if (!group) return false;

            const selfMatches = matchesSearch(group) && (
                !filterType ||
                (filterType === 'FOLDER' && getGroupKind(group) === 'default') ||
                getGroupKind(group) === filterType
            );

            const gFeatures = groupFeaturesMap[groupId];
            const featureMatches = gFeatures?.some(f => {
                if (!matchesSearchOrHasMatchingDescendant(f)) return false;
                if (!filterType) return true;
                if (filterType === 'FOLDER') return false;
                return matchesFilterOrHasMatchingDescendant(f);
            });

            const subGroups = groupParentMap[groupId];
            const subgroupMatches = subGroups?.some(sg => checkGroup(sg.id));

            const isVisible = !!(selfMatches || featureMatches || subgroupMatches);
            map[groupId] = isVisible;
            return isVisible;
        };

        Object.keys(allGroupsMap).forEach(checkGroup);
        return map;
    }, [allGroupsMap, groupFeaturesMap, groupParentMap, treeSearchQuery, filterType, matchesSearch, featureChildrenMap, featuresMap]);

    const filteredRegions = useMemo(() => {
        let list = Object.values(regionsMap);
        if (treeSearchQuery || filterType) {
            const layerRegionMap: Record<string, string> = {};
            Object.values(layersMap).forEach(layer => {
                layerRegionMap[layer.id] = layer.region_id;
            });

            list = list.filter(r => {
                if (matchesSearch(r) && !filterType) return true;
                const rGroups = regionGroupsMap[r.id] || [];
                if (!groupVisibilityMap) return true;
                const hasMatchingGroup = rGroups.some(g => groupVisibilityMap[g.id]);
                if (hasMatchingGroup) return true;

                return Object.values(featuresMap).filter(feature => !isNetworkLinkFeature(feature)).some(f => {
                    if (layerRegionMap[f.layer_id] !== r.id) return false;
                    if (!matchesSearch(f)) return false;
                    if (!filterType) return true;
                    const info = getFeatureDisplayInfo(f);
                    return (filterType === 'INTERSECTION' && info.isIntersection) ||
                        (filterType === 'POLYLINE' && info.isLine) ||
                        info.label === filterType;
                });
            });
        }
        if (reverseOrder) list = [...list].reverse();
        return list;
    }, [regionsMap, layersMap, featuresMap, treeSearchQuery, filterType, reverseOrder, regionGroupsMap, groupVisibilityMap, matchesSearch]);

    const flattenedItems = useMemo(() => {
        const result: FlatTreeItem[] = [];
        const visited = new Set<string>();

        const isDescendantOfIntersection = (f: FeatureState): boolean => {
            const meta = getParsedMetadata(f);
            const parentId = hasStringId(meta.parent_feature_id) ? meta.parent_feature_id : null;
            if (!parentId) return false;
            const parent = featuresMap[parentId];
            if (!parent) return false;
            if (getFeatureDisplayInfo(parent).isIntersection) return true;
            return isDescendantOfIntersection(parent);
        };

        const matchesFilter = (f: FeatureState): boolean => {
            if (!filterType) return true;
            
            if (filterType === 'INTERSECTION') {
                if (getFeatureDisplayInfo(f).isIntersection || isDescendantOfIntersection(f)) {
                    return true;
                }
            }

            const ownInfo = getFeatureDisplayInfo(f);
            if (filterType === 'POLYLINE' && ownInfo.isLine) return true;
            if (['CCTV', 'PTZ', 'SPEED', 'LPR'].includes(filterType) && ownInfo.label === filterType) return true;

            const group = f.group_id ? allGroupsMap[f.group_id] || (f.group_id.startsWith('virtual-') ? allGroupsMap[f.group_id] : null) : null;
            if (group) {
                const gType = getGroupKind(group);
                if (gType === filterType) return true;
                const info = getFeatureDisplayInfo(f, gType, group.name);
                if (filterType === 'POLYLINE' && info.isLine) return true;
                if (['CCTV', 'PTZ', 'SPEED', 'LPR'].includes(filterType) && info.label === filterType) return true;
            }
            return false;
        };

        const matchesFilterOrHasMatchingDescendant = (f: FeatureState): boolean => {
            if (matchesFilter(f)) return true;
            const children = featureChildrenMap[f.id] || [];
            return children.some(child => matchesFilterOrHasMatchingDescendant(child));
        };

        const matchesSearchOrHasMatchingDescendant = (f: FeatureState): boolean => {
            if (matchesSearch(f)) return true;
            const children = featureChildrenMap[f.id] || [];
            return children.some(child => matchesSearchOrHasMatchingDescendant(child));
        };

        const collectFeatures = (featureList: FeatureState[], level: number, levelOffset: number) => {
            let currentFeats = featureList;
            if (reverseOrder) currentFeats = [...currentFeats].reverse();

            currentFeats.forEach(f => {
                const show = matchesSearchOrHasMatchingDescendant(f) && matchesFilterOrHasMatchingDescendant(f);
                if (!show) return;

                result.push({ type: 'feature', id: f.id, level, levelOffset, data: f });
                
                const children = featureChildrenMap[f.id] || [];
                const isSearchOrFilterActive = !!(treeSearchQuery && treeSearchQuery.trim()) || !!filterType;

                if (children.length > 0) {
                    const hasMatchingChild = children.some(child => 
                        matchesSearchOrHasMatchingDescendant(child) && 
                        matchesFilterOrHasMatchingDescendant(child)
                    );
                    const isExpanded = expanded[`feature-${f.id}`] || (isSearchOrFilterActive && hasMatchingChild);
                    if (isExpanded) {
                        collectFeatures(children, level, levelOffset + 1);
                    }
                }
            });
        };

        const collectGroups = (parentId: string | null, level: number, regionId?: string) => {
            if (level > 20) return;
            let currentGroups: FeatureGroupState[] = [];
            if (!parentId && regionId) {
                currentGroups = (regionGroupsMap[regionId] || []);
            } else {
                currentGroups = (groupParentMap[parentId || 'root'] || []);
            }

            currentGroups.forEach(group => {
                if (visited.has(group.id)) return;
                visited.add(group.id);

                const groupFeatures = (groupFeaturesMap[group.id] || []);
                const hasVisibleContent = groupFeatures.length > 0 || (groupParentMap[group.id] || []).length > 0;

                const searchMatch = !treeSearchQuery || matchesSearch(group);
                if (!searchMatch && !hasVisibleContent) return;

                result.push({ type: 'group', id: group.id, level, levelOffset: 0, data: group });

                const shouldCollectGroup = expanded[group.id] || (!!groupVisibilityMap && groupVisibilityMap[group.id]);
                if (shouldCollectGroup) {
                    collectGroups(group.id, level + 1);
                    collectFeatures(groupFeatures, level, 0);
                }
            });
        };

        filteredRegions.forEach(region => {
            const searchMatch = !treeSearchQuery || matchesSearch(region);
            const regionGroups = regionGroupsMap[region.id] || [];
            if (!searchMatch && regionGroups.length === 0) return;

            result.push({ type: 'region', id: region.id, level: 0, levelOffset: 0, data: region });

            const shouldCollectRegion = expanded[region.id] || !!treeSearchQuery || !!filterType;
            if (shouldCollectRegion) {
                const independentFeatures = (regionIndependentFeaturesMap[region.id] || []);
                collectFeatures(independentFeatures, 1, 0);
                collectGroups(null, 1, region.id);
            }
        });

        return result;
    }, [filteredRegions, expanded, treeSearchQuery, filterType, reverseOrder, allGroupsMap, featureChildrenMap, groupParentMap, regionGroupsMap, regionIndependentFeaturesMap, groupFeaturesMap, matchesSearch, featuresMap, groupVisibilityMap]);

    return {
        flattenedItems,
        featureNumbers,
        filteredRegions,
        featureChildrenMap
    };
}

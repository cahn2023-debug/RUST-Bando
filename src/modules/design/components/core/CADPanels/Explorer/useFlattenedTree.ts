import { useMemo, useCallback } from "react";
import { getFeatureDisplayInfo, getParsedMetadata, calculateFeatureNumbers, isMatchSearch } from "@TOOL/utils/featureUtils";
import type { RegionState, LayerState, FeatureGroupState, FeatureState } from "@CONTRACT/types";

export interface FlatTreeItem {
    type: 'region' | 'group' | 'feature';
    id: string;
    level: number;
    levelOffset: number;
    data: RegionState | FeatureGroupState | FeatureState;
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

    const matchesSearch = useCallback((item: RegionState | FeatureGroupState | FeatureState) => {
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
        const features = Object.values(featuresMap);

        layers.forEach(l => {
            // V2 Fix: Ensure layers default to visible if not explicitly set
            if (l.is_visible === undefined) {
                l.is_visible = true;
            }
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
            // V2 Fix: Ensure groups default to visible if not explicitly set
            if (g.is_visible === undefined) {
                g.is_visible = true;
            }
            
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
            // V2 Fix: Ensure features default to visible if not explicitly set
            if (f.is_visible === undefined) {
                f.is_visible = true;
            }
            
            const meta = getParsedMetadata(f);
            const parentFeatureId = meta.parent_feature_id;

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
                                is_virtual: true
                            };
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

        const checkGroup = (groupId: string): boolean => {
            if (map[groupId] !== undefined) return map[groupId];

            const group = allGroupsMap[groupId];
            if (!group) return false;

            const selfMatches = matchesSearch(group) && (
                !filterType ||
                (filterType === 'FOLDER' && (group.group_type === 'default' || !group.group_type)) ||
                (group.group_type || group.type) === filterType
            );

            const gFeatures = groupFeaturesMap[groupId];
            const featureMatches = gFeatures?.some(f => {
                if (!matchesSearch(f)) return false;
                if (!filterType) return true;
                if (filterType === 'FOLDER') return false;
                const info = getFeatureDisplayInfo(f, group.group_type || group.type, group.name);
                return (filterType === 'INTERSECTION' && info.isIntersection) || (filterType === 'POLYLINE' && info.isLine) || info.label === filterType;
            });

            const subGroups = groupParentMap[groupId];
            const subgroupMatches = subGroups?.some(sg => checkGroup(sg.id));

            const isVisible = !!(selfMatches || featureMatches || subgroupMatches);
            map[groupId] = isVisible;
            return isVisible;
        };

        Object.keys(allGroupsMap).forEach(checkGroup);
        return map;
    }, [allGroupsMap, groupFeaturesMap, groupParentMap, treeSearchQuery, filterType, matchesSearch]);

    const filteredRegions = useMemo(() => {
        let list = Object.values(regionsMap);
        if (treeSearchQuery || filterType) {
            list = list.filter(r => {
                if (matchesSearch(r) && !filterType) return true;
                const rGroups = regionGroupsMap[r.id] || [];
                if (!groupVisibilityMap) return true;
                return rGroups.some(g => groupVisibilityMap[g.id]);
            });
        }
        if (reverseOrder) list = [...list].reverse();
        return list;
    }, [regionsMap, treeSearchQuery, filterType, reverseOrder, regionGroupsMap, groupVisibilityMap, matchesSearch]);

    const flattenedItems = useMemo(() => {
        const result: FlatTreeItem[] = [];
        const visited = new Set<string>();

        const collectFeatures = (featureList: FeatureState[], level: number, levelOffset: number) => {
            let currentFeats = featureList;
            if (reverseOrder) currentFeats = [...currentFeats].reverse();

            currentFeats.forEach(f => {
                const searchMatch = !treeSearchQuery || matchesSearch(f);
                if (!searchMatch && !filterType) return;

                let show = searchMatch;
                if (filterType && show) {
                    const group = allGroupsMap[f.group_id] || (f.group_id?.startsWith('virtual-') ? allGroupsMap[f.group_id] : null);
                    if (group) {
                        const gType = group.group_type || group.type;
                        if (gType !== filterType) {
                            const info = getFeatureDisplayInfo(f, gType, group.name);
                            if (filterType === 'INTERSECTION' && !info.isIntersection) show = false;
                            else if (filterType === 'POLYLINE' && !info.isLine) show = false;
                            else if (['CCTV', 'PTZ', 'SPEED', 'LPR'].includes(filterType) && info.label !== filterType) show = false;
                            else if (filterType === 'FOLDER') show = false;
                        }
                    }
                }

                if (show) {
                    result.push({ type: 'feature', id: f.id, level, levelOffset, data: f });
                    if (expanded[`feature-${f.id}`]) {
                        const children = featureChildrenMap[f.id] || [];
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

                if (expanded[group.id]) {
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

            if (expanded[region.id]) {
                const independentFeatures = (regionIndependentFeaturesMap[region.id] || []);
                collectFeatures(independentFeatures, 1, 0);
                collectGroups(null, 1, region.id);
            }
        });

        return result;
    }, [filteredRegions, expanded, treeSearchQuery, filterType, reverseOrder, allGroupsMap, regionsMap, featureChildrenMap, groupParentMap, regionGroupsMap, regionIndependentFeaturesMap, groupFeaturesMap, matchesSearch]);

    return {
        flattenedItems,
        featureNumbers,
        filteredRegions
    };
}

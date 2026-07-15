import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Background,
    BackgroundVariant,
    Connection,
    Controls,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    MarkerType,
    ConnectionMode,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    AlertTriangle,
    CheckCircle2,
    Focus,
    GitBranch,
    Pin,
    PinOff,
    RefreshCcw,
    Router,
    Share2,
    Trash2,
    TriangleAlert,
    WifiOff,
    X,
    PanelRightClose,
    PanelRightOpen,
    Search,
    Filter,
} from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import {
    NetworkGraphService,
    type NetworkComputedStatus,
    type NetworkEdge,
    type NetworkNode,
} from '@DESIGN/features/map/network/NetworkGraphService';
import { buildDisplayNetworkGraph } from '@DESIGN/features/map/network/NetworkGraphAggregation';
import { prepareNetworkConnectionDraft } from '@DESIGN/features/map/network/NetworkConnectionDraft';
import { getNetworkEndpointKey } from '@DESIGN/features/map/network/NetworkEndpoint';
import { buildNetworkConnectionCreateEvents } from '@DESIGN/features/map/network/NetworkConnectionCreation';
import { buildManualEdgeDirectionEvent, buildSetOriginEvents } from '@DESIGN/features/map/network/networkTopology';
import { useNetworkStatusStore } from '@DESIGN/features/map/network/useNetworkStatusStore';
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { NetworkNodeWidget } from './NetworkNodeWidget';
import { cn } from '@TOOL/utils/cn';
import { getPointCoordinates } from '@TOOL/utils/featureMapping';

type NetworkTab = 'intersection' | 'route';
type LayoutMode = 'graph' | 'tree';
type SelectedGraphEntity = { type: 'node' | 'edge'; id: string } | null;
type NetworkLineStyle = 'solid' | 'dashed' | 'dotted';
type NetworkLinkIcon = 'arrow' | 'signal' | 'wireless' | 'fiber' | 'none';
type LayoutPosition = { x: number; y: number };
type LayoutPositions = Record<string, LayoutPosition>;

const nodeTypes = {
    networkNode: NetworkNodeWidget,
};

const NETWORK_GRAPH_LAYOUT_STORAGE_PREFIX = 'network-graph-layout-v1';

const statusLabel: Record<NetworkComputedStatus, string> = {
    online: 'Online',
    'direct-offline': 'Loi truc tiep',
    'upstream-offline': 'Mat upstream',
    unknown: 'Unknown',
    'configuration-error': 'Chua cau hinh',
};

const statusColor: Record<NetworkComputedStatus, string> = {
    online: 'bg-emerald-400',
    'direct-offline': 'bg-red-400',
    'upstream-offline': 'bg-orange-400',
    unknown: 'bg-zinc-500',
    'configuration-error': 'bg-purple-400',
};

const lineStyleDash: Record<NetworkLineStyle, string | undefined> = {
    solid: undefined,
    dashed: '6 4',
    dotted: '2 4',
};

const linkIconLabel: Record<NetworkLinkIcon, string | undefined> = {
    arrow: undefined,
    signal: 'SIGNAL',
    wireless: 'WIFI',
    fiber: 'FIBER',
    none: undefined,
};

const edgeSourceLabel: Record<NetworkEdge['sourceType'], string> = {
    'map-polyline': 'Tu polyline ban do',
    'network-drawn': 'Ve truc tiep trong Network',
};

const isNetworkLineStyle = (value: unknown): value is NetworkLineStyle =>
    value === 'solid' || value === 'dashed' || value === 'dotted';

const isNetworkLinkIcon = (value: unknown): value is NetworkLinkIcon =>
    value === 'arrow' || value === 'signal' || value === 'wireless' || value === 'fiber' || value === 'none';

const getNetworkLinkPresentation = (edge: NetworkEdge | null | undefined) => {
    const metadata = parseMetadata(edge?.feature?.metadata);
    const infrastructure = metadata.infrastructure && typeof metadata.infrastructure === 'object'
        ? metadata.infrastructure as Record<string, unknown>
        : {};
    const lineStyle = isNetworkLineStyle(infrastructure.line_style) ? infrastructure.line_style : 'solid';
    const iconType = isNetworkLinkIcon(infrastructure.icon_type) ? infrastructure.icon_type : 'arrow';

    return { metadata, infrastructure, lineStyle, iconType };
};

const getEdgeStrokeDasharray = (edge: NetworkEdge, lineStyle: NetworkLineStyle) => {
    if (edge.kind === 'relationship') return '5 5';
    if (edge.sourceType === 'map-polyline') return undefined;
    if (edge.directionState === 'pending') return '8 6';
    if (edge.directionState === 'conflict') return '2 6';
    if (edge.sourceType === 'network-drawn') return '10 4';
    return lineStyleDash[lineStyle];
};

const nextStatus = (status: string | undefined) => {
    if (status === 'online') return 'offline';
    if (status === 'offline') return 'unknown';
    return 'online';
};

const rankNode = (node: NetworkNode) => {
    if (node.role === 'cabinet') return 0;
    if (node.role === 'intersection') return 1;
    return 2;
};

const isSourceNode = (node: NetworkNode | undefined | null) => node?.role === 'cabinet' || node?.role === 'intersection';

const getNodeScopeOwnerId = (node: NetworkNode | undefined): string | undefined => {
    if (!node) return undefined;
    if (isSourceNode(node)) return node.id;
    return node.parentFeatureId;
};

const parseMetadata = (metadata: unknown): Record<string, unknown> => {
    if (!metadata) return {};
    if (typeof metadata !== 'string') return metadata as Record<string, unknown>;
    try {
        return JSON.parse(metadata || '{}') as Record<string, unknown>;
    } catch {
        return {};
    }
};

const getLayoutStorageKey = (projectScope: string | null, scope: string) =>
    projectScope ? `${NETWORK_GRAPH_LAYOUT_STORAGE_PREFIX}:${projectScope}:${scope}` : null;

const readLayoutPositions = (storageKey: string | null): LayoutPositions => {
    if (!storageKey) return {};

    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return {};

        const parsed = JSON.parse(raw) as Record<string, LayoutPosition>;
        if (!parsed || typeof parsed !== 'object') return {};

        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) =>
                !!value &&
                typeof value.x === 'number' &&
                Number.isFinite(value.x) &&
                typeof value.y === 'number' &&
                Number.isFinite(value.y)
            )
        );
    } catch {
        return {};
    }
};

const writeLayoutPositions = (storageKey: string | null, positions: LayoutPositions) => {
    if (!storageKey) return;

    try {
        localStorage.setItem(storageKey, JSON.stringify(positions));
    } catch {
        // Keep the panel usable even if local storage is unavailable.
    }
};

const getSignalEdgeColor = (edge: NetworkEdge, fallbackColor: string) => {
    if (edge.sourceType !== 'map-polyline') return fallbackColor;

    const metadata = parseMetadata(edge.feature?.metadata);
    const color = metadata.color;
    return typeof color === 'string' && color.trim() ? color.trim() : '#ef4444';
};

const layoutGraphNodes = (
    nodes: NetworkNode[],
    edges: NetworkEdge[],
    layoutMode: LayoutMode,
    tab: NetworkTab,
    rootId?: string
): Record<string, { x: number; y: number }> => {
    const positions: Record<string, { x: number; y: number }> = {};
    if (nodes.length === 0) return positions;

    const nodeIds = new Set(nodes.map(n => n.id));
    const sortedNodes = [...nodes].sort((a, b) => rankNode(a) - rankNode(b) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

    // If tab is 'route' (Toan tuyen), use geographic-based layout
    if (tab === 'route') {
        let nodeCoords: { id: string; lng: number; lat: number }[] = [];
        const nodesWithoutCoords: NetworkNode[] = [];

        nodes.forEach(n => {
            const pt = getPointCoordinates(n.feature);
            if (pt) {
                nodeCoords.push({ id: n.id, lng: pt[0], lat: pt[1] });
            } else {
                nodesWithoutCoords.push(n);
            }
        });

        // Filter out zero coordinates [0, 0] if there are other valid coordinates,
        // and adjust nodesWithoutCoords accordingly
        const validCoords = nodeCoords.filter(c => Math.abs(c.lng) > 0.001 || Math.abs(c.lat) > 0.001);
        if (validCoords.length > 0 && validCoords.length < nodeCoords.length) {
            const invalidIds = new Set(nodeCoords.filter(c => Math.abs(c.lng) <= 0.001 && Math.abs(c.lat) <= 0.001).map(c => c.id));
            nodeCoords = validCoords;
            nodes.forEach(n => {
                if (invalidIds.has(n.id) && !nodesWithoutCoords.some(item => item.id === n.id)) {
                    nodesWithoutCoords.push(n);
                }
            });
        }

        // 1. Position nodes with coordinates
        if (nodeCoords.length > 0) {
            let minLng = Number.POSITIVE_INFINITY, maxLng = Number.NEGATIVE_INFINITY;
            let minLat = Number.POSITIVE_INFINITY, maxLat = Number.NEGATIVE_INFINITY;

            nodeCoords.forEach(c => {
                if (c.lng < minLng) minLng = c.lng;
                if (c.lng > maxLng) maxLng = c.lng;
                if (c.lat < minLat) minLat = c.lat;
                if (c.lat > maxLat) maxLat = c.lat;
            });

            const xSpan = maxLng - minLng;
            const ySpan = maxLat - minLat;

            // Compute layout bounds proportional to number of nodes to ensure enough spacing
            const areaFactor = Math.sqrt(nodes.length);
            const graphWidth = Math.max(1600, areaFactor * 180);
            const graphHeight = Math.max(1200, areaFactor * 140);

            // Group nodes by their coordinates to handle overlaps
            const coordGroups = new Map<string, string[]>();
            nodeCoords.forEach(c => {
                const key = `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`;
                if (!coordGroups.has(key)) coordGroups.set(key, []);
                coordGroups.get(key)!.push(c.id);
            });

            nodeCoords.forEach(c => {
                const pctX = xSpan > 0 ? (c.lng - minLng) / xSpan : 0.5;
                const pctY = ySpan > 0 ? (c.lat - minLat) / ySpan : 0.5;

                positions[c.id] = {
                    x: pctX * graphWidth + 60,
                    y: (1 - pctY) * graphHeight + 60
                };
            });

            // Disperse nodes at the same coordinates in a small circle to avoid overlapping
            coordGroups.forEach(ids => {
                if (ids.length > 1) {
                    const angleStep = (2 * Math.PI) / ids.length;
                    const radius = 65; // offset in pixels
                    ids.forEach((id, idx) => {
                        const angle = idx * angleStep;
                        positions[id].x += Math.cos(angle) * radius;
                        positions[id].y += Math.sin(angle) * radius;
                    });
                }
            });
        }

        // 2. Position nodes without coordinates (place near parent/references or in a side grid)
        let sideGridIndex = 0;
        const sideGridCols = 5;
        const sideGridCellWidth = 180;
        const sideGridCellHeight = 100;

        nodesWithoutCoords.forEach(n => {
            const parentId = n.parentFeatureId;
            if (parentId && positions[parentId]) {
                const parentPos = positions[parentId];
                const angle = Math.random() * 2 * Math.PI;
                const radius = 80;
                positions[n.id] = {
                    x: parentPos.x + Math.cos(angle) * radius,
                    y: parentPos.y + Math.sin(angle) * radius
                };
            } else {
                const col = sideGridIndex % sideGridCols;
                const row = Math.floor(sideGridIndex / sideGridCols);
                positions[n.id] = {
                    x: col * sideGridCellWidth + 100,
                    y: row * sideGridCellHeight + 2200
                };
                sideGridIndex++;
            }
        });

        return positions;
    }

    // Build adjacency list for signal connections
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    nodes.forEach(n => {
        adj.set(n.id, []);
        inDegree.set(n.id, 0);
    });

    edges.forEach(e => {
        if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
            adj.get(e.from)!.push(e.to);
            inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
        }
    });

    // Find root nodes
    let roots: string[] = [];
    if (rootId && nodeIds.has(rootId)) {
        roots.push(rootId);
    } else {
        // First find cabinet/intersection nodes with 0 in-degree
        roots = sortedNodes
            .filter(n => isSourceNode(n) && (inDegree.get(n.id) || 0) === 0)
            .map(n => n.id);

        // If none, find any source nodes
        if (roots.length === 0) {
            roots = sortedNodes.filter(isSourceNode).map(n => n.id);
        }

        // If still none, find any node with 0 in-degree
        if (roots.length === 0) {
            roots = sortedNodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
        }

        // Fallback to first node
        if (roots.length === 0 && sortedNodes.length > 0) {
            roots.push(sortedNodes[0].id);
        }
    }

    // BFS to assign hierarchy levels (ranks)
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    const queue: { id: string; level: number }[] = [];

    roots.forEach(r => {
        queue.push({ id: r, level: 0 });
        visited.add(r);
    });

    while (queue.length > 0) {
        const { id, level } = queue.shift()!;
        levels.set(id, level);

        const children = adj.get(id) || [];
        children.forEach(child => {
            if (!visited.has(child)) {
                visited.add(child);
                queue.push({ id: child, level: level + 1 });
            }
        });
    }

    // Assign level 0 to unvisited nodes
    sortedNodes.forEach(n => {
        if (!levels.has(n.id)) {
            levels.set(n.id, 0);
        }
    });

    const levelWidth = 260;
    const rowHeight = 90;

    if (layoutMode === 'tree') {
        // Elegant tree layout positioning
        const nextYForColumn = new Map<number, number>();

        const layoutSubtree = (nodeId: string, currentLevel: number): number => {
            const children = (adj.get(nodeId) || []).filter(c => levels.get(c) === currentLevel + 1);
            const x = currentLevel * levelWidth + 40;

            if (children.length === 0) {
                const yStart = nextYForColumn.get(currentLevel) || 40;
                positions[nodeId] = { x, y: yStart };
                nextYForColumn.set(currentLevel, yStart + rowHeight);
                return yStart;
            }

            const childYPositions: number[] = [];
            children.forEach(childId => {
                const childY = layoutSubtree(childId, currentLevel + 1);
                childYPositions.push(childY);
            });

            const avgChildY = childYPositions.reduce((a, b) => a + b, 0) / childYPositions.length;
            const currentYLimit = nextYForColumn.get(currentLevel) || 40;
            const parentY = Math.max(avgChildY, currentYLimit);

            positions[nodeId] = { x, y: parentY };
            nextYForColumn.set(currentLevel, parentY + rowHeight);
            return parentY;
        };

        roots.forEach(r => {
            layoutSubtree(r, 0);
        });

        sortedNodes.forEach(n => {
            if (!positions[n.id]) {
                const level = levels.get(n.id) || 0;
                const x = level * levelWidth + 40;
                const yLimit = nextYForColumn.get(level) || 40;
                positions[n.id] = { x, y: yLimit };
                nextYForColumn.set(level, yLimit + rowHeight);
            }
        });

        return positions;
    } else {
        // Graph Mode: Lay out nodes grouped by levels (rank columns)
        const rankNodesMap = new Map<number, string[]>();

        sortedNodes.forEach(n => {
            const lvl = levels.get(n.id) || 0;
            if (!rankNodesMap.has(lvl)) {
                rankNodesMap.set(lvl, []);
            }
            rankNodesMap.get(lvl)!.push(n.id);
        });

        rankNodesMap.forEach((nodeIdsInRank, lvl) => {
            const x = lvl * levelWidth + 40;
            nodeIdsInRank.forEach((nodeId, index) => {
                positions[nodeId] = { x, y: index * rowHeight + 40 };
            });
        });

        return positions;
    }
};

const InspectorRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-2 last:border-b-0">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="min-w-0 text-right text-[11px] text-zinc-200">{value}</span>
    </div>
);

interface NetworkGraphFlowProps {
    tab: NetworkTab;
    layoutMode: LayoutMode;
    fitVersion: number;
}

const NetworkGraphFlow = ({ tab, layoutMode, fitVersion }: NetworkGraphFlowProps) => {
    const reactFlow = useReactFlow();
    const state = useDesignSync(s => s.state);
    const projectId = useDesignSync(s => s.projectId);
    const projectPath = useDesignSync(s => s.projectPath);
    const projectKey = useDesignSync(s => s.projectKey);
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const selectFeature = useDesignSync(s => s.selectFeature);
    const setSelectedGroup = useDesignSync(s => s.setSelectedGroup);
    const zoomTo = useDesignSync(s => s.zoomTo);
    const dispatchEvent = useDesignSync(s => s.dispatchEvent);
    const dispatchEvents = useDesignSync(s => s.dispatchEvents);
    const setActiveParentFeature = useDesignSync(s => s.setActiveParentFeature);

    const mode = useNetworkStatusStore(s => s.mode);
    const isStale = useNetworkStatusStore(s => s.isStale);
    const getSnapshot = useNetworkStatusStore(s => s.getSnapshot);
    const simulateEvent = useNetworkStatusStore(s => s.simulateEvent);

    const [selectedEntity, setSelectedEntity] = useState<SelectedGraphEntity>(null);
    const [edgePendingDelete, setEdgePendingDelete] = useState<NetworkEdge | null>(null);
    const [drilldownIntersectionId, setDrilldownIntersectionId] = useState<string | null>(null);
    const lastSyncedFeatureIdRef = useRef<string | null>(null);

    const [isInspectorOpen, setIsInspectorOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<NetworkComputedStatus | 'all'>('all');
    const [layoutPositions, setLayoutPositions] = useState<LayoutPositions>({});

    const features = state?.features || {};
    const snapshot = getSnapshot();
    const hasTelemetry = Object.keys(snapshot.nodes || {}).length > 0 || Object.keys(snapshot.edges || {}).length > 0;
    const evaluation = useMemo(() => NetworkGraphService.evaluate(features, snapshot), [features, snapshot]);
    const selectedNodeInfo = evaluation.nodes.find(node => node.id === selectedFeatureId);
    const selectedIntersectionId = drilldownIntersectionId || (isSourceNode(selectedNodeInfo) ? selectedNodeInfo?.id : selectedNodeInfo?.parentFeatureId);
    const selectedIntersection = selectedIntersectionId ? evaluation.nodes.find(node => node.id === selectedIntersectionId) : null;
    const projectScope = projectKey || projectPath || (projectId ? `id:${projectId}` : null);
    const layoutScope = `${tab}:${layoutMode}:${tab === 'intersection' ? (selectedIntersectionId || 'root') : 'all'}`;
    const layoutStorageKey = useMemo(() => getLayoutStorageKey(projectScope, layoutScope), [layoutScope, projectScope]);

    const scopedNodes = useMemo(() => {
        if (tab === 'route' || !selectedIntersectionId) return evaluation.nodes;
        return evaluation.nodes.filter(node => node.id === selectedIntersectionId || node.parentFeatureId === selectedIntersectionId);
    }, [evaluation.nodes, selectedIntersectionId, tab]);

    const scopedNodeIds = useMemo(() => new Set(scopedNodes.map(node => node.id)), [scopedNodes]);
    const nodesById = useMemo(() => new Map(evaluation.nodes.map(node => [node.id, node])), [evaluation.nodes]);
    const scopedEdges = useMemo(() => {
        if (tab === 'route') {
            return evaluation.edges.filter(edge => {
                const fromNode = nodesById.get(edge.from);
                const toNode = nodesById.get(edge.to);
                const fromScope = getNodeScopeOwnerId(fromNode);
                const toScope = getNodeScopeOwnerId(toNode);
                return (isSourceNode(fromNode) && isSourceNode(toNode)) || (!!fromScope && !!toScope && fromScope !== toScope);
            });
        }

        if (!selectedIntersectionId) return [];
        return evaluation.edges.filter(edge => {
            const fromNode = nodesById.get(edge.from);
            const toNode = nodesById.get(edge.to);
            return scopedNodeIds.has(edge.from) &&
                scopedNodeIds.has(edge.to) &&
                getNodeScopeOwnerId(fromNode) === selectedIntersectionId &&
                getNodeScopeOwnerId(toNode) === selectedIntersectionId;
        });
    }, [evaluation.edges, nodesById, scopedNodeIds, selectedIntersectionId, tab]);

    const displayGraph = useMemo(
        () => buildDisplayNetworkGraph(scopedNodes, scopedEdges, tab === 'intersection' ? selectedIntersectionId || null : null),
        [scopedEdges, scopedNodes, selectedIntersectionId, tab]
    );
    const displayNodesById = useMemo(
        () => new Map(displayGraph.nodes.map(node => [node.id, node])),
        [displayGraph.nodes]
    );

    const selectedNode = selectedEntity?.type === 'node'
        ? evaluation.nodes.find(node => node.id === selectedEntity.id)
        : null;
    const selectedDisplayNode = selectedNode
        ? displayGraph.nodes.find(node => node.memberIds.includes(selectedNode.id)) || null
        : null;
    const selectedEdge = selectedEntity?.type === 'edge'
        ? evaluation.edges.find(edge => edge.id === selectedEntity.id)
        : null;

    const stats = useMemo(() => {
        const total = scopedNodes.length;
        let online = 0;
        let directOffline = 0;
        let upstreamOffline = 0;
        let configError = 0;
        let unknown = 0;

        scopedNodes.forEach(n => {
            const status = evaluation.nodeStates[n.id]?.status;
            if (status === 'online') online++;
            else if (status === 'direct-offline') directOffline++;
            else if (status === 'upstream-offline') upstreamOffline++;
            else if (status === 'configuration-error') configError++;
            else unknown++;
        });

        return { total, online, directOffline, upstreamOffline, configError, unknown };
    }, [scopedNodes, evaluation.nodeStates]);

    const hasSearchOrFilter = searchQuery.trim() !== '' || statusFilter !== 'all';
    const dimmedNodeIds = useMemo(() => {
        const ids = new Set<string>();
        if (!hasSearchOrFilter) return ids;

        displayGraph.nodes.forEach(displayNode => {
            const representative = displayNode.representative;
            const searchHaystack = [
                representative.label,
                representative.telemetryId || '',
                ...displayNode.memberLabels,
            ].join(' ').toLowerCase();
            const matchesSearch = searchHaystack.includes(searchQuery.toLowerCase());
            const nodeState = evaluation.nodeStates[representative.id];
            const status = nodeState?.status || 'unknown';
            const matchesStatus = statusFilter === 'all' || status === statusFilter;

            if (!(matchesSearch && matchesStatus)) {
                ids.add(displayNode.id);
            }
        });
        return ids;
    }, [displayGraph.nodes, evaluation.nodeStates, searchQuery, statusFilter, hasSearchOrFilter]);

    useEffect(() => {
        if (!selectedFeatureId) {
            lastSyncedFeatureIdRef.current = null;
            return;
        }
        const selectedFeatureChanged = lastSyncedFeatureIdRef.current !== selectedFeatureId;
        lastSyncedFeatureIdRef.current = selectedFeatureId;
        const isNode = evaluation.nodes.some(node => node.id === selectedFeatureId);
        const isEdge = evaluation.edges.some(edge => edge.id === selectedFeatureId);
        if (isNode || isEdge) {
            setIsInspectorOpen(true);
        }
        setSelectedEntity(current => {
            if (current?.type === 'edge' && !selectedFeatureChanged) return current;
            if (isNode) {
                if (current?.type === 'node' && current.id === selectedFeatureId) return current;
                return { type: 'node', id: selectedFeatureId };
            }
            if (isEdge) {
                if (current?.type === 'edge' && current.id === selectedFeatureId) return current;
                return { type: 'edge', id: selectedFeatureId };
            }
            return current;
        });
    }, [evaluation.edges, evaluation.nodes, selectedFeatureId]);

    useEffect(() => {
        if (fitVersion === 0) return;
        window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 250 }));
    }, [fitVersion, reactFlow]);

    useEffect(() => {
        window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 250 }));
    }, [layoutMode, reactFlow, scopedEdges.length, scopedNodes.length, selectedIntersectionId]);

    useEffect(() => {
        setLayoutPositions(readLayoutPositions(layoutStorageKey));
    }, [layoutStorageKey]);

    useEffect(() => {
        writeLayoutPositions(layoutStorageKey, layoutPositions);
    }, [layoutPositions, layoutStorageKey]);

    const { reactFlowNodes, reactFlowEdges } = useMemo(() => {
        const positions = layoutGraphNodes(scopedNodes, scopedEdges, layoutMode, tab, selectedIntersectionId);
        const pairEdgeIndexes = new Map<string, number>();
        const pairEdgeCounts = new Map<string, number>();

        displayGraph.edges.forEach(edge => {
            const pairKey = [edge.from, edge.to].sort().join('::');
            pairEdgeCounts.set(pairKey, (pairEdgeCounts.get(pairKey) || 0) + 1);
        });

        const nodes: Node[] = displayGraph.nodes.map(displayNode => {
            const node = displayNode.representative;
            const nodeState = evaluation.nodeStates[node.id];
            const isDimmed = dimmedNodeIds.has(displayNode.id);
            const isSelected = selectedFeatureId !== null
                ? displayNode.memberIds.includes(selectedFeatureId) || selectedEntity?.id === node.id
                : selectedEntity?.id === node.id;

            return {
                id: displayNode.id,
                type: 'networkNode',
                position: layoutPositions[displayNode.id] || positions[node.id] || { x: 40, y: 40 },
                style: {
                    opacity: isDimmed ? 0.35 : 1,
                    transition: 'opacity 300ms ease-out',
                },
                data: {
                    label: displayNode.memberCount > 1 ? `${node.label} +${displayNode.memberCount - 1}` : node.label,
                    role: node.role === 'intersection' ? 'cabinet' : node.role,
                    status: nodeState?.status || 'unknown',
                    telemetryId: node.telemetryId || node.id,
                    isInferredRole: node.isInferredRole,
                    isSelected,
                    affectedDownstreamCount: nodeState?.affectedDownstream.length || 0,
                    memberCount: displayNode.memberCount,
                },
            };
        });

        const edges: any[] = displayGraph.edges.map(displayEdge => {
            const edge = displayEdge.representative;
            const edgeStatus = edge.kind === 'relationship' ? 'online' : snapshot.edges?.[edge.telemetryId || edge.id] || 'unknown';
            const isDimmed = dimmedNodeIds.has(displayEdge.from) || dimmedNodeIds.has(displayEdge.to);
            const fallbackColor = edge.directionState === 'conflict'
                ? '#f59e0b'
                : edge.directionState === 'pending'
                    ? '#a1a1aa'
                    : edgeStatus === 'online'
                        ? '#10b981'
                        : edgeStatus === 'offline'
                            ? '#ef4444'
                            : '#71717a';
            const color = edge.kind === 'relationship' ? '#475569' : getSignalEdgeColor(edge, fallbackColor);
            const { lineStyle, iconType } = getNetworkLinkPresentation(edge);
            const iconLabel = edge.directionState === 'confirmed' ? linkIconLabel[iconType] : undefined;
            const pairKey = [displayEdge.from, displayEdge.to].sort().join('::');
            const pairIndex = pairEdgeIndexes.get(pairKey) || 0;
            const pairCount = pairEdgeCounts.get(pairKey) || 1;
            pairEdgeIndexes.set(pairKey, pairIndex + 1);

            return {
                id: edge.id,
                source: displayEdge.from,
                target: displayEdge.to,
                type: 'smoothstep',
                animated: edge.kind === 'signal' && edgeStatus === 'online' && edge.directionState === 'confirmed' && !isDimmed,
                selectable: edge.kind === 'signal',
                interactionWidth: edge.kind === 'signal' ? 18 : 8,
                pathOptions: {
                    borderRadius: 14,
                    offset: pairCount > 1 ? 24 + pairIndex * 18 : 24,
                },
                data: {
                    status: edgeStatus,
                    label: edge.label,
                    kind: edge.kind,
                    iconType,
                    lineStyle,
                    directionState: edge.directionState,
                    sourceType: edge.sourceType,
                },
                label: edge.kind === 'relationship' ? undefined : iconLabel || (edgeStatus === 'unknown' ? undefined : edgeStatus),
                markerEnd: edge.kind === 'signal' && edge.directionState === 'confirmed' && iconType !== 'none'
                    ? { type: MarkerType.ArrowClosed, color }
                    : undefined,
                style: {
                    stroke: color,
                    strokeDasharray: getEdgeStrokeDasharray(edge, lineStyle),
                    strokeWidth: selectedEntity?.id === edge.id ? 3.5 : edge.kind === 'relationship' ? 1.5 : 2.5,
                    opacity: isDimmed ? 0.15 : 1,
                    transition: 'opacity 300ms ease-out',
                    filter: selectedEntity?.id === edge.id || (edgeStatus === 'online' && edge.kind === 'signal' && !isDimmed)
                        ? `drop-shadow(0 0 4px ${color})`
                        : undefined,
                },
            };
        });

        return { reactFlowNodes: nodes, reactFlowEdges: edges };
    }, [dimmedNodeIds, displayGraph.edges, displayGraph.nodes, evaluation.nodeStates, layoutMode, tab, layoutPositions, scopedEdges, scopedNodes, selectedEntity?.id, selectedFeatureId, selectedIntersectionId, snapshot.edges]);

    useEffect(() => {
        if (!selectedFeatureId) return;
        const selectedDisplayNodeId = displayGraph.displayNodeIdByRawNodeId[selectedFeatureId] || selectedFeatureId;
        const selectedFlowNode = reactFlowNodes.find(node => node.id === selectedDisplayNodeId);
        if (!selectedFlowNode) return;

        window.requestAnimationFrame(() => {
            reactFlow.setCenter(
                selectedFlowNode.position.x + 70,
                selectedFlowNode.position.y + 34,
                { zoom: 1.15, duration: 250 }
            );
        });
    }, [displayGraph.displayNodeIdByRawNodeId, reactFlow, reactFlowNodes, selectedFeatureId]);

    const selectAndZoomFeature = useCallback((id: string) => {
        selectFeature(id);
        zoomTo(id, 'feature');
    }, [selectFeature, zoomTo]);

    const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        const displayNode = displayGraph.nodes.find(item => item.id === node.id);
        const representative = displayNode?.representative || evaluation.nodes.find(item => item.id === node.id);
        if (!representative) return;

        setSelectedEntity({ type: 'node', id: representative.id });
        setIsInspectorOpen(true);
        selectAndZoomFeature(representative.id);

        if (isSourceNode(representative)) {
            setDrilldownIntersectionId(representative.id);
        }

        if (mode === 'simulation') {
            const telemetryId = String(representative.telemetryId || representative.id);
            const currentStatus = snapshot.nodes?.[telemetryId] || 'online';
            simulateEvent(telemetryId, 'node', nextStatus(currentStatus));
        }
    }, [displayGraph.nodes, evaluation.nodes, mode, selectAndZoomFeature, simulateEvent, snapshot.nodes]);

    const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.stopPropagation();
        const graphEdge = evaluation.edges.find(item => item.id === edge.id);
        if (!graphEdge || graphEdge.kind !== 'signal') return;

        setSelectedEntity({ type: 'edge', id: graphEdge.id });
        setIsInspectorOpen(true);

        if (mode === 'simulation') {
            const telemetryId = graphEdge.telemetryId || graphEdge.id;
            const currentStatus = snapshot.edges?.[telemetryId] || 'online';
            simulateEvent(telemetryId, 'edge', nextStatus(currentStatus));
        }
    }, [evaluation.edges, mode, simulateEvent, snapshot.edges]);

    const handleConnect = useCallback(async (connection: Connection) => {
        if (!connection.source || !connection.target || connection.source === connection.target) return;
        const sourceDisplayNode = displayNodesById.get(connection.source);
        const targetDisplayNode = displayNodesById.get(connection.target);
        const preparedDraft = prepareNetworkConnectionDraft(sourceDisplayNode, targetDisplayNode, tab);
        if (!sourceDisplayNode || !targetDisplayNode || !preparedDraft) {
            alert('Khong the bat dau ve ket noi tu node hien tai.');
            return;
        }

        const fromEndpointKey = getNetworkEndpointKey(preparedDraft.draft.fromEndpoint);
        const toEndpointKey = getNetworkEndpointKey(preparedDraft.draft.toEndpoint);
        const duplicateSignal = evaluation.edges.some(edge =>
            edge.kind === 'signal' &&
            ((edge.fromEndpointKey === fromEndpointKey && edge.toEndpointKey === toEndpointKey) ||
                (edge.fromEndpointKey === toEndpointKey && edge.toEndpointKey === fromEndpointKey))
        );
        if (duplicateSignal) {
            alert('Tuyen ket noi giua hai doi tuong nay da ton tai.');
            return;
        }

        const groupId = preparedDraft.groupId;
        if (!groupId) {
            alert('Khong the luu ket noi vi thieu nhom cua doi tuong.');
            return;
        }

        const group = state?.feature_groups?.[groupId];
        if (!group) {
            alert('Khong the luu ket noi vi thieu nhom cua doi tuong.');
            return;
        }

        setSelectedGroup(groupId);
        setActiveParentFeature(preparedDraft.activeParentFeatureId || null);

        const { events } = buildNetworkConnectionCreateEvents({
            sourceNode: sourceDisplayNode,
            targetNode: targetDisplayNode,
            draft: preparedDraft.draft,
            group,
            selectedGroupId: groupId,
            activeParentFeatureId: preparedDraft.activeParentFeatureId || null,
            featuresById: features,
            createId: () => crypto.randomUUID(),
        });

        await dispatchEvents(events);
    }, [dispatchEvents, displayNodesById, evaluation.edges, features, setActiveParentFeature, setSelectedGroup, state?.feature_groups, tab]);

    const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
        setLayoutPositions(current => ({
            ...current,
            [node.id]: {
                x: node.position.x,
                y: node.position.y,
            },
        }));
    }, []);

    const handleEdgesDelete = useCallback((edges: Edge[]) => {
        const edge = evaluation.edges.find(item => item.id === edges[0]?.id && item.kind === 'signal');
        if (edge) setEdgePendingDelete(edge);
    }, [evaluation.edges]);

    const confirmDeleteEdge = useCallback(() => {
        if (!edgePendingDelete) return;
        dispatchEvent({
            type: 'FeatureDeleted',
            payload: { id: edgePendingDelete.id },
        });
        setSelectedEntity(null);
        setEdgePendingDelete(null);
    }, [dispatchEvent, edgePendingDelete]);

    const handleReverseEdge = useCallback(async () => {
        if (!selectedEdge?.feature || selectedEdge.kind !== 'signal') return;
        const reverseEvent = buildManualEdgeDirectionEvent(selectedEdge.feature, true);
        if (reverseEvent) {
            await dispatchEvent(reverseEvent);
        }
    }, [dispatchEvent, selectedEdge]);

    const handleConfirmEdgeDirection = useCallback(async () => {
        if (!selectedEdge?.feature || selectedEdge.kind !== 'signal') return;
        const confirmEvent = buildManualEdgeDirectionEvent(selectedEdge.feature, false);
        if (confirmEvent) {
            await dispatchEvent(confirmEvent);
        }
    }, [dispatchEvent, selectedEdge]);

    const handleUpdateEdgePresentation = useCallback(async (updates: Partial<{ name: string; lineStyle: NetworkLineStyle; iconType: NetworkLinkIcon }>) => {
        if (!selectedEdge?.feature || selectedEdge.kind !== 'signal') return;
        const { metadata, infrastructure } = getNetworkLinkPresentation(selectedEdge);
        const nextInfrastructure = {
            ...infrastructure,
            type: infrastructure.type || (selectedEdge.sourceType === 'map-polyline' ? 'SignalLine' : 'NetworkLink'),
            ...((updates.lineStyle && selectedEdge.sourceType !== 'map-polyline') ? { line_style: updates.lineStyle } : {}),
            ...(updates.iconType ? { icon_type: updates.iconType } : {}),
        };

        await dispatchEvent({
            type: 'FeatureUpdated',
            payload: {
                id: selectedEdge.id,
                ...(updates.name !== undefined ? { name: updates.name } : {}),
                metadata: JSON.stringify({
                    ...metadata,
                    infrastructure: nextInfrastructure,
                }),
            },
        });
    }, [dispatchEvent, selectedEdge]);

    const handleDiagnosticSelect = useCallback((featureId: string | undefined) => {
        if (!featureId) return;
        selectAndZoomFeature(featureId);
    }, [selectAndZoomFeature]);

    const handleSetOrigin = useCallback(async (nodeId: string) => {
        const events = buildSetOriginEvents(features, nodeId);
        if (events.length === 0) return;
        await dispatchEvents(events);
    }, [dispatchEvents, features]);

    const selectedEdgePresentation = getNetworkLinkPresentation(selectedEdge);

    return (
        <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#070b0e]">
            <div className="relative min-h-0 flex-1">
                {tab === 'intersection' && selectedIntersection && (
                    <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-[11px] font-semibold text-zinc-200 shadow-xl backdrop-blur-md">
                        <button
                            onClick={() => setDrilldownIntersectionId(null)}
                            className="rounded border border-white/10 px-2.5 py-1 text-zinc-300 hover:bg-white/10 hover:text-white transition"
                        >
                            Back
                        </button>
                        <span className="max-w-[200px] truncate">{selectedIntersection.label}</span>
                    </div>
                )}

                <div className="absolute left-4 right-4 top-4 z-10 pointer-events-none flex flex-wrap justify-between gap-3 md:left-4">
                    {tab === 'intersection' && selectedIntersection ? <div className="w-40" /> : <div />}

                    <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/75 px-3 py-1.5 shadow-xl backdrop-blur-md text-[10.5px]">
                        <span className="text-zinc-500 font-bold uppercase tracking-wider mr-1">HUD:</span>
                        <span className="flex items-center gap-1 text-zinc-300 font-medium">
                            Tong: <strong className="text-zinc-100">{stats.total}</strong>
                        </span>
                        <span className="h-3 w-px bg-white/10 mx-1" />
                        <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Online: <strong className="text-emerald-300">{stats.online}</strong>
                        </span>
                        <span className="h-3 w-px bg-white/10 mx-1" />
                        <span className="flex items-center gap-1 text-red-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                            Direct: <strong className="text-red-300">{stats.directOffline}</strong>
                        </span>
                        <span className="h-3 w-px bg-white/10 mx-1" />
                        <span className="flex items-center gap-1 text-orange-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                            Upstream: <strong className="text-orange-300">{stats.upstreamOffline}</strong>
                        </span>
                        <span className="h-3 w-px bg-white/10 mx-1" />
                        <span className="flex items-center gap-1 text-purple-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                            Config: <strong className="text-purple-300">{stats.configError}</strong>
                        </span>
                    </div>

                    <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/75 p-1 shadow-xl backdrop-blur-md">
                        <div className="relative flex items-center">
                            <Search size={12} className="absolute left-2.5 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Tim nut, telemetry..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-[140px] rounded border border-white/5 bg-black/40 py-1 pl-7 pr-2.5 text-[10.5px] text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-400/40 focus:bg-black/60 transition-all duration-200"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 text-zinc-500 hover:text-zinc-300"
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </div>

                        <div className="relative flex items-center">
                            <Filter size={11} className="absolute left-2 text-zinc-500" />
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value as any)}
                                className="rounded border border-white/5 bg-black/40 py-1 pl-6 pr-2 text-[10.5px] text-zinc-300 outline-none hover:bg-black/50 focus:border-cyan-400/40 transition"
                            >
                                <option value="all">Tat ca trang thai</option>
                                <option value="online">Online</option>
                                <option value="direct-offline">Loi truc tiep</option>
                                <option value="upstream-offline">Mat upstream</option>
                                <option value="configuration-error">Chua cau hinh</option>
                            </select>
                        </div>
                    </div>
                </div>

                <ReactFlow
                    nodes={reactFlowNodes}
                    edges={reactFlowEdges}
                    nodeTypes={nodeTypes}
                    nodesDraggable
                    onNodeClick={handleNodeClick}
                    onNodeDragStop={handleNodeDragStop}
                    onEdgeClick={handleEdgeClick}
                    onConnect={handleConnect}
                    onEdgesDelete={handleEdgesDelete}
                    connectionMode={ConnectionMode.Loose}
                    fitView
                    deleteKeyCode={['Backspace', 'Delete']}
                    className="bg-[#080c0f]"
                >
                    <Background color="#38bdf8" gap={16} size={1.2} variant={BackgroundVariant.Dots} className="opacity-[0.03]" />
                    <Controls className="!border-white/10 !bg-zinc-950/80 !fill-zinc-300 !text-zinc-300 !shadow-lg backdrop-blur-md rounded-lg overflow-hidden [&_button]:hover:!bg-white/10" />
                    <MiniMap
                        nodeColor={node => {
                            const status = node.data?.status as NetworkComputedStatus | undefined;
                            if (status === 'online') return '#10b981';
                            if (status === 'direct-offline') return '#ef4444';
                            if (status === 'upstream-offline') return '#f97316';
                            if (status === 'configuration-error') return '#a855f7';
                            return '#71717a';
                        }}
                        className="!border-white/10 !bg-zinc-950/80 !shadow-lg backdrop-blur-md rounded-lg overflow-hidden"
                        maskColor="rgba(0,0,0,0.6)"
                    />
                </ReactFlow>

                {scopedNodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/20 backdrop-blur-[1px]">
                        <div className="max-w-md rounded-xl border border-white/10 bg-zinc-950/80 p-6 text-center shadow-2xl backdrop-blur-md">
                            <Router className="mx-auto mb-3 text-zinc-500 animate-pulse" size={32} />
                            <div className="text-sm font-bold text-zinc-100">Chua co topology Network</div>
                            <div className="mt-2 text-xs leading-5 text-zinc-500">
                                Chua co doi tuong khong phai line/polyline de hien thi trong Network.
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'realtime' && (isStale || !hasTelemetry) && (
                    <div className="absolute left-4 bottom-4 z-10 flex items-center gap-2 rounded-lg border border-orange-500/20 bg-orange-950/85 px-3 py-2 text-[10.5px] font-semibold text-orange-200 shadow-xl backdrop-blur-md">
                        <WifiOff size={14} className="text-orange-400 animate-pulse" />
                        Chua ket noi telemetry
                    </div>
                )}

                {/* TOGGLE FLOATING INSPECTOR TRIGGER BUTTON */}
                {!isInspectorOpen && (
                    <button
                        onClick={() => setIsInspectorOpen(true)}
                        className="absolute right-4 top-4 z-20 flex items-center justify-center rounded-lg border border-white/10 bg-zinc-950/80 p-2.5 text-zinc-300 hover:bg-white/10 hover:text-white shadow-xl backdrop-blur-md transition-all duration-200"
                        title="Mo Inspector"
                    >
                        <PanelRightOpen size={16} />
                    </button>
                )}
            </div>

            {/* FLOATING COLLAPSIBLE INSPECTOR PANEL */}
            <aside
                className={cn(
                    "absolute right-4 top-4 bottom-4 z-20 w-[320px] flex flex-col min-h-0 rounded-xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-lg transition-all duration-300 ease-out",
                    isInspectorOpen ? "translate-x-0 opacity-100 pointer-events-auto" : "translate-x-[340px] opacity-0 pointer-events-none"
                )}
            >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-white/5 p-3">
                    <div className="flex items-center gap-1.5">
                        <GitBranch size={14} className="text-cyan-400" />
                        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Inspector</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {selectedEdge && selectedEdge.kind === 'signal' && (
                            <div className="flex items-center gap-1">
                                {selectedEdge.directionState !== 'confirmed' && (
                                    <button
                                        onClick={handleConfirmEdgeDirection}
                                        className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                                    >
                                        Xac nhan
                                    </button>
                                )}
                                <button
                                    onClick={handleReverseEdge}
                                    className="inline-flex items-center gap-1 rounded bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[9px] font-bold text-cyan-300 hover:bg-cyan-500/20"
                                >
                                    Dao chieu
                                </button>
                                <button
                                    onClick={() => setEdgePendingDelete(selectedEdge)}
                                    className="inline-flex items-center gap-1 rounded bg-red-500/10 border border-red-500/30 p-1 text-[9px] font-bold text-red-300 hover:bg-red-500/20"
                                    title="Xoa tuyen"
                                >
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => setIsInspectorOpen(false)}
                            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition"
                            title="Thu gon"
                        >
                            <PanelRightClose size={14} />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                    {!selectedNode && !selectedEdge && (
                        <div className="rounded-lg border border-white/5 bg-black/25 p-3 text-[10.5px] leading-relaxed text-zinc-500">
                            Chon mot node hoac tuyen tren graph de xem chi tiet. Keo tu handle ben phai cua node sang handle ben trai cua node khac de tao ket noi trong Network.
                        </div>
                    )}

                    {selectedNode && (
                        <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2 shadow-inner">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className={cn('h-2.5 w-2.5 rounded-full shadow-[0_0_8px_currentColor]', statusColor[evaluation.nodeStates[selectedNode.id]?.status || 'unknown'])} />
                                    <div className="min-w-0">
                                        <div className="truncate text-xs font-bold text-zinc-100">
                                            {selectedDisplayNode && selectedDisplayNode.memberCount > 1
                                                ? `${selectedNode.label} +${selectedDisplayNode.memberCount - 1}`
                                                : selectedNode.label}
                                        </div>
                                        <div className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">{selectedNode.role}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleSetOrigin(selectedNode.id)}
                                    className={cn(
                                        'rounded border px-2 py-0.5 text-[9px] font-bold transition duration-200',
                                        selectedNode.isOrigin
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                            : 'border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                                    )}
                                >
                                    {selectedNode.isOrigin ? 'Diem goc' : 'Dat lam goc'}
                                </button>
                            </div>
                            <InspectorRow label="Trang thai" value={<span className="font-semibold">{statusLabel[evaluation.nodeStates[selectedNode.id]?.status || 'unknown']}</span>} />
                            <InspectorRow label="Diem goc" value={selectedNode.isOrigin ? <span className="text-emerald-400 font-bold">Da chon</span> : 'Chua chon'} />
                            <InspectorRow label="Telemetry" value={<span className="font-mono bg-black/30 px-1 py-0.5 rounded text-[10.5px] select-all">{selectedNode.telemetryId || 'Chua gan'}</span>} />
                            <InspectorRow label="Feature" value={<span className="font-mono bg-black/30 px-1 py-0.5 rounded text-[10.5px] select-all">{selectedNode.id}</span>} />
                            <InspectorRow label="Ly do" value={<span className="text-zinc-300">{evaluation.nodeStates[selectedNode.id]?.reason || 'Khong co'}</span>} />
                            <InspectorRow label="Downstream" value={<span className="font-bold text-zinc-100">{evaluation.nodeStates[selectedNode.id]?.affectedDownstream.length || 0} node</span>} />
                        </div>
                    )}

                    {selectedEdge && (
                        <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2 shadow-inner">
                            <div className="mb-3 flex items-center gap-2">
                                <GitBranch size={14} className="text-cyan-400" />
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-bold text-zinc-100">{selectedEdge.label}</div>
                                    <div className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">
                                        {selectedEdge.kind === 'relationship'
                                            ? 'Relationship'
                                            : edgeSourceLabel[selectedEdge.sourceType]}
                                    </div>
                                </div>
                            </div>

                            {selectedEdge.kind === 'signal' && selectedEdge.feature && (
                                <div className="mb-3 space-y-3 rounded-lg border border-cyan-500/10 bg-cyan-500/5 p-3">
                                    <div>
                                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-zinc-500">Ten ket noi</label>
                                        <input
                                            key={selectedEdge.id}
                                            defaultValue={selectedEdge.feature.name || selectedEdge.label}
                                            onBlur={event => handleUpdateEdgePresentation({ name: event.target.value })}
                                            className="w-full rounded border border-white/15 bg-black/45 px-2.5 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-cyan-400/40 focus:bg-black/60 transition"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="block text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                                            Bieu tuong
                                            <select
                                                value={selectedEdgePresentation.iconType}
                                                onChange={event => handleUpdateEdgePresentation({ iconType: event.target.value as NetworkLinkIcon })}
                                                className="mt-1 w-full rounded border border-white/15 bg-black/45 px-2 py-1 text-[11px] normal-case text-zinc-100 outline-none focus:border-cyan-400/40 focus:bg-black/60 transition"
                                            >
                                                <option value="arrow">Arrow</option>
                                                <option value="signal">Signal</option>
                                                <option value="wireless">Wireless</option>
                                                <option value="fiber">Fiber</option>
                                                <option value="none">None</option>
                                            </select>
                                        </label>
                                        <label className="block text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                                            Loai net
                                            <select
                                                value={selectedEdge.sourceType === 'map-polyline' ? 'solid' : selectedEdgePresentation.lineStyle}
                                                onChange={event => handleUpdateEdgePresentation({ lineStyle: event.target.value as NetworkLineStyle })}
                                                disabled={selectedEdge.sourceType === 'map-polyline'}
                                                className="mt-1 w-full rounded border border-white/15 bg-black/45 px-2 py-1 text-[11px] normal-case text-zinc-100 outline-none focus:border-cyan-400/40 focus:bg-black/60 transition"
                                            >
                                                <option value="solid">Lien</option>
                                                <option value="dashed">Net dut</option>
                                                <option value="dotted">Cham</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            )}

                            <InspectorRow label="Trang thai" value={<span className="font-semibold">{selectedEdge.kind === 'relationship' ? 'display-only' : snapshot.edges?.[selectedEdge.telemetryId || selectedEdge.id] || 'unknown'}</span>} />
                            <InspectorRow label="Nguon ket noi" value={edgeSourceLabel[selectedEdge.sourceType]} />
                            <InspectorRow label="Huong" value={<span className="capitalize">{selectedEdge.directionState}</span>} />
                            <InspectorRow label="Nguon" value={<span className="font-mono bg-black/30 px-1 py-0.5 rounded text-[10.5px] select-all">{selectedEdge.from}</span>} />
                            <InspectorRow label="Dich" value={<span className="font-mono bg-black/30 px-1 py-0.5 rounded text-[10.5px] select-all">{selectedEdge.to}</span>} />
                            <InspectorRow label="Telemetry" value={<span className="font-mono bg-black/30 px-1 py-0.5 rounded text-[10.5px] select-all">{selectedEdge.telemetryId || 'Chua gan'}</span>} />
                            <InspectorRow label="Feature" value={<span className="font-mono bg-black/30 px-1 py-0.5 rounded text-[10.5px] select-all">{selectedEdge.id}</span>} />
                            {selectedEdge.directionState !== 'confirmed' && (
                                <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/10 p-2.5 text-[10px] leading-relaxed text-amber-200 shadow-inner">
                                    Tuyen nay chua co huong hop le cho downstream. Hay chon lai diem goc hoac xac nhan thu cong.
                                </div>
                            )}
                        </div>
                    )}

                    <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                            <TriangleAlert size={13} className="text-zinc-500" /> Cau hinh
                        </div>
                        {evaluation.diagnostics.length === 0 ? (
                            <div className="flex items-center gap-1.5 text-[10.5px] text-emerald-400 font-semibold bg-emerald-500/5 border border-emerald-500/15 p-2 rounded-lg">
                                <CheckCircle2 size={13} /> Khong phat hien loi topology.
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {evaluation.diagnostics.map((diagnostic, index) => (
                                    <button
                                        key={`${diagnostic.type}-${diagnostic.edgeId || diagnostic.featureId || index}`}
                                        onClick={() => handleDiagnosticSelect(diagnostic.edgeId || diagnostic.featureId)}
                                        className="w-full rounded-lg border border-purple-500/20 bg-purple-500/5 p-2.5 text-left text-[10.5px] leading-relaxed text-purple-200 hover:bg-purple-500/15 hover:border-purple-500/35 transition duration-200"
                                    >
                                        <div className="mb-1 flex items-center gap-1 font-bold text-purple-400">
                                            <AlertTriangle size={12} /> {diagnostic.type}
                                        </div>
                                        {diagnostic.message}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <DeleteConfirmationModal
                isOpen={!!edgePendingDelete}
                onClose={() => setEdgePendingDelete(null)}
                onConfirm={confirmDeleteEdge}
                title="Xoa ket noi Network"
                message="Xoa ket noi gia lap trong Network. Khong tao hoac xoa polyline tren ban do."
                itemName={edgePendingDelete?.label}
            />
        </div>
    );
};

export const NetworkGraphPanel: React.FC = () => {
    const { onPin, onClose, isPinned, dragHandleProps } = usePaletteContext();
    const [tab, setTab] = useState<NetworkTab>('intersection');
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('graph');
    const [fitVersion, setFitVersion] = useState(0);
    const mode = useNetworkStatusStore(s => s.mode);
    const isStale = useNetworkStatusStore(s => s.isStale);
    const setMode = useNetworkStatusStore(s => s.setMode);
    const resetSimulation = useNetworkStatusStore(s => s.resetSimulation);

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#0b0f12] text-zinc-100">
            <div
                className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2"
                {...dragHandleProps}
            >
                <div className="flex items-center gap-2">
                    <Router size={15} className="text-cyan-300" />
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wide">Network Graph</div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                            <span>Cong cu van hanh va chinh topology</span>
                            {mode === 'realtime' && isStale && (
                                <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-300">
                                    stale
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button className="rounded border border-white/10 p-1.5 text-zinc-300 hover:bg-white/10" onClick={onPin} title={isPinned ? 'Bo ghim' : 'Ghim'}>
                        {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button className="rounded border border-white/10 p-1.5 text-zinc-300 hover:bg-white/10" onClick={onClose} title="Dong">
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div className="flex items-center gap-2">
                    <div className="flex rounded border border-white/10 bg-black/20 p-0.5 text-[11px] font-semibold">
                        <button className={cn('rounded px-3 py-1', tab === 'intersection' ? 'bg-cyan-400 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setTab('intersection')}>
                            Nut giao
                        </button>
                        <button className={cn('rounded px-3 py-1', tab === 'route' ? 'bg-cyan-400 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setTab('route')}>
                            Toan tuyen
                        </button>
                    </div>
                    <button
                        className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/10"
                        onClick={() => setFitVersion(version => version + 1)}
                    >
                        <Focus size={12} /> Fit
                    </button>
                    <div className="flex rounded border border-white/10 bg-black/20 p-0.5 text-[11px] font-semibold">
                        <button className={cn('rounded px-3 py-1', layoutMode === 'graph' ? 'bg-cyan-400 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setLayoutMode('graph')}>
                            <Share2 size={12} className="inline-block" /> Graph
                        </button>
                        <button className={cn('rounded px-3 py-1', layoutMode === 'tree' ? 'bg-cyan-400 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setLayoutMode('tree')}>
                            Tree
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="hidden items-center gap-2 text-[10px] text-zinc-500 md:flex">
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />Online</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />Direct</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" />Upstream</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" />Config</span>
                    </div>
                    <div className="flex rounded border border-white/10 bg-black/20 p-0.5 text-[11px] font-semibold">
                        <button className={cn('rounded px-3 py-1', mode === 'realtime' ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setMode('realtime')}>
                            Realtime
                        </button>
                        <button className={cn('rounded px-3 py-1', mode === 'simulation' ? 'bg-amber-300 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setMode('simulation')}>
                            Simulation
                        </button>
                    </div>
                    <button className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10" onClick={resetSimulation}>
                        <RefreshCcw size={12} /> Reset
                    </button>
                </div>
            </div>

            <ReactFlowProvider>
                <NetworkGraphFlow tab={tab} layoutMode={layoutMode} fitVersion={fitVersion} />
            </ReactFlowProvider>
        </div>
    );
};




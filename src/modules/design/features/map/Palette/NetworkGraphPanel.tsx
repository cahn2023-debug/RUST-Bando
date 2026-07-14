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
} from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import { usePaletteContext } from '@DESIGN/features/map/Palette/PaletteContext';
import {
    NetworkGraphService,
    type NetworkComputedStatus,
    type NetworkEdge,
    type NetworkNode,
} from '@DESIGN/features/map/network/NetworkGraphService';
import { useNetworkStatusStore } from '@DESIGN/features/map/network/useNetworkStatusStore';
import { DeleteConfirmationModal } from '@DESIGN/components/ui/DeleteConfirmationModal';
import { NetworkNodeWidget } from './NetworkNodeWidget';
import { cn } from '@TOOL/utils/cn';

type NetworkTab = 'intersection' | 'route';
type LayoutMode = 'graph' | 'tree';
type SelectedGraphEntity = { type: 'node' | 'edge'; id: string } | null;
type NetworkLineStyle = 'solid' | 'dashed' | 'dotted';
type NetworkLinkIcon = 'arrow' | 'signal' | 'wireless' | 'fiber' | 'none';

const nodeTypes = {
    networkNode: NetworkNodeWidget,
};

const statusLabel: Record<NetworkComputedStatus, string> = {
    online: 'Online',
    'direct-offline': 'Lỗi trực tiếp',
    'upstream-offline': 'Mất upstream',
    unknown: 'Unknown',
    'configuration-error': 'Chưa cấu hình',
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

const parsePointCoordinate = (value: unknown): [number, number] | null => {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value || 'null');
        } catch {
            return null;
        }
    }
    if (Array.isArray(parsed) && typeof parsed[0] === 'number' && typeof parsed[1] === 'number') return [parsed[0], parsed[1]];
    if (Array.isArray(parsed) && Array.isArray(parsed[0])) return parsePointCoordinate(parsed[0]);
    return null;
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

const layoutGraphNodes = (nodes: NetworkNode[], layoutMode: LayoutMode, rootId?: string): Record<string, { x: number; y: number }> => {
    const positions: Record<string, { x: number; y: number }> = {};
    const sortedNodes = [...nodes].sort((a, b) => rankNode(a) - rankNode(b) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

    if (layoutMode === 'tree') {
        const root = sortedNodes.find(node => node.id === rootId) || sortedNodes.find(isSourceNode) || sortedNodes[0];
        if (!root) return positions;

        positions[root.id] = { x: 40, y: 40 };
        sortedNodes.filter(node => node.id !== root.id).forEach((node, index) => {
            const column = Math.floor(index / 8);
            const row = index % 8;
            positions[node.id] = { x: 260 + column * 220, y: 40 + row * 82 };
        });

        return positions;
    }

    const rankCounts = new Map<number, number>();
    for (const node of sortedNodes) {
        const level = rankNode(node);
        const index = rankCounts.get(level) || 0;
        rankCounts.set(level, index + 1);
        positions[node.id] = { x: level * 240 + 40, y: index * 84 + 40 };
    }

    return positions;
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
    const selectedFeatureId = useDesignSync(s => s.selectedFeatureId);
    const selectFeature = useDesignSync(s => s.selectFeature);
    const setSelectedGroup = useDesignSync(s => s.setSelectedGroup);
    const zoomTo = useDesignSync(s => s.zoomTo);
    const dispatchEvent = useDesignSync(s => s.dispatchEvent);
    const setDrawingMode = useDesignSync(s => s.setDrawingMode);
    const setActiveParentFeature = useDesignSync(s => s.setActiveParentFeature);
    const networkConnectionDraft = useDesignSync(s => s.networkConnectionDraft);
    const clearNetworkConnectionDraft = useDesignSync(s => s.clearNetworkConnectionDraft);

    const mode = useNetworkStatusStore(s => s.mode);
    const isStale = useNetworkStatusStore(s => s.isStale);
    const getSnapshot = useNetworkStatusStore(s => s.getSnapshot);
    const simulateEvent = useNetworkStatusStore(s => s.simulateEvent);

    const [selectedEntity, setSelectedEntity] = useState<SelectedGraphEntity>(null);
    const [edgePendingDelete, setEdgePendingDelete] = useState<NetworkEdge | null>(null);
    const [drilldownIntersectionId, setDrilldownIntersectionId] = useState<string | null>(null);
    const lastSyncedFeatureIdRef = useRef<string | null>(null);

    const features = state?.features || {};
    const snapshot = getSnapshot();
    const hasTelemetry = Object.keys(snapshot.nodes || {}).length > 0 || Object.keys(snapshot.edges || {}).length > 0;
    const evaluation = useMemo(() => NetworkGraphService.evaluate(features, snapshot), [features, snapshot]);
    const selectedNodeInfo = evaluation.nodes.find(node => node.id === selectedFeatureId);
    const selectedIntersectionId = drilldownIntersectionId || (isSourceNode(selectedNodeInfo) ? selectedNodeInfo?.id : selectedNodeInfo?.parentFeatureId);
    const selectedIntersection = selectedIntersectionId ? evaluation.nodes.find(node => node.id === selectedIntersectionId) : null;

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
                return isSourceNode(fromNode) && isSourceNode(toNode);
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

    const selectedNode = selectedEntity?.type === 'node'
        ? evaluation.nodes.find(node => node.id === selectedEntity.id)
        : null;
    const selectedEdge = selectedEntity?.type === 'edge'
        ? evaluation.edges.find(edge => edge.id === selectedEntity.id)
        : null;

    useEffect(() => {
        if (!selectedFeatureId) {
            lastSyncedFeatureIdRef.current = null;
            return;
        }
        const selectedFeatureChanged = lastSyncedFeatureIdRef.current !== selectedFeatureId;
        lastSyncedFeatureIdRef.current = selectedFeatureId;
        const isNode = evaluation.nodes.some(node => node.id === selectedFeatureId);
        const isEdge = evaluation.edges.some(edge => edge.id === selectedFeatureId);
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

    const { reactFlowNodes, reactFlowEdges } = useMemo(() => {
        const positions = layoutGraphNodes(scopedNodes, layoutMode, selectedIntersectionId);

        const nodes: Node[] = scopedNodes.map(node => {
            const nodeState = evaluation.nodeStates[node.id];

            return {
                id: node.id,
                type: 'networkNode',
                position: positions[node.id] || { x: 40, y: 40 },
                data: {
                    label: node.label,
                    role: node.role === 'intersection' ? 'cabinet' : node.role,
                    status: nodeState?.status || 'unknown',
                    telemetryId: node.telemetryId || node.id,
                    isInferredRole: node.isInferredRole,
                    isSelected: selectedFeatureId === node.id || selectedEntity?.id === node.id,
                    affectedDownstreamCount: nodeState?.affectedDownstream.length || 0,
                },
            };
        });

        const edges: Edge[] = scopedEdges.map(edge => {
            const edgeStatus = edge.kind === 'relationship' ? 'online' : snapshot.edges?.[edge.telemetryId || edge.id] || 'unknown';
            const color = edgeStatus === 'online' ? '#34d399' : edgeStatus === 'offline' ? '#f87171' : '#71717a';
            const { lineStyle, iconType } = getNetworkLinkPresentation(edge);
            const iconLabel = linkIconLabel[iconType];

            return {
                id: edge.id,
                source: edge.from,
                target: edge.to,
                animated: edge.kind === 'signal' && edgeStatus === 'online',
                selectable: edge.kind === 'signal',
                interactionWidth: edge.kind === 'signal' ? 18 : 8,
                data: { status: edgeStatus, label: edge.label, kind: edge.kind, iconType, lineStyle },
                label: edge.kind === 'relationship' ? undefined : iconLabel || (edgeStatus === 'unknown' ? undefined : edgeStatus),
                markerEnd: edge.kind === 'signal' && iconType !== 'none' ? { type: MarkerType.ArrowClosed, color } : undefined,
                style: {
                    stroke: edge.kind === 'relationship' ? '#64748b' : color,
                    strokeDasharray: edge.kind === 'relationship' ? '5 5' : lineStyleDash[lineStyle],
                    strokeWidth: selectedEntity?.id === edge.id ? 3 : edge.kind === 'relationship' ? 1.5 : 2,
                },
            };
        });

        return { reactFlowNodes: nodes, reactFlowEdges: edges };
    }, [evaluation.nodeStates, layoutMode, scopedEdges, scopedNodes, selectedEntity?.id, selectedFeatureId, selectedIntersectionId, snapshot.edges]);

    useEffect(() => {
        if (!selectedFeatureId) return;
        const selectedFlowNode = reactFlowNodes.find(node => node.id === selectedFeatureId);
        if (!selectedFlowNode) return;

        window.requestAnimationFrame(() => {
            reactFlow.setCenter(
                selectedFlowNode.position.x + 70,
                selectedFlowNode.position.y + 34,
                { zoom: 1.15, duration: 250 }
            );
        });
    }, [reactFlow, reactFlowNodes, selectedFeatureId]);

    const selectAndZoomFeature = useCallback((id: string) => {
        selectFeature(id);
        zoomTo(id, 'feature');
    }, [selectFeature, zoomTo]);

    const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedEntity({ type: 'node', id: node.id });
        selectAndZoomFeature(node.id);

        const graphNode = evaluation.nodes.find(item => item.id === node.id);
        if (graphNode && isSourceNode(graphNode)) {
            setDrilldownIntersectionId(graphNode.id);
        }

        if (mode === 'simulation') {
            const telemetryId = String(node.data.telemetryId || node.id);
            const currentStatus = snapshot.nodes?.[telemetryId] || 'online';
            simulateEvent(telemetryId, 'node', nextStatus(currentStatus));
        }
    }, [evaluation.nodes, mode, selectAndZoomFeature, simulateEvent, snapshot.nodes]);

    const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.stopPropagation();
        const graphEdge = evaluation.edges.find(item => item.id === edge.id);
        if (!graphEdge || graphEdge.kind !== 'signal') return;

        setSelectedEntity({ type: 'edge', id: graphEdge.id });

        if (mode === 'simulation') {
            const telemetryId = graphEdge.telemetryId || graphEdge.id;
            const currentStatus = snapshot.edges?.[telemetryId] || 'online';
            simulateEvent(telemetryId, 'edge', nextStatus(currentStatus));
        }
    }, [evaluation.edges, mode, simulateEvent, snapshot.edges]);

    const handleConnect = useCallback(async (connection: Connection) => {
        if (!connection.source || !connection.target || connection.source === connection.target) return;
        const duplicateSignal = evaluation.edges.some(edge =>
            edge.kind === 'signal' &&
            ((edge.from === connection.source && edge.to === connection.target) ||
                (edge.from === connection.target && edge.to === connection.source))
        );
        if (duplicateSignal) {
            alert('Tuyến SignalLine giữa hai đối tượng này đã tồn tại.');
            return;
        }

        const sourceNode = evaluation.nodes.find(node => node.id === connection.source);
        const targetNode = evaluation.nodes.find(node => node.id === connection.target);
        const groupId = sourceNode?.feature.group_id || targetNode?.feature.group_id || null;
        if (groupId) setSelectedGroup(groupId);

        const parentFeatureId = sourceNode?.parentFeatureId || targetNode?.parentFeatureId || (isSourceNode(targetNode) ? targetNode?.id : null) || (isSourceNode(sourceNode) ? sourceNode?.id : null);
        setActiveParentFeature(parentFeatureId || null);

        if (!sourceNode || !targetNode || !groupId) {
            alert('Không thể lưu kết nối vì thiếu nhóm của đối tượng.');
            return;
        }

        clearNetworkConnectionDraft();
        setDrawingMode('none');

        await dispatchEvent({
            type: 'FeatureCreated',
            payload: {
                id: crypto.randomUUID(),
                layer_id: sourceNode.feature.layer_id || targetNode.feature.layer_id,
                group_id: groupId,
                name: `NetworkLink ${sourceNode.label} → ${targetNode.label}`,
                geom_type: 'NetworkLink',
                coordinates: null,
                metadata: JSON.stringify({
                    infrastructure: { type: 'NetworkLink', status: 'simulated', line_style: 'solid', icon_type: 'arrow' },
                    network: {
                        from_feature_id: connection.source,
                        to_feature_id: connection.target,
                    },
                }),
                properties: {},
            },
        });
    }, [clearNetworkConnectionDraft, dispatchEvent, evaluation.edges, evaluation.nodes, setActiveParentFeature, setDrawingMode, setSelectedGroup]);

    const handleCancelDraft = useCallback(() => {
        setDrawingMode('none');
        clearNetworkConnectionDraft();
    }, [clearNetworkConnectionDraft, setDrawingMode]);

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
        const metadata = parseMetadata(selectedEdge.feature.metadata);
        const network = metadata.network && typeof metadata.network === 'object' ? metadata.network as Record<string, unknown> : {};
        const startPoint = parsePointCoordinate(selectedEdge.feature.coordinates);
        const endPoint = Array.isArray(selectedEdge.feature.coordinates) && selectedEdge.feature.coordinates.length > 1
            ? parsePointCoordinate(selectedEdge.feature.coordinates[selectedEdge.feature.coordinates.length - 1])
            : null;
        const coordinates = startPoint && endPoint ? [endPoint, startPoint] : selectedEdge.feature.coordinates;

        await dispatchEvent({
            type: 'FeatureUpdated',
            payload: {
                id: selectedEdge.id,
                coordinates,
                metadata: JSON.stringify({
                    ...metadata,
                    network: {
                        ...network,
                        from_feature_id: selectedEdge.to,
                        to_feature_id: selectedEdge.from,
                    },
                }),
            },
        });
    }, [dispatchEvent, selectedEdge]);

    const handleUpdateEdgePresentation = useCallback(async (updates: Partial<{ name: string; lineStyle: NetworkLineStyle; iconType: NetworkLinkIcon }>) => {
        if (!selectedEdge?.feature || selectedEdge.kind !== 'signal') return;
        const { metadata, infrastructure } = getNetworkLinkPresentation(selectedEdge);
        const nextInfrastructure = {
            ...infrastructure,
            type: infrastructure.type || 'NetworkLink',
            ...(updates.lineStyle ? { line_style: updates.lineStyle } : {}),
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

    const fromDraft = networkConnectionDraft ? evaluation.nodes.find(node => node.id === networkConnectionDraft.fromFeatureId) : null;
    const toDraft = networkConnectionDraft ? evaluation.nodes.find(node => node.id === networkConnectionDraft.toFeatureId) : null;
    const selectedEdgePresentation = getNetworkLinkPresentation(selectedEdge);

    return (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
            <div className="relative min-h-0">
                {tab === 'intersection' && selectedIntersection && (
                    <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded border border-white/10 bg-zinc-950/90 px-3 py-2 text-[11px] font-semibold text-zinc-200 shadow-lg">
                        <button
                            onClick={() => setDrilldownIntersectionId(null)}
                            className="rounded border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/10"
                        >
                            Back
                        </button>
                        <span className="max-w-[320px] truncate">{selectedIntersection.label}</span>
                    </div>
                )}
                <ReactFlow
                    nodes={reactFlowNodes}
                    edges={reactFlowEdges}
                    nodeTypes={nodeTypes}
                    onNodeClick={handleNodeClick}
                    onEdgeClick={handleEdgeClick}
                    onConnect={handleConnect}
                    onEdgesDelete={handleEdgesDelete}
                    connectionMode={ConnectionMode.Loose}
                    fitView
                    deleteKeyCode={['Backspace', 'Delete']}
                    className="bg-black/40"
                >
                    <Background color="#ffffff" gap={16} size={1} variant={BackgroundVariant.Dots} className="opacity-5" />
                    <Controls className="!border-white/10 !bg-black/60 !fill-white !text-white" />
                    <MiniMap
                        nodeColor={node => {
                            const status = node.data?.status as NetworkComputedStatus | undefined;
                            if (status === 'online') return '#34d399';
                            if (status === 'direct-offline') return '#f87171';
                            if (status === 'upstream-offline') return '#fb923c';
                            if (status === 'configuration-error') return '#c084fc';
                            return '#71717a';
                        }}
                        className="!border-white/10 !bg-black/80"
                        maskColor="rgba(0,0,0,0.5)"
                    />
                </ReactFlow>

                {scopedNodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                        <div className="max-w-md rounded border border-white/10 bg-zinc-950/90 p-5 text-center shadow-2xl">
                            <Router className="mx-auto mb-3 text-zinc-500" size={28} />
                            <div className="text-sm font-bold text-zinc-100">Chưa có topology Network</div>
                            <div className="mt-2 text-xs leading-5 text-zinc-500">
                                Chua co doi tuong khong phai line/polyline de hien thi trong Network.
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'realtime' && (isStale || !hasTelemetry) && (
                    <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded border border-orange-400/30 bg-orange-950/90 px-3 py-2 text-[11px] font-semibold text-orange-100 shadow-lg">
                        <WifiOff size={14} />
                        Chưa kết nối telemetry
                    </div>
                )}

                {networkConnectionDraft && (
                    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
                        <div className="flex items-center gap-3 rounded-full border border-cyan-400/30 bg-cyan-950/90 px-4 py-2 text-xs font-medium text-cyan-100 shadow-xl backdrop-blur-md">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
                            </span>
                            Đang vẽ tuyến SignalLine từ {fromDraft?.label || networkConnectionDraft.fromFeatureId} đến {toDraft?.label || networkConnectionDraft.toFeatureId}
                            <button
                                onClick={handleCancelDraft}
                                className="ml-1 rounded p-1 transition hover:bg-white/10"
                                title="Hủy vẽ tuyến"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <aside className="min-h-0 overflow-auto border-l border-white/10 bg-zinc-950/80 p-3">
                <div className="mb-3 flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">Inspector</div>
                    {selectedEdge && selectedEdge.kind === 'signal' && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleReverseEdge}
                                className="inline-flex items-center gap-1 rounded border border-cyan-400/30 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/10"
                            >
                                Đảo chiều
                            </button>
                            <button
                                onClick={() => setEdgePendingDelete(selectedEdge)}
                                className="inline-flex items-center gap-1 rounded border border-red-400/30 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/10"
                            >
                                <Trash2 size={12} /> Xóa tuyến
                            </button>
                        </div>
                    )}
                </div>

                {!selectedNode && !selectedEdge && (
                    <div className="rounded border border-white/10 bg-black/20 p-3 text-[11px] leading-5 text-zinc-500">
                        Chọn một node hoặc tuyến trên graph để xem chi tiết. Kéo từ handle bên phải của node sang handle bên trái của node khác để bắt đầu vẽ SignalLine trên bản đồ.
                    </div>
                )}

                {selectedNode && (
                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', statusColor[evaluation.nodeStates[selectedNode.id]?.status || 'unknown'])} />
                            <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-zinc-100">{selectedNode.label}</div>
                                <div className="text-[10px] uppercase text-zinc-500">{selectedNode.role}</div>
                            </div>
                        </div>
                        <InspectorRow label="Trạng thái" value={statusLabel[evaluation.nodeStates[selectedNode.id]?.status || 'unknown']} />
                        <InspectorRow label="Telemetry" value={<span className="font-mono">{selectedNode.telemetryId || 'Chưa gán'}</span>} />
                        <InspectorRow label="Feature" value={<span className="font-mono">{selectedNode.id}</span>} />
                        <InspectorRow label="Lý do" value={evaluation.nodeStates[selectedNode.id]?.reason || 'Không có'} />
                        <InspectorRow label="Downstream" value={`${evaluation.nodeStates[selectedNode.id]?.affectedDownstream.length || 0} node`} />
                    </div>
                )}

                {selectedEdge && (
                    <div className="rounded border border-white/10 bg-black/20 p-3">
                        <div className="mb-3 flex items-center gap-2">
                            <GitBranch size={14} className="text-cyan-300" />
                            <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-zinc-100">{selectedEdge.label}</div>
                                <div className="text-[10px] uppercase text-zinc-500">{selectedEdge.kind === 'relationship' ? 'Relationship' : 'NetworkLink simulated'}</div>
                            </div>
                        </div>

                        {selectedEdge.kind === 'signal' && selectedEdge.feature && (
                            <div className="mb-3 space-y-3 rounded border border-cyan-400/10 bg-cyan-400/5 p-3">
                                <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-zinc-400">Ten ket noi</label>
                                    <input
                                        key={selectedEdge.id}
                                        defaultValue={selectedEdge.feature.name || selectedEdge.label}
                                        onBlur={event => handleUpdateEdgePresentation({ name: event.target.value })}
                                        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-cyan-400/60"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                                        Bieu tuong
                                        <select
                                            value={selectedEdgePresentation.iconType}
                                            onChange={event => handleUpdateEdgePresentation({ iconType: event.target.value as NetworkLinkIcon })}
                                            className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] normal-case text-zinc-100 outline-none focus:border-cyan-400/60"
                                        >
                                            <option value="arrow">Arrow</option>
                                            <option value="signal">Signal</option>
                                            <option value="wireless">Wireless</option>
                                            <option value="fiber">Fiber</option>
                                            <option value="none">None</option>
                                        </select>
                                    </label>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                                        Loai net
                                        <select
                                            value={selectedEdgePresentation.lineStyle}
                                            onChange={event => handleUpdateEdgePresentation({ lineStyle: event.target.value as NetworkLineStyle })}
                                            className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] normal-case text-zinc-100 outline-none focus:border-cyan-400/60"
                                        >
                                            <option value="solid">Lien</option>
                                            <option value="dashed">Net dut</option>
                                            <option value="dotted">Cham</option>
                                        </select>
                                    </label>
                                </div>
                            </div>
                        )}

                        <InspectorRow label="Trang thai" value={selectedEdge.kind === 'relationship' ? 'display-only' : snapshot.edges?.[selectedEdge.telemetryId || selectedEdge.id] || 'unknown'} />
                        <InspectorRow label="Nguon" value={<span className="font-mono">{selectedEdge.from}</span>} />
                        <InspectorRow label="Dich" value={<span className="font-mono">{selectedEdge.to}</span>} />
                        <InspectorRow label="Telemetry" value={<span className="font-mono">{selectedEdge.telemetryId || 'Chua gan'}</span>} />
                        <InspectorRow label="Feature" value={<span className="font-mono">{selectedEdge.id}</span>} />
                    </div>
                )}

                <div className="mt-3 rounded border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
                        <TriangleAlert size={13} /> Cấu hình
                    </div>
                    {evaluation.diagnostics.length === 0 ? (
                        <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                            <CheckCircle2 size={13} /> Không phát hiện lỗi topology.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {evaluation.diagnostics.map((diagnostic, index) => (
                                <button
                                    key={`${diagnostic.type}-${diagnostic.edgeId || diagnostic.featureId || index}`}
                                    onClick={() => handleDiagnosticSelect(diagnostic.edgeId || diagnostic.featureId)}
                                    className="w-full rounded border border-purple-400/30 bg-purple-500/10 p-2 text-left text-[11px] leading-4 text-purple-100 hover:bg-purple-500/20"
                                >
                                    <div className="mb-1 flex items-center gap-1 font-bold">
                                        <AlertTriangle size={12} /> {diagnostic.type}
                                    </div>
                                    {diagnostic.message}
                                </button>
                            ))}
                        </div>
                    )}
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
                            <span>Công cụ vận hành và chỉnh topology</span>
                            {mode === 'realtime' && isStale && (
                                <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-300">
                                    stale
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button className="rounded border border-white/10 p-1.5 text-zinc-300 hover:bg-white/10" onClick={onPin} title={isPinned ? 'Bỏ ghim' : 'Ghim'}>
                        {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button className="rounded border border-white/10 p-1.5 text-zinc-300 hover:bg-white/10" onClick={onClose} title="Đóng">
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div className="flex items-center gap-2">
                    <div className="flex rounded border border-white/10 bg-black/20 p-0.5 text-[11px] font-semibold">
                        <button className={cn('rounded px-3 py-1', tab === 'intersection' ? 'bg-cyan-400 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setTab('intersection')}>
                            Nút giao
                        </button>
                        <button className={cn('rounded px-3 py-1', tab === 'route' ? 'bg-cyan-400 text-black' : 'text-zinc-400 hover:text-zinc-200')} onClick={() => setTab('route')}>
                            Toàn tuyến
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



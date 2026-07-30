import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link2, Loader2, X } from 'lucide-react';
import { useDesignSync } from '@IMPLEMENT/stores/useDesignSync';
import {
  deleteFiberPortPatch,
  deleteFiberPortTermination,
  deleteFiberSplice,
  getFiberInventory,
  upsertFiberPort,
  upsertFiberPortPatch,
  upsertFiberPortTermination,
  upsertEquipment,
  upsertFiberSplice,
  upsertFiberSplices,
} from '@DESIGN/features/map/network/fiberService';
import type { FiberSpliceUpsertInput } from '@DESIGN/features/map/network/fiberService';
import type { FiberInventory, FiberPort, FiberPortPatch, FiberPortTermination, FiberSplice, FiberStrand } from '@CONTRACT/types';
import { Button } from '@DESIGN/components/ui/Button';
import {
  buildGroupedSpliceDiagramItems,
  type TubeSpliceDiagramGroup,
  type VisibleSpliceDiagramItem,
} from './fiberSpliceDiagramModel';

import { DIAGRAM_COLORS, fiberColorAt } from '@DESIGN/features/map/styles/dataColors';

type EndpointDirection = 'start' | 'end';
type EquipmentKind = 'splice_enclosure' | 'odf';

interface Props {
  enclosureId: string;
  evaluation: any;
  onClose: () => void;
}

interface CableEndpoint {
  id: string;
  cableId: string;
  cableName: string;
  direction: EndpointDirection;
  fiberCount: number;
}

type StrandSide = 'left' | 'right';

interface AnchorPoint {
  x: number;
  y: number;
}

interface SplicePath {
  splice: FiberSplice;
  leftStrand: FiberStrand;
  leftStrandId: string;
  rightStrandId: string;
  path: string;
}

interface TubeSplicePath {
  id: string;
  group: TubeSpliceDiagramGroup;
  path: string;
  labelX: number;
  labelY: number;
}

interface OdfStrandDrag {
  side: StrandSide;
  strandId: string;
}

interface OdfPath {
  id: string;
  sourceId: string;
  kind: 'termination' | 'patch';
  path: string;
  color: string;
  dashed?: boolean;
}

const equipmentLabels: Record<EquipmentKind, string> = {
  splice_enclosure: 'Măng xông',
  odf: 'ODF',
};

/** Strand color cycles every 12 cores (TIA-598-C). */
const getStrandColor = (strandNo: number) => fiberColorAt(strandNo);
/** Buffer tube color advances once per 12-core group. */
const getTubeColor = (strandNo: number) => fiberColorAt(Math.floor((strandNo - 1) / 12) + 1);

const getStrandBackground = (strandNo: number) => {
  return getStrandColor(strandNo).hex;
};

export function FiberSpliceDiagramModal({ enclosureId, evaluation, onClose }: Props) {
  const state = useDesignSync(s => s.state) as any;
  const projectId = useDesignSync(s => s.projectId);
  const [localInventory, setLocalInventory] = useState<FiberInventory | null>(null);
  const [requestedLeftCableId, setRequestedLeftCableId] = useState('');
  const [requestedRightCableId, setRequestedRightCableId] = useState('');
  const [selectedLeftStrandId, setSelectedLeftStrandId] = useState<string | null>(null);
  const [selectedRightStrandId, setSelectedRightStrandId] = useState<string | null>(null);
  const [draggingLeftStrandId, setDraggingLeftStrandId] = useState<string | null>(null);
  const [dragPointer, setDragPointer] = useState<AnchorPoint | null>(null);
  const [hoveredRightStrandId, setHoveredRightStrandId] = useState<string | null>(null);
  const [splicePaths, setSplicePaths] = useState<SplicePath[]>([]);
  const [tubeSplicePaths, setTubeSplicePaths] = useState<TubeSplicePath[]>([]);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [draggingOdfStrand, setDraggingOdfStrand] = useState<OdfStrandDrag | null>(null);
  const [odfDragPointer, setOdfDragPointer] = useState<AnchorPoint | null>(null);
  const [hoveredPortId, setHoveredPortId] = useState<string | null>(null);
  const [odfPaths, setOdfPaths] = useState<OdfPath[]>([]);
  const [odfPreviewPath, setOdfPreviewPath] = useState<string | null>(null);
  const [odfPortCount, setOdfPortCount] = useState(0);
  const [selectedPatchPortId, setSelectedPatchPortId] = useState<string | null>(null);
  const [equipmentKind, setEquipmentKind] = useState<EquipmentKind>('splice_enclosure');
  const [lossDb, setLossDb] = useState(0.05);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const diagramRef = useRef<HTMLDivElement | null>(null);
  const strandRefs = useRef(new Map<string, HTMLButtonElement>());
  const portRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const equipmentKindSelectId = useId();

  const storeInventory = state?.inventory as FiberInventory | null | undefined;
  const inventory: FiberInventory | null = localInventory ?? storeInventory ?? null;
  const getFeatureName = (featureId: string) => state?.features?.[featureId]?.name || featureId;

  const refreshInventory = useCallback(async () => {
    if (!projectId) return;
    try {
      setLocalInventory(await getFiberInventory(projectId));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu fiber.');
    }
  }, [projectId]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refreshInventory(), 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refreshInventory]);

  /** Escape closes the dialog (MASTER.md §7). */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  /** Initial focus lands on the close button — a safe, non-destructive control. */
  useEffect(() => {
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, []);

  const currentEquipment = useMemo(
    () => (inventory?.equipment || []).find(item => item.feature_id === enclosureId) || null,
    [enclosureId, inventory?.equipment]
  );
  const activeEquipmentKind = equipmentKind;

  useEffect(() => {
    const equipmentTimer = window.setTimeout(() => {
      if (currentEquipment?.equipment_type === 'odf') {
        setEquipmentKind('odf');
      } else if (currentEquipment?.equipment_type === 'splice_enclosure') {
        setEquipmentKind('splice_enclosure');
      }
    }, 0);
    return () => window.clearTimeout(equipmentTimer);
  }, [currentEquipment?.equipment_type]);

  const connectedCableEndpoints = useMemo(() => {
    const endpoints: CableEndpoint[] = [];
    const endpointIds = new Set<string>();
    const byId = new Map((inventory?.cables || []).map(cable => [cable.id, cable]));
    const pushEndpoint = (endpoint: CableEndpoint) => {
      if (endpointIds.has(endpoint.id)) return;
      endpointIds.add(endpoint.id);
      endpoints.push(endpoint);
    };

    (inventory?.cable_points || [])
      .filter(point => point.feature_id === enclosureId)
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .forEach(point => {
        const cable = byId.get(point.cable_id);
        if (!cable) return;

        if (point.point_kind === 'cable_start') {
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đi)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        } else if (point.point_kind === 'cable_end') {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đến)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
        } else if (point.point_kind === 'splice_enclosure') {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Về trước)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Về sau)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        }
      });

    evaluation?.edges?.forEach((edge: any) => {
      if (edge.sourceType !== 'map-polyline' || edge.kind !== 'signal') return;
      if (edge.from !== enclosureId && edge.to !== enclosureId) return;
      if (!edge.feature?.id) return;

      const cable = inventory?.cables.find(item => item.feature_id === edge.feature.id);
      if (cable) {
        if (edge.from === enclosureId) {
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đi)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        } else {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Đến)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
        }
      }
    });

    return endpoints.filter((endpoint, index, all) => all.findIndex(item => item.id === endpoint.id) === index);
  }, [enclosureId, evaluation?.edges, inventory?.cable_points, inventory?.cables]);

  const { leftEndpointId, rightEndpointId } = useMemo(() => {
    const validIds = connectedCableEndpoints.map(endpoint => endpoint.id);
    const findId = (requested?: string) => {
      if (!requested) return undefined;
      if (validIds.includes(requested)) return requested;
      return validIds.find(id => connectedCableEndpoints.find(endpoint => endpoint.id === id)?.cableId === requested);
    };
    const reqLeft = findId(requestedLeftCableId);
    const reqRight = findId(requestedRightCableId);
    const nextLeft = reqLeft || validIds[0] || '';
    const nextRight = reqRight && reqRight !== nextLeft ? reqRight : validIds.find(id => id !== nextLeft) || '';
    return { leftEndpointId: nextLeft, rightEndpointId: nextRight };
  }, [connectedCableEndpoints, requestedLeftCableId, requestedRightCableId]);

  const leftEndpoint = connectedCableEndpoints.find(endpoint => endpoint.id === leftEndpointId);
  const rightEndpoint = connectedCableEndpoints.find(endpoint => endpoint.id === rightEndpointId);

  const leftStrands = useMemo(
    () => (inventory?.strands || [])
      .filter(strand => strand.cable_id === leftEndpoint?.cableId)
      .sort((a, b) => a.strand_no - b.strand_no),
    [inventory?.strands, leftEndpoint?.cableId]
  );

  const rightStrands = useMemo(
    () => (inventory?.strands || [])
      .filter(strand => strand.cable_id === rightEndpoint?.cableId)
      .sort((a, b) => a.strand_no - b.strand_no),
    [inventory?.strands, rightEndpoint?.cableId]
  );

  const selectedLeftStrand = leftStrands.find(strand => strand.id === selectedLeftStrandId) || null;
  const selectedRightStrand = rightStrands.find(strand => strand.id === selectedRightStrandId) || null;
  const odfPorts = useMemo(
    () => (inventory?.ports || [])
      .filter(port => port.feature_id === enclosureId)
      .sort((a, b) => a.port_label.localeCompare(b.port_label, undefined, { numeric: true })),
    [enclosureId, inventory?.ports]
  );
  const portTerminations = useMemo(
    () => (inventory?.port_terminations || []) as FiberPortTermination[],
    [inventory?.port_terminations]
  );
  const portPatches = useMemo(
    () => (inventory?.port_patches || []) as FiberPortPatch[],
    [inventory?.port_patches]
  );
  const portTerminationsByPort = useMemo(
    () => new Map(portTerminations.map(item => [item.port_id, item])),
    [portTerminations]
  );
  const portPatchesByPort = useMemo(() => {
    const patches = new Map<string, FiberPortPatch[]>();
    portPatches.forEach(patch => {
      patches.set(patch.from_port_id, [...(patches.get(patch.from_port_id) || []), patch]);
      patches.set(patch.to_port_id, [...(patches.get(patch.to_port_id) || []), patch]);
    });
    return patches;
  }, [portPatches]);
  const odfStrandTerminations = useMemo(() => {
    const keys = new Set<string>();
    portTerminations.forEach(termination => keys.add(`${termination.strand_id}-${termination.strand_direction}`));
    return keys;
  }, [portTerminations]);
  const odfTerminationByStrandDirection = useMemo(() => {
    const terminations = new Map<string, FiberPortTermination>();
    portTerminations.forEach(termination => {
      terminations.set(`${termination.strand_id}-${termination.strand_direction}`, termination);
    });
    return terminations;
  }, [portTerminations]);

  useEffect(() => {
    if (activeEquipmentKind !== 'odf') return;
    const portCountTimer = window.setTimeout(() => {
      if (odfPorts.length > 0) {
        setOdfPortCount(odfPorts.length);
        return;
      }
      const endpointCapacity = Math.max(leftEndpoint?.fiberCount || 0, rightEndpoint?.fiberCount || 0, 2);
      setOdfPortCount(current => current || endpointCapacity);
    }, 0);
    return () => window.clearTimeout(portCountTimer);
  }, [activeEquipmentKind, leftEndpoint?.fiberCount, odfPorts.length, rightEndpoint?.fiberCount]);

  const splices = useMemo(
    () => (inventory?.splices || []).filter(splice => splice.enclosure_feature_id === enclosureId),
    [enclosureId, inventory?.splices]
  );

  const occupiedStrands = useMemo(() => {
    const occupied = new Set<string>();
    splices.forEach(splice => {
      occupied.add(`${splice.from_strand_id}-${splice.from_direction}`);
      occupied.add(`${splice.to_strand_id}-${splice.to_direction}`);
    });
    return occupied;
  }, [splices]);

  const visibleSplices = useMemo(() => {
    if (!leftEndpoint || !rightEndpoint) return [];
    const leftByDirection = new Set(leftStrands.map(strand => `${strand.id}-${leftEndpoint.direction}`));
    const rightByDirection = new Set(rightStrands.map(strand => `${strand.id}-${rightEndpoint.direction}`));
    const leftById = new Set(leftStrands.map(strand => strand.id));
    const rightById = new Set(rightStrands.map(strand => strand.id));

    return splices
      .map(splice => {
        let leftStrandId = '';
        let rightStrandId = '';

        if (leftByDirection.has(`${splice.from_strand_id}-${splice.from_direction}`) && rightByDirection.has(`${splice.to_strand_id}-${splice.to_direction}`)) {
          leftStrandId = splice.from_strand_id;
          rightStrandId = splice.to_strand_id;
        } else if (leftByDirection.has(`${splice.to_strand_id}-${splice.to_direction}`) && rightByDirection.has(`${splice.from_strand_id}-${splice.from_direction}`)) {
          leftStrandId = splice.to_strand_id;
          rightStrandId = splice.from_strand_id;
        } else if (leftById.has(splice.from_strand_id) && rightById.has(splice.to_strand_id)) {
          leftStrandId = splice.from_strand_id;
          rightStrandId = splice.to_strand_id;
        } else if (leftById.has(splice.to_strand_id) && rightById.has(splice.from_strand_id)) {
          leftStrandId = splice.to_strand_id;
          rightStrandId = splice.from_strand_id;
        }

        const leftStrand = leftStrands.find(strand => strand.id === leftStrandId);
        const rightStrand = rightStrands.find(strand => strand.id === rightStrandId);
        if (!leftStrand || !rightStrand || !rightStrandId) return null;

        return {
          splice,
          leftStrand,
          rightStrand,
          leftStrandId,
          rightStrandId,
        };
      })
      .filter((item): item is VisibleSpliceDiagramItem => !!item);
  }, [leftEndpoint, leftStrands, rightEndpoint, rightStrands, splices]);

  const getStrandKey = useCallback((side: StrandSide, strandId: string) => `${side}:${strandId}`, []);

  const setStrandRef = useCallback((side: StrandSide, strandId: string, element: HTMLButtonElement | null) => {
    const key = getStrandKey(side, strandId);
    if (element) {
      strandRefs.current.set(key, element);
    } else {
      strandRefs.current.delete(key);
    }
  }, [getStrandKey]);

  const setPortRef = useCallback((portId: string, element: HTMLButtonElement | null) => {
    if (element) {
      portRefs.current.set(portId, element);
    } else {
      portRefs.current.delete(portId);
    }
  }, []);

  const getRelativePoint = useCallback((clientX: number, clientY: number): AnchorPoint | null => {
    const container = diagramRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: clientX - rect.left + container.scrollLeft,
      y: clientY - rect.top + container.scrollTop,
    };
  }, []);

  const getStrandAnchor = useCallback((side: StrandSide, strandId: string): AnchorPoint | null => {
    const container = diagramRef.current;
    const element = strandRefs.current.get(getStrandKey(side, strandId));
    if (!container || !element) return null;
    const containerRect = container.getBoundingClientRect();
    const strandRect = element.getBoundingClientRect();
    return {
      x: (side === 'left' ? strandRect.right : strandRect.left) - containerRect.left + container.scrollLeft,
      y: strandRect.top + strandRect.height / 2 - containerRect.top + container.scrollTop,
    };
  }, [getStrandKey]);

  const getPortAnchor = useCallback((portId: string): AnchorPoint | null => {
    const container = diagramRef.current;
    const element = portRefs.current.get(portId);
    if (!container || !element) return null;
    const containerRect = container.getBoundingClientRect();
    const portRect = element.getBoundingClientRect();
    return {
      x: portRect.left + portRect.width / 2 - containerRect.left + container.scrollLeft,
      y: portRect.bottom - containerRect.top + container.scrollTop,
    };
  }, []);

  const buildSplicePath = useCallback((from: AnchorPoint, to: AnchorPoint) => {
    const deltaX = Math.abs(to.x - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${from.x + deltaX} ${from.y}, ${to.x - deltaX} ${to.y}, ${to.x} ${to.y}`;
  }, []);

  const midpoint = useCallback((a: AnchorPoint, b: AnchorPoint): AnchorPoint => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }), []);

  const buildTerminationPath = useCallback((from: AnchorPoint, to: AnchorPoint, side: StrandSide) => {
    const deltaX = Math.abs(to.x - from.x) * 0.4;
    const deltaY = Math.abs(to.y - from.y) * 0.4;
    const cp1x = side === 'left' ? from.x + deltaX : from.x - deltaX;
    return `M ${from.x} ${from.y} C ${cp1x} ${from.y}, ${to.x} ${to.y + deltaY}, ${to.x} ${to.y}`;
  }, []);

  const buildPatchPath = useCallback((from: AnchorPoint, to: AnchorPoint) => {
    const dist = Math.abs(to.x - from.x);
    const deltaY = Math.max(30, dist * 0.4);
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + deltaY}, ${to.x} ${to.y + deltaY}, ${to.x} ${to.y}`;
  }, []);

  const updateSplicePaths = useCallback(() => {
    const groupedItems = buildGroupedSpliceDiagramItems(visibleSplices);
    setSplicePaths(groupedItems.singleSplices.flatMap(item => {
      const from = getStrandAnchor('left', item.leftStrandId);
      const to = getStrandAnchor('right', item.rightStrandId);
      if (!from || !to) return [];
      return [{
        ...item,
        path: buildSplicePath(from, to),
      }];
    }));
    setTubeSplicePaths(groupedItems.tubeGroups.flatMap(group => {
      const first = group.splices[0];
      const last = group.splices[group.splices.length - 1];
      if (!first || !last) return [];
      const leftFirst = getStrandAnchor('left', first.leftStrandId);
      const leftLast = getStrandAnchor('left', last.leftStrandId);
      const rightFirst = getStrandAnchor('right', first.rightStrandId);
      const rightLast = getStrandAnchor('right', last.rightStrandId);
      if (!leftFirst || !leftLast || !rightFirst || !rightLast) return [];
      const from = midpoint(leftFirst, leftLast);
      const to = midpoint(rightFirst, rightLast);
      return [{
        id: group.id,
        group,
        path: buildSplicePath(from, to),
        labelX: (from.x + to.x) / 2,
        labelY: (from.y + to.y) / 2,
      }];
    }));
  }, [buildSplicePath, getStrandAnchor, midpoint, visibleSplices]);

  const updateOdfPaths = useCallback(() => {
    const nextPaths: OdfPath[] = [];
    portTerminations.forEach(termination => {
      const from = getStrandAnchor(termination.side, termination.strand_id);
      const to = getPortAnchor(termination.port_id);
      const strand = [...leftStrands, ...rightStrands].find(item => item.id === termination.strand_id);
      if (!from || !to || !strand) return;
      nextPaths.push({
        id: `termination-${termination.id}`,
        sourceId: termination.id,
        kind: 'termination',
        path: buildTerminationPath(from, to, termination.side),
        color: getStrandColor(strand.strand_no).hex,
        dashed: !(portPatchesByPort.get(termination.port_id) || []).length,
      });
    });
    portPatches.forEach(patch => {
      const from = getPortAnchor(patch.from_port_id);
      const to = getPortAnchor(patch.to_port_id);
      if (!from || !to) return;
      nextPaths.push({
        id: `patch-${patch.id}`,
        sourceId: patch.id,
        kind: 'patch',
        path: buildPatchPath(from, to),
        color: DIAGRAM_COLORS.okTrace,
      });
    });
    setOdfPaths(nextPaths);
  }, [buildTerminationPath, buildPatchPath, getPortAnchor, getStrandAnchor, leftStrands, portPatches, portPatchesByPort, portTerminations, rightStrands]);

  useLayoutEffect(() => {
    const layoutTimer = window.setTimeout(() => {
      updateSplicePaths();
      updateOdfPaths();
    }, 0);
    return () => window.clearTimeout(layoutTimer);
  }, [updateOdfPaths, updateSplicePaths, leftEndpointId, rightEndpointId, activeEquipmentKind]);

  useEffect(() => {
    const container = diagramRef.current;
    if (!container) return;

    const handleLayoutChange = () => updateSplicePaths();
    const handleOdfLayoutChange = () => updateOdfPaths();
    container.addEventListener('scroll', handleLayoutChange, true);
    container.addEventListener('scroll', handleOdfLayoutChange, true);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('resize', handleOdfLayoutChange);
    return () => {
      container.removeEventListener('scroll', handleLayoutChange, true);
      container.removeEventListener('scroll', handleOdfLayoutChange, true);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('resize', handleOdfLayoutChange);
    };
  }, [updateOdfPaths, updateSplicePaths]);

  useEffect(() => {
    const previewTimer = window.setTimeout(() => {
      if (!draggingLeftStrandId) {
        setPreviewPath(null);
        return;
      }
      const from = getStrandAnchor('left', draggingLeftStrandId);
      const snappedTarget = hoveredRightStrandId ? getStrandAnchor('right', hoveredRightStrandId) : null;
      const to = snappedTarget || dragPointer;
      setPreviewPath(from && to ? buildSplicePath(from, to) : null);
    }, 0);
    return () => window.clearTimeout(previewTimer);
  }, [buildSplicePath, dragPointer, draggingLeftStrandId, getStrandAnchor, hoveredRightStrandId]);

  useEffect(() => {
    const previewTimer = window.setTimeout(() => {
      if (!draggingOdfStrand) {
        setOdfPreviewPath(null);
        return;
      }
      const from = getStrandAnchor(draggingOdfStrand.side, draggingOdfStrand.strandId);
      const snappedTarget = hoveredPortId ? getPortAnchor(hoveredPortId) : null;
      const to = snappedTarget || odfDragPointer;
      setOdfPreviewPath(from && to ? buildTerminationPath(from, to, draggingOdfStrand.side) : null);
    }, 0);
    return () => window.clearTimeout(previewTimer);
  }, [buildTerminationPath, draggingOdfStrand, getPortAnchor, getStrandAnchor, hoveredPortId, odfDragPointer]);

  const isDuplicateEventIdError = (error: unknown) =>
    String(error instanceof Error ? error.message : error).includes('UNIQUE constraint failed: events.id');

  const isFiberSplicePairExistsError = (error: unknown) =>
    String(error instanceof Error ? error.message : error).includes('fiber splice pair already exists');

  const runWrite = async (
    successMessage: string,
    action: () => Promise<unknown>,
    options: { treatDuplicateEventAsSuccess?: boolean } = {}
  ): Promise<boolean> => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res: any = await action();
      if (res && res.success === false) {
        throw new Error(res.error || 'Server rejected the transaction');
      }
      setStatusMessage(successMessage);
      return true;
    } catch (error) {
      if (options.treatDuplicateEventAsSuccess && isDuplicateEventIdError(error)) {
        setStatusMessage(`${successMessage} Đang đồng bộ lại dữ liệu.`);
        return true;
      }
      setStatusMessage(error instanceof Error ? error.message : 'Thao tác thất bại.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleEquipmentKindChange = async (value: EquipmentKind) => {
    const previousKind = activeEquipmentKind;
    setEquipmentKind(value);
    if (!projectId) return;
    const saved = await runWrite(
      `Đã cập nhật loại điểm nối: ${equipmentLabels[value]}.`,
      () =>
        upsertEquipment({
          id: currentEquipment?.id || enclosureId,
          projectId,
          featureId: enclosureId,
          equipmentType: value,
          status: currentEquipment?.status || 'active',
        }),
      { treatDuplicateEventAsSuccess: true }
    );
    if (saved) {
      void refreshInventory();
    } else {
      setEquipmentKind(previousKind);
    }
  };

  const handleEnsureOdfPorts = async () => {
    if (!projectId || odfPortCount < 1) return;
    await runWrite(`Đã cập nhật ${odfPortCount} cổng ODF.`, async () => {
      await upsertEquipment({
        id: currentEquipment?.id || enclosureId,
        projectId,
        featureId: enclosureId,
        equipmentType: 'odf',
        status: currentEquipment?.status || 'active',
      });
      const existingLabels = new Set(odfPorts.map(port => port.port_label));
      const width = Math.max(2, String(odfPortCount).length);
      const events = Array.from({ length: odfPortCount }, (_, index) => {
        const label = `P${String(index + 1).padStart(width, '0')}`;
        if (existingLabels.has(label)) return null;
        return upsertFiberPort(projectId, {
          id: crypto.randomUUID(),
          featureId: enclosureId,
          portLabel: label,
          portKind: 'ODF',
          direction: 'bidirectional',
          status: 'available',
        });
      }).filter((item): item is NonNullable<typeof item> => !!item);
      await Promise.all(events);
    });
  };

  const handleStrandClick = (side: 'left' | 'right', strand: FiberStrand) => {
    if (side === 'left') {
      setSelectedLeftStrandId(current => current === strand.id ? null : strand.id);
      return;
    }
    setSelectedRightStrandId(current => current === strand.id ? null : strand.id);
  };

  const handleConnectSelectedStrands = async (leftStrandId = selectedLeftStrandId, rightStrandId = selectedRightStrandId) => {
    if (!projectId || !leftEndpoint || !rightEndpoint || !leftStrandId || !rightStrandId) return;
    if (leftStrandId === rightStrandId && leftEndpoint.direction === rightEndpoint.direction) {
      setStatusMessage('Không thể nối một core với chính nó trên cùng một hướng.');
      return;
    }
    if (occupiedStrands.has(`${leftStrandId}-${leftEndpoint.direction}`)) return;
    if (occupiedStrands.has(`${rightStrandId}-${rightEndpoint.direction}`)) return;

    await runWrite('Đã nối core quang.', () =>
      upsertFiberSplice(projectId, {
        id: crypto.randomUUID(),
        enclosureFeatureId: enclosureId,
        fromStrandId: leftStrandId,
        toStrandId: rightStrandId,
        fromDirection: leftEndpoint.direction,
        toDirection: rightEndpoint.direction,
        lossDb,
      })
    );
    setSelectedLeftStrandId(null);
    setSelectedRightStrandId(null);
  };

  const handleConnectAllStrands = async () => {
    if (!projectId || !leftEndpoint || !rightEndpoint) return;
    
    const splicesToCreate: FiberSpliceUpsertInput[] = [];
    let noRightStrand = 0;
    let sameStrand = 0;
    let leftOccupied = 0;
    let rightOccupied = 0;
    
    for (const leftStrand of leftStrands) {
      const rightStrand = rightStrands.find(s => s.strand_no === leftStrand.strand_no);
      if (!rightStrand) { noRightStrand++; continue; }
      
      const leftId = leftStrand.id;
      const rightId = rightStrand.id;
      
      if (leftId === rightId && leftEndpoint.direction === rightEndpoint.direction) { sameStrand++; continue; }
      if (occupiedStrands.has(`${leftId}-${leftEndpoint.direction}`)) { leftOccupied++; continue; }
      if (occupiedStrands.has(`${rightId}-${rightEndpoint.direction}`)) { rightOccupied++; continue; }
      
      splicesToCreate.push({
        id: crypto.randomUUID(),
        enclosureFeatureId: enclosureId,
        fromStrandId: leftId,
        toStrandId: rightId,
        fromDirection: leftEndpoint.direction,
        toDirection: rightEndpoint.direction,
        lossDb,
      });
    }
    
    if (splicesToCreate.length === 0) {
      setStatusMessage(`Không có cặp trống (Lỗi: Thiếu phải=${noRightStrand}, Trùng=${sameStrand}, Bận trái=${leftOccupied}, Bận phải=${rightOccupied})`);
      return;
    }

    const saved = await runWrite(`Nối ${splicesToCreate.length} cặp. (Bỏ qua: Thiếu phải=${noRightStrand}, Trùng=${sameStrand}, Bận trái=${leftOccupied}, Bận phải=${rightOccupied})`, async () => {
      try {
        await upsertFiberSplices(projectId, splicesToCreate);
        return;
      } catch (error) {
        if (!isFiberSplicePairExistsError(error)) throw error;
      }

      const failures: unknown[] = [];
      for (const splice of splicesToCreate) {
        try {
          await upsertFiberSplice(projectId, splice);
        } catch (error) {
          if (isFiberSplicePairExistsError(error) || isDuplicateEventIdError(error)) continue;
          failures.push(error);
        }
      }
      if (failures.length > 0) throw failures[0];
    }
    );
    if (saved) void refreshInventory();
    
    setSelectedLeftStrandId(null);
    setSelectedRightStrandId(null);
  };

  const handleConnectPortTermination = async (side: StrandSide, strandId: string, portId: string) => {
    const endpoint = side === 'left' ? leftEndpoint : rightEndpoint;
    if (!projectId || !endpoint || !strandId || !portId) return;
    if (portTerminationsByPort.has(portId)) {
      setStatusMessage('Port ODF này đã có core kết nối.');
      return;
    }
    const existingTermination = odfTerminationByStrandDirection.get(`${strandId}-${endpoint.direction}`);

    await runWrite('Đã đấu core vào cổng ODF. 1 hướng có tín hiệu.', async () => {
      if (existingTermination) {
        await deleteFiberPortTermination(projectId, existingTermination.id);
      }
      await upsertFiberPortTermination(projectId, {
        id: existingTermination?.id || crypto.randomUUID(),
        portId,
        strandId,
        strandDirection: endpoint.direction,
        side,
      });
    });
  };

  const handlePortClick = async (port: FiberPort) => {
    if (!projectId) return;
    if (!selectedPatchPortId) {
      setSelectedPatchPortId(port.id);
      return;
    }
    if (selectedPatchPortId === port.id) {
      setSelectedPatchPortId(null);
      return;
    }
    const existingPatch = (portPatchesByPort.get(selectedPatchPortId) || [])
      .find(patch => patch.from_port_id === port.id || patch.to_port_id === port.id);
    if (existingPatch) {
      setStatusMessage('Hai cổng ODF này đã thông tuyến.');
      setSelectedPatchPortId(null);
      return;
    }
    await runWrite('Đã patch hai cổng ODF. Thông tuyến 2 phía khi cả hai cổng có core.', () =>
      upsertFiberPortPatch(projectId, {
        id: crypto.randomUUID(),
        fromPortId: selectedPatchPortId,
        toPortId: port.id,
        lossDb,
      })
    );
    setSelectedPatchPortId(null);
  };

  useEffect(() => {
    if (!draggingLeftStrandId) return;

    const getDropTarget = (clientX: number, clientY: number) => {
      const target = document.elementFromPoint?.(clientX, clientY);
      return target?.closest('[data-fiber-drop-strand-id]') as HTMLElement | null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dropTarget = getDropTarget(event.clientX, event.clientY);
      setHoveredRightStrandId(dropTarget?.dataset.fiberDropStrandId || null);
      setDragPointer(getRelativePoint(event.clientX, event.clientY));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dropTarget = getDropTarget(event.clientX, event.clientY);
      const rightStrandId = dropTarget?.dataset.fiberDropStrandId;

      setDraggingLeftStrandId(null);
      setDragPointer(null);
      setHoveredRightStrandId(null);
      if (!rightStrandId) return;

      setSelectedLeftStrandId(draggingLeftStrandId);
      setSelectedRightStrandId(rightStrandId);
      void handleConnectSelectedStrands(draggingLeftStrandId, rightStrandId);
    };

    const handlePointerCancel = () => {
      setDraggingLeftStrandId(null);
      setDragPointer(null);
      setHoveredRightStrandId(null);
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
    };
  }, [draggingLeftStrandId, getRelativePoint, handleConnectSelectedStrands]);

  useEffect(() => {
    if (!draggingOdfStrand) return;

    const getDropTarget = (clientX: number, clientY: number) => {
      const target = document.elementFromPoint?.(clientX, clientY);
      return target?.closest('[data-fiber-drop-port-id]') as HTMLElement | null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dropTarget = getDropTarget(event.clientX, event.clientY);
      setHoveredPortId(dropTarget?.dataset.fiberDropPortId || null);
      setOdfDragPointer(getRelativePoint(event.clientX, event.clientY));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dropTarget = getDropTarget(event.clientX, event.clientY);
      const portId = dropTarget?.dataset.fiberDropPortId;
      const drag = draggingOdfStrand;

      setDraggingOdfStrand(null);
      setOdfDragPointer(null);
      setHoveredPortId(null);
      if (!portId) return;

      void handleConnectPortTermination(drag.side, drag.strandId, portId);
    };

    const handlePointerCancel = () => {
      setDraggingOdfStrand(null);
      setOdfDragPointer(null);
      setHoveredPortId(null);
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
    };
  }, [draggingOdfStrand, getRelativePoint, handleConnectPortTermination]);

  const handleRemoveSplice = async (spliceId: string) => {
    if (!projectId) return;
    await runWrite('Đã xóa mối nối.', () => deleteFiberSplice(projectId, spliceId));
  };

  const handleRemoveSpliceGroup = async (spliceIds: string[]) => {
    if (!projectId || spliceIds.length === 0) return;
    await runWrite(`Đã xóa ${spliceIds.length} mối nối trong tube.`, () =>
      Promise.all(spliceIds.map(spliceId => deleteFiberSplice(projectId, spliceId)))
    );
  };

  const handleRemoveOdfPath = async (path: OdfPath) => {
    if (!projectId) return;
    if (path.kind === 'termination') {
      await runWrite('Đã xóa kết nối core vào port ODF.', () => deleteFiberPortTermination(projectId, path.sourceId));
      return;
    }
    await runWrite('Đã xóa patch giữa hai port ODF.', () => deleteFiberPortPatch(projectId, path.sourceId));
  };

  /**
   * The overlay is a purely visual schematic, so it gets a text summary instead of
   * exposing the individual <path> elements to assistive tech (MASTER.md §9).
   */
  const diagramSummary = useMemo(() => {
    const parts = [
      `Sơ đồ nối core: ${leftStrands.length} core IN, ${rightStrands.length} core OUT`,
      `${splicePaths.length + tubeSplicePaths.length} mối/nhóm nối đang hiển thị`,
    ];
    if (activeEquipmentKind === 'odf') {
      parts.push(`${odfPorts.length} cổng ODF, ${odfPaths.length} đường đấu nối ODF`);
    }
    return `${parts.join('. ')}.`;
  }, [activeEquipmentKind, leftStrands.length, odfPaths.length, odfPorts.length, rightStrands.length, splicePaths.length, tubeSplicePaths.length]);

  const renderStrand = (strand: FiberStrand, side: 'left' | 'right') => {
    const color = getStrandColor(strand.strand_no);
    const endpoint = side === 'left' ? leftEndpoint : rightEndpoint;
    const isSelected = side === 'left' ? selectedLeftStrandId === strand.id : selectedRightStrandId === strand.id;
    const isOdfMode = activeEquipmentKind === 'odf';
    const isOccupied = isOdfMode
      ? odfStrandTerminations.has(`${strand.id}-${endpoint?.direction}`)
      : occupiedStrands.has(`${strand.id}-${endpoint?.direction}`);
    const canSelect = !saving && (isOdfMode || !isOccupied);
    const canDrag = !saving && (isOdfMode || (!isOccupied && side === 'left'));

    return (
      <button
        key={strand.id}
        ref={element => setStrandRef(side, strand.id, element)}
        type="button"
        data-fiber-drop-strand-id={side === 'right' && canSelect ? strand.id : undefined}
        data-fiber-strand-id={strand.id}
        data-fiber-strand-side={side}
        onClick={() => {
          if (!canSelect) return;
          handleStrandClick(side, strand);
        }}
        onPointerDown={event => {
          if (!canDrag || event.button !== 0) return;
          event.stopPropagation();
          if (isOdfMode) {
            setDraggingOdfStrand({ side, strandId: strand.id });
            setOdfDragPointer(getRelativePoint(event.clientX, event.clientY));
          } else {
            setDraggingLeftStrandId(strand.id);
            setDragPointer(getRelativePoint(event.clientX, event.clientY));
          }
        }}
        draggable={false}
        disabled={saving || (!isOdfMode && isOccupied)}
        aria-pressed={isSelected}
        aria-label={`Core ${side === 'left' ? 'IN' : 'OUT'} #${strand.strand_no}, màu ${color.name}, tube ${getTubeColor(strand.strand_no).name}${isOccupied ? ', đã sử dụng' : ''}`}
        className={[
          'flex h-5 w-full items-center overflow-hidden rounded border border-cad-border bg-cad-elevated text-[9px] font-bold transition',
          side === 'left' ? 'justify-end' : 'justify-start',
          isSelected ? 'ring-2 ring-cad-active ring-offset-1 ring-offset-cad-surface' : '',
          side === 'right' && draggingLeftStrandId && canSelect ? 'border-cad-active/60 bg-cad-active/10' : '',
          isOccupied && !isOdfMode ? 'opacity-50' : '',
          canDrag ? 'cursor-grab hover:border-cad-active/50 active:cursor-grabbing' : (canSelect ? 'cursor-pointer hover:border-cad-active/50' : 'cursor-default'),
        ].join(' ')}
        title={`Core: ${color.name} | Tube: ${getTubeColor(strand.strand_no).name} | #${strand.strand_no}`}
      >
        {side === 'left' && (
          <span
            className="h-full w-5 shrink-0 border-r border-black/30"
            style={{ background: getTubeColor(strand.strand_no).hex }}
          />
        )}
        {side === 'right' && <span className="h-px w-6 bg-white/25" />}
        
        <span
          className={`flex h-full flex-1 items-center justify-center border-x border-black/30 ${color.textClass}`}
          style={{ background: getStrandBackground(strand.strand_no) }}
        >
          {strand.strand_no}
        </span>
        
        {side === 'left' && <span className="h-px w-6 bg-white/25" />}
        {side === 'right' && (
          <span
            className="h-full w-5 shrink-0 border-l border-black/30"
            style={{ background: getTubeColor(strand.strand_no).hex }}
          />
        )}
      </button>
    );
  };

  const renderOdfPort = (port: FiberPort) => {
    const termination = portTerminationsByPort.get(port.id);
    const patches = portPatchesByPort.get(port.id) || [];
    const isSelected = selectedPatchPortId === port.id;
    const isDropReady = !!draggingOdfStrand && !termination;
    const statusLabel = termination
      ? patches.length > 0 ? 'Thông tuyến' : '1 hướng'
      : 'Trống';
    /* Exactly one text color wins: status color when terminated, else selection/base. */
    const textClass = termination
      ? (patches.length > 0 ? 'text-cad-accent' : 'text-cad-warn')
      : (isSelected ? 'text-cad-accent' : 'text-cad-text-muted');

    return (
      <button
        key={port.id}
        ref={element => setPortRef(port.id, element)}
        type="button"
        data-fiber-drop-port-id={!termination ? port.id : undefined}
        onClick={() => void handlePortClick(port)}
        disabled={saving}
        className={[
          'pointer-events-auto relative z-40 flex aspect-square w-11 shrink-0 items-center justify-center rounded border text-[10px] font-black transition',
          isSelected ? 'border-cad-accent/30 bg-cad-accent/10' : 'border-cad-border bg-cad-elevated',
          isDropReady ? 'border-cad-active/60 bg-cad-active/10' : '',
          textClass,
        ].join(' ')}
        aria-pressed={isSelected}
        aria-label={`Cổng ${port.port_label}: ${statusLabel}`}
        title={`${port.port_label} · ${statusLabel}`}
      >
        <span>{port.port_label}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-cad-overlay flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="z-cad-modal flex h-[min(600px,88vh)] w-[min(900px,94vw)] flex-col overflow-hidden rounded-lg border border-cad-border bg-cad-elevated font-sans shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-cad-border px-3 py-2">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-[13px] font-semibold text-cad-text-primary">{getFeatureName(enclosureId)}</h3>
            <div className="mt-0.5 text-[9px] text-cad-text-muted">Sơ đồ nối core quang</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor={equipmentKindSelectId} className="text-[9px] font-semibold text-cad-text-muted">Loại điểm nối</label>
            <select
              id={equipmentKindSelectId}
              value={activeEquipmentKind}
              onChange={event => void handleEquipmentKindChange(event.target.value as EquipmentKind)}
              disabled={saving}
              className="rounded border border-cad-border bg-cad-surface px-2 py-1 text-[10px] font-semibold text-cad-text-primary outline-none focus:border-cad-active/50"
            >
              <option value="splice_enclosure">Măng xông</option>
              <option value="odf">ODF</option>
            </select>
            <Button ref={closeButtonRef} variant="ghost" size="sm" icon={X} ariaLabel="Đóng" title="Đóng" onClick={onClose} />
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_1fr] gap-3 border-b border-cad-border px-3 py-2">
          <select
            aria-label="Chọn cáp IN"
            className="min-w-0 rounded border border-cad-border bg-cad-surface px-2 py-1 text-[11px] font-semibold text-cad-active outline-none focus:border-cad-active/50"
            value={leftEndpointId}
            onChange={event => {
              setRequestedLeftCableId(event.target.value);
              setSelectedLeftStrandId(null);
            }}
          >
            <option value="">Chọn cáp IN</option>
            {connectedCableEndpoints.map((endpoint, index) => (
              <option key={`in-${endpoint.id}-${index}`} value={endpoint.id}>
                IN: {endpoint.cableName} ({endpoint.fiberCount || '?'} FO)
              </option>
            ))}
          </select>

          <select
            aria-label="Chọn cáp OUT"
            className="min-w-0 rounded border border-cad-border bg-cad-surface px-2 py-1 text-[11px] font-semibold text-cad-text-primary outline-none focus:border-cad-active/50"
            value={rightEndpointId}
            onChange={event => {
              setRequestedRightCableId(event.target.value);
              setSelectedRightStrandId(null);
            }}
          >
            <option value="">Chọn cáp OUT</option>
            {connectedCableEndpoints.map((endpoint, index) => (
              <option key={`out-${endpoint.id}-${index}`} value={endpoint.id} disabled={endpoint.id === leftEndpointId}>
                OUT: {endpoint.cableName} ({endpoint.fiberCount || '?'} FO)
              </option>
            ))}
          </select>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_1fr_auto_auto_auto] items-end gap-2 border-b border-cad-border px-3 py-2 text-[10px]">
          <div className="min-w-0 rounded border border-cad-active/15 bg-cad-active/5 px-2 py-1 text-cad-text-primary">
            IN core: {selectedLeftStrand ? `#${selectedLeftStrand.strand_no}` : 'Chưa chọn'}
          </div>
          <div className="min-w-0 rounded border border-cad-border bg-cad-surface px-2 py-1 text-cad-text-primary">
            OUT core: {selectedRightStrand ? `#${selectedRightStrand.strand_no}` : 'Chưa chọn'}
          </div>
          <label className="flex items-center gap-1 text-cad-text-muted">
            Loss
            <input
              type="number"
              min={0}
              step={0.01}
              value={lossDb}
              onChange={event => setLossDb(Number(event.target.value) || 0)}
              className="w-16 rounded border border-cad-border bg-cad-surface px-2 py-1 text-cad-text-primary outline-none"
            />
          </label>
          <Button
            variant="accent"
            size="sm"
            icon={Link2}
            onClick={() => void handleConnectSelectedStrands()}
            disabled={saving || activeEquipmentKind === 'odf' || !selectedLeftStrandId || !selectedRightStrandId}
          >
            Nối core
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Link2}
            onClick={() => void handleConnectAllStrands()}
            disabled={saving || activeEquipmentKind === 'odf'}
            title="Nối tự động các core có cùng số thứ tự giữa 2 cáp"
          >
            Nối full
          </Button>
        </div>

        {activeEquipmentKind === 'odf' && (
          <div className="grid shrink-0 grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-cad-border px-3 py-2 text-[10px]">
            <div className="min-w-0 text-cad-text-muted">
              ODF: kéo core vào port, sau đó chọn 2 port để patch thông tuyến.
            </div>
            <label className="flex items-center gap-1 text-cad-text-muted">
              Số cổng quang
              <input
                aria-label="Số cổng quang"
                type="number"
                min={1}
                max={576}
                value={odfPortCount || ''}
                onChange={event => setOdfPortCount(Math.max(0, Number(event.target.value) || 0))}
                className="w-20 rounded border border-cad-border bg-cad-surface px-2 py-1 text-cad-text-primary outline-none"
              />
            </label>
            <Button
              variant="accent"
              size="sm"
              ariaLabel="Cập nhật port"
              onClick={() => void handleEnsureOdfPorts()}
              disabled={saving || odfPortCount < 1}
            >
              Cập nhật port
            </Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 p-3">
          {connectedCableEndpoints.length < 2 ? (
            <div className="flex flex-1 items-center justify-center rounded border border-cad-border bg-cad-surface text-xs text-cad-text-muted">
              Điểm này chưa có đủ cáp đi qua để tạo splice IN/OUT.
            </div>
          ) : (
            <div ref={diagramRef} className="relative flex min-h-0 flex-1 overflow-auto rounded border border-cad-border bg-cad-surface">
                <svg
                  className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible"
                  data-testid="fiber-splice-overlay"
                  role="img"
                  aria-label={diagramSummary}
                >
                {tubeSplicePaths.map(item => (
                  <g
                    key={item.id}
                    className="pointer-events-auto cursor-pointer"
                    onClick={() => void handleRemoveSpliceGroup(item.group.splices.map(spliceItem => spliceItem.splice.id))}
                  >
                    <path
                      d={item.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                      className="pointer-events-auto"
                    />
                    <path
                      d={item.path}
                      fill="none"
                      stroke={item.group.color}
                      strokeLinecap="round"
                      strokeWidth={7}
                      className="drop-shadow-[0_0_9px_rgba(34,211,238,0.38)]"
                      data-testid="fiber-splice-tube-path"
                    />
                    <text
                      x={item.labelX}
                      y={item.labelY - 8}
                      textAnchor="middle"
                      className="select-none fill-cad-text-primary text-[10px] font-black"
                      paintOrder="stroke"
                      stroke={DIAGRAM_COLORS.canvas}
                      strokeWidth={4}
                      data-testid="fiber-splice-tube-label"
                    >
                      {item.group.startCore}-{item.group.endCore}
                    </text>
                  </g>
                ))}
                {splicePaths.map(({ splice, leftStrand, path }) => (
                  <g key={splice.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={10}
                      className="pointer-events-auto cursor-pointer"
                      onClick={() => void handleRemoveSplice(splice.id)}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={getStrandColor(leftStrand.strand_no).hex}
                      strokeLinecap="round"
                      strokeWidth={2.5}
                      className="drop-shadow-[0_0_6px_rgba(34,211,238,0.35)]"
                      data-testid="fiber-splice-path"
                    />
                  </g>
                ))}
                {previewPath && (
                  <path
                    d={previewPath}
                    fill="none"
                    stroke={DIAGRAM_COLORS.activeTrace}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                    strokeWidth={2}
                    className="opacity-90 drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]"
                    data-testid="fiber-splice-preview-path"
                  />
                )}
                  {odfPaths.map(item => (
                    <g key={item.id} className="pointer-events-auto cursor-pointer" onClick={() => void handleRemoveOdfPath(item)}>
                      <path
                        d={item.path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={12}
                        className="pointer-events-auto"
                      />
                      <path
                        d={item.path}
                        fill="none"
                        stroke={item.color}
                        strokeDasharray={item.dashed ? '5 5' : undefined}
                        strokeLinecap="round"
                        strokeWidth={2}
                        className="drop-shadow-[0_0_6px_rgba(34,211,238,0.35)]"
                        data-testid="fiber-odf-path"
                      />
                    </g>
                  ))}
                {odfPreviewPath && (
                  <path
                    d={odfPreviewPath}
                    fill="none"
                    stroke={DIAGRAM_COLORS.warnTrace}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                    strokeWidth={2}
                    className="opacity-90 drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]"
                    data-testid="fiber-odf-preview-path"
                  />
                )}
              </svg>

                {activeEquipmentKind === 'odf' && (
                    <div className="pointer-events-none absolute left-3 right-3 top-3">
                      <div
                        className="absolute inset-0 z-20 rounded border border-cad-border opacity-80 shadow-lg"
                        style={{ backgroundColor: DIAGRAM_COLORS.canvas }}
                      />
                      <div className="relative z-40 px-3 py-2">
                        <div className="mb-2 text-center text-[10px] font-bold uppercase text-cad-accent">ODF ports</div>
                    {odfPorts.length === 0 ? (
                      <div className="rounded border border-cad-border bg-cad-elevated p-2 text-center text-[10px] text-cad-text-muted">
                        Nhập số cổng và bấm Cập nhật port.
                      </div>
                    ) : (
                        <div className="flex flex-wrap justify-center gap-2">{odfPorts.map(renderOdfPort)}</div>
                      )}
                      </div>
                    </div>
                )}

                  <div className={['relative z-40 w-[34%] min-w-[210px] p-3', activeEquipmentKind === 'odf' ? 'pt-28' : ''].join(' ')}>
                <div className="mb-2 text-[10px] font-bold uppercase text-cad-active">IN cores</div>
                <div className="flex flex-col gap-1">{leftStrands.map(strand => renderStrand(strand, 'left'))}</div>
              </div>

                <div className="relative z-20 w-[32%] min-w-[200px] p-3" />

                  <div className={['relative z-40 w-[34%] min-w-[210px] p-3', activeEquipmentKind === 'odf' ? 'pt-28' : ''].join(' ')}>
                <div className="mb-2 text-right text-[10px] font-bold uppercase text-cad-text-primary">OUT cores</div>
                <div className="flex flex-col gap-1">{rightStrands.map(strand => renderStrand(strand, 'right'))}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-cad-border px-3 py-2 text-[11px] text-cad-text-muted">
          <div className="min-w-0 truncate" role="status" aria-live="polite">
            {statusMessage || 'Kéo core bên IN sang core bên OUT để nối nhanh, hoặc chọn hai core rồi bấm Nối core. Click đường nối để xóa.'}
          </div>
          {saving && (
            <div className="flex shrink-0 items-center gap-2 text-cad-active">
              <Loader2 size={13} className="animate-spin" />
              Đang lưu
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

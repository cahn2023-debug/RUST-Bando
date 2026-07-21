import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

const TIA_598_COLORS = [
  { name: 'Blue', hex: '#2563eb', textClass: 'text-white' },
  { name: 'Orange', hex: '#f97316', textClass: 'text-white' },
  { name: 'Green', hex: '#16a34a', textClass: 'text-white' },
  { name: 'Brown', hex: '#8b5a2b', textClass: 'text-white' },
  { name: 'Slate', hex: '#64748b', textClass: 'text-white' },
  { name: 'White', hex: '#ffffff', textClass: 'text-zinc-950' },
  { name: 'Red', hex: '#dc2626', textClass: 'text-white' },
  { name: 'Black', hex: '#111827', textClass: 'text-white' },
  { name: 'Yellow', hex: '#facc15', textClass: 'text-zinc-950' },
  { name: 'Violet', hex: '#7c3aed', textClass: 'text-white' },
  { name: 'Rose', hex: '#ec4899', textClass: 'text-white' },
  { name: 'Aqua', hex: '#06b6d4', textClass: 'text-zinc-950' },
];

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
  splice_enclosure: 'MÄƒng xÃ´ng',
  odf: 'ODF',
};

const getStrandColor = (strandNo: number) => TIA_598_COLORS[(strandNo - 1) % TIA_598_COLORS.length];
const getTubeColor = (strandNo: number) => TIA_598_COLORS[Math.floor((strandNo - 1) / 12) % TIA_598_COLORS.length];

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

  const storeInventory = state?.inventory as FiberInventory | null | undefined;
  const inventory: FiberInventory | null = localInventory ?? storeInventory ?? null;
  const getFeatureName = (featureId: string) => state?.features?.[featureId]?.name || featureId;

  const refreshInventory = useCallback(async () => {
    if (!projectId) return;
    try {
      setLocalInventory(await getFiberInventory(projectId));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u fiber.');
    }
  }, [projectId]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => void refreshInventory(), 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refreshInventory]);

  const currentEquipment = useMemo(
    () => (inventory?.equipment || []).find(item => item.feature_id === enclosureId) || null,
    [enclosureId, inventory?.equipment]
  );
  const activeEquipmentKind = currentEquipment?.equipment_type === 'odf' || currentEquipment?.equipment_type === 'splice_enclosure'
    ? currentEquipment.equipment_type
    : equipmentKind;

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
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Äi)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        } else if (point.point_kind === 'cable_end') {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Äáº¿n)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
        } else if (point.point_kind === 'splice_enclosure') {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Vá» trÆ°á»›c)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Vá» sau)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        }
      });

    evaluation?.edges?.forEach((edge: any) => {
      if (edge.sourceType !== 'map-polyline' || edge.kind !== 'signal') return;
      if (edge.from !== enclosureId && edge.to !== enclosureId) return;
      if (!edge.feature?.id) return;

      const cable = inventory?.cables.find(item => item.feature_id === edge.feature.id);
      if (cable) {
        if (edge.from === enclosureId) {
          pushEndpoint({ id: `${cable.id}-end`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Äi)`, direction: 'end', fiberCount: cable.fiber_count || 0 });
        } else {
          pushEndpoint({ id: `${cable.id}-start`, cableId: cable.id, cableName: `${getFeatureName(cable.feature_id)} (Äáº¿n)`, direction: 'start', fiberCount: cable.fiber_count || 0 });
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
        if (!leftStrand || !rightStrandId) return null;

        return {
          splice,
          leftStrand,
          leftStrandId,
          rightStrandId,
        };
      })
      .filter((item): item is { splice: FiberSplice; leftStrand: FiberStrand; leftStrandId: string; rightStrandId: string } => !!item);
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
    setSplicePaths(visibleSplices.flatMap(item => {
      const from = getStrandAnchor('left', item.leftStrandId);
      const to = getStrandAnchor('right', item.rightStrandId);
      if (!from || !to) return [];
      return [{
        ...item,
        path: buildSplicePath(from, to),
      }];
    }));
  }, [buildSplicePath, getStrandAnchor, visibleSplices]);

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
        color: '#22c55e',
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

  const runWrite = async (successMessage: string, action: () => Promise<unknown>) => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res: any = await action();
      if (res && res.success === false) {
        throw new Error(res.error || 'Server rejected the transaction');
      }
      setStatusMessage(successMessage);
      await refreshInventory();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Thao tÃ¡c tháº¥t báº¡i.');
    } finally {
      setSaving(false);
    }
  };

  const handleEquipmentKindChange = async (value: EquipmentKind) => {
    setEquipmentKind(value);
    if (!projectId) return;
    await runWrite(`ÄÃ£ cáº­p nháº­t loáº¡i Ä‘iá»ƒm ná»‘i: ${equipmentLabels[value]}.`, () =>
      upsertEquipment({
        id: currentEquipment?.id || enclosureId,
        projectId,
        featureId: enclosureId,
        equipmentType: value,
        status: currentEquipment?.status || 'active',
      })
    );
  };

  const handleEnsureOdfPorts = async () => {
    if (!projectId || odfPortCount < 1) return;
    await runWrite(`ÄÃ£ cáº­p nháº­t ${odfPortCount} cá»•ng ODF.`, async () => {
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
      setStatusMessage('KhÃ´ng thá»ƒ ná»‘i má»™t core vá»›i chÃ­nh nÃ³ trÃªn cÃ¹ng má»™t hÆ°á»›ng.');
      return;
    }
    if (occupiedStrands.has(`${leftStrandId}-${leftEndpoint.direction}`)) return;
    if (occupiedStrands.has(`${rightStrandId}-${rightEndpoint.direction}`)) return;

    await runWrite('ÄÃ£ ná»‘i core quang.', () =>
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
      setStatusMessage(`KhÃ´ng cÃ³ cáº·p trá»‘ng (Lá»—i: Thiáº¿u pháº£i=${noRightStrand}, TrÃ¹ng=${sameStrand}, Báº­n trÃ¡i=${leftOccupied}, Báº­n pháº£i=${rightOccupied})`);
      return;
    }

    await runWrite(`Ná»‘i ${splicesToCreate.length} cáº·p. (Bá» qua: Thiáº¿u pháº£i=${noRightStrand}, TrÃ¹ng=${sameStrand}, Báº­n trÃ¡i=${leftOccupied}, Báº­n pháº£i=${rightOccupied})`, () =>
      upsertFiberSplices(projectId, splicesToCreate)
    );
    
    setSelectedLeftStrandId(null);
    setSelectedRightStrandId(null);
  };

  const handleConnectPortTermination = async (side: StrandSide, strandId: string, portId: string) => {
    const endpoint = side === 'left' ? leftEndpoint : rightEndpoint;
    if (!projectId || !endpoint || !strandId || !portId) return;
    if (portTerminationsByPort.has(portId)) {
      setStatusMessage('Port ODF nÃ y Ä‘Ã£ cÃ³ core káº¿t ná»‘i.');
      return;
    }
    const existingTermination = odfTerminationByStrandDirection.get(`${strandId}-${endpoint.direction}`);

    await runWrite('ÄÃ£ Ä‘áº¥u core vÃ o cá»•ng ODF. 1 hÆ°á»›ng cÃ³ tÃ­n hiá»‡u.', async () => {
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
      setStatusMessage('Hai cá»•ng ODF nÃ y Ä‘Ã£ thÃ´ng tuyáº¿n.');
      setSelectedPatchPortId(null);
      return;
    }
    await runWrite('ÄÃ£ patch hai cá»•ng ODF. ThÃ´ng tuyáº¿n 2 phÃ­a khi cáº£ hai cá»•ng cÃ³ core.', () =>
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
    await runWrite('ÄÃ£ xÃ³a má»‘i ná»‘i.', () => deleteFiberSplice(projectId, spliceId));
  };

  const handleRemoveOdfPath = async (path: OdfPath) => {
    if (!projectId) return;
    if (path.kind === 'termination') {
      await runWrite('ÄÃ£ xÃ³a káº¿t ná»‘i core vÃ o port ODF.', () => deleteFiberPortTermination(projectId, path.sourceId));
      return;
    }
    await runWrite('ÄÃ£ xÃ³a patch giá»¯a hai port ODF.', () => deleteFiberPortPatch(projectId, path.sourceId));
  };

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
        className={[
          'flex h-5 w-full items-center overflow-hidden rounded border border-white/10 bg-black/25 text-[9px] font-bold transition',
          side === 'left' ? 'justify-end' : 'justify-start',
          isSelected ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-black' : '',
          side === 'right' && draggingLeftStrandId && canSelect ? 'border-cyan-400/60 bg-cyan-500/10' : '',
          isOccupied && !isOdfMode ? 'opacity-50' : '',
          canDrag ? 'cursor-grab hover:border-cyan-400/50 active:cursor-grabbing' : (canSelect ? 'cursor-pointer hover:border-cyan-400/50' : 'cursor-default'),
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
      ? patches.length > 0 ? 'ThÃ´ng tuyáº¿n' : '1 hÆ°á»›ng'
      : 'Trá»‘ng';

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
          isSelected ? 'border-emerald-300 bg-emerald-500/20 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.2)]' : 'border-white/10 bg-black/35 text-zinc-200',
          isDropReady ? 'border-cyan-400/60 bg-cyan-500/10' : '',
          termination ? (patches.length > 0 ? 'text-emerald-200' : 'text-amber-200') : 'text-zinc-500',
        ].join(' ')}
        title={`${port.port_label} Â· ${statusLabel}`}
      >
        <span>{port.port_label}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
      <div className="flex h-[min(600px,88vh)] w-[min(900px,94vw)] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0f141a] font-sans shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-zinc-100">{getFeatureName(enclosureId)}</h3>
            <div className="mt-0.5 text-[9px] text-zinc-500">SÆ¡ Ä‘á»“ ná»‘i core quang</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="text-[9px] font-semibold text-zinc-500">Loáº¡i Ä‘iá»ƒm ná»‘i</label>
            <select
              value={activeEquipmentKind}
              onChange={event => void handleEquipmentKindChange(event.target.value as EquipmentKind)}
              disabled={saving}
              className="rounded border border-white/10 bg-black/45 px-2 py-1 text-[10px] font-semibold text-zinc-100 outline-none focus:border-cyan-400/50"
            >
              <option value="splice_enclosure">MÄƒng xÃ´ng</option>
              <option value="odf">ODF</option>
            </select>
            <button onClick={onClose} className="rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white" title="ÄÃ³ng">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_1fr] gap-3 border-b border-white/5 px-3 py-2">
          <select
            className="min-w-0 rounded border border-white/10 bg-black/45 px-2 py-1 text-[11px] font-semibold text-cyan-300 outline-none focus:border-cyan-400/50"
            value={leftEndpointId}
            onChange={event => {
              setRequestedLeftCableId(event.target.value);
              setSelectedLeftStrandId(null);
            }}
          >
            <option value="">Chá»n cÃ¡p IN</option>
            {connectedCableEndpoints.map((endpoint, index) => (
              <option key={`in-${endpoint.id}-${index}`} value={endpoint.id}>
                IN: {endpoint.cableName} ({endpoint.fiberCount || '?'} FO)
              </option>
            ))}
          </select>

          <select
            className="min-w-0 rounded border border-white/10 bg-black/45 px-2 py-1 text-[11px] font-semibold text-pink-300 outline-none focus:border-pink-400/50"
            value={rightEndpointId}
            onChange={event => {
              setRequestedRightCableId(event.target.value);
              setSelectedRightStrandId(null);
            }}
          >
            <option value="">Chá»n cÃ¡p OUT</option>
            {connectedCableEndpoints.map((endpoint, index) => (
              <option key={`out-${endpoint.id}-${index}`} value={endpoint.id} disabled={endpoint.id === leftEndpointId}>
                OUT: {endpoint.cableName} ({endpoint.fiberCount || '?'} FO)
              </option>
            ))}
          </select>
        </div>

        <div className="grid shrink-0 grid-cols-[1fr_1fr_auto_auto_auto] items-end gap-2 border-b border-white/5 px-3 py-2 text-[10px]">
          <div className="min-w-0 rounded border border-cyan-500/15 bg-cyan-500/5 px-2 py-1 text-cyan-100">
            IN core: {selectedLeftStrand ? `#${selectedLeftStrand.strand_no}` : 'ChÆ°a chá»n'}
          </div>
          <div className="min-w-0 rounded border border-pink-500/15 bg-pink-500/5 px-2 py-1 text-pink-100">
            OUT core: {selectedRightStrand ? `#${selectedRightStrand.strand_no}` : 'ChÆ°a chá»n'}
          </div>
          <label className="flex items-center gap-1 text-zinc-400">
            Loss
            <input
              type="number"
              min={0}
              step={0.01}
              value={lossDb}
              onChange={event => setLossDb(Number(event.target.value) || 0)}
              className="w-16 rounded border border-white/10 bg-black/45 px-2 py-1 text-zinc-100 outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleConnectSelectedStrands()}
            disabled={saving || activeEquipmentKind === 'odf' || !selectedLeftStrandId || !selectedRightStrandId}
            className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Link2 size={12} />
            Ná»‘i core
          </button>
          <button
            type="button"
            onClick={() => void handleConnectAllStrands()}
            disabled={saving || activeEquipmentKind === 'odf'}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
            title="Ná»‘i tá»± Ä‘á»™ng cÃ¡c core cÃ³ cÃ¹ng sá»‘ thá»© tá»± giá»¯a 2 cÃ¡p"
          >
            <Link2 size={12} />
            Ná»‘i full
          </button>
        </div>

        {activeEquipmentKind === 'odf' && (
          <div className="grid shrink-0 grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-white/5 px-3 py-2 text-[10px]">
            <div className="min-w-0 text-zinc-400">
              ODF: kÃ©o core vÃ o port, sau Ä‘Ã³ chá»n 2 port Ä‘á»ƒ patch thÃ´ng tuyáº¿n.
            </div>
            <label className="flex items-center gap-1 text-zinc-400">
              Sá»‘ cá»•ng quang
              <input
                aria-label="Số cổng quang"
                type="number"
                min={1}
                max={576}
                value={odfPortCount || ''}
                onChange={event => setOdfPortCount(Math.max(0, Number(event.target.value) || 0))}
                className="w-20 rounded border border-white/10 bg-black/45 px-2 py-1 text-zinc-100 outline-none"
              />
            </label>
            <button
              aria-label="Cập nhật port"
              type="button"
              onClick={() => void handleEnsureOdfPorts()}
              disabled={saving || odfPortCount < 1}
              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Cáº­p nháº­t port
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 p-3">
          {connectedCableEndpoints.length < 2 ? (
            <div className="flex flex-1 items-center justify-center rounded border border-white/5 bg-black/20 text-xs text-zinc-500">
              Äiá»ƒm nÃ y chÆ°a cÃ³ Ä‘á»§ cÃ¡p Ä‘i qua Ä‘á»ƒ táº¡o splice IN/OUT.
            </div>
          ) : (
            <div ref={diagramRef} className="relative flex min-h-0 flex-1 overflow-auto rounded border border-white/5 bg-black/20">
                <svg className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible" data-testid="fiber-splice-overlay">
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
                    stroke="#22d3ee"
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
                    stroke="#f59e0b"
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
                      <div className="absolute inset-0 z-20 rounded border border-white/5 bg-[#0f141a]/80 shadow-lg" />
                      <div className="relative z-40 px-3 py-2">
                        <div className="mb-2 text-center text-[10px] font-bold uppercase text-emerald-300">ODF ports</div>
                    {odfPorts.length === 0 ? (
                      <div className="rounded border border-white/5 bg-black/25 p-2 text-center text-[10px] text-zinc-500">
                        NhÃ¡ÂºÂ­p sÃ¡Â»â€˜ cÃ¡Â»â€¢ng vÃƒÂ  bÃ¡ÂºÂ¥m CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t port.
                      </div>
                    ) : (
                        <div className="flex flex-wrap justify-center gap-2">{odfPorts.map(renderOdfPort)}</div>
                      )}
                      </div>
                    </div>
                )}

                  <div className={['relative z-40 w-[34%] min-w-[210px] p-3', activeEquipmentKind === 'odf' ? 'pt-28' : ''].join(' ')}>
                <div className="mb-2 text-[10px] font-bold uppercase text-cyan-300">IN cores</div>
                <div className="flex flex-col gap-1">{leftStrands.map(strand => renderStrand(strand, 'left'))}</div>
              </div>

                <div className="relative z-20 w-[32%] min-w-[200px] p-3" />

                  <div className={['relative z-40 w-[34%] min-w-[210px] p-3', activeEquipmentKind === 'odf' ? 'pt-28' : ''].join(' ')}>
                <div className="mb-2 text-right text-[10px] font-bold uppercase text-pink-300">OUT cores</div>
                <div className="flex flex-col gap-1">{rightStrands.map(strand => renderStrand(strand, 'right'))}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-[11px] text-zinc-500">
          <div className="min-w-0 truncate">
            {statusMessage || 'KÃ©o core bÃªn IN sang core bÃªn OUT Ä‘á»ƒ ná»‘i nhanh, hoáº·c chá»n hai core rá»“i báº¥m Ná»‘i core. Click Ä‘Æ°á»ng ná»‘i Ä‘á»ƒ xÃ³a.'}
          </div>
          {saving && (
            <div className="flex shrink-0 items-center gap-2 text-cyan-300">
              <Loader2 size={13} className="animate-spin" />
              Äang lÆ°u
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

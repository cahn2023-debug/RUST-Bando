import type {
  FiberCable,
  FiberCircuit,
  FiberInventory,
  FiberPort,
  FiberSplice,
  FiberStrand,
} from '@CONTRACT/types';

export type FiberGraphNodeKind = 'cable' | 'strand' | 'port' | 'splice' | 'circuit';

export interface FiberGraphNode {
  id: string;
  label: string;
  kind: FiberGraphNodeKind;
  parentId?: string | null;
  status?: string | null;
}

export interface FiberGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'contains' | 'routes' | 'spliced';
  label?: string;
}

export interface FiberGraph {
  nodes: FiberGraphNode[];
  edges: FiberGraphEdge[];
}

const mapCableNode = (cable: FiberCable): FiberGraphNode => ({
  id: `cable:${cable.id}`,
  label: cable.cable_type || cable.id,
  kind: 'cable',
  status: cable.status,
});

const mapStrandNode = (strand: FiberStrand): FiberGraphNode => ({
  id: `strand:${strand.id}`,
  label: `S${strand.strand_no}`,
  kind: 'strand',
  parentId: `cable:${strand.cable_id}`,
  status: strand.status,
});

const mapPortNode = (port: FiberPort): FiberGraphNode => ({
  id: `port:${port.id}`,
  label: port.port_label,
  kind: 'port',
  status: port.status,
});

const mapSpliceNode = (splice: FiberSplice): FiberGraphNode => ({
  id: `splice:${splice.id}`,
  label: `Splice ${splice.id.slice(0, 6)}`,
  kind: 'splice',
});

const mapCircuitNode = (circuit: FiberCircuit): FiberGraphNode => ({
  id: `circuit:${circuit.id}`,
  label: circuit.name,
  kind: 'circuit',
  status: circuit.status,
});

export const buildFiberGraph = (inventory: FiberInventory): FiberGraph => {
  const nodes: FiberGraphNode[] = [];
  const edges: FiberGraphEdge[] = [];

  inventory.cables.forEach(cable => {
    nodes.push(mapCableNode(cable));
  });

  inventory.strands.forEach(strand => {
    nodes.push(mapStrandNode(strand));
    edges.push({
      id: `cable-strand:${strand.cable_id}:${strand.strand_no}`,
      source: `cable:${strand.cable_id}`,
      target: `strand:${strand.id}`,
      kind: 'contains',
      label: `#${strand.strand_no}`,
    });
  });

  inventory.ports.forEach(port => {
    nodes.push(mapPortNode(port));
  });

  inventory.splices.forEach(splice => {
    nodes.push(mapSpliceNode(splice));
    edges.push({
      id: `splice-from:${splice.id}`,
      source: `strand:${splice.from_strand_id}`,
      target: `splice:${splice.id}`,
      kind: 'spliced',
      label: 'from',
    });
    edges.push({
      id: `splice-to:${splice.id}`,
      source: `splice:${splice.id}`,
      target: `strand:${splice.to_strand_id}`,
      kind: 'spliced',
      label: 'to',
    });
  });

  inventory.circuits.forEach(circuit => {
    nodes.push(mapCircuitNode(circuit));
    edges.push({
      id: `circuit-a:${circuit.id}`,
      source: `circuit:${circuit.id}`,
      target: `feature:${circuit.a_feature_id}`,
      kind: 'routes',
      label: 'A',
    });
    edges.push({
      id: `circuit-z:${circuit.id}`,
      source: `circuit:${circuit.id}`,
      target: `feature:${circuit.z_feature_id}`,
      kind: 'routes',
      label: 'Z',
    });
  });

  return { nodes, edges };
};

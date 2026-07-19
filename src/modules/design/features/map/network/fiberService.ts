import { invoke } from '@tauri-apps/api/core';
import { invoke_design_event_batch } from '@TOOL/utils/designIpc';
import type {
  DesignBulkActionResponse,
  FeatureState,
  FiberCableSource,
  FiberCableStatus,
  FiberCablePoint,
  FiberCapacitySummary,
  FiberCircuitServiceType,
  FiberCircuitStatus,
  FiberInventory,
  FiberPortDirection,
  FiberPortStatus,
  FiberStrandStatus,
  FiberTraceResult,
  FiberValidationDiagnostic,
} from '@CONTRACT/types';
import { buildFiberPolylineMaterializationEvents } from './fiberPolylineMaterializer';
import { validateFiberGeometry } from './fiberGeometryValidation';
export interface FiberInventoryFilter {
  cableId?: string | null;
  featureId?: string | null;
}

export interface FiberCableUpsertInput {
  id: string;
  projectId: string;
  featureId: string;
  cableType?: string | null;
  fiberCount?: number | null;
  owner?: string | null;
  status?: FiberCableStatus;
  source?: FiberCableSource;
}

export interface FiberStrandInitializationInput {
  projectId: string;
  cableId: string;
  fiberCount: number;
  strands?: Array<{
    id?: string;
    strandNo: number;
    color?: string | null;
    status?: FiberStrandStatus;
  }>;
}

export interface FiberPortUpsertInput {
  id: string;
  featureId: string;
  portLabel: string;
  portKind: string;
  direction?: FiberPortDirection;
  status?: FiberPortStatus;
}

export interface FiberSpliceUpsertInput {
  id: string;
  enclosureFeatureId: string;
  fromStrandId: string;
  toStrandId: string;
  lossDb?: number | null;
}

export interface FiberCircuitUpsertInput {
  id: string;
  projectId: string;
  name: string;
  serviceType?: FiberCircuitServiceType;
  status?: FiberCircuitStatus;
  aFeatureId: string;
  zFeatureId: string;
  hops?: Array<{
    sequenceNo: number;
    strandId?: string | null;
    portId?: string | null;
  }>;
}

export type FiberInventoryResponse = FiberInventory;

export interface FiberCapacityResponse {
  items: FiberCapacitySummary[];
}

export interface FiberCablePointsResponse {
  items: FiberCablePoint[];
}

export interface FiberNetworkValidationResponse {
  inventory: FiberInventoryResponse;
  diagnostics: FiberValidationDiagnostic[];
}

const toMaybeString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const buildBatchResponse = async (
  projectId: string,
  event: any
): Promise<DesignBulkActionResponse> => invoke_design_event_batch(projectId, [event]);

export const getFiberInventory = async (
  projectId: string,
  filter: FiberInventoryFilter = {}
): Promise<FiberInventoryResponse> => {
  return invoke<FiberInventoryResponse>('get_fiber_inventory', {
    projectId,
    project_id: projectId,
    cableId: toMaybeString(filter.cableId ?? null),
    cable_id: toMaybeString(filter.cableId ?? null),
    featureId: toMaybeString(filter.featureId ?? null),
    feature_id: toMaybeString(filter.featureId ?? null),
  });
};

export const getFiberCapacity = async (
  projectId: string,
  filter: FiberInventoryFilter = {}
): Promise<FiberCapacityResponse> => {
  return invoke<FiberCapacityResponse>('get_fiber_capacity', {
    projectId,
    project_id: projectId,
    cableId: toMaybeString(filter.cableId ?? null),
    cable_id: toMaybeString(filter.cableId ?? null),
    featureId: toMaybeString(filter.featureId ?? null),
    feature_id: toMaybeString(filter.featureId ?? null),
  });
};

export const getFiberCablePoints = async (
  projectId: string,
  cableId?: string | null
): Promise<FiberCablePointsResponse> => {
  return invoke<FiberCablePointsResponse>('get_fiber_cable_points', {
    projectId,
    project_id: projectId,
    cableId: toMaybeString(cableId ?? null),
    cable_id: toMaybeString(cableId ?? null),
  });
};

export const traceFiberCircuit = async (circuitId: string): Promise<FiberTraceResult> => {
  return invoke<FiberTraceResult>('trace_fiber_circuit', {
    circuitId,
    circuit_id: circuitId,
  });
};

export const validateFiberNetwork = async (
  projectId: string,
  filter: FiberInventoryFilter = {},
  featuresById?: Record<string, FeatureState>
): Promise<FiberNetworkValidationResponse> => {
  const result = await invoke<FiberNetworkValidationResponse>('validate_fiber_network', {
    projectId,
    project_id: projectId,
    cableId: toMaybeString(filter.cableId ?? null),
    cable_id: toMaybeString(filter.cableId ?? null),
    featureId: toMaybeString(filter.featureId ?? null),
    feature_id: toMaybeString(filter.featureId ?? null),
  });

  if (featuresById) {
    const geometryDiagnostics = validateFiberGeometry(projectId, result.inventory, featuresById);
    result.diagnostics = [...result.diagnostics, ...geometryDiagnostics];
  }

  return result;
};

export const initializeCableStrands = async (input: FiberStrandInitializationInput) => {
  return buildBatchResponse(input.projectId, {
    type: 'FiberStrandsInitialized',
    payload: {
      cable_id: input.cableId,
      fiber_count: input.fiberCount,
      strands: input.strands?.map(strand => ({
        id: strand.id,
        strand_no: strand.strandNo,
        color: strand.color ?? null,
        status: strand.status ?? 'available',
      })),
    },
  });
};

export const upsertFiberCable = async (input: FiberCableUpsertInput) =>
  buildBatchResponse(input.projectId, {
    type: 'FiberCableUpserted',
    payload: {
      id: input.id,
      project_id: input.projectId,
      feature_id: input.featureId,
      cable_type: input.cableType ?? null,
      fiber_count: input.fiberCount ?? null,
      owner: input.owner ?? null,
      status: input.status ?? 'planned',
      source: input.source ?? 'manual',
    },
  });

export const upsertFiberPort = async (projectId: string, input: FiberPortUpsertInput) =>
  buildBatchResponse(projectId, {
    type: 'FiberPortUpserted',
    payload: {
      id: input.id,
      feature_id: input.featureId,
      port_label: input.portLabel,
      port_kind: input.portKind,
      direction: input.direction ?? 'bidirectional',
      status: input.status ?? 'available',
    },
  });

export const upsertFiberSplice = async (projectId: string, input: FiberSpliceUpsertInput) =>
  buildBatchResponse(projectId, {
    type: 'FiberSpliceUpserted',
    payload: {
      id: input.id,
      enclosure_feature_id: input.enclosureFeatureId,
      from_strand_id: input.fromStrandId,
      to_strand_id: input.toStrandId,
      loss_db: input.lossDb ?? null,
    },
  });

export const deleteFiberSplice = async (projectId: string, spliceId: string) =>
  buildBatchResponse(projectId, {
    type: 'FiberSpliceDeleted',
    payload: { id: spliceId },
  });

export const upsertFiberCircuit = async (input: FiberCircuitUpsertInput) => {
  const batch: any[] = [
    {
      type: 'FiberCircuitUpserted',
      payload: {
        id: input.id,
        project_id: input.projectId,
        name: input.name,
        service_type: input.serviceType ?? 'data',
        status: input.status ?? 'planned',
        a_feature_id: input.aFeatureId,
        z_feature_id: input.zFeatureId,
      },
    },
  ];

  if (input.hops) {
    batch.push({
      type: 'FiberCircuitHopsReplaced',
      payload: {
        circuit_id: input.id,
        hops: input.hops.map(hop => ({
          sequence_no: hop.sequenceNo,
          strand_id: hop.strandId ?? null,
          port_id: hop.portId ?? null,
        })),
      },
    });
  }

  return invoke_design_event_batch(input.projectId, batch);
};

export const deleteFiberCircuit = async (projectId: string, circuitId: string) =>
  buildBatchResponse(projectId, {
    type: 'FiberCircuitDeleted',
    payload: { id: circuitId },
  });

export const materializeFiberFromPolylines = async (
  projectId: string,
  featuresById: Record<string, FeatureState>,
  inventory: FiberInventory | null = null
) => {
  const materialization = buildFiberPolylineMaterializationEvents(projectId, featuresById, inventory);
  if (materialization.events.length === 0) {
    return {
      success: true,
      last_event_id: '',
      applied_events: [],
      side_effects: [],
    } satisfies DesignBulkActionResponse;
  }
  return invoke_design_event_batch(projectId, materialization.events);
};

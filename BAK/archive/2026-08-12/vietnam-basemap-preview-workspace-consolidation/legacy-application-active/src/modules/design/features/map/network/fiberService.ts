import { fiberApi } from '@/contracts/tauri-api';
import type {
  FiberCablePointsResponse,
  FiberCapacityResponse,
  FiberNetworkValidationResponse,
} from '@/contracts/tauri-api';
import { invoke_design_event_batch } from '@SHARED/utils/designIpc';
import type {
  DesignBulkActionResponse,
  FeatureState,
  FiberCableSource,
  FiberCableStatus,
  FiberCircuitServiceType,
  FiberCircuitStatus,
  FiberInventory,
  FiberPortDirection,
  FiberPortTerminationSide,
  FiberPortStatus,
  FiberStrandStatus,
  FiberTraceResult,
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

export interface FiberPortTerminationUpsertInput {
  id: string;
  portId: string;
  strandId: string;
  strandDirection: 'start' | 'end';
  side: FiberPortTerminationSide;
  status?: string;
}

export interface FiberPortPatchUpsertInput {
  id: string;
  fromPortId: string;
  toPortId: string;
  status?: string;
  lossDb?: number | null;
}

export interface FiberSpliceUpsertInput {
  id: string;
  enclosureFeatureId: string;
  fromStrandId: string;
  toStrandId: string;
  fromDirection: 'start' | 'end';
  toDirection: 'start' | 'end';
  lossDb?: number | null;
}

export interface EquipmentUpsertInput {
  id: string;
  projectId: string;
  featureId: string;
  equipmentType: string;
  status?: string;
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

export type { FiberCapacityResponse, FiberCablePointsResponse, FiberNetworkValidationResponse } from '@/contracts/tauri-api';

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
  return fiberApi.getInventory({
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
  return fiberApi.getCapacity({
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
  return fiberApi.getCablePoints({
    projectId,
    project_id: projectId,
    cableId: toMaybeString(cableId ?? null),
    cable_id: toMaybeString(cableId ?? null),
  });
};

export const traceFiberCircuit = async (circuitId: string): Promise<FiberTraceResult> => {
  return fiberApi.traceCircuit(circuitId);
};

export const validateFiberNetwork = async (
  projectId: string,
  filter: FiberInventoryFilter = {},
  featuresById?: Record<string, FeatureState>
): Promise<FiberNetworkValidationResponse> => {
  const result = await fiberApi.validateNetwork({
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

export const upsertFiberPortTermination = async (projectId: string, input: FiberPortTerminationUpsertInput) =>
  buildBatchResponse(projectId, {
    type: 'FiberPortTerminationUpserted',
    payload: {
      id: input.id,
      port_id: input.portId,
      strand_id: input.strandId,
      strand_direction: input.strandDirection,
      side: input.side,
      status: input.status ?? 'active',
    },
  });

export const deleteFiberPortTermination = async (projectId: string, terminationId: string) =>
  buildBatchResponse(projectId, {
    type: 'FiberPortTerminationDeleted',
    payload: { id: terminationId },
  });

export const upsertFiberPortPatch = async (projectId: string, input: FiberPortPatchUpsertInput) =>
  buildBatchResponse(projectId, {
    type: 'FiberPortPatchUpserted',
    payload: {
      id: input.id,
      from_port_id: input.fromPortId,
      to_port_id: input.toPortId,
      status: input.status ?? 'active',
      loss_db: input.lossDb ?? null,
    },
  });

export const deleteFiberPortPatch = async (projectId: string, patchId: string) =>
  buildBatchResponse(projectId, {
    type: 'FiberPortPatchDeleted',
    payload: { id: patchId },
  });

export const upsertFiberSplice = async (projectId: string, input: FiberSpliceUpsertInput) =>
  buildBatchResponse(projectId, {
    type: 'FiberSpliceUpserted',
    payload: {
      id: input.id,
      enclosure_feature_id: input.enclosureFeatureId,
      from_strand_id: input.fromStrandId,
      to_strand_id: input.toStrandId,
      from_direction: input.fromDirection,
      to_direction: input.toDirection,
      loss_db: input.lossDb ?? null,
    },
  });

export const upsertFiberSplices = async (projectId: string, inputs: FiberSpliceUpsertInput[]) =>
  invoke_design_event_batch(
    projectId,
    inputs.map(input => ({
      type: 'FiberSpliceUpserted',
      payload: {
        id: input.id,
        enclosure_feature_id: input.enclosureFeatureId,
        from_strand_id: input.fromStrandId,
        to_strand_id: input.toStrandId,
        from_direction: input.fromDirection,
        to_direction: input.toDirection,
        loss_db: input.lossDb ?? null,
      },
    }))
  );

export const deleteFiberSplice = async (projectId: string, spliceId: string) =>
  buildBatchResponse(projectId, {
    type: 'FiberSpliceDeleted',
    payload: { id: spliceId },
  });

export const upsertEquipment = async (input: EquipmentUpsertInput) =>
  buildBatchResponse(input.projectId, {
    type: 'EquipmentUpserted',
    payload: {
      id: input.id,
      project_id: input.projectId,
      feature_id: input.featureId,
      equipment_type: input.equipmentType,
      status: input.status ?? 'active',
    },
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
  inventory: FiberInventory | null = null,
  options: import('./fiberPolylineMaterializer').FiberPolylineMaterializationOptions = {}
) => {
  const materialization = buildFiberPolylineMaterializationEvents(projectId, featuresById, inventory, options);
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

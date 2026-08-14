import { safeInvoke } from '@IMPLEMENT/lib/tauri';
import type {
  FiberCablePoint,
  FiberCapacitySummary,
  FiberInventory,
  FiberTraceResult,
  FiberValidationDiagnostic,
} from '@CONTRACT/types';

export interface FiberInventoryQuery {
  projectId: string;
  project_id: string;
  cableId?: string;
  cable_id?: string;
  featureId?: string;
  feature_id?: string;
}

export interface FiberCablePointsQuery {
  projectId: string;
  project_id: string;
  cableId?: string;
  cable_id?: string;
}

export interface FiberNetworkValidationResponse {
  inventory: FiberInventory;
  diagnostics: FiberValidationDiagnostic[];
}

export interface FiberCapacityResponse {
  items: FiberCapacitySummary[];
}

export interface FiberCablePointsResponse {
  items: FiberCablePoint[];
}

export const fiberApi = {
  getInventory: (query: FiberInventoryQuery) =>
    safeInvoke<FiberInventory>('get_fiber_inventory', query),

  getCapacity: (query: FiberInventoryQuery) =>
    safeInvoke<FiberCapacityResponse>('get_fiber_capacity', query),

  getCablePoints: (query: FiberCablePointsQuery) =>
    safeInvoke<FiberCablePointsResponse>('get_fiber_cable_points', query),

  traceCircuit: (circuitId: string) =>
    safeInvoke<FiberTraceResult>('trace_fiber_circuit', { circuitId, circuit_id: circuitId }),

  validateNetwork: (query: FiberInventoryQuery) =>
    safeInvoke<FiberNetworkValidationResponse>('validate_fiber_network', query),
};

// Design State Types

// Coordinate types
export type PointCoordinates = [number, number];
export type LineStringCoordinates = PointCoordinates[];
export type PolygonCoordinates = LineStringCoordinates[];
export type FeatureCoordinates =
  PointCoordinates | LineStringCoordinates | PolygonCoordinates | null;

// Properties type (flexible but typed)
export type FeaturePropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | string[]
  | number[];

export type FeatureProperties = Record<string, FeaturePropertyValue>;

export type IconType = 'default' | 'cctv' | 'ptz' | 'speed' | 'lpr' | 'intersection';

export type NetworkFeatureEndpointMetadata = {
  type: 'feature';
  id: string;
};

export type NetworkSharedPointEndpointMetadata = {
  type: 'shared-point';
  id: string;
  intersection_id: string;
  member_ids: string[];
  coordinate: PointCoordinates;
};

export type NetworkEndpointMetadata =
  | NetworkFeatureEndpointMetadata
  | NetworkSharedPointEndpointMetadata;

export interface VertexMetadata {
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  [key: string]: string | string[] | number | boolean | undefined;
}

export interface FeatureMetadata {
  description?: string;
  type?: string;
  icon?: IconType;
  color?: string;
  size?: number;
  label?: string;
  display_order?: string;
  media?: {
    imageUrl?: string;
    imageUrls?: string[];
    imageAssetIds?: string[];
    primaryImageAssetId?: string;
    externalUrls?: string[];
  };
  gis?: {
    vn2000_x?: number;
    vn2000_y?: number;
    lengthKm?: number;
    rotation?: number;
    fov_angle?: number;
    fov_radius?: number;
    fov_visible?: boolean;
  };
  is_visible?: boolean;
  business?: {
    contractor?: string;
    phoneNumber?: string;
    contract_id?: string;
  };
  vertexMetadata?: Record<number, VertexMetadata>;
  ai?: {
    model?: string;
    hash?: string;
    normalized_text?: string;
    embedding?: number[];
    updated_at?: string;
  };
  infrastructure?: {
    type?: string;
    // PowerLine
    voltage?: string;
    capacity?: string;
    owner?: string;
    status?: string;
    // SignalLine
    cable_type?: string;
    core_count?: number;
    bandwidth?: string;
    operator?: string;
    // Trench
    depth?: number;
    surface_type?: string;
  };
  network?: {
    role?: 'cabinet' | 'intersection' | 'device';
    telemetry_id?: string;
    from_feature_id?: string;
    to_feature_id?: string;
    from_endpoint?: NetworkEndpointMetadata;
    to_endpoint?: NetworkEndpointMetadata;
    is_origin?: boolean;
    direction_mode?: 'auto' | 'manual';
  };
  specs?: {
    install_height?: number;
    focal_length?: number;
    sensor_size?: string;
    resolution_x?: number;
    resolution_y?: number;
    target_distance?: number;
    target_height?: number;
  };
  [key: string]:
    | string
    | number
    | boolean
    | null
    | string[]
    | number[]
    | IconType
    | VertexMetadata
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | undefined;
}

export type FiberCableSource = 'manual' | 'legacy' | 'imported';
export type FiberCableStatus = 'planned' | 'active' | 'retired' | 'damaged';
export type FiberStrandStatus = 'available' | 'reserved' | 'active' | 'damaged';
export type FiberPortDirection = 'input' | 'output' | 'bidirectional';
export type FiberPortStatus = 'available' | 'reserved' | 'active' | 'damaged';
export type FiberCircuitServiceType = 'data' | 'voice' | 'video' | 'backhaul' | 'other';
export type FiberCircuitStatus = 'planned' | 'active' | 'suspended' | 'down' | 'retired';
export type FiberCablePointKind = 'cable_start' | 'cable_end' | 'splice_enclosure';

export interface FiberCable {
  id: string;
  project_id: string;
  feature_id: string;
  cable_type: string | null;
  fiber_count: number | null;
  owner: string | null;
  status: FiberCableStatus;
  source: FiberCableSource;
  created_at: string;
  updated_at: string;
}

export interface FiberStrand {
  id: string;
  cable_id: string;
  strand_no: number;
  color: string | null;
  status: FiberStrandStatus;
  created_at: string;
  updated_at: string;
}

export interface FiberCablePoint {
  id: string;
  project_id: string;
  cable_id: string;
  feature_id: string;
  point_kind: FiberCablePointKind;
  sequence_no: number;
  vertex_index: number | null;
  created_at: string;
  updated_at: string;
}

export interface FiberPort {
  id: string;
  feature_id: string;
  port_label: string;
  port_kind: string;
  direction: FiberPortDirection;
  status: FiberPortStatus;
  created_at: string;
  updated_at: string;
}

export interface FiberSplice {
  id: string;
  enclosure_feature_id: string;
  from_strand_id: string;
  to_strand_id: string;
  loss_db: number | null;
  created_at: string;
  updated_at: string;
}

export interface FiberCircuit {
  id: string;
  project_id: string;
  name: string;
  service_type: FiberCircuitServiceType;
  status: FiberCircuitStatus;
  a_feature_id: string;
  z_feature_id: string;
  created_at: string;
  updated_at: string;
}

export interface FiberCircuitHop {
  circuit_id: string;
  sequence_no: number;
  strand_id: string | null;
  port_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FiberCapacitySummary {
  cable_id: string;
  feature_id: string;
  cable_type: string | null;
  fiber_count: number | null;
  available_count: number;
  reserved_count: number;
  active_count: number;
  damaged_count: number;
  occupied_count: number;
  utilization: number;
}

export interface FiberValidationDiagnostic {
  type:
    | 'missing-strand'
    | 'missing-port'
    | 'duplicate-splice'
    | 'invalid-splice-loop'
    | 'strand-occupied'
    | 'missing-circuit-endpoint'
    | 'broken-hop'
    | 'damaged-strand'
    | 'endpoint-mismatch'
    | 'uninitialized-cable'
    | 'missing-polyline-endpoint'
    | 'missing-cable-point'
    | 'invalid-enclosure-location'
    | 'missing-branch-enclosure'
    | 'unmaterialized-cable-points'
    | 'direction-conflict'
    | 'multiple-origin';
  message: string;
  cable_id?: string | null;
  circuit_id?: string | null;
  feature_id?: string | null;
  strand_id?: string | null;
  port_id?: string | null;
  edge_id?: string | null;
}

export interface FiberTraceResult {
  circuit: FiberCircuit | null;
  hops: FiberCircuitHop[];
  strands: FiberStrand[];
  ports: FiberPort[];
  splices: FiberSplice[];
  diagnostics: FiberValidationDiagnostic[];
}

export interface FiberInventory {
  project_id: string;
  scope: {
    cable_id?: string | null;
    feature_id?: string | null;
  };
  cables: FiberCable[];
  strands: FiberStrand[];
  ports: FiberPort[];
  splices: FiberSplice[];
  circuits: FiberCircuit[];
  cable_points?: FiberCablePoint[];
  summary: {
    total_strands: number;
    available_strands: number;
    reserved_strands: number;
    active_strands: number;
    damaged_strands: number;
    free_strands: number;
  };
}

export interface VersionedFeatureMetadata {
  schema_version: number;
  core: FeatureMetadata;
  custom: Record<string, unknown>;
}

export type DesignEventType =
  | { type: 'RegionCreated'; payload: { id: string; parent_id: string | null; name: string } }
  | { type: 'RegionUpdated'; payload: { id: string; name: string; description: string | null } }
  | { type: 'RegionDeleted'; payload: { id: string } }
  | { type: 'RegionMoved'; payload: { id: string; new_parent_id: string | null } }
  | { type: 'LayerCreated'; payload: { id: string; region_id: string; name: string } }
  | { type: 'LayerUpdated'; payload: { id: string; name: string; is_visible: boolean } }
  | { type: 'LayerDeleted'; payload: { id: string } }
  | { type: 'LayerMoved'; payload: { id: string; new_region_id: string } }
  | {
      type: 'FeatureGroupCreated';
      payload: {
        id: string;
        layer_id: string;
        parent_id?: string | null;
        name: string;
        group_type: string;
      };
    }
  | {
      type: 'FeatureGroupUpdated';
      payload: {
        id: string;
        name?: string;
        is_visible?: boolean;
        metadata?: string;
        layer_id?: string;
        parent_id?: string | null;
      };
    }
  | { type: 'FeatureGroupDeleted'; payload: { id: string } }
  | {
      type: 'FeatureCreated';
      payload: {
        id: string;
        layer_id: string;
        group_id: string | null;
        name: string;
        geom_type: string;
        metadata: string;
        coordinates: FeatureCoordinates;
        properties: FeatureProperties;
      };
    }
  | {
      type: 'FeatureUpdated';
      payload: {
        id: string;
        name?: string;
        geom_type?: string;
        metadata?: string;
        coordinates?: FeatureCoordinates;
        properties?: FeatureProperties;
        layer_id?: string;
        group_id?: string | null;
      };
    }
  | { type: 'FeatureDeleted'; payload: { id: string } }
  | {
      type: 'FiberCableUpserted';
      payload: {
        id: string;
        project_id: string;
        feature_id: string;
        cable_type?: string | null;
        fiber_count?: number | null;
        owner?: string | null;
        status?: FiberCableStatus;
        source?: FiberCableSource;
      };
    }
  | {
      type: 'FiberStrandsInitialized';
      payload: {
        cable_id: string;
        fiber_count: number;
        strands?: Array<{
          id?: string;
          strand_no: number;
          color?: string | null;
          status?: FiberStrandStatus;
        }>;
      };
    }
  | {
      type: 'FiberCablePointsMaterialized';
      payload: {
        id: string;
        project_id: string;
        cable_id: string;
        points: Array<{
          id: string;
          feature_id: string;
          point_kind: FiberCablePointKind;
          sequence_no: number;
          vertex_index?: number | null;
        }>;
      };
    }
  | {
      type: 'FiberPortUpserted';
      payload: {
        id: string;
        feature_id: string;
        port_label: string;
        port_kind: string;
        direction?: FiberPortDirection;
        status?: FiberPortStatus;
      };
    }
  | {
      type: 'FiberSpliceUpserted';
      payload: {
        id: string;
        enclosure_feature_id: string;
        from_strand_id: string;
        to_strand_id: string;
        loss_db?: number | null;
      };
    }
  | { type: 'FiberSpliceDeleted'; payload: { id: string } }
  | {
      type: 'FiberCircuitUpserted';
      payload: {
        id: string;
        project_id: string;
        name: string;
        service_type?: FiberCircuitServiceType;
        status?: FiberCircuitStatus;
        a_feature_id: string;
        z_feature_id: string;
      };
    }
  | { type: 'FiberCircuitDeleted'; payload: { id: string } }
  | {
      type: 'FiberCircuitHopsReplaced';
      payload: {
        circuit_id: string;
        hops: Array<{
          sequence_no: number;
          strand_id?: string | null;
          port_id?: string | null;
        }>;
      };
    }
  | {
      type: 'update_metadata';
      payload:
        | { feature_id: string; metadata: FeatureMetadata | VersionedFeatureMetadata }
        | { featureId: string; metadata: FeatureMetadata | VersionedFeatureMetadata };
    }
  | {
      type: 'preview_update';
      payload:
        | { feature_id: string; metadata: FeatureMetadata | VersionedFeatureMetadata }
        | { featureId: string; metadata: FeatureMetadata | VersionedFeatureMetadata };
    }
  | { type: 'SettingsUpdated'; payload: { settings: Record<string, unknown> } };

export type DesignActionResponse = {
  success: boolean;
  event_id: string;
  applied_event: DesignEventType;
  side_effects: DesignEventType[];
};

export type DesignBulkActionResponse = {
  success: boolean;
  last_event_id: string;
  applied_events: DesignEventType[];
  side_effects: DesignEventType[];
};

export type SelectionSummary = {
  count: number;
  byType: Record<string, number>;
  items: SelectionItem[];
  bounds: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
};

export type SelectionItem = {
  id: string;
  name: string;
  geomType: string;
  displayType: string;
  lng: number;
  lat: number;
  note: string;
  groupId: string;
};

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

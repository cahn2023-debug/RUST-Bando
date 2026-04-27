// Design State Types

// Coordinate types
export type PointCoordinates = [number, number];
export type LineStringCoordinates = PointCoordinates[];
export type PolygonCoordinates = LineStringCoordinates[];
export type FeatureCoordinates = PointCoordinates | LineStringCoordinates | PolygonCoordinates | null;

// Properties type (flexible but typed)
export type FeatureProperties = Record<string, string | number | boolean | null>;

// Metadata type
export type FeatureMetadata = {
    icon?: string;
    color?: string;
    size?: number;
    [key: string]: string | number | boolean | undefined;
};

export type DesignEventType =
    | { type: 'RegionCreated', payload: { id: string, parent_id: string | null, name: string } }
    | { type: 'RegionUpdated', payload: { id: string, name: string, description: string | null } }
    | { type: 'RegionDeleted', payload: { id: string } }
    | { type: 'RegionMoved', payload: { id: string, new_parent_id: string | null } }
    | { type: 'LayerCreated', payload: { id: string, region_id: string, name: string } }
    | { type: 'LayerUpdated', payload: { id: string, name: string, is_visible: boolean } }
    | { type: 'LayerDeleted', payload: { id: string } }
    | { type: 'LayerMoved', payload: { id: string, new_region_id: string } }
    | { type: 'FeatureGroupCreated', payload: { id: string, layer_id: string, parent_id?: string | null, name: string, group_type: string } }
    | { type: 'FeatureGroupUpdated', payload: { id: string, name?: string, is_visible?: boolean, metadata?: string, layer_id?: string, parent_id?: string | null } }
    | { type: 'FeatureGroupDeleted', payload: { id: string } }
    | { type: 'FeatureCreated', payload: { id: string, layer_id: string, group_id: string | null, name: string, geom_type: string, metadata: string, coordinates: FeatureCoordinates, properties: FeatureProperties } }
    | { type: 'FeatureUpdated', payload: { id: string, name?: string, geom_type?: string, metadata?: string, coordinates?: FeatureCoordinates, properties?: FeatureProperties, layer_id?: string, group_id?: string | null } }
    | { type: 'FeatureDeleted', payload: { id: string } }
    | { type: 'update_metadata', payload: { featureId: string, metadata: FeatureMetadata } }
    | { type: 'preview_update', payload: { featureId: string, metadata: FeatureMetadata } }
    | { type: 'SettingsUpdated', payload: { settings: Record<string, unknown> } };

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

import type { FeatureCoordinates, FeatureProperties } from './designTypes';
export type { FeatureCoordinates, FeatureProperties };

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  contract_number: string | null;
  investor: string | null;
  contractor: string | null;
  signed_date: string | null;
  duration: string | null;
  end_date: string | null;
  status: 'active' | 'archived' | 'completed';
  created_at: string;
  updated_at: string;
  metadata_json?: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_completed: boolean;
  status: string;
  color: string | null;
  target_file_path?: string | null;
}

export interface Note {
  id: string;
  project_id: string;
  title: string;
  content: string | null;
  target_file_path: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  project_id: string;
  name: string;
  contract_number: string | null;
  vendor: string | null;
  value: number | null;
  signed_date: string | null;
  notes: string | null;
  file_path: string | null;
  has_analysis: boolean;
  created_at: string;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  extension: string | null;
  children: FileNode[] | null;
}

export interface TaskDependency {
  id: string;
  from_task_id: string;
  to_task_id: string;
}

export interface SearchResult {
  file_path: string;
  title: string;
  snippet: string;
}

export type IconType = 'default' | 'cctv' | 'ptz' | 'speed' | 'lpr' | 'intersection';

export type FeatureType = 'POINT' | 'POLYLINE' | 'IMAGE' | 'INTERSECTION';

export const FeatureTypes = {
  POINT: 'POINT' as FeatureType,
  POLYLINE: 'POLYLINE' as FeatureType,
  IMAGE: 'IMAGE' as FeatureType,
  INTERSECTION: 'INTERSECTION' as FeatureType,
};

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
  specs?: {
    install_height?: number;
    focal_length?: number;
    sensor_size?: string;
    resolution_x?: number;
    resolution_y?: number;
    target_distance?: number;
    target_height?: number;
  };
  [key: string]: string | number | boolean | string[] | number[] | IconType | VertexMetadata | Record<string, unknown> | undefined;
}

export interface Material {
  id: string;
  project_id: string;
  name: string;
  unit: string;
  unit_cost: number;
  category: string | null;
  specs: string | null;
  created_at: string;
}

export interface WorkItem {
  id: string;
  project_id: string;
  feature_id: string | null;
  name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
  created_at: string;
}

// --- Design State Types ---

export interface RegionState {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
}

export interface LayerState {
  id: string;
  region_id: string;
  name: string;
  is_visible: boolean;
}

export interface FeatureGroupState {
  id: string;
  layer_id: string;
  parent_id?: string | null;
  name: string;
  type: string;
  is_visible: boolean;
  metadata: string;
}

export interface FeatureState {
  id: string;
  layer_id: string;
  group_id: string | null;
  name: string;
  geom_type: string;
  metadata: string;
  properties: FeatureProperties;
  coordinates: FeatureCoordinates;
  bbox?: { min_x: number; max_x: number; min_y: number; max_y: number } | null;
  area?: number | null;
  length?: number | null;
}

export interface MapState {
  regions: Record<string, RegionState>;
  layers: Record<string, LayerState>;
  feature_groups: Record<string, FeatureGroupState>;
  features: Record<string, FeatureState>;
  settings: Record<string, unknown>;
  lastEventId?: string | null;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface SnapPoint {
  lat: number;
  lon: number;
  snapped_object_id: string | null;
  distance: number;
}

export enum SegmentType {
  AsphaltRoad = 'AsphaltRoad',
  StoneSidewalk = 'StoneSidewalk',
  SoilSidewalk = 'SoilSidewalk',
  TerrazzoSidewalk = 'TerrazzoSidewalk',
  BlockSidewalk = 'BlockSidewalk',
  ConcreteSidewalk = 'ConcreteSidewalk',
  Unknown = 'Unknown',
}

export interface Segment {
  id: string;
  points: GeoPoint[];
  segment_type: SegmentType;
  properties: Record<string, string>;
}

export enum PolylineType {
  PowerLine = 'PowerLine',
  SignalLine = 'SignalLine',
  TrenchLine = 'TrenchLine',
}

export interface PolylineFeature {
  id: string;
  polyline_type: PolylineType;
  segments: Segment[];
  start_point: SnapPoint;
  end_point: SnapPoint;
}

// --- Flexible Content Types ---

export interface ContentType {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
}

export interface ContentField {
  id: string;
  content_type_id: string;
  name: string;
  label: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  required: boolean;
  options_json: string | null; // For dropdowns
}

export interface ContentItem {
  id: string;
  content_type_id: string;
  project_id: string;
  name: string;
  data_json: string; // Parsed as Record<string, any> in frontend
  created_at: string;
  updated_at: string;
}

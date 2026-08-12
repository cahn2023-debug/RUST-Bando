/**
 * PostGIS Standardized Spatial Data Contracts & Types.
 */

export enum SpatialReferenceSystem {
  WGS84 = 4326,
  WEB_MERCATOR = 3857,
  VN2000_105 = 4756,
}

export type GeometryType =
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon';

export interface PostGisFeatureDto {
  geometry: Record<string, unknown>;
  srid: number;
  ewkt: string;
}

export interface GisValidationReport {
  isValid: boolean;
  reason?: string;
  location?: [number, number];
}

export interface SpatialMeasurements {
  areaSqM?: number;
  lengthM?: number;
  centroid?: [number, number];
  bbox?: [number, number, number, number];
}

export type SpatialPredicate = 'intersects' | 'contains' | 'overlaps';

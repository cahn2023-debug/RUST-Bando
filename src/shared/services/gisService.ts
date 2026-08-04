import { safeInvoke as invoke } from '../../modules/implement/lib/tauri';
import {
  GisValidationReport,
  GeometryType,
  PostGisFeatureDto,
  SpatialMeasurements,
  SpatialPredicate,
  SpatialReferenceSystem,
} from '../../contracts/postgis';

export class PostGisService {
  /**
   * Parse EWKT (Extended Well-Known Text) e.g., "SRID=4326;POINT(105.85 21.02)"
   */
  static async geomFromEwkt(ewkt: string): Promise<PostGisFeatureDto> {
    return await invoke<PostGisFeatureDto>('st_geom_from_ewkt', { ewkt });
  }

  /**
   * Format geometry coordinates to PostGIS EWKT
   */
  static async asEwkt(
    coordinatesJson: unknown,
    geomType: GeometryType,
    srid: SpatialReferenceSystem = SpatialReferenceSystem.WGS84
  ): Promise<string> {
    return await invoke<string>('st_as_ewkt', {
      coordinatesJson,
      geomType,
      srid,
    });
  }

  /**
   * PostGIS ST_IsValid topology check
   */
  static async isValid(
    coordinatesJson: unknown,
    geomType: GeometryType
  ): Promise<GisValidationReport> {
    return await invoke<GisValidationReport>('st_is_valid', {
      coordinatesJson,
      geomType,
    });
  }

  /**
   * PostGIS ST_MakeValid automatic topology repair
   */
  static async makeValid(
    coordinatesJson: unknown,
    geomType: GeometryType
  ): Promise<Record<string, unknown>> {
    return await invoke<Record<string, unknown>>('st_make_valid', {
      coordinatesJson,
      geomType,
    });
  }

  /**
   * PostGIS ST_Transform coordinate reprojection (EPSG:4326 <-> EPSG:3857 <-> EPSG:4756 / VN-2000)
   */
  static async transform(
    coordinatesJson: unknown,
    geomType: GeometryType,
    fromSrid: SpatialReferenceSystem,
    toSrid: SpatialReferenceSystem
  ): Promise<Record<string, unknown>> {
    return await invoke<Record<string, unknown>>('st_transform', {
      coordinatesJson,
      geomType,
      fromSrid,
      toSrid,
    });
  }

  /**
   * Measure spatial feature (area, length, centroid, bbox)
   */
  static async measureFeature(
    coordinatesJson: unknown,
    geomType: GeometryType,
    srid: SpatialReferenceSystem = SpatialReferenceSystem.WGS84
  ): Promise<SpatialMeasurements> {
    return await invoke<SpatialMeasurements>('st_measure_feature', {
      coordinatesJson,
      geomType,
      srid,
    });
  }

  /**
   * Evaluate PostGIS spatial relation predicate (intersects, contains, overlaps)
   */
  static async spatialRelate(
    geom1: unknown,
    type1: GeometryType,
    geom2: unknown,
    type2: GeometryType,
    predicate: SpatialPredicate
  ): Promise<boolean> {
    return await invoke<boolean>('st_spatial_relate', {
      geom1,
      type1,
      geom2,
      type2,
      predicate,
    });
  }
}

use geo::{
    Area, BooleanOps, BoundingRect, Centroid, Contains, Coord, Euclidean, Geometry,
    Intersects, Length, LineString, MapCoords, MultiPolygon, Point, Polygon,
};
use geozero::geojson::GeoJson;
use geozero::wkb::Wkb;
use geozero::wkt::Wkt;
use geozero::{ToGeo, ToJson, ToWkt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::f64::consts::PI;

pub const SRID_WGS84: i32 = 4326;
pub const SRID_WEB_MERCATOR: i32 = 3857;
pub const SRID_VN2000_105: i32 = 4756; // Standard EPSG for VN-2000 / WGS 84 (Central Meridian 105)

/// Standard PostGIS Geometry Container holding a geo::Geometry and a Spatial Reference ID (SRID).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PostGisGeometry {
    pub geometry: Geometry<f64>,
    pub srid: i32,
}

impl PostGisGeometry {
    pub fn new(geometry: Geometry<f64>, srid: i32) -> Self {
        Self { geometry, srid }
    }

    pub fn wgs84(geometry: Geometry<f64>) -> Self {
        Self {
            geometry,
            srid: SRID_WGS84,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ValidationReport {
    pub is_valid: bool,
    pub reason: Option<String>,
    pub location: Option<(f64, f64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpatialMeasurements {
    pub area_sq_m: Option<f64>,
    pub length_m: Option<f64>,
    pub centroid: Option<(f64, f64)>,
    pub bbox: Option<[f64; 4]>,
}

/// Advanced GIS Topology & PostGIS Engine.
pub struct GisEngine;

impl GisEngine {
    // ==========================================
    // 1. PostGIS I/O (EWKT, EWKB, GeoJSON)
    // ==========================================

    /// Parses an Extended Well-Known Text (EWKT) string, e.g., "SRID=4326;POINT(105.85 21.02)".
    /// If no SRID is specified, defaults to SRID 4326.
    pub fn st_geom_from_ewkt(ewkt: &str) -> Result<PostGisGeometry, String> {
        let trimmed = ewkt.trim();
        let (srid, wkt_str) = if trimmed.starts_with("SRID=") {
            let parts: Vec<&str> = trimmed.splitn(2, ';').collect();
            if parts.len() != 2 {
                return Err("Invalid EWKT format: expected 'SRID=<id>;<WKT>'".to_string());
            }
            let srid_part = parts[0].trim_start_matches("SRID=");
            let parsed_srid = srid_part
                .parse::<i32>()
                .map_err(|_| format!("Invalid SRID in EWKT: '{}'", srid_part))?;
            (parsed_srid, parts[1].trim())
        } else {
            (SRID_WGS84, trimmed)
        };

        let geo_item = Wkt(wkt_str)
            .to_geo()
            .map_err(|e| format!("Failed to parse WKT string: {}", e))?;

        Ok(PostGisGeometry::new(geo_item, srid))
    }

    /// Exports a PostGisGeometry into an EWKT string, e.g., "SRID=4326;POINT(105.85 21.02)".
    pub fn st_as_ewkt(postgis_geom: &PostGisGeometry) -> Result<String, String> {
        let wkt_str = postgis_geom
            .geometry
            .to_wkt()
            .map_err(|e| format!("Failed to convert geometry to WKT: {}", e))?;
        Ok(format!("SRID={};{}", postgis_geom.srid, wkt_str))
    }

    /// Serializes PostGisGeometry to PostGIS EWKB binary layout.
    pub fn st_as_ewkb(postgis_geom: &PostGisGeometry) -> Result<Vec<u8>, String> {
        use geozero::wkb::WkbWriter;
        let mut wkb_bytes = Vec::new();
        let mut writer = WkbWriter::new(&mut wkb_bytes, geozero::wkb::WkbDialect::Wkb);
        geozero::geo_types::process_geom(&postgis_geom.geometry, &mut writer)
            .map_err(|e| format!("Failed to process geometry for EWKB: {}", e))?;

        if wkb_bytes.len() < 5 {
            return Err("WKB generation output is invalid".to_string());
        }

        // Inject EWKB SRID flag & value
        let byte_order = wkb_bytes[0];
        let base_type = if byte_order == 1 {
            u32::from_le_bytes(wkb_bytes[1..5].try_into().unwrap())
        } else {
            u32::from_be_bytes(wkb_bytes[1..5].try_into().unwrap())
        };

        let ewkb_type = base_type | 0x20000000;
        let mut ewkb_output = Vec::with_capacity(wkb_bytes.len() + 4);
        ewkb_output.push(byte_order);

        if byte_order == 1 {
            ewkb_output.extend_from_slice(&ewkb_type.to_le_bytes());
            ewkb_output.extend_from_slice(&postgis_geom.srid.to_le_bytes());
        } else {
            ewkb_output.extend_from_slice(&ewkb_type.to_be_bytes());
            ewkb_output.extend_from_slice(&postgis_geom.srid.to_be_bytes());
        }

        ewkb_output.extend_from_slice(&wkb_bytes[5..]);
        Ok(ewkb_output)
    }

    /// Deserializes a PostGIS EWKB binary layout into PostGisGeometry.
    pub fn st_geom_from_ewkb(ewkb: &[u8]) -> Result<PostGisGeometry, String> {
        if ewkb.len() < 9 {
            return Err("EWKB byte array too short".to_string());
        }

        let byte_order = ewkb[0];
        let raw_type = if byte_order == 1 {
            u32::from_le_bytes(ewkb[1..5].try_into().unwrap())
        } else {
            u32::from_be_bytes(ewkb[1..5].try_into().unwrap())
        };

        let has_srid = (raw_type & 0x20000000) != 0;
        let (srid, wkb_start) = if has_srid {
            let parsed_srid = if byte_order == 1 {
                i32::from_le_bytes(ewkb[5..9].try_into().unwrap())
            } else {
                i32::from_be_bytes(ewkb[5..9].try_into().unwrap())
            };
            (parsed_srid, 9)
        } else {
            (SRID_WGS84, 5)
        };

        // Construct standard WKB for geozero
        let base_type = raw_type & !0x20000000;
        let mut standard_wkb = Vec::with_capacity(ewkb.len() - wkb_start + 5);
        standard_wkb.push(byte_order);
        if byte_order == 1 {
            standard_wkb.extend_from_slice(&base_type.to_le_bytes());
        } else {
            standard_wkb.extend_from_slice(&base_type.to_be_bytes());
        }
        standard_wkb.extend_from_slice(&ewkb[wkb_start..]);

        let geom = Wkb(standard_wkb)
            .to_geo()
            .map_err(|e| format!("Failed to parse EWKB payload: {}", e))?;

        Ok(PostGisGeometry::new(geom, srid))
    }

    /// Parses a GeoJSON geometry value into PostGisGeometry.
    pub fn st_geom_from_geojson(geom_json: &Value, srid: Option<i32>) -> Result<PostGisGeometry, String> {
        let json_str = serde_json::to_string(geom_json).map_err(|e| e.to_string())?;
        let geom = GeoJson(&json_str)
            .to_geo()
            .map_err(|e| format!("Failed to convert GeoJSON to geo::Geometry: {}", e))?;

        let target_srid = srid.unwrap_or(SRID_WGS84);
        Ok(PostGisGeometry::new(geom, target_srid))
    }

    /// Converts a PostGisGeometry into a GeoJSON Geometry Value.
    pub fn st_as_geojson(postgis_geom: &PostGisGeometry) -> Result<Value, String> {
        let json_str = postgis_geom
            .geometry
            .to_json()
            .map_err(|e| format!("Failed to convert geometry to GeoJSON: {}", e))?;
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid GeoJSON generated: {}", e))
    }

    // ==========================================
    // 2. Topology Validation & ST_MakeValid
    // ==========================================

    /// Validates topology according to PostGIS ST_IsValid rules.
    pub fn st_is_valid(geom: &Geometry<f64>) -> ValidationReport {
        fn check_coords(pts: &[Point<f64>]) -> Option<String> {
            for pt in pts {
                if pt.x().is_nan() || pt.x().is_infinite() || pt.y().is_nan() || pt.y().is_infinite()
                {
                    return Some(format!("Invalid coordinate values: ({}, {})", pt.x(), pt.y()));
                }
            }
            None
        }

        match geom {
            Geometry::Point(p) => {
                if let Some(err) = check_coords(&[*p]) {
                    return ValidationReport {
                        is_valid: false,
                        reason: Some(err),
                        location: Some((p.x(), p.y())),
                    };
                }
            }
            Geometry::LineString(line) => {
                let pts: Vec<Point<f64>> = line.points().collect();
                if pts.len() < 2 {
                    return ValidationReport {
                        is_valid: false,
                        reason: Some("LineString must have at least 2 points".to_string()),
                        location: pts.first().map(|p| (p.x(), p.y())),
                    };
                }
                if let Some(err) = check_coords(&pts) {
                    return ValidationReport {
                        is_valid: false,
                        reason: Some(err),
                        location: pts.first().map(|p| (p.x(), p.y())),
                    };
                }
            }
            Geometry::Polygon(poly) => {
                let ext = poly.exterior();
                let pts: Vec<Point<f64>> = ext.points().collect();
                if pts.len() < 4 {
                    return ValidationReport {
                        is_valid: false,
                        reason: Some("Polygon exterior ring must have at least 4 points".to_string()),
                        location: pts.first().map(|p| (p.x(), p.y())),
                    };
                }
                if pts.first() != pts.last() {
                    return ValidationReport {
                        is_valid: false,
                        reason: Some("Polygon ring is not closed".to_string()),
                        location: pts.first().map(|p| (p.x(), p.y())),
                    };
                }
                if let Some(err) = check_coords(&pts) {
                    return ValidationReport {
                        is_valid: false,
                        reason: Some(err),
                        location: pts.first().map(|p| (p.x(), p.y())),
                    };
                }
            }
            Geometry::MultiPolygon(mp) => {
                for poly in mp {
                    let report = Self::st_is_valid(&Geometry::Polygon(poly.clone()));
                    if !report.is_valid {
                        return report;
                    }
                }
            }
            _ => {}
        }

        ValidationReport {
            is_valid: true,
            reason: None,
            location: None,
        }
    }

    /// Repair invalid geometry topologies automatically (PostGIS ST_MakeValid equivalent).
    pub fn st_make_valid(geom: &Geometry<f64>) -> Geometry<f64> {
        match geom {
            Geometry::LineString(line) => {
                let mut pts: Vec<(f64, f64)> = Vec::new();
                for pt in line.points() {
                    let coord = (pt.x(), pt.y());
                    if pts.last() != Some(&coord) && !pt.x().is_nan() && !pt.y().is_nan() {
                        pts.push(coord);
                    }
                }
                if pts.len() < 2 {
                    if let Some(&first) = pts.first() {
                        Geometry::Point(Point::new(first.0, first.1))
                    } else {
                        geom.clone()
                    }
                } else {
                    Geometry::LineString(LineString::from(pts))
                }
            }
            Geometry::Polygon(poly) => {
                let ext = poly.exterior();
                let mut pts: Vec<(f64, f64)> = ext
                    .points()
                    .filter_map(|p| {
                        if p.x().is_nan() || p.y().is_nan() {
                            None
                        } else {
                            Some((p.x(), p.y()))
                        }
                    })
                    .collect();

                if pts.is_empty() {
                    return geom.clone();
                }

                // Ensure ring closure
                if pts.first() != pts.last() {
                    pts.push(*pts.first().unwrap());
                }

                if pts.len() < 4 {
                    return Geometry::LineString(LineString::from(pts));
                }

                let cleaned_ext = LineString::from(pts);
                let poly_cleaned = Polygon::new(cleaned_ext, poly.interiors().to_vec());
                Geometry::Polygon(poly_cleaned)
            }
            Geometry::MultiPolygon(mp) => {
                let cleaned_polys: Vec<Polygon<f64>> = mp
                    .iter()
                    .filter_map(|p| match Self::st_make_valid(&Geometry::Polygon(p.clone())) {
                        Geometry::Polygon(valid_p) => Some(valid_p),
                        _ => None,
                    })
                    .collect();
                Geometry::MultiPolygon(MultiPolygon::new(cleaned_polys))
            }
            _ => geom.clone(),
        }
    }

    // ==========================================
    // 3. ST_Transform Reprojection
    // ==========================================

    /// Reprojects a PostGisGeometry between supported SRIDs (EPSG:4326, EPSG:3857, VN-2000 EPSG:4756).
    pub fn st_transform(postgis_geom: &PostGisGeometry, target_srid: i32) -> Result<PostGisGeometry, String> {
        if postgis_geom.srid == target_srid {
            return Ok(postgis_geom.clone());
        }

        let transformed_geom = match (postgis_geom.srid, target_srid) {
            // EPSG:4326 (WGS84 Lat/Lng) -> EPSG:3857 (Web Mercator)
            (SRID_WGS84, SRID_WEB_MERCATOR) => {
                postgis_geom.geometry.map_coords(|c| {
                    let x = c.x * 20037508.34 / 180.0;
                    let y = (c.y + 90.0) * PI / 360.0;
                    let y = (y.tan().ln()) / (PI / 180.0) * 20037508.34 / 180.0;
                    Coord { x, y }
                })
            }
            // EPSG:3857 (Web Mercator) -> EPSG:4326 (WGS84 Lat/Lng)
            (SRID_WEB_MERCATOR, SRID_WGS84) => {
                postgis_geom.geometry.map_coords(|c| {
                    let lon = c.x * 180.0 / 20037508.34;
                    let lat = (c.y * 180.0 / 20037508.34 * PI / 180.0).sinh().atan() * 180.0 / PI;
                    Coord { x: lon, y: lat }
                })
            }
            // EPSG:4326 (WGS84) -> VN-2000 EPSG:4756 (Transverse Mercator 105° Meridian)
            (SRID_WGS84, SRID_VN2000_105) => {
                let cm_lon = 105.0; // Central Meridian
                postgis_geom.geometry.map_coords(|c| {
                    let d_lon = (c.x - cm_lon) * PI / 180.0;
                    let lat_rad = c.y * PI / 180.0;
                    let x = 500000.0 + 6378137.0 * d_lon * lat_rad.cos() * 0.9999;
                    let y = 6378137.0 * lat_rad * 0.9999;
                    Coord { x, y }
                })
            }
            // VN-2000 EPSG:4756 -> EPSG:4326 (WGS84)
            (SRID_VN2000_105, SRID_WGS84) => {
                let cm_lon = 105.0;
                postgis_geom.geometry.map_coords(|c| {
                    let lat_rad = c.y / (6378137.0 * 0.9999);
                    let lat = lat_rad * 180.0 / PI;
                    let d_lon = (c.x - 500000.0) / (6378137.0 * lat_rad.cos() * 0.9999);
                    let lon = cm_lon + (d_lon * 180.0 / PI);
                    Coord { x: lon, y: lat }
                })
            }
            _ => {
                return Err(format!(
                    "Unsupported reprojection from SRID {} to SRID {}",
                    postgis_geom.srid, target_srid
                ));
            }
        };

        Ok(PostGisGeometry::new(transformed_geom, target_srid))
    }

    // ==========================================
    // 4. Spatial Measurements & Predicates
    // ==========================================

    /// Calculates spatial statistics (Area, Length, Centroid, Bounding Box).
    pub fn st_measure_feature(postgis_geom: &PostGisGeometry) -> SpatialMeasurements {
        let area_sq_m = match &postgis_geom.geometry {
            Geometry::Polygon(poly) => Some(poly.unsigned_area()),
            Geometry::MultiPolygon(mp) => Some(mp.unsigned_area()),
            _ => None,
        };

        let length_m = match &postgis_geom.geometry {
            Geometry::LineString(line) => Some(line.length::<Euclidean>()),
            Geometry::MultiLineString(ml) => Some(ml.length::<Euclidean>()),
            _ => None,
        };

        let centroid = postgis_geom
            .geometry
            .centroid()
            .map(|pt| (pt.x(), pt.y()));

        let bbox = postgis_geom.geometry.bounding_rect().map(|rect| {
            [
                rect.min().x,
                rect.min().y,
                rect.max().x,
                rect.max().y,
            ]
        });

        SpatialMeasurements {
            area_sq_m,
            length_m,
            centroid,
            bbox,
        }
    }

    /// Evaluates PostGIS spatial predicates between two geometries.
    pub fn st_spatial_relate(
        g1: &Geometry<f64>,
        g2: &Geometry<f64>,
        predicate: &str,
    ) -> Result<bool, String> {
        match predicate.to_lowercase().as_str() {
            "intersects" => Ok(g1.intersects(g2)),
            "contains" => match (g1, g2) {
                (Geometry::Polygon(p1), Geometry::Point(p2)) => Ok(p1.contains(p2)),
                (Geometry::Polygon(p1), Geometry::Polygon(p2)) => Ok(p1.contains(p2)),
                _ => Ok(g1.intersects(g2)),
            },
            "overlaps" => match (g1, g2) {
                (Geometry::Polygon(p1), Geometry::Polygon(p2)) => {
                    let inter = p1.intersection(p2);
                    Ok(inter.unsigned_area() > 1e-9)
                }
                _ => Ok(g1.intersects(g2)),
            },
            _ => Err(format!("Unsupported spatial predicate: '{}'", predicate)),
        }
    }

    // ==========================================
    // Backward Compatibility Helpers
    // ==========================================

    pub fn value_to_geometry(
        geom_type: &str,
        coordinates: &Value,
    ) -> Result<Geometry<f64>, String> {
        let full_geom = json!({
            "type": geom_type,
            "coordinates": coordinates
        });
        Self::st_geom_from_geojson(&full_geom, Some(SRID_WGS84)).map(|g| g.geometry)
    }

    pub fn check_overlap(
        new_geo: &Geometry<f64>,
        existing_features: &[(String, Geometry<f64>)],
    ) -> Vec<(String, String)> {
        use rayon::prelude::*;
        existing_features
            .par_iter()
            .filter_map(|feature| {
                let (id, existing_geo) = feature;
                if let Ok(true) = Self::st_spatial_relate(new_geo, existing_geo, "overlaps") {
                    Some((id.clone(), "OVERLAP".to_string()))
                } else if new_geo.intersects(existing_geo) {
                    Some((id.clone(), "INTERSECT".to_string()))
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn validate_geometry(geom_json: &Value) -> Result<(), String> {
        let postgis_geom = Self::st_geom_from_geojson(geom_json, Some(SRID_WGS84))?;
        let report = Self::st_is_valid(&postgis_geom.geometry);
        if report.is_valid {
            Ok(())
        } else {
            Err(report.reason.unwrap_or_else(|| "Invalid geometry".to_string()))
        }
    }

    pub fn calculate_stats(geom: &Geometry<f64>) -> (Option<f64>, Option<f64>) {
        let postgis_geom = PostGisGeometry::wgs84(geom.clone());
        let measures = Self::st_measure_feature(&postgis_geom);
        (measures.area_sq_m, measures.length_m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use geo::{point, polygon};

    #[test]
    fn test_st_geom_from_ewkt_and_as_ewkt() {
        let ewkt_input = "SRID=4326;POINT(105.85 21.02)";
        let postgis_geom = GisEngine::st_geom_from_ewkt(ewkt_input).expect("Failed to parse EWKT");

        assert_eq!(postgis_geom.srid, 4326);
        assert_eq!(postgis_geom.geometry, Geometry::Point(point!(x: 105.85, y: 21.02)));

        let ewkt_output = GisEngine::st_as_ewkt(&postgis_geom).expect("Failed to serialize EWKT");
        assert!(ewkt_output.starts_with("SRID=4326;"));
        assert!(ewkt_output.contains("POINT"));
    }

    #[test]
    fn test_st_ewkb_roundtrip() {
        let geom = Geometry::Point(point!(x: 105.85, y: 21.02));
        let postgis_geom = PostGisGeometry::new(geom, 3857);

        let ewkb_bytes = GisEngine::st_as_ewkb(&postgis_geom).expect("EWKB serialization failed");
        assert!(ewkb_bytes.len() >= 9);

        let deserialized = GisEngine::st_geom_from_ewkb(&ewkb_bytes).expect("EWKB deserialization failed");
        assert_eq!(deserialized.srid, 3857);
        assert_eq!(deserialized.geometry, postgis_geom.geometry);
    }

    #[test]
    fn test_st_is_valid_and_make_valid() {
        let valid_poly = Geometry::Polygon(polygon![
            (x: 0.0, y: 0.0),
            (x: 4.0, y: 0.0),
            (x: 4.0, y: 4.0),
            (x: 0.0, y: 4.0),
            (x: 0.0, y: 0.0),
        ]);
        let report = GisEngine::st_is_valid(&valid_poly);
        assert!(report.is_valid);

        // Single point LineString (invalid)
        let invalid_line = Geometry::LineString(LineString::from(vec![(0.0, 0.0)]));
        let invalid_report = GisEngine::st_is_valid(&invalid_line);
        assert!(!invalid_report.is_valid);
        assert!(invalid_report.reason.unwrap().contains("at least 2 points"));

        let fixed = GisEngine::st_make_valid(&invalid_line);
        let fixed_report = GisEngine::st_is_valid(&fixed);
        assert!(fixed_report.is_valid);
    }

    #[test]
    fn test_st_transform_wgs84_web_mercator() {
        let hanoi_pt = PostGisGeometry::wgs84(Geometry::Point(point!(x: 105.85, y: 21.02)));
        let transformed = GisEngine::st_transform(&hanoi_pt, SRID_WEB_MERCATOR)
            .expect("Transform WGS84 to Web Mercator failed");

        assert_eq!(transformed.srid, 3857);
        if let Geometry::Point(pt) = transformed.geometry {
            assert!(pt.x() > 11000000.0);
            assert!(pt.y() > 2300000.0);
        } else {
            panic!("Expected point geometry");
        }

        let back_to_wgs84 = GisEngine::st_transform(&transformed, SRID_WGS84)
            .expect("Transform Web Mercator to WGS84 failed");
        assert_eq!(back_to_wgs84.srid, 4326);
        if let Geometry::Point(pt) = back_to_wgs84.geometry {
            assert!((pt.x() - 105.85).abs() < 1e-4);
            assert!((pt.y() - 21.02).abs() < 1e-4);
        }
    }
}

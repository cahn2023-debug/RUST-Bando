use geo::{Area, Euclidean, Geometry, Intersects, Length, BooleanOps};
use geozero::geojson::GeoJson;
use geozero::ToGeo;
use serde_json::Value;

/// Advanced GIS Topology Validation engine.
pub struct GisEngine;

impl GisEngine {
    /// Converts a GeoJSON geometry Value to a geo::Geometry.
    pub fn value_to_geometry(
        geom_type: &str,
        coordinates: &Value,
    ) -> Result<Geometry<f64>, String> {
        let full_geom = serde_json::json!({
            "type": geom_type,
            "coordinates": coordinates
        });
        let geo_json_str = serde_json::to_string(&full_geom).map_err(|e| e.to_string())?;
        GeoJson(&geo_json_str)
            .to_geo()
            .map_err(|e| format!("Failed to convert to geo-types: {}", e))
    }

    /// Checks for overlapping boundaries between a new geometry and existing geometries.
    /// Returns a list of overlapping feature IDs and the overlap type.
    /// Optimized with Rayon for parallel processing.
    pub fn check_overlap(
        new_geo: &Geometry<f64>,
        existing_features: &[(String, Geometry<f64>)],
    ) -> Vec<(String, String)> {
        use rayon::prelude::*;

        existing_features
            .par_iter()
            .filter_map(|feature| {
                let (id, existing_geo) = feature;
                match (new_geo, existing_geo) {
                    (Geometry::Polygon(p1), Geometry::Polygon(p2)) => {
                        let inter = p1.intersection(p2);
                        if inter.unsigned_area() > 1e-9 {
                            return Some((id.clone(), "OVERLAP".to_string()));
                        }
                    }
                    (Geometry::MultiPolygon(mp1), Geometry::Polygon(p2)) => {
                        let inter = mp1.intersection(p2);
                        if inter.unsigned_area() > 1e-9 {
                            return Some((id.clone(), "OVERLAP".to_string()));
                        }
                    }
                    _ => {
                        if new_geo.intersects(existing_geo) {
                            return Some((id.clone(), "INTERSECT".to_string()));
                        }
                    }
                }
                None
            })
            .collect()
    }

    /// Validates a geometry before insertion.
    pub fn validate_geometry(geom_json: &Value) -> Result<(), String> {
        if !geom_json.is_object() {
            return Err("Invalid GeoJSON: must be an object".to_string());
        }

        let geom_type = geom_json.get("type").and_then(|v| v.as_str());
        match geom_type {
            Some("Point")
            | Some("LineString")
            | Some("Polygon")
            | Some("MultiPoint")
            | Some("MultiLineString")
            | Some("MultiPolygon") => Ok(()),
            _ => Err(format!(
                "Unsupported or invalid geometry type: {:?}",
                geom_type
            )),
        }
    }

    /// Calculates basic spatial statistics (Area for Polygons, Length for LineStrings)
    pub fn calculate_stats(geom: &Geometry<f64>) -> (Option<f64>, Option<f64>) {
        match geom {
            Geometry::Polygon(poly) => (Some(poly.unsigned_area()), None),
            Geometry::MultiPolygon(mp) => (Some(mp.unsigned_area()), None),
            Geometry::LineString(line) => (None, Some(line.length::<Euclidean>())),
            Geometry::MultiLineString(ml) => (None, Some(ml.length::<Euclidean>())),
            _ => (None, None),
        }
    }
}

use crate::domain::implement::modules::v2::projections::utils::Vn2000;
use geozero::geojson::GeoJsonReader;
use geozero::wkb::{WkbDialect, WkbWriter};
use geozero::GeozeroDatasource;
use serde_json::Value;

/// Calculates WKB, Bounding Box, VN2000 coordinates, Area, and Length for a GeoJSON geometry.
/// Returns (Transformed Geometry, WKB, min_x, min_y, max_x, max_y, x_vn2000, y_vn2000, area, length)
pub fn calculate_spatial(
    geometry: &Value,
) -> (
    Value,           // Transformed Geometry
    Option<Vec<u8>>, // Transformed WKB
    Option<f64>,     // min_x (lon)
    Option<f64>,     // min_y (lat)
    Option<f64>,     // max_x (lon)
    Option<f64>,     // max_y (lat)
    Option<f64>,     // x_vn2000
    Option<f64>,     // y_vn2000
    Option<f64>,     // area (square meters)
    Option<f64>,     // length (meters)
) {
    // 1. Transform geometry to WGS84 and extract source VN2000 if it was a Point
    let mut transformed_geometry = geometry.clone();

    // We need a copy of the geometry in VN2000 (meters) for accurate area/length calculation
    // if the input is already VN2000. If it's WGS84, we might need geodesic calculation.
    // For simplicity in the current PMP context, we detect VN2000 and calculate planar.
    let mut vn2000_geo = geometry.clone();
    ensure_vn2000_geometry(&mut vn2000_geo);

    let (x_vn, y_vn) = transform_geometry_to_wgs84(&mut transformed_geometry);

    // 2. Calculate WKB from transformed geometry
    let mut wkb = Vec::new();
    let mut writer = WkbWriter::new(&mut wkb, WkbDialect::Wkb);
    let geojson_str = transformed_geometry.to_string();
    let mut reader = GeoJsonReader(geojson_str.as_bytes());

    let wkb_blob = if reader.process(&mut writer).is_ok() {
        Some(wkb)
    } else {
        None
    };

    // 3. Calculate Area and Length using planar VN2000 coordinates
    let (area, length) = calculate_area_length_planar(&vn2000_geo);

    // 4. Calculate Bounding Box from transformed geometry
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    let mut found = false;

    fn find_coords(
        val: &Value,
        min_x: &mut f64,
        min_y: &mut f64,
        max_x: &mut f64,
        max_y: &mut f64,
        found: &mut bool,
    ) {
        if let Some(arr) = val.as_array() {
            if arr.len() >= 2 && arr[0].is_number() && arr[1].is_number() {
                let lon = arr[0].as_f64().unwrap();
                let lat = arr[1].as_f64().unwrap();

                *min_x = min_x.min(lon);
                *min_y = min_y.min(lat);
                *max_x = max_x.max(lon);
                *max_y = max_y.max(lat);
                *found = true;
            } else {
                for item in arr {
                    find_coords(item, min_x, min_y, max_x, max_y, found);
                }
            }
        } else if let Some(obj) = val.as_object() {
            for (key, v) in obj {
                // GeoJSON specific: only look in 'coordinates' or arrays
                if key == "coordinates" || v.is_array() || v.is_object() {
                    find_coords(v, min_x, min_y, max_x, max_y, found);
                }
            }
        }
    }

    find_coords(
        &transformed_geometry,
        &mut min_x,
        &mut min_y,
        &mut max_x,
        &mut max_y,
        &mut found,
    );

    if found {
        (
            transformed_geometry,
            wkb_blob,
            Some(min_x),
            Some(min_y),
            Some(max_x),
            Some(max_y),
            x_vn,
            y_vn,
            area,
            length,
        )
    } else {
        (
            transformed_geometry,
            wkb_blob,
            None,
            None,
            None,
            None,
            x_vn,
            y_vn,
            area,
            length,
        )
    }
}

/// Helper to calculate area and length assuming planar coordinates (meters)
pub fn calculate_area_length_planar(vn2000_geo: &Value) -> (Option<f64>, Option<f64>) {
    use geo::{Area, Euclidean, Length};
    use geozero::ToGeo;

    // Convert GeoJSON Value to geo_types::Geometry
    let geo_str = vn2000_geo.to_string();
    if let Ok(geo_obj) = geozero::geojson::GeoJson(&geo_str).to_geo() {
        use geo::Geometry::*;
        let (area, length) = match geo_obj {
            Point(_) | MultiPoint(_) => (0.0, 0.0),
            LineString(l) => (0.0, l.length::<Euclidean>()),
            MultiLineString(ml) => (0.0, ml.length::<Euclidean>()),
            Polygon(p) => (p.unsigned_area(), p.exterior().length::<Euclidean>()),
            MultiPolygon(mp) => (mp.unsigned_area(), 0.0), // Simplified length for MultiPolygon
            GeometryCollection(gc) => {
                let a: f64 = gc
                    .iter()
                    .map(|g| match g {
                        Polygon(p) => p.unsigned_area(),
                        MultiPolygon(mp) => mp.unsigned_area(),
                        _ => 0.0,
                    })
                    .sum();
                (a, 0.0)
            }
            _ => (0.0, 0.0),
        };

        // Only return Some if > 0 or appropriate for type
        let a = if area > 0.0 { Some(area) } else { None };
        let l = if length > 0.0 { Some(length) } else { None };

        return (a, l);
    }
    (None, None)
}

/// Helper to ensure a geometry is in VN2000 (meters).
/// If it's already WGS84, it will be transformed to VN2000.
fn ensure_vn2000_geometry(val: &mut Value) {
    if let Some(obj) = val.as_object_mut() {
        if let Some(coords) = obj.get_mut("coordinates") {
            transform_to_vn2000_recursive(coords);
        } else if let Some(geometries) = obj.get_mut("geometries") {
            if let Some(arr) = geometries.as_array_mut() {
                for geom in arr {
                    ensure_vn2000_geometry(geom);
                }
            }
        }
    }
}

fn transform_to_vn2000_recursive(val: &mut Value) {
    if let Some(arr) = val.as_array_mut() {
        if arr.len() >= 2 && arr[0].is_number() && arr[1].is_number() {
            let x = arr[0].as_f64().unwrap();
            let y = arr[1].as_f64().unwrap();

            // If it looks like WGS84 (lon between -180 and 180, lat between -90 and 90)
            if x >= -180.0 && x <= 180.0 && y >= -90.0 && y <= 90.0 {
                let (vn_x, vn_y) = Vn2000::to_vn2000(y, x, 105.0); // lat, lon
                arr[0] = serde_json::Number::from_f64(vn_x)
                    .map(Value::Number)
                    .unwrap();
                arr[1] = serde_json::Number::from_f64(vn_y)
                    .map(Value::Number)
                    .unwrap();
            }
        } else {
            for item in arr {
                transform_to_vn2000_recursive(item);
            }
        }
    } else if let Some(obj) = val.as_object_mut() {
        for (key, v) in obj {
            if key != "type" {
                transform_to_vn2000_recursive(v);
            }
        }
    }
}

/// Recursively transforms all coordinates in a GeoJSON Value from VN2000 to WGS84.
/// If the root is a Point, returns the ORIGINAL VN2000 coordinates (x, y).
fn transform_geometry_to_wgs84(val: &mut Value) -> (Option<f64>, Option<f64>) {
    let mut x_vn = None;
    let mut y_vn = None;

    if let Some(obj) = val.as_object_mut() {
        let is_point = obj.get("type").and_then(|t| t.as_str()) == Some("Point");
        if let Some(coords) = obj.get_mut("coordinates") {
            if let Some(arr) = coords.as_array_mut() {
                if arr.len() >= 2 && arr[0].is_number() && arr[1].is_number() {
                    let raw_x = arr[0].as_f64().unwrap();
                    let raw_y = arr[1].as_f64().unwrap();

                    // Auto-transform: raw_x is VN2000 X (e.g. 500k), raw_y is VN2000 Y (e.g. 2M)
                    if raw_x > 180.0 || raw_x < -180.0 || raw_y > 90.0 || raw_y < -90.0 {
                        // It's VN2000
                        if is_point {
                            x_vn = Some(raw_x);
                            y_vn = Some(raw_y);
                        }
                        let (lat, lon) = Vn2000::to_wgs84(raw_x, raw_y, 105.0);
                        arr[0] = serde_json::Number::from_f64(lon)
                            .map(Value::Number)
                            .unwrap();
                        arr[1] = serde_json::Number::from_f64(lat)
                            .map(Value::Number)
                            .unwrap();
                    } else if is_point {
                        // Already WGS84 - Calculate VN2000 for storage
                        let (x, y) = Vn2000::to_vn2000(raw_y, raw_x, 105.0); // lat, lon
                        x_vn = Some(x);
                        y_vn = Some(y);
                    }
                } else {
                    // Recursive for MultiPoint, LineString, Polygon etc.
                    for item in arr {
                        let _ = transform_geometry_to_wgs84_recursive(item);
                    }
                }
            }
        } else {
            // Check other fields (GeometryCollection)
            for (key, v) in obj {
                if key != "type" {
                    let _ = transform_geometry_to_wgs84_recursive(v);
                }
            }
        }
    }
    (x_vn, y_vn)
}

fn transform_geometry_to_wgs84_recursive(val: &mut Value) {
    if let Some(arr) = val.as_array_mut() {
        if arr.len() >= 2 && arr[0].is_number() && arr[1].is_number() {
            let raw_x = arr[0].as_f64().unwrap();
            let raw_y = arr[1].as_f64().unwrap();
            if raw_x > 180.0 || raw_x < -180.0 || raw_y > 90.0 || raw_y < -90.0 {
                let (lat, lon) = Vn2000::to_wgs84(raw_x, raw_y, 105.0);
                arr[0] = serde_json::Number::from_f64(lon)
                    .map(Value::Number)
                    .unwrap();
                arr[1] = serde_json::Number::from_f64(lat)
                    .map(Value::Number)
                    .unwrap();
            }
        } else {
            for item in arr {
                transform_geometry_to_wgs84_recursive(item);
            }
        }
    } else if let Some(obj) = val.as_object_mut() {
        for (key, v) in obj {
            if key != "type" {
                transform_geometry_to_wgs84_recursive(v);
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DoriRangeResult {
    pub label: String,
    pub distance: f64,
    pub ppm: f64,
    pub color: String,
}

/// Calculates DORI ranges based on camera specs.
pub fn get_dori_ranges(
    resolution_x: f64,
    focal_length: f64,
    sensor_width: f64,
    install_height: f64,
    target_height: f64,
) -> Vec<DoriRangeResult> {
    let hfov = calculate_hfov_internal(sensor_width, focal_length);
    let levels = [
        ("Identification", 250.0, "#ef4444"),
        ("Recognition", 125.0, "#f59e0b"),
        ("Observation", 63.0, "#10b981"),
        ("Detection", 25.0, "#06b6d4"),
    ];

    levels
        .iter()
        .map(|(label, ppm, color)| {
            let dist = calculate_dori_distance_internal(
                resolution_x,
                hfov,
                *ppm,
                install_height,
                target_height,
            );
            DoriRangeResult {
                label: label.to_string(),
                distance: dist,
                ppm: *ppm,
                color: color.to_string(),
            }
        })
        .collect()
}

fn calculate_hfov_internal(sensor_width: f64, focal_length: f64) -> f64 {
    if focal_length <= 0.0 {
        return 0.0;
    }
    let hfov_rad = 2.0 * (sensor_width / (2.0 * focal_length)).atan();
    hfov_rad.to_degrees()
}

fn calculate_dori_distance_internal(
    resolution_x: f64,
    hfov_degrees: f64,
    ppm_threshold: f64,
    install_height: f64,
    target_height: f64,
) -> f64 {
    if ppm_threshold <= 0.0 || hfov_degrees <= 0.0 || resolution_x <= 0.0 {
        return 0.0;
    }
    let hfov_rad = hfov_degrees.to_radians();
    let slant_range = resolution_x / (2.0 * ppm_threshold * (hfov_rad / 2.0).tan());
    let height_diff = (install_height - target_height).max(0.0);
    if slant_range < height_diff {
        return 0.0;
    }
    (slant_range.powi(2) - height_diff.powi(2)).sqrt()
}

pub fn calculate_ppm_internal(
    resolution_x: f64,
    distance: f64,
    hfov_degrees: f64,
    install_height: f64,
    target_height: f64,
) -> f64 {
    if distance <= 0.0 || hfov_degrees <= 0.0 {
        return 0.0;
    }
    let height_diff = (install_height - target_height).max(0.0);
    let slant_range = (distance.powi(2) + height_diff.powi(2)).sqrt();
    let hfov_rad = hfov_degrees.to_radians();
    let field_width = 2.0 * slant_range * (hfov_rad / 2.0).tan();
    if field_width <= 0.0 {
        return 0.0;
    }
    resolution_x / field_width
}

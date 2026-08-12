use gis_engine::{GisEngine, PostGisGeometry, SpatialMeasurements, ValidationReport};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct GeoJsonFeatureDto {
    pub geometry: Value,
    pub srid: i32,
    pub ewkt: String,
}

#[tauri::command]
pub fn st_geom_from_ewkt(ewkt: String) -> Result<GeoJsonFeatureDto, String> {
    let postgis_geom = GisEngine::st_geom_from_ewkt(&ewkt)?;
    let geometry = GisEngine::st_as_geojson(&postgis_geom)?;
    let ewkt_out = GisEngine::st_as_ewkt(&postgis_geom)?;

    Ok(GeoJsonFeatureDto {
        geometry,
        srid: postgis_geom.srid,
        ewkt: ewkt_out,
    })
}

#[tauri::command]
pub fn st_as_ewkt(
    coordinates_json: Value,
    geom_type: String,
    srid: Option<i32>,
) -> Result<String, String> {
    let geom_val = serde_json::json!({
        "type": geom_type,
        "coordinates": coordinates_json
    });
    let postgis_geom = GisEngine::st_geom_from_geojson(&geom_val, srid)?;
    GisEngine::st_as_ewkt(&postgis_geom)
}

#[tauri::command]
pub fn st_is_valid(coordinates_json: Value, geom_type: String) -> Result<ValidationReport, String> {
    let geom_val = serde_json::json!({
        "type": geom_type,
        "coordinates": coordinates_json
    });
    let postgis_geom = GisEngine::st_geom_from_geojson(&geom_val, None)?;
    Ok(GisEngine::st_is_valid(&postgis_geom.geometry))
}

#[tauri::command]
pub fn st_make_valid(coordinates_json: Value, geom_type: String) -> Result<Value, String> {
    let geom_val = serde_json::json!({
        "type": geom_type,
        "coordinates": coordinates_json
    });
    let postgis_geom = GisEngine::st_geom_from_geojson(&geom_val, None)?;
    let fixed_geom = GisEngine::st_make_valid(&postgis_geom.geometry);
    let fixed_postgis = PostGisGeometry::new(fixed_geom, postgis_geom.srid);
    GisEngine::st_as_geojson(&fixed_postgis)
}

#[tauri::command]
pub fn st_transform(
    coordinates_json: Value,
    geom_type: String,
    from_srid: i32,
    to_srid: i32,
) -> Result<Value, String> {
    let geom_val = serde_json::json!({
        "type": geom_type,
        "coordinates": coordinates_json
    });
    let postgis_geom = GisEngine::st_geom_from_geojson(&geom_val, Some(from_srid))?;
    let transformed = GisEngine::st_transform(&postgis_geom, to_srid)?;
    GisEngine::st_as_geojson(&transformed)
}

#[tauri::command]
pub fn st_measure_feature(
    coordinates_json: Value,
    geom_type: String,
    srid: Option<i32>,
) -> Result<SpatialMeasurements, String> {
    let geom_val = serde_json::json!({
        "type": geom_type,
        "coordinates": coordinates_json
    });
    let postgis_geom = GisEngine::st_geom_from_geojson(&geom_val, srid)?;
    Ok(GisEngine::st_measure_feature(&postgis_geom))
}

#[tauri::command]
pub fn st_spatial_relate(
    geom1: Value,
    type1: String,
    geom2: Value,
    type2: String,
    predicate: String,
) -> Result<bool, String> {
    let val1 = serde_json::json!({ "type": type1, "coordinates": geom1 });
    let val2 = serde_json::json!({ "type": type2, "coordinates": geom2 });

    let p1 = GisEngine::st_geom_from_geojson(&val1, None)?;
    let p2 = GisEngine::st_geom_from_geojson(&val2, None)?;

    GisEngine::st_spatial_relate(&p1.geometry, &p2.geometry, &predicate)
}

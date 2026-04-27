use crate::implement::db::DatabaseState;
use geozero::mvt::{tile, Message, MvtWriter, Tile};
use geozero::wkb::Wkb;
use geozero::GeozeroGeometry; // Required for process_geom
use log::{debug, error};
use rusqlite::params;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn get_tile_v2(app: tauri::AppHandle, z: u32, x: u32, y: u32) -> Result<Vec<u8>, String> {
    // Tauri 2.0 Request builder expects a valid URI path or full URL
    let uri = format!("http://tiles.localhost/{}/{}/{}", z, x, y);
    let req = Request::builder()
        .uri(uri)
        .body(vec![])
        .map_err(|e| e.to_string())?;

    let res = handle_tile_request(&app, req);
    if res.status() == StatusCode::OK {
        Ok(res.into_body())
    } else {
        // Return empty vector for 404/no data instead of error to avoid frontend console spam
        Ok(vec![])
    }
}

pub fn handle_tile_request(
    app: &AppHandle,
    request: Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let uri = request.uri().path();
    debug!("Tile request: {}", uri);

    // Format expected: /tiles/{z}/{x}/{y}
    let path = uri
        .trim_start_matches('/')
        .replace(".pbf", "")
        .replace(".mvt", "");
    let parts: Vec<&str> = path.split('/').collect();

    let tiles_idx = parts.iter().position(|&p| p == "tiles").unwrap_or(0);
    let z_idx = tiles_idx + 1;
    let x_idx = tiles_idx + 2;
    let y_idx = tiles_idx + 3;

    if parts.len() <= y_idx {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(b"Invalid tile coordinates".to_vec())
            .unwrap();
    }

    let z: u32 = parts[z_idx]
        .parse()
        .or_else(|_| parts[parts.len() - 3].parse())
        .unwrap_or(0);
    let x: u32 = parts[x_idx]
        .parse()
        .or_else(|_| parts[parts.len() - 2].parse())
        .unwrap_or(0);
    let y: u32 = parts[y_idx]
        .parse()
        .or_else(|_| parts[parts.len() - 1].parse())
        .unwrap_or(0);

    let state = app.state::<DatabaseState>();
    let h_project_id = match state.active_project_id.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => return internal_error("Lock failed"),
    };

    let project_id = match h_project_id {
        Some(id) => id,
        None => {
            log::warn!("[TileProtocol] No active project for tile request: {}", uri);
            return not_found("No active project");
        }
    };

    let db_path = match state.active_dmp_path.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => None,
    }
    .unwrap_or_default();

    if db_path.to_string_lossy().is_empty() {
        log::warn!(
            "[TileProtocol] Database path is empty for project {}",
            project_id
        );
        return not_found("Database not loaded");
    }

    let conn_guard_arc: Option<Arc<Mutex<Connection>>> = state
        .connection_pool
        .get(&db_path)
        .map(|r| r.value().clone());

    let conn_arc = match conn_guard_arc {
        Some(c) => c,
        None => return internal_error("Connection not found"),
    };

    let conn = match conn_arc.lock() {
        Ok(c) => c,
        Err(_) => return internal_error("DB Lock failed"),
    };

    // v72.1: Performance Optimization - BBOX Filtering
    let n = 2.0_f64.powi(z as i32);
    let lon_min = x as f64 / n * 360.0 - 180.0;
    let lon_max = (x + 1) as f64 / n * 360.0 - 180.0;
    let lat_min_rad = (std::f64::consts::PI * (1.0 - 2.0 * (y + 1) as f64 / n))
        .sinh()
        .atan();
    let lat_min = lat_min_rad.to_degrees();
    let lat_max_rad = (std::f64::consts::PI * (1.0 - 2.0 * y as f64 / n))
        .sinh()
        .atan();
    let lat_max = lat_max_rad.to_degrees();

    // Padding (buffer) for labels/overflow
    let buffer = 0.0001; // Approx 10m

    let mut stmt = match conn.prepare(
        "SELECT id, geometry_wkb, properties_json, name, geom_type 
         FROM features 
         WHERE project_id = ?1 
           AND geometry_wkb IS NOT NULL
           AND is_visible = 1
           AND NOT (max_x < ?2 OR min_x > ?3 OR max_y < ?4 OR min_y > ?5)",
    ) {
        Ok(s) => s,
        Err(e) => return internal_error(&e.to_string()),
    };

    // Create MVT structure using Tile and Layer
    let mut mvt_tile = Tile::default();
    let mut mvt_layer = tile::Layer {
        name: "design_features".to_string(),
        version: 2,
        extent: Some(4096),
        ..Default::default()
    };

    let rows = stmt.query_map(
        params![
            project_id,
            lon_min - buffer,
            lon_max + buffer,
            lat_min - buffer,
            lat_max + buffer
        ],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
            ))
        },
    );

    if let Ok(it) = rows {
        for row_result in it {
            if let Ok((id, wkb_data, props, name, _geom_type)) = row_result {
                let reader = Wkb(wkb_data);

                // v72.2: Coordinate Transform to Tile Space (0-4096)
                // Use a simple transformer to map WGS84 to tile-relative coordinates
                struct TileTransform {
                    lon_min: f64,
                    lon_range: f64,
                    lat_max_merc: f64,
                    lat_range_merc: f64,
                    extent: f64,
                }

                impl TileTransform {
                    fn lat_to_mercator(lat: f64) -> f64 {
                        lat.to_radians().tan().asinh()
                    }

                    fn transform(&self, x: f64, y: f64) -> (f64, f64) {
                        let tx = (x - self.lon_min) / self.lon_range * self.extent;
                        let my = Self::lat_to_mercator(y);
                        let ty = (self.lat_max_merc - my) / self.lat_range_merc * self.extent;
                        (tx, ty)
                    }
                }

                let trans = TileTransform {
                    lon_min,
                    lon_range: lon_max - lon_min,
                    lat_max_merc: TileTransform::lat_to_mercator(lat_max),
                    lat_range_merc: TileTransform::lat_to_mercator(lat_max)
                        - TileTransform::lat_to_mercator(lat_min),
                    extent: 4096.0,
                };

                // We need to inject the transformation into the MVT encoding process.
                // Since MvtWriter is a GeomProcessor, we can wrap it or just transform beforehand
                // if we have simple geozero access. For now, let's transform the WKB or use a proxy.

                let mut mw = MvtWriter::default();

                // Simple strategy: MVT needs integer coordinates.
                // We'll use a custom processor to scale and then pass to MvtWriter.
                struct GeoTransformer<'a> {
                    inner: &'a mut MvtWriter,
                    trans: &'a TileTransform,
                }

                impl<'a> geozero::GeomProcessor for GeoTransformer<'a> {
                    fn xy(&mut self, x: f64, y: f64, idx: usize) -> geozero::error::Result<()> {
                        let (tx, ty) = self.trans.transform(x, y);
                        self.inner.xy(tx, ty, idx)
                    }
                    fn point_begin(&mut self, idx: usize) -> geozero::error::Result<()> {
                        self.inner.point_begin(idx)
                    }
                    fn point_end(&mut self, idx: usize) -> geozero::error::Result<()> {
                        self.inner.point_end(idx)
                    }
                    fn linestring_begin(
                        &mut self,
                        tagged: bool,
                        size: usize,
                        idx: usize,
                    ) -> geozero::error::Result<()> {
                        self.inner.linestring_begin(tagged, size, idx)
                    }
                    fn linestring_end(
                        &mut self,
                        tagged: bool,
                        idx: usize,
                    ) -> geozero::error::Result<()> {
                        self.inner.linestring_end(tagged, idx)
                    }
                    fn multilinestring_begin(
                        &mut self,
                        size: usize,
                        idx: usize,
                    ) -> geozero::error::Result<()> {
                        self.inner.multilinestring_begin(size, idx)
                    }
                    fn multilinestring_end(&mut self, idx: usize) -> geozero::error::Result<()> {
                        self.inner.multilinestring_end(idx)
                    }
                    fn polygon_begin(
                        &mut self,
                        tagged: bool,
                        size: usize,
                        idx: usize,
                    ) -> geozero::error::Result<()> {
                        self.inner.polygon_begin(tagged, size, idx)
                    }
                    fn polygon_end(
                        &mut self,
                        tagged: bool,
                        idx: usize,
                    ) -> geozero::error::Result<()> {
                        self.inner.polygon_end(tagged, idx)
                    }
                    fn multipolygon_begin(
                        &mut self,
                        size: usize,
                        idx: usize,
                    ) -> geozero::error::Result<()> {
                        self.inner.multipolygon_begin(size, idx)
                    }
                    fn multipolygon_end(&mut self, idx: usize) -> geozero::error::Result<()> {
                        self.inner.multipolygon_end(idx)
                    }
                }

                let mut gt = GeoTransformer {
                    inner: &mut mw,
                    trans: &trans,
                };

                if let Err(e) = reader.process_geom(&mut gt) {
                    error!("MVT geometry encoding error: {}", e);
                    continue;
                }

                let mut feature = mw.geometry().clone();

                // Add Metadata: ID (v72.2)
                // Use hash for numerical ID if it's a UUID string
                if let Ok(num_id) = id.parse::<u64>() {
                    feature.id = Some(num_id);
                }

                // Add Name and ID to tags for display
                add_tag(&mut mvt_layer, &mut feature, "id", &id);
                if let Some(n) = name {
                    add_tag(&mut mvt_layer, &mut feature, "name", &n);
                }

                // Add properties from JSON
                if let Ok(json_props) = serde_json::from_str::<serde_json::Value>(&props) {
                    if let Some(obj) = json_props.as_object() {
                        for (key, val) in obj {
                            let val_str = match val {
                                serde_json::Value::String(s) => s.clone(),
                                _ => val.to_string(),
                            };
                            add_tag(&mut mvt_layer, &mut feature, key, &val_str);
                        }
                    }
                }

                mvt_layer.features.push(feature);
            }
        }
    }

    mvt_tile.layers.push(mvt_layer);

    // Encode Tile to bytes via prost::Message trait
    let mvt_data = mvt_tile.encode_to_vec();

    Response::builder()
        .header("Content-Type", "application/x-protobuf")
        .header("Access-Control-Allow-Origin", "*")
        .status(StatusCode::OK)
        .body(mvt_data)
        .unwrap()
}

fn add_tag(layer: &mut tile::Layer, feature: &mut tile::Feature, key: &str, value: &str) {
    let key_idx = if let Some(pos) = layer.keys.iter().position(|k| k == key) {
        pos as u32
    } else {
        layer.keys.push(key.to_string());
        (layer.keys.len() - 1) as u32
    };

    let val_idx = if let Some(pos) = layer
        .values
        .iter()
        .position(|v| v.string_value.as_ref() == Some(&value.to_string()))
    {
        pos as u32
    } else {
        layer.values.push(tile::Value {
            string_value: Some(value.to_string()),
            ..Default::default()
        });
        (layer.values.len() - 1) as u32
    };

    feature.tags.push(key_idx);
    feature.tags.push(val_idx);
}

fn internal_error(msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::INTERNAL_SERVER_ERROR)
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

fn not_found(msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

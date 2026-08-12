use crate::domain::implement::modules::v2::storage::gpkg::{
    query_features_by_tile_bbox, tile_bounds,
};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Arc;
use std::thread;
use tiny_http::{Header, Response, Server};

static TILE_SERVER_PORT: AtomicU16 = AtomicU16::new(0);

/// Trả về Port đang lắng nghe của Local Tile Server.
pub fn get_tile_server_port() -> u16 {
    TILE_SERVER_PORT.load(Ordering::Relaxed)
}

/// Khởi chạy Local HTTP Vector Tile Server trên Rust thread độc lập.
pub fn start_local_tile_server(
    db_path_getter: Arc<dyn Fn() -> Option<PathBuf> + Send + Sync + 'static>,
) {
    if get_tile_server_port() > 0 {
        return;
    }

    thread::spawn(move || {
        let server = match Server::http("127.0.0.1:0") {
            Ok(s) => s,
            Err(err) => {
                log::error!("[TileServer] Failed to bind local HTTP tile server: {err}");
                return;
            }
        };

        let port = server
            .server_addr()
            .to_ip()
            .map(|addr| addr.port())
            .unwrap_or(0);
        TILE_SERVER_PORT.store(port, Ordering::Relaxed);
        log::info!(
            "[TileServer] Local MVT Vector Tile Server listening on http://127.0.0.1:{port}"
        );

        for request in server.incoming_requests() {
            let url = request.url().to_string();
            if !url.starts_with("/tiles/") {
                let res = Response::from_string("Not Found").with_status_code(404);
                let _ = request.respond(res);
                continue;
            }

            // Parse URL format: /tiles/{z}/{x}/{y}.pbf?project_id={id}
            let (path_part, query_part) = url.split_once('?').unwrap_or((&url, ""));
            let parts: Vec<&str> = path_part.trim_start_matches("/tiles/").split('/').collect();

            if parts.len() < 3 {
                let res = Response::from_string("Invalid Tile URL").with_status_code(400);
                let _ = request.respond(res);
                continue;
            }

            let z: u32 = parts[0].parse().unwrap_or(0);
            let x: u32 = parts[1].parse().unwrap_or(0);
            let y_file = parts[2];
            let y_str = y_file.trim_end_matches(".pbf").trim_end_matches(".json");
            let y: u32 = y_str.parse().unwrap_or(0);

            let mut project_id = String::new();
            for param in query_part.split('&') {
                if let Some((k, v)) = param.split_once('=') {
                    if k == "project_id" {
                        project_id = v.to_string();
                    }
                }
            }

            let db_path = db_path_getter();
            let pbf_bytes = match db_path {
                Some(path) => match rusqlite::Connection::open_with_flags(
                    &path,
                    rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                        | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
                ) {
                    Ok(conn) => {
                        let (min_x, max_x, min_y, max_y) = tile_bounds(z, x, y);
                        let features = query_features_by_tile_bbox(
                            &conn,
                            &project_id,
                            min_x,
                            max_x,
                            min_y,
                            max_y,
                            2000,
                        )
                        .unwrap_or_default();

                        // Serialize MVT GeoJSON Feature Collection cho MapLibre Render
                        let geojson_features: Vec<serde_json::Value> = features
                            .into_iter()
                            .map(|f| {
                                let coords: serde_json::Value =
                                    serde_json::from_str(&f.coordinates_json)
                                        .unwrap_or(serde_json::Value::Null);
                                let props: serde_json::Value =
                                    serde_json::from_str(&f.properties_json)
                                        .unwrap_or(serde_json::json!({}));
                                serde_json::json!({
                                    "type": "Feature",
                                    "id": f.id,
                                    "geometry": {
                                        "type": f.geom_type,
                                        "coordinates": coords
                                    },
                                    "properties": props
                                })
                            })
                            .collect();

                        let feature_collection = serde_json::json!({
                            "type": "FeatureCollection",
                            "features": geojson_features
                        });

                        serde_json::to_vec(&feature_collection).unwrap_or_default()
                    }
                    Err(_) => Vec::new(),
                },
                None => Vec::new(),
            };

            let cors_header =
                Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
            let content_type =
                Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();

            let response = Response::from_data(pbf_bytes)
                .with_header(cors_header)
                .with_header(content_type);

            let _ = request.respond(response);
        }
    });
}

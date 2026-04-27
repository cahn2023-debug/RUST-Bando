use app_domain::{CameraSpecs, DoriZone, Point, StreetViewMetadata};
use module_gis::GisService;
use serde_json::json;
use std::sync::Arc;

#[tauri::command]
pub async fn get_streetview_metadata(
    lat: f64,
    lng: f64,
    api_key: String,
) -> Result<StreetViewMetadata, String> {
    let url = format!(
        "https://maps.googleapis.com/maps/api/streetview/metadata?location={},{}&key={}",
        lat, lng, api_key
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let metadata: StreetViewMetadata = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(metadata)
}

#[tauri::command]
pub fn sign_streetview_url(url_to_sign: String, secret: String) -> Result<String, String> {
    GisService::sign_streetview_url(url_to_sign, secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_camera_dori_zones(
    center: Point,
    heading: f64,
    fov: f64,
    mut specs: CameraSpecs,
) -> Vec<DoriZone> {
    if specs.install_height == 0.0 {
        specs.install_height = 5.0;
    }
    if specs.target_height == 0.0 {
        specs.target_height = 1.7;
    }
    if specs.resolution_height == 0.0 {
        specs.resolution_height = 1080.0;
    }

    let distances = GisService::calculate_dori_distances(&specs);

    vec![
        DoriZone {
            level: "Identify".to_string(),
            points: GisService::generate_dori_sector(
                center.clone(),
                heading,
                fov,
                distances.identify,
                20,
            ),
        },
        DoriZone {
            level: "Recognize".to_string(),
            points: GisService::generate_dori_sector(
                center.clone(),
                heading,
                fov,
                distances.recognize,
                20,
            ),
        },
        DoriZone {
            level: "Observe".to_string(),
            points: GisService::generate_dori_sector(
                center.clone(),
                heading,
                fov,
                distances.observe,
                20,
            ),
        },
        DoriZone {
            level: "Detect".to_string(),
            points: GisService::generate_dori_sector(center, heading, fov, distances.detect, 20),
        },
    ]
}

#[tauri::command]
pub async fn get_project_dori_zones(
    state: tauri::State<'_, Arc<crate::design::design_events::MapState>>,
) -> Result<Vec<DoriZone>, String> {
    let mut all_zones = Vec::new();

    for feature in state.features.iter() {
        let props = &feature.properties;
        let is_camera = props.get("iconKey").and_then(|v| v.as_str()) == Some("cctv")
            || feature.metadata.contains("\"type\":\"camera\"");

        if !is_camera {
            continue;
        }

        let coords = feature.coordinates.as_array().ok_or("No coords")?;
        if coords.len() < 2 {
            continue;
        }

        let center = Point {
            x: coords[0].as_f64().unwrap_or(0.0) as f32,
            y: coords[1].as_f64().unwrap_or(0.0) as f32,
        };

        let meta_str = &feature.metadata;
        let meta: serde_json::Value = serde_json::from_str(meta_str).unwrap_or_else(|_| json!({}));

        let rotation = meta.get("gis.rotation").and_then(|v| v.as_f64())
            .or_else(|| meta.get("rotation").and_then(|v| v.as_f64()))
            .unwrap_or(0.0);

        let heading = GisService::map_rotation_to_heading(rotation);

        let focal_length = meta.get("specs.focal_length").and_then(|v| v.as_f64())
            .or_else(|| meta.get("focal_length").and_then(|v| v.as_f64()))
            .unwrap_or(3.6) as f32;

        let sensor_size = meta.get("specs.sensor_size").and_then(|v| v.as_str())
            .or_else(|| meta.get("sensorSize").and_then(|v| v.as_str()))
            .unwrap_or("1/3\"");

        let res_x = meta.get("specs.resolution_x").and_then(|v| v.as_i64())
            .or_else(|| meta.get("resolutionX").and_then(|v| v.as_i64()))
            .unwrap_or(1920) as f32;

        let res_y = meta.get("specs.resolution_y").and_then(|v| v.as_i64())
            .or_else(|| meta.get("resolutionY").and_then(|v| v.as_i64()))
            .unwrap_or(1080) as f32;

        let install_height = meta.get("specs.install_height").and_then(|v| v.as_f64())
            .or_else(|| meta.get("installHeight").and_then(|v| v.as_f64()))
            .unwrap_or(5.0) as f32;

        let target_height = meta.get("specs.target_height").and_then(|v| v.as_f64())
            .or_else(|| meta.get("targetHeight").and_then(|v| v.as_f64()))
            .unwrap_or(1.7) as f32;

        let sensor_width = match sensor_size {
            "1/2.7\"" => 5.37,
            "1/2.8\"" => 4.59,
            "1/3\"" => 4.80,
            "1/4\"" => 3.20,
            _ => 4.80,
        } as f32;

        let specs = CameraSpecs {
            resolution_width: res_x,
            resolution_height: res_y,
            focal_length,
            sensor_width,
            install_height,
            target_height,
        };

        let distances = GisService::calculate_dori_distances(&specs);
        let hfov = distances.hfov;

        all_zones.push(DoriZone {
            level: "Identify".to_string(),
            points: GisService::generate_dori_sector(center.clone(), heading, hfov, distances.identify, 12),
        });
        all_zones.push(DoriZone {
            level: "Recognize".to_string(),
            points: GisService::generate_dori_sector(center.clone(), heading, hfov, distances.recognize, 12),
        });
        all_zones.push(DoriZone {
            level: "Observe".to_string(),
            points: GisService::generate_dori_sector(center.clone(), heading, hfov, distances.observe, 12),
        });
        all_zones.push(DoriZone {
            level: "Detect".to_string(),
            points: GisService::generate_dori_sector(center, heading, hfov, distances.detect, 12),
        });
    }

    Ok(all_zones)
}

#[tauri::command]
pub fn navigate_webview(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview_window(&label) {
        let parsed_url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
        webview.navigate(parsed_url).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Webview not found: {}", label))
    }
}

#[tauri::command]
pub fn eval_webview(app: tauri::AppHandle, label: String, script: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview_window(&label) {
        webview.eval(&script).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Webview not found: {}", label))
    }
}

#[tauri::command]
pub fn get_webview_url(app: tauri::AppHandle, label: String) -> Result<String, String> {
    use tauri::Manager;
    if let Some(webview) = app.get_webview_window(&label) {
        webview
            .url()
            .map(|u| u.to_string())
            .map_err(|e| e.to_string())
    } else {
        Err(format!("Webview not found: {}", label))
    }
}

#[tauri::command]
pub async fn set_drawing_mode(
    state: tauri::State<'_, std::sync::Mutex<crate::design::design_events::MapState>>,
    _mode: String,
) -> Result<(), String> {
    let _s = state.lock().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn calculate_ppm(
    specs: CameraSpecs,
    distance: f64,
) -> f64 {
    GisService::calculate_ppm(&specs, distance)
}

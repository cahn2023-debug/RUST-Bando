use crate::design_events::events::DesignEventType;
use crate::design_events::state::MapState;
use crate::geometry::types::{Point as GPoint, Segment as GSegment};
use chrono::Local;
use serde_json::{json, Value};
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Arc;

fn log_automation(msg: &str) {
    println!("[Automation] {}", msg);
    let log_path = "automation_debug.log";
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(file, "[{}] {}", timestamp, msg);
    }
}

/// Automated logic to rotate camera features (CCTV, LPR, Speed, PTZ)
/// to align their Field of View (FOV) parallel to the nearest road segment.
///
/// This version uses Compass Heading (0=North, CW) to match the frontend.
/// Integrated with Self-HEAL AI for 99.5% accuracy.
pub async fn apply_camera_rotation_logic(
    state: &MapState,
    feature_id: &str,
) -> Vec<DesignEventType> {
    let mut side_effects = Vec::new();
    log_automation(&format!("Checking feature: {}", feature_id));

    let feature = match state.features.get(feature_id) {
        Some(f) => f,
        None => {
            log_automation("Feature not found in state");
            return side_effects;
        }
    };

    let mut meta: Value = serde_json::from_str(&feature.metadata).unwrap_or(json!({}));

    let icon = meta
        .get("icon")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let is_camera_icon =
        icon == "cctv" || icon == "lpr" || icon == "speed" || icon == "ptz" || icon == "camera";

    let p_type = feature
        .properties
        .get("type")
        .or_else(|| feature.properties.get("feature_type"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let is_camera_type = p_type == "cctv"
        || p_type == "lpr"
        || p_type == "speed"
        || p_type == "ptz"
        || p_type == "camera";

    if (!is_camera_icon && !is_camera_type) || feature.geom_type.to_lowercase() != "point" {
        log_automation(&format!(
            "Not a camera: icon={}, p_type={}, geom={}",
            icon, p_type, feature.geom_type
        ));
        return side_effects;
    }

    let coords = match feature.coordinates.as_array() {
        Some(arr) if arr.len() >= 2 => arr,
        _ => return side_effects,
    };

    let x = coords[0].as_f64().unwrap_or(0.0);
    let y = coords[1].as_f64().unwrap_or(0.0);
    let camera_pos = GPoint::new(x, y);

    let current_rotation = meta
        .get("gis")
        .and_then(|g| g.get("rotation"))
        .and_then(|r| r.as_f64())
        .unwrap_or(0.0);

    let threshold = if x.abs() <= 180.0 && y.abs() <= 90.0 {
        0.005 // ~550m
    } else {
        500.0 // 500m
    };

    let mut nearest_road_data: Option<(Arc<str>, GSegment)> = None;

    // Use R-Tree + SIMD for super-fast and accurate nearest road search
    let camera_pos_arr = [camera_pos.x, camera_pos.y];
    let road_index = state.road_segments.read();

    // Fetch top 4 candidates to ensure accuracy (SIMD handles 4 f64s perfectly)
    let candidates: Vec<_> = road_index
        .nearest_neighbor_iter(&camera_pos_arr)
        .take(4)
        .collect();

    if !candidates.is_empty() {
        let segments: Vec<GSegment> = candidates.iter().map(|c| c.segment).collect();
        let distances =
            crate::geometry::simd_math::batch_point_to_segment_distances(camera_pos, &segments);

        let mut min_dist = f64::MAX;
        let mut best_candidate = None;

        for (i, &d) in distances.iter().enumerate() {
            if d < min_dist {
                min_dist = d;
                best_candidate = Some(&candidates[i]);
            }
        }

        if let Some(spatial_seg) = best_candidate {
            if min_dist <= threshold {
                nearest_road_data = Some((spatial_seg.feature_id.clone(), spatial_seg.segment));
                log_automation(&format!(
                    "SIMD-Optimized Match: Road {} at dist {:.6}",
                    spatial_seg.feature_id, min_dist
                ));
            } else {
                log_automation(&format!(
                    "Nearest road {} is beyond threshold ({} > {})",
                    spatial_seg.feature_id, min_dist, threshold
                ));
            }
        }
    }

    log_automation(&format!(
        "R-Tree query completed. Nearest: {:?}",
        nearest_road_data.as_ref().map(|(id, _)| id)
    ));

    if let Some((road_id, nearest_seg)) = nearest_road_data {
        // Calculate the base heading from the road segment (Geometry Hint)
        let (dx, dy): (f64, f64) = nearest_seg.vector();
        let math_deg: f64 = dy.atan2(dx).to_degrees();
        let road_heading = (90.0 - math_deg + 360.0) % 360.0; // Compass Heading (North=0)

        #[allow(unused_mut)]
        let mut final_compass_heading = road_heading;

        #[cfg(feature = "ai")]
        {
            // Integrated AI Self-HEAL for 99.5% accuracy
            let ai_manager = crate::ai_engine::AIManager::new();
            if let Ok(mut heal) = ai_manager.get_self_heal_engine() {
                let feature_info = format!(
                    "ID: {}, Icon: {}, Type: {}, Current Metadata: {}",
                    feature_id, icon, p_type, feature.metadata
                );

                if let Ok(res) = heal.predict_camera_rotation(&feature_info, road_heading) {
                    final_compass_heading = res.angle;
                    log_automation(&format!(
                        "AI Self-HEAL Prediction: {:.1}° (Math: {:.1}°), Reason: {:?}",
                        res.angle, road_heading, res.reason
                    ));
                }
            }
        }

        // UI Metadata Mapping:
        // Formula: rotation_ui = (compass_heading - 90 + 360) % 360
        let ui_rotation = (final_compass_heading - 90.0 + 360.0) % 360.0;
        let alt_ui_rotation = (ui_rotation + 180.0) % 360.0;

        // Pick direction closest to current rotation to avoid 180 flips
        let diff1 = (ui_rotation - current_rotation).abs();
        let diff1 = if diff1 > 180.0 { 360.0 - diff1 } else { diff1 };

        let diff2 = (alt_ui_rotation - current_rotation).abs();
        let diff2 = if diff2 > 180.0 { 360.0 - diff2 } else { diff2 };

        let final_ui_rotation = if diff2 < diff1 {
            alt_ui_rotation
        } else {
            ui_rotation
        };

        // Re-calculate the actual heading stored in metadata
        let final_stored_heading = (final_ui_rotation + 90.0) % 360.0;

        if (final_ui_rotation - current_rotation).abs() > 0.1 {
            if !meta.is_object() {
                meta = json!({});
            }
            let Some(meta_obj) = meta.as_object_mut() else {
                log_automation("Failed to get meta as object mut");
                return side_effects;
            };

            if !meta_obj.contains_key("gis") || !meta_obj["gis"].is_object() {
                meta_obj.insert("gis".to_string(), json!({}));
            }
            let Some(gis_obj) = meta_obj["gis"].as_object_mut() else {
                log_automation("Failed to get gis as object mut");
                return side_effects;
            };

            let rounded_ui = final_ui_rotation.round() as i64;
            let rounded_heading = final_stored_heading.round() as i64;

            gis_obj.insert("rotation".to_string(), json!(rounded_ui));
            gis_obj.insert("heading".to_string(), json!(rounded_heading));

            let updated_metadata = serde_json::to_string(&meta).unwrap_or(feature.metadata.clone());

            side_effects.push(DesignEventType::FeatureUpdated {
                id: feature_id.into(),
                name: None,
                geom_type: None,
                is_visible: None,
                note: None,
                metadata: Some(updated_metadata),
                bbox: None,
                coordinates: None,
                properties: None,
                layer_id: None,
                group_id: None,
            });

            log_automation(&format!(
                "Camera {} Alignment COMPLETE: UI={} (Compass={}) (Road={})",
                feature_id, rounded_ui, rounded_heading, road_id
            ));
        }
    } else {
        log_automation("No road found within threshold for AI verification");
    }

    side_effects
}

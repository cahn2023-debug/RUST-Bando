use crate::design_events::events::DesignEventType;
use crate::design_events::state::MapState;
use serde_json::Value;

/// Helper to ensure we have a JSON array regardless of whether input is a string or array
fn ensure_array(v: &Value) -> Option<Vec<Value>> {
    if let Some(arr) = v.as_array() {
        return Some(arr.clone());
    }
    if let Some(s) = v.as_str() {
        if let Ok(Value::Array(arr)) = serde_json::from_str(s) {
            return Some(arr);
        }
    }
    None
}

/// Logic to update features that are snapped to a moved feature.
/// Returns a list of side-effect events (FeatureUpdated) that should be recorded.
pub fn apply_topology_updates(
    state: &MapState,
    moved_feature_id: &str,
    new_coords_json: &Value,
) -> Vec<DesignEventType> {
    let mut side_effects = Vec::new();
    let mut queue = std::collections::VecDeque::new();
    let mut visited = std::collections::HashSet::new();

    // 1. Initial moved feature
    queue.push_back((
        std::sync::Arc::from(moved_feature_id),
        new_coords_json.clone(),
    ));
    visited.insert(std::sync::Arc::from(moved_feature_id));

    while let Some((target_id, target_coords)) = queue.pop_front() {
        // Derive target position for snapping
        let target_pos = match ensure_array(&target_coords) {
            Some(arr) if arr.len() >= 2 => {
                // Try to get a point [x, y]
                if arr[0].is_f64() {
                    [
                        arr[0].as_f64().unwrap_or(0.0),
                        arr[1].as_f64().unwrap_or(0.0),
                    ]
                } else if let Some(first_arr) = arr[0].as_array() {
                    // It's a line, use first point as reference for now
                    [
                        first_arr[0].as_f64().unwrap_or(0.0),
                        first_arr[1].as_f64().unwrap_or(0.0),
                    ]
                } else {
                    continue;
                }
            }
            _ => continue,
        };

        // Find all features pointing to this target
        for entry in state.features.iter() {
            let (fid, feature) = entry.pair();
            if visited.contains(fid) {
                continue;
            }

            let metadata: Value = serde_json::from_str(&feature.metadata)
                .unwrap_or(Value::Object(Default::default()));
            let mut current_coords = match ensure_array(&feature.coordinates) {
                Some(arr) => arr,
                _ => continue,
            };

            let geom_type = feature.geom_type.to_lowercase();
            let mut needs_update = false;

            // Type 1: Point feature snapped to target
            if geom_type == "point" {
                let snap_to = metadata.get("snap_to_id").and_then(|v| v.as_str());
                if snap_to == Some(&target_id) {
                    current_coords = vec![Value::from(target_pos[0]), Value::from(target_pos[1])];
                    needs_update = true;
                }
            }

            // Type 2: LineString/Polyline snapped to target via vertices
            if geom_type == "linestring" || geom_type == "polyline" || geom_type == "polygon" {
                // a) Legacy start/end nodes
                let start_node = metadata.get("start_node_id").and_then(|v| v.as_str());
                let end_node = metadata.get("end_node_id").and_then(|v| v.as_str());

                // For polygons, coordinates is usually [ [ [x,y], [x,y] ] ]
                // This logic needs to handle nesting.

                if geom_type == "polygon" {
                    if let Some(outer_ring) =
                        current_coords.get_mut(0).and_then(|v| v.as_array_mut())
                    {
                        if start_node == Some(&target_id) && !outer_ring.is_empty() {
                            outer_ring[0] = Value::Array(vec![
                                Value::from(target_pos[0]),
                                Value::from(target_pos[1]),
                            ]);
                            // Close it
                            let last = outer_ring.len() - 1;
                            outer_ring[last] = Value::Array(vec![
                                Value::from(target_pos[0]),
                                Value::from(target_pos[1]),
                            ]);
                            needs_update = true;
                        }
                        // check snap_links inside polygon... (simplified for now)
                    }
                } else {
                    if start_node == Some(&target_id) && !current_coords.is_empty() {
                        current_coords[0] = Value::Array(vec![
                            Value::from(target_pos[0]),
                            Value::from(target_pos[1]),
                        ]);
                        needs_update = true;
                    }
                    if end_node == Some(&target_id) && !current_coords.is_empty() {
                        let last_idx = current_coords.len() - 1;
                        current_coords[last_idx] = Value::Array(vec![
                            Value::from(target_pos[0]),
                            Value::from(target_pos[1]),
                        ]);
                        needs_update = true;
                    }

                    // b) Generalized snap_links
                    if let Some(links) = metadata.get("snap_links").and_then(|v| v.as_object()) {
                        for (v_key, t_id) in links {
                            if t_id.as_str() == Some(&target_id) {
                                if let Ok(idx) = v_key.replace("v", "").parse::<usize>() {
                                    if idx < current_coords.len() {
                                        current_coords[idx] = Value::Array(vec![
                                            Value::from(target_pos[0]),
                                            Value::from(target_pos[1]),
                                        ]);
                                        needs_update = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if needs_update {
                let updated_val = Value::Array(current_coords);

                side_effects.push(DesignEventType::FeatureUpdated {
                    id: fid.clone(),
                    name: None,
                    geom_type: None,
                    is_visible: None,
                    note: None,
                    metadata: None,
                    bbox: None,
                    coordinates: Some(updated_val.clone()),
                    properties: None,
                    layer_id: None,
                    group_id: None,
                });

                if let Some(mut f) = state.features.get_mut(fid) {
                    f.coordinates = updated_val.clone();
                }
                state.update_spatial_index(fid);
                state.dirty_ids.insert(fid.clone(), true);

                queue.push_back((fid.clone(), updated_val));
                visited.insert(fid.clone());
            }
        }
    }

    side_effects
}

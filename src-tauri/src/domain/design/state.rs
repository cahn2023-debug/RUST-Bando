use super::events::DesignEvent;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorldState {
    pub project_id: String,
    pub regions: HashMap<String, Value>,
    pub layers: HashMap<String, Value>,
    pub features: HashMap<String, Value>,
}

impl WorldState {
    pub fn new(project_id: String) -> Self {
        Self {
            project_id,
            ..Default::default()
        }
    }

    pub fn apply_event(&mut self, event: DesignEvent) {
        match event {
            DesignEvent::AddFeature {
                id,
                layer_id,
                name,
                geom_type,
                coordinates,
                properties,
                metadata,
            } => {
                let feature = serde_json::json!({
                    "id": id.clone(),
                    "layer_id": layer_id,
                    "name": name,
                    "geom_type": geom_type,
                    "coordinates": coordinates,
                    "properties": properties,
                    "metadata": metadata,
                });
                self.features.insert(id, feature);
            }
            DesignEvent::UpdateFeature {
                id,
                name,
                coordinates,
                properties,
                metadata,
            } => {
                if let Some(feature) = self.features.get_mut(&id) {
                    if let Some(n) = name {
                        feature["name"] = serde_json::json!(n);
                    }
                    if let Some(c) = coordinates {
                        feature["coordinates"] = c;
                    }
                    if let Some(p) = properties {
                        feature["properties"] = p;
                    }
                    if let Some(m) = metadata {
                        feature["metadata"] = m;
                    }
                }
            }
            DesignEvent::DeleteFeature { id } => {
                self.features.remove(&id);
            }
            DesignEvent::MoveFeature { id, dx, dy } => {
                if let Some(feature) = self.features.get_mut(&id) {
                    if let Some(coords) = feature["coordinates"].as_array_mut() {
                        // Giả sử tọa độ là [lng, lat]
                        if coords.len() >= 2 {
                            if let (Some(x), Some(y)) = (coords[0].as_f64(), coords[1].as_f64()) {
                                coords[0] = serde_json::json!(x + dx);
                                coords[1] = serde_json::json!(y + dy);
                            }
                        }
                    }
                }
            }
            DesignEvent::CreateLayer {
                id,
                region_id,
                name,
            } => {
                let layer = serde_json::json!({
                    "id": id.clone(),
                    "region_id": region_id,
                    "name": name,
                    "is_visible": true,
                });
                self.layers.insert(id, layer);
            }
            DesignEvent::UpdateLayer {
                id,
                name,
                is_visible,
            } => {
                if let Some(layer) = self.layers.get_mut(&id) {
                    if let Some(n) = name {
                        layer["name"] = serde_json::json!(n);
                    }
                    if let Some(v) = is_visible {
                        layer["is_visible"] = serde_json::json!(v);
                    }
                }
            }
            DesignEvent::DeleteLayer { id } => {
                self.layers.remove(&id);
            }
            DesignEvent::CreateRegion { id, name } => {
                let region = serde_json::json!({
                    "id": id.clone(),
                    "name": name,
                });
                self.regions.insert(id, region);
            }
            DesignEvent::UpdateRegion { id, name } => {
                if let Some(region) = self.regions.get_mut(&id) {
                    if let Some(n) = name {
                        region["name"] = serde_json::json!(n);
                    }
                }
            }
        }
    }
}

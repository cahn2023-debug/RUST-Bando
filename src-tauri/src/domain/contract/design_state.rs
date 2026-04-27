use geo;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum DesignEventType {
    // --- Region Events ---
    RegionCreated {
        id: Arc<str>,
        parent_id: Option<Arc<str>>,
        name: String,
    },
    RegionUpdated {
        id: Arc<str>,
        name: String,
        description: Option<String>,
    },
    RegionDeleted {
        id: Arc<str>,
    },
    RegionMoved {
        id: Arc<str>,
        new_parent_id: Option<Arc<str>>,
    },

    // --- Layer Events ---
    LayerCreated {
        id: Arc<str>,
        region_id: Arc<str>,
        name: String,
    },
    LayerUpdated {
        id: Arc<str>,
        name: String,
        is_visible: bool,
    },
    LayerDeleted {
        id: Arc<str>,
    },
    LayerMoved {
        id: Arc<str>,
        new_region_id: Arc<str>,
    },

    // --- Feature Group Events ---
    FeatureGroupCreated {
        id: Arc<str>,
        layer_id: Arc<str>,
        parent_id: Option<Arc<str>>,
        name: String,
        group_type: String,
        #[serde(default = "default_true")]
        is_visible: bool,
        metadata: Option<String>,
    },
    FeatureGroupUpdated {
        id: Arc<str>,
        name: Option<String>,
        is_visible: Option<bool>,
        metadata: Option<String>,
        layer_id: Option<Arc<str>>,
        parent_id: Option<Option<Arc<str>>>,
    },
    FeatureGroupDeleted {
        id: Arc<str>,
    },

    // --- Feature Events ---
    FeatureCreated {
        id: Arc<str>,
        #[serde(default)]
        layer_id: Arc<str>,
        group_id: Option<Arc<str>>,
        name: String,
        geom_type: String,
        #[serde(default)]
        is_visible: bool,
        #[serde(default)]
        note: String,
        #[serde(default)]
        metadata: String,
        bbox: Option<super::spatial_models::BBox>,
        coordinates: Value,
        properties: Value,
    },
    FeatureUpdated {
        id: Arc<str>,
        name: Option<String>,
        geom_type: Option<String>,
        is_visible: Option<bool>,
        note: Option<String>,
        metadata: Option<String>,
        bbox: Option<super::spatial_models::BBox>,
        coordinates: Option<Value>,
        properties: Option<Value>,
        layer_id: Option<Value>,
        group_id: Option<Option<Arc<str>>>,
    },
    FeatureDeleted {
        id: Arc<str>,
    },
    SettingsUpdated {
        settings: Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignEvent {
    pub event_id: String,
    pub project_id: String,
    pub event_type: String,
    pub payload_json: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignActionResponse {
    pub success: bool,
    pub event_id: String,
    pub applied_event: DesignEventType,
    pub side_effects: Vec<DesignEventType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignBulkActionResponse {
    pub success: bool,
    pub last_event_id: String,
    pub applied_events: Vec<DesignEventType>,
    pub side_effects: Vec<DesignEventType>,
}

fn default_true() -> bool {
    true
}

impl DesignEventType {
    /// Deserializes a DesignEventType from a JSON string, handling both new and legacy formats.
    pub fn robust_deserialize(json_str: &str, entity_id: Option<&str>) -> Result<Self, String> {
        // 1. Parse initial JSON
        let v: serde_json::Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;

        // 2. Extract event_type and payload
        let (mut event_type, mut payload) = if v.get("payload").is_some() && v.get("type").is_some()
        {
            (
                v["type"].as_str().unwrap_or("Unknown").to_string(),
                v["payload"].clone(),
            )
        } else {
            // Legacy V1 format or raw payload
            let t = v
                .get("type")
                .and_then(|t| t.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let mut p = v.clone();
            if let Some(obj) = p.as_object_mut() {
                obj.remove("type");
            }
            (t, p)
        };

        // 3. V1 -> V2 Data Mapping Bridge
        if let Some(obj) = payload.as_object_mut() {
            // Mapping: ProjectCreated -> RegionCreated
            if event_type == "ProjectCreated" {
                event_type = "RegionCreated".to_string();
            }

            // Mapping: geometry -> coordinates
            if obj.contains_key("geometry") && !obj.contains_key("coordinates") {
                if let Some(geom) = obj.remove("geometry") {
                    obj.insert("coordinates".to_string(), geom);
                }
            }

            // 4. Fill missing defaults for legacy events
            if event_type == "LayerCreated" && !obj.contains_key("region_id") {
                obj.insert("region_id".to_string(), serde_json::json!("root"));
            }
            if event_type == "RegionCreated" && !obj.contains_key("parent_id") {
                obj.insert("parent_id".to_string(), serde_json::Value::Null);
            }

            // Inject ID if missing from payload but provided as argument
            if !obj.contains_key("id") {
                if let Some(eid) = entity_id {
                    obj.insert("id".to_string(), serde_json::json!(eid));
                }
            }
        }

        // 5. Reconstruct for standard deserialization
        let wrapped = serde_json::json!({
            "type": event_type,
            "payload": payload
        });

        serde_json::from_value::<Self>(wrapped.clone()).map_err(|e| {
            format!(
                "Failed to parse event {}: {}. JSON: {}",
                event_type, e, wrapped
            )
        })
    }

    pub fn simplify(&mut self, epsilon: f64) {
        match self {
            DesignEventType::FeatureCreated {
                geom_type,
                coordinates,
                ..
            } => {
                if geom_type.to_lowercase() == "linestring" {
                    if let Some(coords_arr) = coordinates.as_array() {
                        let points: Vec<geo::Coord<f64>> = coords_arr
                            .iter()
                            .filter_map(|v| v.as_array())
                            .filter(|a| a.len() >= 2)
                            .map(|a| geo::Coord {
                                x: a[0].as_f64().unwrap_or(0.0),
                                y: a[1].as_f64().unwrap_or(0.0),
                            })
                            .collect();

                        if points.len() > 2 {
                            use geo::Simplify;
                            let line = geo::LineString::new(points);
                            let simplified = line.simplify(&epsilon);
                            let new_coords: Vec<Vec<f64>> =
                                simplified.into_iter().map(|c| vec![c.x, c.y]).collect();
                            *coordinates = serde_json::to_value(new_coords).unwrap_or_default();
                        }
                    }
                }
            }
            DesignEventType::FeatureUpdated {
                geom_type: Some(geom_type),
                coordinates: Some(coordinates),
                ..
            } => {
                if geom_type.to_lowercase() == "linestring" {
                    if let Some(coords_arr) = coordinates.as_array() {
                        let points: Vec<geo::Coord<f64>> = coords_arr
                            .iter()
                            .filter_map(|v| v.as_array())
                            .filter(|a| a.len() >= 2)
                            .map(|a| geo::Coord {
                                x: a[0].as_f64().unwrap_or(0.0),
                                y: a[1].as_f64().unwrap_or(0.0),
                            })
                            .collect();

                        if points.len() > 2 {
                            use geo::Simplify;
                            let line = geo::LineString::new(points);
                            let simplified = line.simplify(&epsilon);
                            let new_coords: Vec<Vec<f64>> =
                                simplified.into_iter().map(|c| vec![c.x, c.y]).collect();
                            *coordinates = serde_json::to_value(new_coords).unwrap_or_default();
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

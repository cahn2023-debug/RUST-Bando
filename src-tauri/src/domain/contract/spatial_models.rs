use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct SerializableMapState {
    pub regions: std::collections::HashMap<Arc<str>, RegionState>,
    pub layers: std::collections::HashMap<Arc<str>, LayerState>,
    pub feature_groups: std::collections::HashMap<Arc<str>, FeatureGroupState>,
    pub features: std::collections::HashMap<Arc<str>, SerializableFeatureState>,
    pub settings: serde_json::Value,
    pub last_event_id: Option<Arc<str>>,
}

/// Specialized struct for Bincode IPC transmission to Frontend.
/// Uses String (JSON) for complex fields to ensure consistent decoding in TypeScript.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BincodeMapState {
    pub regions: std::collections::HashMap<Arc<str>, RegionState>,
    pub layers: std::collections::HashMap<Arc<str>, LayerState>,
    pub feature_groups: std::collections::HashMap<Arc<str>, FeatureGroupState>,
    pub features: std::collections::HashMap<Arc<str>, SerializableFeatureState>,
    pub settings_json: String,
    pub last_event_id: Option<Arc<str>>,
}

impl From<SerializableMapState> for BincodeMapState {
    fn from(s: SerializableMapState) -> Self {
        Self {
            regions: s.regions,
            layers: s.layers,
            feature_groups: s.feature_groups,
            features: s.features,
            settings_json: serde_json::to_string(&s.settings).unwrap_or_else(|_| "{}".to_string()),
            last_event_id: s.last_event_id,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegionState {
    pub id: Arc<str>,
    pub parent_id: Option<Arc<str>>,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LayerState {
    pub id: Arc<str>,
    pub region_id: Arc<str>,
    pub name: String,
    pub is_visible: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeatureGroupState {
    pub id: Arc<str>,
    pub layer_id: Arc<str>,
    pub parent_id: Option<Arc<str>>,
    pub name: String,
    pub r#type: String,
    pub group_type: String,
    pub is_visible: bool,
    pub metadata: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BBox {
    #[serde(alias = "min_lat")]
    pub min_y: f64,
    #[serde(alias = "max_lat")]
    pub max_y: f64,
    #[serde(alias = "min_lng")]
    pub min_x: f64,
    #[serde(alias = "max_lng")]
    pub max_x: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeatureState {
    pub id: Arc<str>,
    pub layer_id: Arc<str>,
    pub group_id: Option<Arc<str>>,
    pub name: String,
    pub geom_type: String,
    pub is_visible: bool,
    pub note: String,
    pub metadata: String,
    pub bbox: Option<BBox>,
    pub area: Option<f64>,
    pub length: Option<f64>,
    pub coordinates: serde_json::Value,
    pub properties: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SerializableFeatureState {
    pub id: Arc<str>,
    pub layer_id: Arc<str>,
    pub group_id: Option<Arc<str>>,
    pub name: String,
    pub geom_type: String,
    pub is_visible: bool,
    pub note: String,
    pub metadata: String,
    pub bbox: Option<BBox>,
    pub area: Option<f64>,
    pub length: Option<f64>,
    pub coordinates: String, // JSON string for binary safety
    pub properties: String,  // JSON string for binary safety
}

impl FeatureState {
    pub fn is_road(&self) -> bool {
        self.geom_type.to_lowercase() == "road"
            || self.properties.get("type").and_then(|v| v.as_str()) == Some("road")
    }
}

impl From<SerializableFeatureState> for FeatureState {
    fn from(s: SerializableFeatureState) -> Self {
        Self {
            id: s.id,
            layer_id: s.layer_id,
            group_id: s.group_id,
            name: s.name,
            geom_type: s.geom_type,
            is_visible: s.is_visible,
            note: s.note,
            metadata: s.metadata,
            bbox: s.bbox,
            area: s.area,
            length: s.length,
            coordinates: serde_json::from_str(&s.coordinates).unwrap_or(serde_json::Value::Null),
            properties: serde_json::from_str(&s.properties).unwrap_or(serde_json::Value::Null),
        }
    }
}

impl From<FeatureState> for SerializableFeatureState {
    fn from(f: FeatureState) -> Self {
        Self {
            id: f.id,
            layer_id: f.layer_id,
            group_id: f.group_id,
            name: f.name,
            geom_type: f.geom_type,
            is_visible: f.is_visible,
            note: f.note,
            metadata: f.metadata,
            bbox: f.bbox,
            area: f.area,
            length: f.length,
            coordinates: serde_json::to_string(&f.coordinates).unwrap_or_default(),
            properties: serde_json::to_string(&f.properties).unwrap_or_default(),
        }
    }
}

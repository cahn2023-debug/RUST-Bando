use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum DesignEvent {
    // --- Feature Events ---
    AddFeature {
        id: String,
        layer_id: String,
        name: String,
        geom_type: String,
        coordinates: Value,
        properties: Value,
        metadata: Option<Value>,
    },
    UpdateFeature {
        id: String,
        name: Option<String>,
        coordinates: Option<Value>,
        properties: Option<Value>,
        metadata: Option<Value>,
    },
    DeleteFeature {
        id: String,
    },
    MoveFeature {
        id: String,
        dx: f64,
        dy: f64,
    },

    // --- Layer Events ---
    CreateLayer {
        id: String,
        region_id: String,
        name: String,
    },
    UpdateLayer {
        id: String,
        name: Option<String>,
        is_visible: Option<bool>,
    },
    DeleteLayer {
        id: String,
    },

    // --- Region Events ---
    CreateRegion {
        id: String,
        name: String,
    },
    UpdateRegion {
        id: String,
        name: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignEventRecord {
    pub sequence_id: i64,
    pub event: DesignEvent,
    pub timestamp: i64,
}

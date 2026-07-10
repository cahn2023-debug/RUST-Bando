use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn distance_to(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CameraSpecs {
    pub resolution_width: f32,  // pixels
    pub resolution_height: f32, // pixels
    pub focal_length: f32,      // mm
    pub sensor_width: f32,      // mm
    pub install_height: f32,    // meters
    pub target_height: f32,     // meters (e.g. 1.7 for human)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DoriDistances {
    pub identify: f64,
    pub recognize: f64,
    pub observe: f64,
    pub detect: f64,
    pub hfov: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BoundingBox {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl BoundingBox {
    pub fn from_points(points: &[Point]) -> Self {
        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;

        for p in points {
            min_x = min_x.min(p.x);
            min_y = min_y.min(p.y);
            max_x = max_x.max(p.x);
            max_y = max_y.max(p.y);
        }

        Self { min_x, min_y, max_x, max_y }
    }

    pub fn intersects(&self, other: &BoundingBox) -> bool {
        self.min_x <= other.max_x
            && self.max_x >= other.min_x
            && self.min_y <= other.max_y
            && self.max_y >= other.min_y
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZeroCopyEventEnvelope {
    pub event_id: uuid::Uuid,
    pub entity_id: uuid::Uuid,
    pub project_id: uuid::Uuid,
    pub entity_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskV2 {
    pub id: String,
    pub name: String,
    pub status: String,
    pub priority: String,
    pub progress: f64,
    pub is_completed: bool,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteV2 {
    pub id: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractV2 {
    pub id: String,
    pub name: String,
    pub contract_number: String,
    pub vendor: Option<String>,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLinkV2 {
    pub id: String,
    pub from_task_id: String,
    pub to_task_id: String,
    pub link_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BOMItemV2 {
    pub uid: String,
    pub stt: String,
    pub name: String,
    pub description: String,
    pub unit: String,
    pub quantity: f64,
    pub price: f64,
    pub total: f64,
    pub manufacturer: String,
    pub origin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBOMResponse {
    pub contract_number: String,
    pub investor: String,
    pub contractor: String,
    pub signed_date: String,
    pub duration: String,
    pub end_date: String,
    pub bom_table: Vec<BOMItemV2>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultV2 {
    pub entity_id: String,
    pub entity_type: String,
    pub project_id: String,
    pub name: String,
    pub rank: f64,
    pub tags: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchV2Response {
    pub results: Vec<SearchResultV2>,
    pub total_count: usize,
}

#[derive(Debug, Clone, Default)]
pub struct SearchFiltersV2 {
    pub project_id: Option<uuid::Uuid>,
    pub entity_types: Option<Vec<String>>,
    pub limit: usize,
    pub offset: usize,
}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub use crate::contract::project_model::Project;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TaskDependency {
    pub id: String,
    pub from_task_id: String,
    pub to_task_id: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_completed: bool,
    pub status: String,
    pub color: Option<String>,
    pub target_file_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Note {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub content: Option<String>,
    pub target_file_path: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Contract {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub contract_number: Option<String>,
    pub vendor: Option<String>,
    pub value: Option<f64>,
    pub signed_date: Option<String>,
    pub notes: Option<String>,
    pub file_path: Option<String>,
    pub has_analysis: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub file_path: String,
    pub title: String,
    pub snippet: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Material {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub unit: Option<String>,
    pub base_price: f64,
    pub category: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct File {
    pub id: String,
    pub project_id: Option<String>,
    pub path: String,
    pub filename: String,
    pub extension: Option<String>,
    pub size: i64,
    pub file_type: Option<String>,
    pub metadata_json: Option<String>,
    pub categorization: Option<String>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct WorkItem {
    pub id: String,
    pub project_id: String,
    pub feature_id: Option<String>,
    pub name: String,
    pub material_id: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub total_price: f64,
    pub status: String,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GeoPoint {
    pub lat: f64,
    pub lon: f64,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SnapPoint {
    pub lat: f64,
    pub lon: f64,
    pub snapped_object_id: Option<String>,
    pub distance: f64,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum SegmentType {
    AsphaltRoad,
    StoneSidewalk,
    SoilSidewalk,
    TerrazzoSidewalk,
    BlockSidewalk,
    ConcreteSidewalk,
    Unknown,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Segment {
    pub id: String,
    pub points: Vec<GeoPoint>,
    pub segment_type: SegmentType,
    pub properties: HashMap<String, String>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum PolylineType {
    PowerLine,
    SignalLine,
    TrenchLine,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Polyline {
    pub id: String,
    pub polyline_type: PolylineType,
    pub segments: Vec<Segment>,
    pub start_point: SnapPoint,
    pub end_point: SnapPoint,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProjectSettings {
    pub project_id: String,
    pub epsg_code: String,
    pub units: String,
    pub center_lat: Option<f64>,
    pub center_lon: Option<f64>,
    pub default_zoom: f64,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AuditLog {
    pub id: String,
    pub project_id: String,
    pub user_id: Option<String>,
    pub user_email: Option<String>,
    pub action_type: String,
    pub table_name: String,
    pub record_id: String,
    pub old_values_json: Option<String>,
    pub new_values_json: Option<String>,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FeatureAttachment {
    pub id: i32,
    pub project_id: String,
    pub feature_id: String,
    pub file_id: i32,
    pub attachment_type: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DesignStyle {
    pub id: i32,
    pub project_id: String,
    pub name: String,
    pub geom_type: String,
    pub stroke_color: Option<String>,
    pub stroke_width: Option<f64>,
    pub fill_color: Option<String>,
    pub opacity: Option<f64>,
    pub icon_path: Option<String>,
    pub dash_pattern: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Role {
    pub id: i32,
    pub name: String,
    pub permissions_json: String,
    pub created_at: String,
}

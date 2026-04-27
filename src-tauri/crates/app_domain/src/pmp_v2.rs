use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PmpV2Project {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub base_dir_hint: Option<String>,
    pub metadata_json: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PmpV2File {
    pub id: String,
    pub project_id: String,
    pub rel_path: String,
    pub filename: String,
    pub extension: Option<String>,
    pub file_size: Option<i64>,
    pub hash_sha256: Option<String>,
    pub mime_type: Option<String>,
    pub status: String,
    pub metadata_json: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PmpV2Tag {
    pub id: i32,
    pub name: String,
    pub color: String,
    pub category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PmpV2Metadata {
    pub meta_version: i32,
    pub system: Value,
    pub analysis: Value,
    pub custom: Value,
}

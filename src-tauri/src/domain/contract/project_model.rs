use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub root_path: Option<String>,
    pub description: Option<String>,
    pub contract_number: Option<String>,
    pub investor: Option<String>,
    pub contractor: Option<String>,
    pub signed_date: Option<String>,
    pub duration: Option<String>,
    pub end_date: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub metadata_json: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchResult {
    pub file_path: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BOMItem {
    #[serde(default)]
    pub uid: String,
    pub stt: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub unit: String,
    pub quantity: f64,
    pub price: f64,
    pub total: f64,
    #[serde(default)]
    pub manufacturer: String,
    #[serde(default)]
    pub origin: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContractExecutionGroup {
    pub id: Option<i64>,
    pub project_id: i64,
    pub name: String,
    pub description: String,
    pub status: String,
    pub due_date: String,
    pub assignee: String,
    pub color: String,
    pub bom_item_uids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContractMetadata {
    #[serde(default)]
    pub contract_number: String,
    pub investor: String,
    pub contractor: String,
    pub signed_date: String,
    pub duration: String,
    pub end_date: String,
    pub bom_table: Vec<BOMItem>,
    #[serde(default)]
    pub categorization: String,
}

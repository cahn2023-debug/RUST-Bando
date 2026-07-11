// src/domain/mod.rs

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Project {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct OutputContract {
    pub id: i32,
    pub project_id: i32,
    pub contract_number: String,
    pub client_name: Option<String>,
    pub total_planned_value: Decimal,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct OutputItem {
    pub id: i32,
    pub contract_id: i32,
    pub item_name: String,
    pub planned_value: Decimal,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct InputContract {
    pub id: i32,
    pub project_id: i32,
    pub contract_number: String,
    pub vendor_name: Option<String>,
    pub total_actual_cost: Decimal,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct InputItem {
    pub id: i32,
    pub contract_id: i32,
    pub item_name: String,
    pub actual_cost: Decimal,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Allocation {
    pub id: i32,
    pub input_item_id: i32,
    pub output_item_id: i32,
    pub allocated_amount: Decimal,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AllocationRequest {
    pub input_item_id: i32,
    pub output_item_id: i32,
    pub amount: Decimal,
}

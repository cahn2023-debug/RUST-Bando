use crate::pmp_v2::PmpV2Project;
use crate::{DeltaMapData, MapData};
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait ProjectStorage: Send + Sync {
    async fn get_projects(&self) -> Result<Vec<PmpV2Project>>;
    async fn save_project(&self, project: PmpV2Project) -> Result<()>;
    async fn delete_project(&self, id: &str) -> Result<()>;
}

#[async_trait]
pub trait GisProcessor: Send + Sync {
    async fn calculate_area(&self, data: &MapData) -> Result<f64>;
    async fn apply_delta(&self, current: &mut MapData, delta: DeltaMapData) -> Result<()>;
}

pub trait AppConfig: Send + Sync {
    fn get_value(&self, key: &str) -> Option<String>;
    fn set_value(&mut self, key: &str, value: String) -> Result<()>;
}

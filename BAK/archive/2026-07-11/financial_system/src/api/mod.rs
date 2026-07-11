// src/api/mod.rs

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use crate::repository::Repository;
use crate::domain::AllocationRequest;
use std::sync::Arc;
use serde_json::Value;

pub struct AppState {
    pub repo: Repository,
}

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/projects/:id/summary", get(get_project_summary))
        .route("/allocations", post(create_allocation))
        .with_state(state)
}

async fn get_project_summary(
    Path(id): Path<i32>,
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let summary = state.repo.get_project_summary(id).await.unwrap_or_default();
    Json(summary)
}

async fn create_allocation(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AllocationRequest>,
) -> Json<Value> {
    match state.repo.allocate_amount(req).await {
        Ok(alloc) => match serde_json::to_value(alloc) {
            Ok(json) => Json(json),
            Err(e) => Json(serde_json::json!({ "error": format!("Failed to serialize allocation: {}", e) })),
        },
        Err(e) => Json(serde_json::json!({ "error": e.to_string() })),
    }
}

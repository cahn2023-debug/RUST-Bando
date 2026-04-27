// src/main.rs

mod domain;
mod repository;
mod service;
mod ai_engine;
mod api;

use std::sync::Arc;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use crate::repository::Repository;
use crate::api::{AppState, create_router};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize observability
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    // Connection pooling
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&db_url)
        .await?;

    let repo = Repository::new(pool);
    let state = Arc::new(AppState { repo });

    let app = create_router(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    tracing::info!("PFMS Server listening on {}", listener.local_addr()?);
    
    ax_server(listener, app).await?;

    Ok(())
}

async fn ax_server(listener: tokio::net::TcpListener, app: axum::Router) -> anyhow::Result<()> {
    axum::serve(listener, app).await?;
    Ok(())
}

pub mod migration;
pub mod models;
pub mod projector;
pub mod repository;
#[cfg(test)]
mod tests;

use crate::repository::EventRepository;
use anyhow::{anyhow, Result};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Pool, Sqlite,
};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct StorageService {
    pool: Arc<RwLock<Option<Pool<Sqlite>>>>,
    repo: Arc<RwLock<Option<EventRepository>>>,
}

impl Default for StorageService {
    fn default() -> Self {
        Self::new()
    }
}

impl StorageService {
    pub fn new() -> Self {
        Self {
            pool: Arc::new(RwLock::new(None)),
            repo: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn open(&self, path: PathBuf) -> Result<()> {
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|e| anyhow!("Failed to open DB pool: {}", e))?;

        // Initialize schema
        let schema = include_str!("schema.sql");
        sqlx::query(schema).execute(&pool).await?;

        let repo = EventRepository::new(pool.clone());

        let mut pool_lock = self.pool.write().await;
        let mut repo_lock = self.repo.write().await;

        *pool_lock = Some(pool);
        *repo_lock = Some(repo);

        Ok(())
    }

    pub async fn get_repo(&self) -> Result<EventRepository> {
        let lock = self.repo.read().await;
        if let Some(repo) = lock.as_ref() {
            Ok(repo.clone())
        } else {
            Err(anyhow!("Repository not initialized"))
        }
    }
}

// Temporary: keeping the old interfaces as empty stubs or mapping to new logic if needed
// For now, focusing on the new DAL as requested.

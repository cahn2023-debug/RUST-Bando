//! Custom error types for the application
//! Provides structured, typed errors instead of raw Strings

use thiserror::Error;

/// Application-level error type
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Lock poisoned: {0}")]
    LockPoisoned(&'static str),

    #[error("No project opened")]
    NoProjectOpened,

    #[error("Project not found: {0}")]
    ProjectNotFound(i64),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("File operation error: {0}")]
    FileOperation(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Authentication error: {0}")]
    AuthError(String),

    #[error("Import error: {0}")]
    ImportError(String),

    #[error("AI error: {0}")]
    AiError(String),

    #[error("Design error: {0}")]
    DesignError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl AppError {
    /// Convert AppError to String for Tauri command compatibility
    pub fn to_string_lossy(&self) -> String {
        self.to_string()
    }
}

/// Helper trait for converting Result<T, String> to Result<T, AppError>
pub trait StringResultExt<T> {
    fn map_string_err(self) -> Result<T, AppError>;
}

impl<T> StringResultExt<T> for Result<T, String> {
    fn map_string_err(self) -> Result<T, AppError> {
        self.map_err(AppError::Unknown)
    }
}

/// Helper functions for common error patterns
pub mod helpers {
    use super::AppError;
    use parking_lot::Mutex;
    use std::sync::Arc;

    /// Safely lock a Mutex, returning AppError::LockPoisoned on failure
    pub fn lock_mutex<T>(lock: &Arc<Mutex<T>>) -> Result<parking_lot::MutexGuard<'_, T>, AppError> {
        Ok(lock.lock())
    }

    /// Get value from Option inside a Mutex (locks and maps in one call)
    pub fn get_mutex_option<T>(
        lock: &Arc<Mutex<Option<T>>>,
        context: &'static str,
    ) -> Result<T, AppError>
    where
        T: Clone,
    {
        let guard = lock.lock();
        guard
            .clone()
            .ok_or(AppError::Unknown(context.to_string()))
    }

    /// Simplified lock + check pattern for DatabaseState
    pub fn with_db_connection<T, F>(
        conn_lock: &Arc<std::sync::Mutex<Option<rusqlite::Connection>>>,
        f: F,
    ) -> Result<T, AppError>
    where
        F: FnOnce(&rusqlite::Connection) -> Result<T, AppError>,
    {
        let guard = conn_lock
            .lock()
            .map_err(|_| AppError::LockPoisoned("Database connection lock poisoned"))?;
        let conn = guard
            .as_ref()
            .ok_or(AppError::NoProjectOpened)?;
        f(conn)
    }

    /// Optimized read-only access helper for DatabaseState
    pub fn with_db_ref<T, F>(
        state: &tauri::State<'_, crate::implement::db::DatabaseState>,
        f: F,
    ) -> Result<T, String>
    where
        F: FnOnce(&rusqlite::Connection) -> Result<T, String>,
    {
        let guard = state.conn.lock().map_err(|_| "DB lock poisoned")?;
        let conn = guard.as_ref().ok_or("No project opened")?;
        f(conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = AppError::ProjectNotFound(123);
        assert_eq!(err.to_string(), "Project not found: 123");

        let err = AppError::NoProjectOpened;
        assert_eq!(err.to_string(), "No project opened");
    }

    #[test]
    fn test_error_from_rusqlite() {
        let rusqlite_err = rusqlite::Error::InvalidQuery;
        let app_err = AppError::from(rusqlite_err);
        assert!(matches!(app_err, AppError::Database(_)));
    }
}

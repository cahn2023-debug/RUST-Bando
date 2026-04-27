/// V2 Search Module
///
/// Unified entity index replacing scattered FTS5 tables.
pub mod engine;

pub use engine::{SearchEngine, SearchFilters, SearchResult};

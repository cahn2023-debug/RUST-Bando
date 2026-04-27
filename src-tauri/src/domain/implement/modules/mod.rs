#[path = "ai/mod.rs"]
pub mod ai;
#[path = "bootstrap.rs"]
pub mod bootstrap;
#[path = "core/mod.rs"]
pub mod core;
pub mod gis;
#[path = "ingestion/mod.rs"]
pub mod ingestion;
#[path = "v2/mod.rs"]
pub mod v2;

#[cfg(feature = "ai")]
pub use self::ai::ai_engine;
pub use self::core::config;
pub use self::ingestion::preview_service;

// Re-export common types
pub use self::ingestion::doc_parser;
pub use self::ingestion::import;
pub use crate::contract::project_model;

/// V2 Metadata Module
/// Schema registry for JSON validation and metadata governance.
pub mod registry;

pub use registry::{
    seed_default_schemas, MetadataRegistry, SchemaDefinition, FEATURE_SCHEMA_V1, FILE_SCHEMA_V1,
    PROJECT_SCHEMA_V1, TASK_SCHEMA_V1,
};

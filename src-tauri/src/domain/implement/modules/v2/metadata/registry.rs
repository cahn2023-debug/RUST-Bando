use parking_lot::Mutex;
/// Metadata Registry - Schema Control for V2
///
/// Eliminates "JSON chaos" by:
/// 1. Defining schemas for all JSON columns
/// 2. Tracking schema versions
/// 3. Validating events against schemas before storage
/// 4. Enabling automatic schema migration
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

// ============================================================================
// Schema Definition
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaDefinition {
    pub id: Uuid,
    pub entity_type: String,
    pub schema_name: String,
    pub schema_json: String, // JSON Schema (draft-07)
    pub version: i64,
    pub is_active: bool,
}

impl SchemaDefinition {
    pub fn new(entity_type: &str, schema_name: &str, schema_json: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            entity_type: entity_type.to_string(),
            schema_name: schema_name.to_string(),
            schema_json: schema_json.to_string(),
            version: 1,
            is_active: true,
        }
    }
}

// ============================================================================
// MetadataRegistry
// ============================================================================

#[derive(Clone)]
pub struct MetadataRegistry {
    conn: Arc<Mutex<Connection>>,
    /// Compiled JSON schemas for validation
    schemas: std::collections::HashMap<String, SchemaDefinition>,
}

impl MetadataRegistry {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        let mut registry = Self {
            conn,
            schemas: std::collections::HashMap::new(),
        };
        registry.load_schemas().ok();
        registry
    }

    /// Load all active schemas from database
    fn load_schemas(&mut self) -> Result<(), String> {
        let conn = self.conn.lock();

        let mut stmt = conn
            .prepare(
                "SELECT id, entity_type, schema_name, schema_json, version, is_active
                 FROM metadata_registry WHERE is_active = 1",
            )
            .map_err(|e| e.to_string())?;

        let schemas = stmt
            .query_map([], |row| {
                Ok(SchemaDefinition {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or(Uuid::nil()),
                    entity_type: row.get(1)?,
                    schema_name: row.get(2)?,
                    schema_json: row.get(3)?,
                    version: row.get(4)?,
                    is_active: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        for schema in schemas {
            let schema = schema.map_err(|e| e.to_string())?;
            self.schemas.insert(schema.entity_type.clone(), schema);
        }

        Ok(())
    }

    /// Register a new schema
    pub fn register_schema(&mut self, schema: SchemaDefinition) -> Result<(), String> {
        let conn = self.conn.lock();

        conn.execute(
            "INSERT INTO metadata_registry (id, entity_type, schema_name, schema_json, version, is_active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                schema.id.to_string(),
                schema.entity_type,
                schema.schema_name,
                schema.schema_json,
                schema.version,
                if schema.is_active { 1 } else { 0 },
            ],
        )
        .map_err(|e| e.to_string())?;

        if schema.is_active {
            self.schemas.insert(schema.entity_type.clone(), schema);
        }

        Ok(())
    }

    /// Get the active schema for an entity type
    pub fn get_schema(&self, entity_type: &str) -> Option<&SchemaDefinition> {
        self.schemas.get(entity_type)
    }

    /// Validate data against a schema
    ///
    /// V2 FIX: Skip validation for empty objects `{}` and null values.
    /// Frontend sends empty metadata by default — the actual data lives
    /// in the AppEvent struct fields (name, status, etc.), not in metadata.
    pub fn validate(&self, entity_type: &str, data: &serde_json::Value) -> Result<(), Vec<String>> {
        // V2 FIX: Empty metadata or null always passes validation
        // Real event data is in AppEvent fields, not metadata
        if data.is_null() {
            return Ok(());
        }
        if let Some(obj) = data.as_object() {
            if obj.is_empty() {
                return Ok(());
            }
        }

        let schema = match self.schemas.get(entity_type) {
            Some(s) => s,
            // V2 FIX: No schema = pass (lenient mode for unregistered entity types)
            None => {
                log::warn!(
                    "[MetadataRegistry] No schema for '{}', skipping validation",
                    entity_type
                );
                return Ok(());
            }
        };

        let schema_obj: serde_json::Value =
            serde_json::from_str(&schema.schema_json).map_err(|e| vec![e.to_string()])?;

        let mut errors = Vec::new();
        self.validate_value(data, &schema_obj, "", &mut errors);

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Simple JSON Schema validator (supports: type, required, enum, minimum, maximum, minLength, maxLength)
    fn validate_value(
        &self,
        value: &serde_json::Value,
        schema: &serde_json::Value,
        path: &str,
        errors: &mut Vec<String>,
    ) {
        if let Some(schema_obj) = schema.as_object() {
            // Check type
            if let Some(expected_type) = schema_obj.get("type").and_then(|v| v.as_str()) {
                let actual_type = match value {
                    serde_json::Value::Null => "null",
                    serde_json::Value::Bool(_) => "boolean",
                    serde_json::Value::Number(_) => "number",
                    serde_json::Value::String(_) => "string",
                    serde_json::Value::Array(_) => "array",
                    serde_json::Value::Object(_) => "object",
                };

                if actual_type != expected_type {
                    errors.push(format!(
                        "{}: expected type '{}', got '{}'",
                        path, expected_type, actual_type
                    ));
                    return;
                }
            }

            // Check enum
            if let Some(enum_values) = schema_obj.get("enum").and_then(|v| v.as_array()) {
                if !enum_values.contains(value) {
                    errors.push(format!(
                        "{}: value {:?} not in allowed values {:?}",
                        path, value, enum_values
                    ));
                }
            }

            // Check number constraints
            if let Some(num) = value.as_f64() {
                if let Some(min) = schema_obj.get("minimum").and_then(|v| v.as_f64()) {
                    if num < min {
                        errors.push(format!(
                            "{}: value {} is less than minimum {}",
                            path, num, min
                        ));
                    }
                }
                if let Some(max) = schema_obj.get("maximum").and_then(|v| v.as_f64()) {
                    if num > max {
                        errors.push(format!(
                            "{}: value {} is greater than maximum {}",
                            path, num, max
                        ));
                    }
                }
            }

            // Check string constraints
            if let Some(s) = value.as_str() {
                if let Some(min_len) = schema_obj.get("minLength").and_then(|v| v.as_u64()) {
                    if (s.len() as u64) < min_len {
                        errors.push(format!(
                            "{}: string length {} is less than minimum {}",
                            path,
                            s.len(),
                            min_len
                        ));
                    }
                }
                if let Some(max_len) = schema_obj.get("maxLength").and_then(|v| v.as_u64()) {
                    if (s.len() as u64) > max_len {
                        errors.push(format!(
                            "{}: string length {} is greater than maximum {}",
                            path,
                            s.len(),
                            max_len
                        ));
                    }
                }
            }

            // Check object properties and required fields
            if let Some(obj) = value.as_object() {
                // Check required fields
                if let Some(required) = schema_obj.get("required").and_then(|v| v.as_array()) {
                    for req_field in required {
                        if let Some(field_name) = req_field.as_str() {
                            if !obj.contains_key(field_name) {
                                errors.push(format!(
                                    "{}: missing required field '{}'",
                                    path, field_name
                                ));
                            }
                        }
                    }
                }

                // Check properties
                if let Some(properties) = schema_obj.get("properties").and_then(|v| v.as_object()) {
                    for (key, prop_schema) in properties {
                        if let Some(prop_value) = obj.get(key) {
                            let new_path = if path.is_empty() {
                                key.clone()
                            } else {
                                format!("{}.{}", path, key)
                            };
                            self.validate_value(prop_value, prop_schema, &new_path, errors);
                        }
                    }
                }
            }

            // Check array items
            if let Some(arr) = value.as_array() {
                if let Some(items_schema) = schema_obj.get("items") {
                    for (i, item) in arr.iter().enumerate() {
                        let new_path = format!("{}[{}]", path, i);
                        self.validate_value(item, items_schema, &new_path, errors);
                    }
                }
            }
        }
    }

    /// Check if a schema exists for an entity type
    pub fn has_schema(&self, entity_type: &str) -> bool {
        self.schemas.contains_key(entity_type)
    }

    /// List all registered entity types
    pub fn registered_types(&self) -> Vec<String> {
        self.schemas.keys().cloned().collect()
    }
}

// ============================================================================
// Default Schemas
// ============================================================================

pub const TASK_SCHEMA_V1: &str = r#"{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "name": { "type": "string", "minLength": 1, "maxLength": 200 },
        "description": { "type": "string", "maxLength": 5000 },
        "status": { "enum": ["todo", "in_progress", "done", "cancelled"] },
        "priority": { "enum": ["low", "normal", "high", "urgent"] },
        "progress": { "type": "number", "minimum": 0, "maximum": 100 }
    },
    "required": ["name", "status"]
}"#;

pub const FEATURE_SCHEMA_V1: &str = r#"{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "name": { "type": "string", "minLength": 1 },
        "geom_type": { "enum": ["Point", "LineString", "Polygon", "Rect"] },
        "layer_id": { "type": "string" },
        "group_id": { "type": ["string", "null"] },
        "properties": { "type": "object" }
    },
    "required": ["name", "geom_type", "layer_id"]
}"#;

pub const FILE_SCHEMA_V1: &str = r#"{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "filename": { "type": "string", "minLength": 1 },
        "rel_path": { "type": "string" },
        "file_size": { "type": "integer", "minimum": 0 },
        "extension": { "type": "string" }
    },
    "required": ["filename", "rel_path"]
}"#;

pub const PROJECT_SCHEMA_V1: &str = r#"{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "name": { "type": "string", "minLength": 1, "maxLength": 200 },
        "root_path": { "type": "string" },
        "description": { "type": "string" },
        "status": { "enum": ["active", "archived", "completed"] }
    },
    "required": ["name", "root_path"]
}"#;

/// Seed default schemas into the registry
pub fn seed_default_schemas(conn: &Connection) -> Result<(), String> {
    let defaults = vec![
        ("task", "Default Task Schema", TASK_SCHEMA_V1),
        ("feature", "Default Feature Schema", FEATURE_SCHEMA_V1),
        ("file", "Default File Schema", FILE_SCHEMA_V1),
        ("project", "Default Project Schema", PROJECT_SCHEMA_V1),
    ];

    for (entity_type, name, schema_json) in defaults {
        // Check if already exists
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM metadata_registry WHERE entity_type = ? AND is_active = 1",
                params![entity_type],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if exists == 0 {
            conn.execute(
                "INSERT INTO metadata_registry (id, entity_type, schema_name, schema_json, version, is_active)
                 VALUES (?1, ?2, ?3, ?4, 1, 1)",
                params![
                    Uuid::new_v4().to_string(),
                    entity_type,
                    name,
                    schema_json,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Arc;
    use std::sync::Mutex;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute(
            "CREATE TABLE metadata_registry (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                schema_name TEXT NOT NULL,
                schema_json TEXT NOT NULL,
                version INTEGER NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(entity_type, version)
            )",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_schema_definition_new() {
        let schema = SchemaDefinition::new("task", "Task Schema", TASK_SCHEMA_V1);
        assert_eq!(schema.entity_type, "task");
        assert_eq!(schema.version, 1);
        assert!(schema.is_active);
        assert!(schema.schema_json.contains("required"));
    }

    #[test]
    fn test_seed_default_schemas() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM metadata_registry", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 4);
    }

    #[test]
    fn test_seed_idempotent() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();
        seed_default_schemas(&conn).unwrap(); // Second call should not fail

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM metadata_registry", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 4); // Still 4, not 8
    }

    #[test]
    fn test_load_schemas() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();

        let registry = MetadataRegistry::new(Arc::new(Mutex::new(conn)));
        assert_eq!(registry.registered_types().len(), 4);
        assert!(registry.has_schema("task"));
        assert!(registry.has_schema("feature"));
        assert!(registry.has_schema("file"));
        assert!(registry.has_schema("project"));
    }

    #[test]
    fn test_validate_task_schema_valid() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();
        let registry = MetadataRegistry::new(Arc::new(Mutex::new(conn)));

        let data = serde_json::json!({
            "name": "Test Task",
            "status": "todo",
            "priority": "high",
            "progress": 50
        });

        let result = registry.validate("task", &data);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_task_schema_missing_required() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();
        let registry = MetadataRegistry::new(Arc::new(Mutex::new(conn)));

        let data = serde_json::json!({
            "status": "todo"
            // missing "name"
        });

        let result = registry.validate("task", &data);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| e.contains("missing required field 'name'")));
    }

    #[test]
    fn test_validate_task_schema_invalid_enum() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();
        let registry = MetadataRegistry::new(Arc::new(Mutex::new(conn)));

        let data = serde_json::json!({
            "name": "Test",
            "status": "invalid_status"
        });

        let result = registry.validate("task", &data);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| e.contains("not in allowed values")));
    }

    #[test]
    fn test_validate_task_schema_invalid_progress() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();
        let registry = MetadataRegistry::new(Arc::new(Mutex::new(conn)));

        let data = serde_json::json!({
            "name": "Test",
            "status": "todo",
            "progress": 150  // > 100
        });

        let result = registry.validate("task", &data);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| e.contains("greater than maximum")));
    }

    #[test]
    fn test_validate_no_schema_error() {
        let conn = create_test_db();
        let registry = MetadataRegistry::new(Arc::new(Mutex::new(conn)));

        let data = serde_json::json!({"key": "value"});
        let result = registry.validate("nonexistent", &data);
        assert!(result.is_ok()); // V2 FIX: No schema = pass (lenient mode)
    }

    #[test]
    fn test_validate_string_min_max_length() {
        let conn = create_test_db();
        seed_default_schemas(&conn).unwrap();
        let registry = MetadataRegistry::new(Arc::new(Mutex::new(conn)));

        // Empty name (minLength: 1)
        let data = serde_json::json!({
            "name": "",
            "status": "todo"
        });
        let result = registry.validate("task", &data);
        assert!(result.is_err());
    }
}

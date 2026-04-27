-- Seed Metadata Registry with default JSON Schemas (Draft-07 compliant)

INSERT INTO metadata_registry (id, name, schema, version) VALUES
(
    '018ebc1e-5e7b-7b3b-8d1b-6b0b3b4b5e6f', 
    'project_settings', 
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "default_view": {"type": "string", "enum": ["list", "board", "map"]},
            "auto_sync": {"type": "boolean"},
            "theme": {"type": "string", "enum": ["light", "dark", "system"]}
        }
    }', 
    1
),
(
    '018ebc1e-5e7c-7b3b-8d1c-6b0b3b4b5e70', 
    'task_metadata', 
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "estimated_hours": {"type": "number", "minimum": 0},
            "dependency_id": {"type": "string", "format": "uuid"},
            "complexity": {"type": "integer", "minimum": 1, "maximum": 5}
        }
    }', 
    1
),
(
    '018ebc1e-5e7d-7b3b-8d1d-6b0b3b4b5e71', 
    'feature_metadata', 
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "roadmap_quarter": {"type": "string", "pattern": "^Q[1-4]-[0-9]{4}$"},
            "target_release_version": {"type": "string"}
        }
    }', 
    1
),
(
    '018ebc1e-5e7e-7b3b-8d1e-6b0b3b4b5e72', 
    'land_metadata', 
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "area_sqm": {"type": "number"},
            "classification": {"type": "string"},
            "owner_uuid": {"type": "string", "format": "uuid"},
            "usage_type": {"type": "string", "enum": ["residential", "agricultural", "industrial", "forestry"]}
        }
    }', 
    1
),
(
    '018ebc1e-5e7f-7b3b-8d1f-6b0b3b4b5e73', 
    'user_preferences', 
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "language": {"type": "string", "default": "vi"},
            "notifications_enabled": {"type": "boolean", "default": true}
        }
    }', 
    1
),
(
    '018ebc1e-5e80-7b3b-8d20-6b0b3b4b5e74', 
    'sync_config', 
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "server_url": {"type": "string", "format": "uri"},
            "sync_interval_ms": {"type": "integer", "minimum": 1000}
        }
    }', 
    1
),
(
    '018ebc1e-5e81-7b3b-8d21-6b0b3b4b5e75', 
    'system_node', 
    '{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "node_type": {"type": "string"},
            "is_active": {"type": "boolean"},
            "uptime_threshold": {"type": "number"}
        }
    }', 
    1
);

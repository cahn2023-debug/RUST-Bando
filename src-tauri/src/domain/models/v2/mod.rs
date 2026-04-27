use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncStatus {
    Idle,
    Syncing,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub device_id: String,
    pub last_pushed_seq: i64,
    pub last_pulled_seq: i64,
    pub last_sync_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AppEvent {
    // Project
    ProjectCreated {
        id: Uuid,
        name: String,
        root_path: String,
        metadata: serde_json::Value,
        settings: serde_json::Value,
    },
    ProjectUpdated {
        changes: serde_json::Value,
    },
    ProjectMetadataUpdated {
        changes: serde_json::Value,
    },
    ProjectDeleted {
        id: Uuid,
    },

    // Tasks
    TaskCreated {
        name: String,
        parent_id: Option<Uuid>,
        metadata: serde_json::Value,
    },
    TaskUpdated {
        changes: serde_json::Value,
    },
    TaskDeleted {
        id: Uuid,
        project_id: Uuid,
    },
    TaskLinked {
        id: Uuid,
        target_id: Uuid,
    },
    TaskUnlinked {
        id: Uuid,
        target_id: Uuid,
    },

    // GIS / Layers
    LayerCreated {
        name: String,
        metadata: serde_json::Value,
    },
    LayerUpdated {
        changes: serde_json::Value,
    },
    LayerDeleted {
        id: Uuid,
    },

    FeatureGroupCreated {
        name: String,
        metadata: serde_json::Value,
    },
    FeatureGroupUpdated {
        changes: serde_json::Value,
    },
    FeatureGroupDeleted {
        id: Uuid,
    },

    FeatureCreated {
        layer_id: Uuid,
        group_id: Option<Uuid>,
        name: String,
        geom_type: String,
        geometry: serde_json::Value,
        properties: serde_json::Value,
        style_id: Option<Uuid>,
        is_visible: bool,
        note: Option<String>,
        bbox: Option<serde_json::Value>,
        metadata: serde_json::Value,
    },
    FeatureUpdated {
        changes: serde_json::Value,
    },
    FeatureDeleted {
        id: Uuid,
    },

    RegionCreated {
        name: String,
        metadata: serde_json::Value,
    },
    RegionUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    RegionDeleted {
        id: Uuid,
    },

    ContentItemUpserted {
        content_type_id: Uuid,
        name: String,
        data_json: serde_json::Value,
    },
    ContentItemDeleted {
        id: Uuid,
    },

    // Notes
    NoteCreated {
        title: String,
        content: String,
        metadata: serde_json::Value,
    },
    NoteUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    NoteDeleted {
        id: Uuid,
    },

    // Folders / Files (DMP Structure)
    FolderCreated {
        parent_id: Option<Uuid>,
        name: String,
        metadata: serde_json::Value,
    },
    FolderUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    FolderDeleted {
        id: Uuid,
    },

    FileCreated {
        folder_id: Option<Uuid>,
        rel_path: String,
        filename: String,
        file_size: u64,
        hash_sha256: String,
        metadata: serde_json::Value,
    },
    FileUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    FileDeleted {
        id: Uuid,
    },

    // Business / Materials
    MaterialCreated {
        name: String,
        code: String,
        metadata: serde_json::Value,
    },
    MaterialUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    MaterialDeleted {
        id: Uuid,
    },

    WorkItemCreated {
        name: String,
        feature_id: Uuid,
        material_id: Uuid,
        quantity: f64,
        unit_price: f64,
        metadata: serde_json::Value,
    },
    WorkItemUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    WorkItemDeleted {
        id: Uuid,
    },

    // Personnel
    PersonnelCreated {
        name: String,
        metadata: serde_json::Value,
    },
    PersonnelUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    PersonnelDeleted {
        id: Uuid,
    },

    // Contracts
    ContractCreated {
        name: String,
        contract_number: String,
        vendor: Option<String>,
        metadata: serde_json::Value,
    },
    ContractUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    ContractDeleted {
        id: Uuid,
    },

    // Attributes / Properties
    PropertyDefinitionCreated {
        name: String,
        data_type: String,
        metadata: serde_json::Value,
    },
    PropertyDefinitionUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    PropertyDefinitionDeleted {
        id: Uuid,
    },

    // System
    SettingsUpdated {
        changes: serde_json::Value,
    },

    // Generic Entities
    EntityCreated {
        id: Uuid,
        project_id: Uuid,
        entity_type: String,
        data: serde_json::Value,
    },
    EntityUpdated {
        id: Uuid,
        project_id: Uuid,
        entity_type: String,
        data: serde_json::Value,
    },
    EntityDeleted {
        id: Uuid,
        project_id: Uuid,
        entity_type: String,
    },

    // Others (Legacy/PMP)
    SyncStarted {
        device_id: String,
    },
    SyncCompleted {
        device_id: String,
    },

    IngestionStarted {
        ingestion_id: Uuid,
        source_path: String,
        source_type: String,
        metadata: serde_json::Value,
    },
    IngestionFeatureAdded {
        ingestion_id: Uuid,
        feature_name: String,
        geometry_type: String,
        data: serde_json::Value,
    },
    IngestionCompleted {
        ingestion_id: Uuid,
        total_count: u64,
        status: String,
        message: String,
        metadata: serde_json::Value,
    },
}

impl AppEvent {
    pub fn action(&self) -> &str {
        match self {
            AppEvent::ProjectCreated { .. } => "created",
            AppEvent::ProjectUpdated { .. } => "updated",
            AppEvent::ProjectDeleted { .. } => "deleted",
            AppEvent::TaskCreated { .. } => "created",
            AppEvent::TaskUpdated { .. } => "updated",
            AppEvent::TaskDeleted { .. } => "deleted",
            AppEvent::TaskLinked { .. } => "linked",
            AppEvent::TaskUnlinked { .. } => "unlinked",
            AppEvent::MaterialCreated { .. } => "created",
            AppEvent::MaterialUpdated { .. } => "updated",
            AppEvent::MaterialDeleted { .. } => "deleted",
            AppEvent::NoteCreated { .. } => "created",
            AppEvent::NoteUpdated { .. } => "updated",
            AppEvent::NoteDeleted { .. } => "deleted",
            AppEvent::FolderCreated { .. } => "created",
            AppEvent::FolderUpdated { .. } => "updated",
            AppEvent::FolderDeleted { .. } => "deleted",
            AppEvent::FileCreated { .. } => "created",
            AppEvent::FileUpdated { .. } => "updated",
            AppEvent::FileDeleted { .. } => "deleted",
            AppEvent::PropertyDefinitionCreated { .. } => "created",
            AppEvent::PropertyDefinitionUpdated { .. } => "updated",
            AppEvent::PropertyDefinitionDeleted { .. } => "deleted",
            AppEvent::SyncStarted { .. } => "started",
            AppEvent::SyncCompleted { .. } => "completed",
            AppEvent::SettingsUpdated { .. } => "updated",
            AppEvent::EntityCreated { .. } => "created",
            AppEvent::EntityUpdated { .. } => "updated",
            AppEvent::EntityDeleted { .. } => "deleted",
            AppEvent::IngestionStarted { .. } => "started",
            AppEvent::IngestionFeatureAdded { .. } => "feature_added",
            AppEvent::IngestionCompleted { .. } => "completed",
            _ => "unknown",
        }
    }

    pub fn entity_type(&self) -> &str {
        match self {
            AppEvent::ProjectCreated { .. }
            | AppEvent::ProjectUpdated { .. }
            | AppEvent::ProjectDeleted { .. } => "project",
            AppEvent::TaskCreated { .. }
            | AppEvent::TaskUpdated { .. }
            | AppEvent::TaskDeleted { .. }
            | AppEvent::TaskLinked { .. }
            | AppEvent::TaskUnlinked { .. } => "task",
            AppEvent::MaterialCreated { .. }
            | AppEvent::MaterialUpdated { .. }
            | AppEvent::MaterialDeleted { .. } => "material",
            AppEvent::NoteCreated { .. }
            | AppEvent::NoteUpdated { .. }
            | AppEvent::NoteDeleted { .. } => "note",
            AppEvent::FolderCreated { .. }
            | AppEvent::FolderUpdated { .. }
            | AppEvent::FolderDeleted { .. } => "folder",
            AppEvent::FileCreated { .. }
            | AppEvent::FileUpdated { .. }
            | AppEvent::FileDeleted { .. } => "file",
            AppEvent::PropertyDefinitionCreated { .. }
            | AppEvent::PropertyDefinitionUpdated { .. }
            | AppEvent::PropertyDefinitionDeleted { .. } => "property_definition",
            AppEvent::EntityCreated { entity_type, .. } => entity_type,
            AppEvent::EntityUpdated { entity_type, .. } => entity_type,
            AppEvent::EntityDeleted { entity_type, .. } => entity_type,
            AppEvent::IngestionStarted { .. }
            | AppEvent::IngestionFeatureAdded { .. }
            | AppEvent::IngestionCompleted { .. } => "ingestion",
            _ => "other",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub id: Uuid,
    pub entity_id: Uuid,
    pub project_id: Uuid,
    pub entity_type: String,
    pub event: AppEvent,
    pub version: i64,
    pub global_seq: i64,
    pub device_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub metadata: Option<serde_json::Value>,
    pub correlation_id: Option<Uuid>,
    pub causal_id: Option<Uuid>,
    pub schema_version: i32,
}

impl AppEvent {
    pub fn robust_deserialize(val: &str) -> Result<Self, String> {
        serde_json::from_str(val).map_err(|e| e.to_string())
    }
}

impl EventEnvelope {
    pub fn new(
        project_id: Uuid,
        entity_type: &str,
        entity_id: Uuid,
        event: AppEvent,
        device_id: &str,
        metadata: Option<serde_json::Value>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            entity_id,
            project_id,
            entity_type: entity_type.to_string(),
            event,
            version: 1,
            global_seq: 0,
            device_id: device_id.to_string(),
            created_at: chrono::Utc::now(),
            metadata,
            correlation_id: None,
            causal_id: None,
            schema_version: 1,
        }
    }
    pub fn with_version(mut self, v: i64) -> Self {
        self.version = v;
        self
    }
    pub fn with_global_seq(mut self, s: i64) -> Self {
        self.global_seq = s;
        self
    }
}

pub struct Manifest {
    pub format_version: String,
    pub project_id: Uuid,
    pub app_version: String,
    pub features: Vec<String>,
}

pub struct ProjectSettings {
    pub auto_sync: bool,
    pub backup_enabled: bool,
}

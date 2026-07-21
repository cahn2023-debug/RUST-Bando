use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncStatus {
    Idle,
    Syncing,
    Error(String),
}

fn default_json() -> serde_json::Value {
    serde_json::json!({})
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
    // --- Project ---
    ProjectCreated {
        id: Uuid,
        name: String,
        root_path: String,
        #[serde(default = "default_json")]
        metadata: serde_json::Value,
        #[serde(default = "default_json")]
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

    // --- Regions & Layers ---
    RegionCreated {
        id: Uuid,
        name: String,
        parent_id: Option<Uuid>,
        #[serde(default = "default_json")]
        metadata: serde_json::Value,
    },
    RegionUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    RegionDeleted {
        id: Uuid,
    },
    LayerCreated {
        id: Uuid,
        region_id: Option<Uuid>,
        name: String,
        #[serde(default = "default_json")]
        metadata: serde_json::Value,
    },
    LayerUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    LayerDeleted {
        id: Uuid,
    },

    // --- Tasks & Links ---
    TaskCreated {
        id: Uuid,
        name: String,
        parent_id: Option<Uuid>,
        metadata: serde_json::Value,
    },
    TaskUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    TaskDeleted {
        id: Uuid,
    },
    TaskLinked {
        from_id: Uuid,
        to_id: Uuid,
        link_type: String,
        metadata: serde_json::Value,
    },
    TaskUnlinked {
        from_id: Uuid,
        to_id: Uuid,
    },

    // --- GIS Features ---
    FeatureGroupCreated {
        id: Uuid,
        name: String,
        layer_id: Uuid,
        parent_id: Option<Uuid>,
        group_type: Option<String>,
        #[serde(default = "default_json")]
        metadata: serde_json::Value,
    },
    FeatureGroupUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    FeatureGroupDeleted {
        id: Uuid,
    },
    FeatureCreated {
        id: Uuid,
        layer_id: Uuid,
        group_id: Option<Uuid>,
        task_id: Option<Uuid>,
        name: String,
        geom_type: String,
        geometry: serde_json::Value,
        #[serde(default = "default_json")]
        properties: serde_json::Value,
        style_id: Option<Uuid>,
        is_visible: bool,
        note: Option<String>,
        bbox: Option<serde_json::Value>,
        #[serde(default = "default_json")]
        metadata: serde_json::Value,
    },
    FeatureUpdated {
        id: Uuid,
        changes: serde_json::Value,
    },
    FeatureDeleted {
        id: Uuid,
    },
    EquipmentUpserted {
        id: Uuid,
        project_id: Uuid,
        feature_id: Uuid,
        equipment_type: String,
        status: Option<String>,
    },
    FiberCableUpserted {
        id: Uuid,
        project_id: Uuid,
        feature_id: Uuid,
        cable_type: Option<String>,
        fiber_count: Option<i64>,
        owner: Option<String>,
        status: Option<String>,
        source: Option<String>,
    },
    FiberCablePointsMaterialized {
        id: Uuid,
        project_id: Uuid,
        cable_id: Uuid,
        points: Vec<serde_json::Value>,
    },
    FiberStrandsInitialized {
        cable_id: Uuid,
        fiber_count: i64,
        strands: Vec<serde_json::Value>,
    },
    FiberPortUpserted {
        id: Uuid,
        feature_id: Uuid,
        port_label: String,
        port_kind: String,
        direction: Option<String>,
        status: Option<String>,
    },
    FiberPortTerminationUpserted {
        id: Uuid,
        port_id: Uuid,
        strand_id: Uuid,
        strand_direction: String,
        side: String,
        status: Option<String>,
    },
    FiberPortTerminationDeleted {
        id: Uuid,
    },
    FiberPortPatchUpserted {
        id: Uuid,
        from_port_id: Uuid,
        to_port_id: Uuid,
        status: Option<String>,
        loss_db: Option<f64>,
    },
    FiberPortPatchDeleted {
        id: Uuid,
    },
    FiberSpliceUpserted {
        id: Uuid,
        enclosure_feature_id: Uuid,
        from_strand_id: Uuid,
        to_strand_id: Uuid,
        from_direction: String,
        to_direction: String,
        loss_db: Option<f64>,
    },
    FiberSpliceDeleted {
        id: Uuid,
    },
    FiberCircuitUpserted {
        id: Uuid,
        project_id: Uuid,
        name: String,
        service_type: Option<String>,
        status: Option<String>,
        a_feature_id: Uuid,
        z_feature_id: Uuid,
    },
    FiberCircuitDeleted {
        id: Uuid,
    },
    FiberCircuitHopsReplaced {
        circuit_id: Uuid,
        hops: Vec<serde_json::Value>,
    },
    FeatureStyleUpdated {
        id: Uuid,
        style_id: Option<Uuid>,
    },

    // --- Document & File Management ---
    FolderCreated {
        id: Uuid,
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
        id: Uuid,
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

    // --- Business Entities ---
    PersonnelCreated {
        id: Uuid,
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
    RoleCreated {
        id: Uuid,
        name: String,
        metadata: serde_json::Value,
    },
    RoleDeleted {
        id: Uuid,
    },
    PersonnelRoleLinked {
        personnel_id: Uuid,
        role_id: Uuid,
        metadata: serde_json::Value,
    },
    PersonnelRoleUnlinked {
        personnel_id: Uuid,
        role_id: Uuid,
    },
    MaterialCreated {
        id: Uuid,
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
        id: Uuid,
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
    ContractCreated {
        id: Uuid,
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

    // --- CMS & Dynamic Content ---
    ContentTypeCreated {
        id: Uuid,
        name: String,
        metadata: serde_json::Value,
    },
    ContentFieldCreated {
        content_type_id: Uuid,
        name: String,
        field_type: String,
        metadata: serde_json::Value,
    },
    ContentItemUpserted {
        id: Option<Uuid>,
        content_type_id: Uuid,
        name: String,
        data_json: serde_json::Value,
    },
    ContentItemDeleted {
        id: Uuid,
    },

    // --- Notes ---
    NoteCreated {
        id: Uuid,
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

    // --- Design & Properties ---
    DesignStyleCreated {
        id: Uuid,
        name: String,
        config: serde_json::Value,
        metadata: serde_json::Value,
    },
    PropertyDefinitionCreated {
        id: Uuid,
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

    // --- Metadata & Settings ---
    SettingsUpdated {
        changes: serde_json::Value,
    },

    // --- System & Migration ---
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

    // --- Generic / Extensible ---
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
            AppEvent::RegionCreated { .. } => "created",
            AppEvent::RegionUpdated { .. } => "updated",
            AppEvent::RegionDeleted { .. } => "deleted",
            AppEvent::LayerCreated { .. } => "created",
            AppEvent::LayerUpdated { .. } => "updated",
            AppEvent::LayerDeleted { .. } => "deleted",
            AppEvent::FeatureGroupCreated { .. } => "created",
            AppEvent::FeatureGroupUpdated { .. } => "updated",
            AppEvent::FeatureGroupDeleted { .. } => "deleted",
            AppEvent::FeatureCreated { .. } => "created",
            AppEvent::FeatureUpdated { .. } => "updated",
            AppEvent::FeatureDeleted { .. } => "deleted",
            AppEvent::EquipmentUpserted { .. } => "upserted",
            AppEvent::FiberCableUpserted { .. } => "upserted",
            AppEvent::FiberCablePointsMaterialized { .. } => "materialized",
            AppEvent::FiberStrandsInitialized { .. } => "initialized",
            AppEvent::FiberPortUpserted { .. } => "upserted",
            AppEvent::FiberPortTerminationUpserted { .. } => "upserted",
            AppEvent::FiberPortTerminationDeleted { .. } => "deleted",
            AppEvent::FiberPortPatchUpserted { .. } => "upserted",
            AppEvent::FiberPortPatchDeleted { .. } => "deleted",
            AppEvent::FiberSpliceUpserted { .. } => "upserted",
            AppEvent::FiberSpliceDeleted { .. } => "deleted",
            AppEvent::FiberCircuitUpserted { .. } => "upserted",
            AppEvent::FiberCircuitDeleted { .. } => "deleted",
            AppEvent::FiberCircuitHopsReplaced { .. } => "replaced",
            AppEvent::PropertyDefinitionCreated { .. } => "created",
            AppEvent::PropertyDefinitionUpdated { .. } => "updated",
            AppEvent::PropertyDefinitionDeleted { .. } => "deleted",
            AppEvent::ContentItemUpserted { .. } => "upserted",
            AppEvent::ContentItemDeleted { .. } => "deleted",
            AppEvent::SyncStarted { .. } => "started",
            AppEvent::SyncCompleted { .. } => "completed",
            AppEvent::SettingsUpdated { .. } => "updated",
            AppEvent::EntityCreated { .. } => "created",
            AppEvent::EntityUpdated { .. } => "updated",
            AppEvent::EntityDeleted { .. } => "deleted",
            AppEvent::IngestionStarted { .. } => "started",
            AppEvent::IngestionFeatureAdded { .. } => "feature_added",
            AppEvent::IngestionCompleted { .. } => "completed",
            AppEvent::RoleCreated { .. } => "created",
            AppEvent::RoleDeleted { .. } => "deleted",
            AppEvent::PersonnelCreated { .. } => "created",
            AppEvent::PersonnelUpdated { .. } => "updated",
            AppEvent::PersonnelDeleted { .. } => "deleted",
            AppEvent::PersonnelRoleLinked { .. } => "linked",
            AppEvent::PersonnelRoleUnlinked { .. } => "unlinked",
            AppEvent::ContentTypeCreated { .. } => "created",
            AppEvent::ContentFieldCreated { .. } => "created",
            AppEvent::DesignStyleCreated { .. } => "created",
            _ => "unknown",
        }
    }

    pub fn event_type(&self) -> &str {
        match self {
            AppEvent::ProjectCreated { .. } => "ProjectCreated",
            AppEvent::ProjectUpdated { .. } => "ProjectUpdated",
            AppEvent::ProjectMetadataUpdated { .. } => "ProjectMetadataUpdated",
            AppEvent::ProjectDeleted { .. } => "ProjectDeleted",
            AppEvent::RegionCreated { .. } => "RegionCreated",
            AppEvent::RegionUpdated { .. } => "RegionUpdated",
            AppEvent::RegionDeleted { .. } => "RegionDeleted",
            AppEvent::LayerCreated { .. } => "LayerCreated",
            AppEvent::LayerUpdated { .. } => "LayerUpdated",
            AppEvent::LayerDeleted { .. } => "LayerDeleted",
            AppEvent::TaskCreated { .. } => "TaskCreated",
            AppEvent::TaskUpdated { .. } => "TaskUpdated",
            AppEvent::TaskDeleted { .. } => "TaskDeleted",
            AppEvent::TaskLinked { .. } => "TaskLinked",
            AppEvent::TaskUnlinked { .. } => "TaskUnlinked",
            AppEvent::FeatureCreated { .. } => "FeatureCreated",
            AppEvent::FeatureUpdated { .. } => "FeatureUpdated",
            AppEvent::FeatureDeleted { .. } => "FeatureDeleted",
            AppEvent::EquipmentUpserted { .. } => "EquipmentUpserted",
            AppEvent::FiberCableUpserted { .. } => "FiberCableUpserted",
            AppEvent::FiberCablePointsMaterialized { .. } => "FiberCablePointsMaterialized",
            AppEvent::FiberStrandsInitialized { .. } => "FiberStrandsInitialized",
            AppEvent::FiberPortUpserted { .. } => "FiberPortUpserted",
            AppEvent::FiberPortTerminationUpserted { .. } => "FiberPortTerminationUpserted",
            AppEvent::FiberPortTerminationDeleted { .. } => "FiberPortTerminationDeleted",
            AppEvent::FiberPortPatchUpserted { .. } => "FiberPortPatchUpserted",
            AppEvent::FiberPortPatchDeleted { .. } => "FiberPortPatchDeleted",
            AppEvent::FiberSpliceUpserted { .. } => "FiberSpliceUpserted",
            AppEvent::FiberSpliceDeleted { .. } => "FiberSpliceDeleted",
            AppEvent::FiberCircuitUpserted { .. } => "FiberCircuitUpserted",
            AppEvent::FiberCircuitDeleted { .. } => "FiberCircuitDeleted",
            AppEvent::FiberCircuitHopsReplaced { .. } => "FiberCircuitHopsReplaced",
            AppEvent::FeatureGroupCreated { .. } => "FeatureGroupCreated",
            AppEvent::FeatureGroupUpdated { .. } => "FeatureGroupUpdated",
            AppEvent::FeatureGroupDeleted { .. } => "FeatureGroupDeleted",
            AppEvent::FolderCreated { .. } => "FolderCreated",
            AppEvent::FolderUpdated { .. } => "FolderUpdated",
            AppEvent::FolderDeleted { .. } => "FolderDeleted",
            AppEvent::FileCreated { .. } => "FileCreated",
            AppEvent::FileUpdated { .. } => "FileUpdated",
            AppEvent::FileDeleted { .. } => "FileDeleted",
            AppEvent::NoteCreated { .. } => "NoteCreated",
            AppEvent::NoteUpdated { .. } => "NoteUpdated",
            AppEvent::NoteDeleted { .. } => "NoteDeleted",
            AppEvent::PersonnelCreated { .. } => "PersonnelCreated",
            AppEvent::PersonnelUpdated { .. } => "PersonnelUpdated",
            AppEvent::PersonnelDeleted { .. } => "PersonnelDeleted",
            AppEvent::RoleCreated { .. } => "RoleCreated",
            AppEvent::RoleDeleted { .. } => "RoleDeleted",
            AppEvent::MaterialCreated { .. } => "MaterialCreated",
            AppEvent::MaterialUpdated { .. } => "MaterialUpdated",
            AppEvent::MaterialDeleted { .. } => "MaterialDeleted",
            AppEvent::WorkItemCreated { .. } => "WorkItemCreated",
            AppEvent::WorkItemUpdated { .. } => "WorkItemUpdated",
            AppEvent::WorkItemDeleted { .. } => "WorkItemDeleted",
            AppEvent::ContractCreated { .. } => "ContractCreated",
            AppEvent::ContractUpdated { .. } => "ContractUpdated",
            AppEvent::ContractDeleted { .. } => "ContractDeleted",
            AppEvent::SettingsUpdated { .. } => "SettingsUpdated",
            AppEvent::SyncStarted { .. } => "SyncStarted",
            AppEvent::SyncCompleted { .. } => "SyncCompleted",
            AppEvent::EntityCreated { .. } => "EntityCreated",
            AppEvent::EntityUpdated { .. } => "EntityUpdated",
            AppEvent::EntityDeleted { .. } => "EntityDeleted",
            AppEvent::IngestionStarted { .. } => "IngestionStarted",
            AppEvent::IngestionFeatureAdded { .. } => "IngestionFeatureAdded",
            AppEvent::IngestionCompleted { .. } => "IngestionCompleted",
            _ => self.action(),
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
            AppEvent::RegionCreated { .. }
            | AppEvent::RegionUpdated { .. }
            | AppEvent::RegionDeleted { .. } => "region",
            AppEvent::LayerCreated { .. }
            | AppEvent::LayerUpdated { .. }
            | AppEvent::LayerDeleted { .. } => "layer",
            AppEvent::FeatureGroupCreated { .. }
            | AppEvent::FeatureGroupUpdated { .. }
            | AppEvent::FeatureGroupDeleted { .. } => "feature_group",
            AppEvent::FeatureCreated { .. }
            | AppEvent::FeatureUpdated { .. }
            | AppEvent::FeatureDeleted { .. } => "feature",
            AppEvent::EquipmentUpserted { .. } => "equipment",
            AppEvent::FiberCableUpserted { .. }
            | AppEvent::FiberCablePointsMaterialized { .. }
            | AppEvent::FiberStrandsInitialized { .. }
            | AppEvent::FiberPortUpserted { .. }
            | AppEvent::FiberPortTerminationUpserted { .. }
            | AppEvent::FiberPortTerminationDeleted { .. }
            | AppEvent::FiberPortPatchUpserted { .. }
            | AppEvent::FiberPortPatchDeleted { .. }
            | AppEvent::FiberSpliceUpserted { .. }
            | AppEvent::FiberSpliceDeleted { .. }
            | AppEvent::FiberCircuitUpserted { .. }
            | AppEvent::FiberCircuitDeleted { .. }
            | AppEvent::FiberCircuitHopsReplaced { .. } => "fiber",
            AppEvent::SettingsUpdated { .. } => "settings",
            AppEvent::ContentItemUpserted { .. } | AppEvent::ContentItemDeleted { .. } => {
                "content_item"
            }
            AppEvent::PropertyDefinitionCreated { .. }
            | AppEvent::PropertyDefinitionUpdated { .. }
            | AppEvent::PropertyDefinitionDeleted { .. } => "property_definition",
            AppEvent::IngestionStarted { .. }
            | AppEvent::IngestionFeatureAdded { .. }
            | AppEvent::IngestionCompleted { .. } => "ingestion",
            AppEvent::RoleCreated { .. } | AppEvent::RoleDeleted { .. } => "role",
            AppEvent::PersonnelCreated { .. }
            | AppEvent::PersonnelUpdated { .. }
            | AppEvent::PersonnelDeleted { .. } => "personnel",
            AppEvent::PersonnelRoleLinked { .. } | AppEvent::PersonnelRoleUnlinked { .. } => {
                "personnel_role"
            }
            AppEvent::ContentTypeCreated { .. } => "content_type",
            AppEvent::ContentFieldCreated { .. } => "content_field",
            AppEvent::DesignStyleCreated { .. } => "design_style",
            AppEvent::EntityCreated { entity_type, .. } => entity_type,
            AppEvent::EntityUpdated { entity_type, .. } => entity_type,
            AppEvent::EntityDeleted { entity_type, .. } => entity_type,
            _ => "other",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub hash: Option<String>,
}

impl AppEvent {
    fn sanitize_event_value(mut value: serde_json::Value) -> serde_json::Value {
        let Some(obj) = value.as_object_mut() else {
            return value;
        };
        let event_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or_default();

        if event_type == "FeatureCreated" {
            obj.entry("id".to_string())
                .or_insert_with(|| serde_json::Value::String(Uuid::new_v4().to_string()));
            obj.entry("group_id".to_string()).or_insert(serde_json::Value::Null);
            obj.entry("task_id".to_string()).or_insert(serde_json::Value::Null);
            obj.entry("style_id".to_string()).or_insert(serde_json::Value::Null);
            obj.entry("note".to_string()).or_insert(serde_json::Value::Null);
            obj.entry("bbox".to_string()).or_insert(serde_json::Value::Null);
            if obj.get("geometry").map(|v| v.is_null()).unwrap_or(true) {
                obj.insert("geometry".to_string(), serde_json::json!([]));
            }
            if obj.get("properties").map(|v| v.is_null()).unwrap_or(true) {
                obj.insert("properties".to_string(), serde_json::json!({}));
            }
            if obj.get("metadata").map(|v| v.is_null()).unwrap_or(true) {
                obj.insert("metadata".to_string(), serde_json::json!({}));
            }
        }

        value
    }

    pub fn robust_deserialize(val: &str) -> Result<Self, String> {
        let v: serde_json::Value = serde_json::from_str(val).map_err(|e| e.to_string())?;
        Self::from_value_robust(v)
    }

    pub fn from_value_robust(v: serde_json::Value) -> Result<Self, String> {
        // Handle standard wrapper: {"type": "...", "payload": {...}}
        if let Some(payload) = v.get("payload").and_then(|p| p.as_object()) {
            let event_type = v.get("type").cloned();
            let mut new_v = serde_json::Map::new();
            if let Some(t) = event_type {
                new_v.insert("type".to_string(), t);
            }
            for (key, value) in payload {
                new_v.insert(key.clone(), value.clone());
            }
            let sanitized = Self::sanitize_event_value(serde_json::Value::Object(new_v));
            serde_json::from_value(sanitized)
                .map_err(|e| format!("Deserialize from payload wrapper failed: {}", e))
        } else {
            // Handle raw event format
            let sanitized = Self::sanitize_event_value(v);
            serde_json::from_value(sanitized)
                .map_err(|e| format!("Deserialize raw event failed: {}", e))
        }
    }
}

impl EventEnvelope {
    pub fn calculate_hash(&self) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();

        hasher.update(self.id.as_bytes());
        hasher.update(self.project_id.as_bytes());
        hasher.update(self.entity_id.as_bytes());
        hasher.update(self.entity_type.as_bytes());
        hasher.update(self.version.to_le_bytes());
        hasher.update(self.global_seq.to_le_bytes());

        if let Ok(payload) = serde_json::to_string(&self.event) {
            hasher.update(payload.as_bytes());
        }

        format!("{:x}", hasher.finalize())
    }

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
            hash: None,
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_robust_deserialize_user_failure() {
        let json = r#"{"type":"FeatureCreated","layer_id":"7647247a-6242-53b4-b25b-38e9a26f6345","name":"22","geom_type":"Point","geometry":null,"properties":null,"is_visible":true}"#;
        match AppEvent::robust_deserialize(json) {
            Ok(ev) => {
                if let AppEvent::FeatureCreated {
                    geometry,
                    properties,
                    metadata,
                    ..
                } = ev
                {
                    assert!(!geometry.is_null(), "geometry should not be null");
                    assert!(!properties.is_null(), "properties should not be null");
                    assert!(!metadata.is_null(), "metadata should not be null");
                } else {
                    panic!("Expected FeatureCreated");
                }
            }
            Err(e) => panic!("Deserialization failed: {}", e),
        }
    }
}

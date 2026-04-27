use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventPayload<'a> {
    TaskCreated {
        project_id: Uuid,
        parent_id: Option<Uuid>,
        title: String,
        priority: i32,
        status: String,
        color: Option<String>,
        start_date: Option<i64>,
        end_date: Option<i64>,
        created_at: i64,
    },
    FeatureUpdated {
        feature_id: Uuid,
        project_id: Option<Uuid>,
        name: Option<String>,
        layer_id: Option<Uuid>,
        geom_type: Option<String>,
        #[serde(borrow)]
        geometry_wkb: Cow<'a, [u8]>,
    },
    MetadataUpdated {
        key: String,
        value: String,
    },
    ProjectSettingsUpdated {
        project_id: Uuid,
        epsg_code: String,
        units: String,
        center_lat: Option<f64>,
        center_lon: Option<f64>,
        default_zoom: f64,
    },
    AuditLogged {
        project_id: Uuid,
        user_email: Option<String>,
        action_type: String,
        table_name: String,
        record_id: String,
        old_values_json: Option<String>,
        new_values_json: Option<String>,
    },
    CommandUndone {
        target_event_id: Uuid,
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope<'a> {
    pub event_id: Uuid,
    pub entity_id: Uuid,
    pub schema_version: i32,
    pub created_at: i64,
    #[serde(borrow)]
    pub payload: EventPayload<'a>,
}

impl<'a> EventPayload<'a> {
    pub fn into_owned(self) -> EventPayload<'static> {
        match self {
            EventPayload::TaskCreated {
                project_id,
                parent_id,
                title,
                priority,
                status,
                color,
                start_date,
                end_date,
                created_at,
            } => EventPayload::TaskCreated {
                project_id,
                parent_id,
                title,
                priority,
                status,
                color,
                start_date,
                end_date,
                created_at,
            },
            EventPayload::FeatureUpdated {
                feature_id,
                project_id,
                name,
                layer_id,
                geom_type,
                geometry_wkb,
            } => EventPayload::FeatureUpdated {
                feature_id,
                project_id,
                name,
                layer_id,
                geom_type,
                geometry_wkb: Cow::Owned(geometry_wkb.into_owned()),
            },
            EventPayload::MetadataUpdated { key, value } => {
                EventPayload::MetadataUpdated { key, value }
            }
            EventPayload::ProjectSettingsUpdated {
                project_id,
                epsg_code,
                units,
                center_lat,
                center_lon,
                default_zoom,
            } => EventPayload::ProjectSettingsUpdated {
                project_id,
                epsg_code,
                units,
                center_lat,
                center_lon,
                default_zoom,
            },
            EventPayload::AuditLogged {
                project_id,
                user_email,
                action_type,
                table_name,
                record_id,
                old_values_json,
                new_values_json,
            } => EventPayload::AuditLogged {
                project_id,
                user_email,
                action_type,
                table_name,
                record_id,
                old_values_json,
                new_values_json,
            },
            EventPayload::CommandUndone {
                target_event_id,
                reason,
            } => EventPayload::CommandUndone {
                target_event_id,
                reason,
            },
        }
    }
}

impl<'a> EventEnvelope<'a> {
    pub fn into_owned(self) -> EventEnvelope<'static> {
        EventEnvelope {
            event_id: self.event_id,
            entity_id: self.entity_id,
            schema_version: self.schema_version,
            created_at: self.created_at,
            payload: self.payload.into_owned(),
        }
    }
}

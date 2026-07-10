use serde::{Deserialize, Serialize};
pub use shared_kernel::{Point, Color, CameraSpecs, DoriDistances};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum EntityType {
    Line {
        start: Point,
        end: Point,
    },
    Rect {
        top_left: Point,
        width: f32,
        height: f32,
    },
    Circle {
        center: Point,
        radius: f32,
    },
    Text {
        position: Point,
        text: String,
        size: f32,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Entity {
    pub id: String,
    pub entity_type: EntityType,
    pub color: Color,
    pub stroke_width: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MapData {
    pub entities: Vec<Entity>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeltaMapData {
    pub upsert_entities: Vec<Entity>,
    pub delete_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DoriZone {
    pub level: String,
    pub points: Vec<Point>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreetViewMetadata {
    pub status: String,
    #[serde(rename = "pano_id")]
    pub pano_id: Option<String>,
    pub date: Option<String>,
    pub location: Option<serde_json::Value>,
    pub copyright: Option<String>,
}

pub mod interfaces;
pub mod pmp_v2;

pub use interfaces::*;

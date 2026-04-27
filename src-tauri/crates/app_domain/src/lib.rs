use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraSpecs {
    pub resolution_width: f32,  // pixels
    pub resolution_height: f32, // pixels
    pub focal_length: f32,      // mm
    pub sensor_width: f32,      // mm
    pub install_height: f32,    // meters
    pub target_height: f32,     // meters (e.g. 1.7 for human)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoriDistances {
    pub identify: f64,
    pub recognize: f64,
    pub observe: f64,
    pub detect: f64,
    pub hfov: f64, // Added to store calculated HFOV
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

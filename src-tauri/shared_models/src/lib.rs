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

pub mod pmp_v2;

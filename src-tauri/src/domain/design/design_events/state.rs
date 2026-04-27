use crate::design_events::events::DesignEventType;
use crate::design_events::models::{
    FeatureGroupState, FeatureState, LayerState, RegionState, SerializableFeatureState,
};
use crate::design_events::spatial::{SpatialFeature, SpatialSegment};
use crate::geometry::types::{Point as GPoint, Segment as GSegment};
use arc_swap::ArcSwap;
use dashmap::DashMap;
use parking_lot::RwLock;
use rstar::RTree;
// use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::contract::spatial_models::SerializableMapState;

// In-Memory Representation of the Entire Map - Optimized for Performance (0.001ms)
#[derive(Debug)]
pub struct MapState {
    pub regions: DashMap<Arc<str>, RegionState>,
    pub layers: DashMap<Arc<str>, LayerState>,
    pub feature_groups: DashMap<Arc<str>, FeatureGroupState>,
    pub features: DashMap<Arc<str>, FeatureState>,

    pub settings: ArcSwap<serde_json::Value>,

    pub last_event_id: ArcSwap<Option<Arc<str>>>,

    pub spatial_index: RwLock<RTree<SpatialFeature>>,
    pub spatial_map: DashMap<Arc<str>, SpatialFeature>,
    pub road_segments: RwLock<RTree<SpatialSegment>>,
    pub road_map: DashMap<Arc<str>, Vec<SpatialSegment>>,
    pub dirty_ids: DashMap<Arc<str>, bool>, // Use DashMap for thread-safe tracking
}

impl Default for MapState {
    fn default() -> Self {
        Self {
            regions: DashMap::new(),
            layers: DashMap::new(),
            feature_groups: DashMap::new(),
            features: DashMap::new(),
            settings: ArcSwap::from_pointee(serde_json::json!({})),
            last_event_id: ArcSwap::from_pointee(None),
            spatial_index: RwLock::new(RTree::new()),
            spatial_map: DashMap::new(),
            road_segments: RwLock::new(RTree::new()),
            road_map: DashMap::new(),
            dirty_ids: DashMap::new(),
        }
    }
}

impl MapState {
    pub fn to_snapshot(&self) -> SerializableMapState {
        SerializableMapState {
            regions: self
                .regions
                .iter()
                .map(|kv| (kv.key().clone(), kv.value().clone()))
                .collect(),
            layers: self
                .layers
                .iter()
                .map(|kv| (kv.key().clone(), kv.value().clone()))
                .collect(),
            feature_groups: self
                .feature_groups
                .iter()
                .map(|kv| (kv.key().clone(), kv.value().clone()))
                .collect(),
            features: self
                .features
                .iter()
                .map(|kv| {
                    (
                        kv.key().clone(),
                        SerializableFeatureState::from(kv.value().clone()),
                    )
                })
                .collect(),
            settings: (**self.settings.load()).clone(),
            last_event_id: self.last_event_id.load_full().as_ref().clone(),
        }
    }

    pub fn from_snapshot(snap: SerializableMapState) -> Self {
        let state = Self::default();
        for (id, r) in snap.regions {
            state.regions.insert(id, r);
        }
        for (id, l) in snap.layers {
            state.layers.insert(id, l);
        }
        for (id, g) in snap.feature_groups {
            state.feature_groups.insert(id, g);
        }
        for (id, f) in snap.features {
            state.features.insert(id, FeatureState::from(f));
        }

        state.settings.store(Arc::new(snap.settings));
        state.last_event_id.store(Arc::new(snap.last_event_id));

        // Optimized: Single rebuild instead of N updates with N write-locks
        state.rebuild_spatial_index();
        state
    }

    pub fn clear(&self) {
        self.regions.clear();
        self.layers.clear();
        self.feature_groups.clear();
        self.features.clear();
        self.spatial_map.clear();
        self.road_map.clear();
        self.dirty_ids.clear();

        self.settings.store(Arc::new(serde_json::json!({})));
        self.last_event_id.store(Arc::new(None));

        *self.spatial_index.write() = RTree::new();
        *self.road_segments.write() = RTree::new();
    }

    pub fn get_bounds(&self) -> Option<[f64; 4]> {
        let index = self.spatial_index.read();
        if index.size() == 0 {
            return None;
        }
        let env = index.root().envelope();
        let lower = env.lower();
        let upper = env.upper();
        Some([lower[0], lower[1], upper[0], upper[1]])
    }

    pub fn copy_from(&self, other: &Self) {
        self.clear();
        for r in other.regions.iter() {
            self.regions.insert(r.key().clone(), r.value().clone());
        }
        for l in other.layers.iter() {
            self.layers.insert(l.key().clone(), l.value().clone());
        }
        for g in other.feature_groups.iter() {
            self.feature_groups
                .insert(g.key().clone(), g.value().clone());
        }
        for f in other.features.iter() {
            self.features.insert(f.key().clone(), f.value().clone());
        }
        self.settings.store(other.settings.load_full());
        self.last_event_id.store(other.last_event_id.load_full());
        self.rebuild_spatial_index();
    }

    pub fn get_effective_metadata(&self, feature_id: &str) -> serde_json::Value {
        let mut final_meta = self.settings.load().as_ref().clone();

        if let Some(feature) = self.features.get(feature_id) {
            // 1. Inherit from Group if exists
            if let Some(gid) = &feature.group_id {
                if let Some(group) = self.feature_groups.get(gid) {
                    if let Some(group_meta_str) = &group.metadata {
                        if let Ok(group_meta) =
                            serde_json::from_str::<serde_json::Value>(group_meta_str)
                        {
                            merge_json(&mut final_meta, &group_meta);
                        }
                    }
                }
            }

            // 2. Merge Feature's own metadata
            if let Ok(feature_meta) = serde_json::from_str::<serde_json::Value>(&feature.metadata) {
                merge_json(&mut final_meta, &feature_meta);
            }
        }

        final_meta
    }
}

fn merge_json(a: &mut serde_json::Value, b: &serde_json::Value) {
    if let serde_json::Value::Object(b_obj) = b {
        if let serde_json::Value::Object(a_obj) = a {
            for (k, v) in b_obj {
                merge_json(a_obj.entry(k.clone()).or_insert(serde_json::Value::Null), v);
            }
        } else {
            *a = b.clone();
        }
    } else {
        *a = b.clone();
    }
}

impl MapState {
    pub fn apply_event(&self, event: &DesignEventType) {
        self.apply_event_internal(event, true);
    }

    pub fn apply_event_no_index(&self, event: &DesignEventType) {
        self.apply_event_internal(event, false);
    }

    fn apply_event_internal(&self, event: &DesignEventType, update_spatial: bool) {
        match event {
            // Region
            DesignEventType::RegionCreated {
                id,
                parent_id,
                name,
            } => {
                self.regions.insert(
                    id.clone(),
                    RegionState {
                        id: id.clone(),
                        parent_id: parent_id.clone(),
                        name: name.clone(),
                        description: None,
                    },
                );
            }
            DesignEventType::RegionUpdated {
                id,
                name,
                description,
            } => {
                if let Some(mut r) = self.regions.get_mut(id) {
                    r.name = name.clone();
                    if description.is_some() {
                        r.description = description.clone();
                    }
                }
            }
            DesignEventType::RegionDeleted { id } => {
                let layer_ids: Vec<Arc<str>> = self
                    .layers
                    .iter()
                    .filter(|l| l.region_id == *id)
                    .map(|l| l.id.clone())
                    .collect();
                for lid in layer_ids {
                    self.apply_event_internal(
                        &DesignEventType::LayerDeleted { id: lid },
                        update_spatial,
                    );
                }
                self.regions.remove(id);
            }
            DesignEventType::RegionMoved { id, new_parent_id } => {
                if let Some(mut r) = self.regions.get_mut(id) {
                    r.parent_id = new_parent_id.clone();
                }
            }

            // Layer
            DesignEventType::LayerCreated {
                id,
                region_id,
                name,
            } => {
                self.layers.insert(
                    id.clone(),
                    LayerState {
                        id: id.clone(),
                        region_id: region_id.clone(),
                        name: name.clone(),
                        is_visible: true,
                    },
                );
            }
            DesignEventType::LayerUpdated {
                id,
                name,
                is_visible,
            } => {
                if let Some(mut l) = self.layers.get_mut(id) {
                    l.name = name.clone();
                    l.is_visible = *is_visible;
                }
            }
            DesignEventType::LayerDeleted { id } => {
                let group_ids: Vec<Arc<str>> = self
                    .feature_groups
                    .iter()
                    .filter(|g| g.layer_id == *id)
                    .map(|g| g.id.clone())
                    .collect();
                for gid in group_ids {
                    self.apply_event_internal(
                        &DesignEventType::FeatureGroupDeleted { id: gid },
                        update_spatial,
                    );
                }
                self.layers.remove(id);
            }
            DesignEventType::LayerMoved { id, new_region_id } => {
                if let Some(mut l) = self.layers.get_mut(id) {
                    l.region_id = new_region_id.clone();
                }
            }

            // Group
            DesignEventType::FeatureGroupCreated {
                id,
                layer_id,
                parent_id,
                name,
                group_type,
                is_visible,
                metadata,
            } => {
                self.feature_groups.insert(
                    id.clone(),
                    FeatureGroupState {
                        id: id.clone(),
                        layer_id: layer_id.clone(),
                        parent_id: parent_id.clone(),
                        name: name.clone(),
                        r#type: "group".to_string(), // Default fallback
                        group_type: group_type.clone(),
                        is_visible: *is_visible,
                        metadata: metadata.clone(),
                    },
                );
            }
            DesignEventType::FeatureGroupUpdated {
                id,
                name,
                is_visible,
                metadata,
                layer_id,
                parent_id,
            } => {
                if let Some(mut g) = self.feature_groups.get_mut(id) {
                    if let Some(n) = name {
                        g.name = n.clone();
                    }
                    if let Some(v) = is_visible {
                        g.is_visible = *v;
                    }
                    if let Some(lid) = layer_id {
                        g.layer_id = lid.clone();
                    }
                    if let Some(pid_opt) = parent_id {
                        if pid_opt.as_deref() == Some("") {
                            g.parent_id = None;
                        } else {
                            g.parent_id = pid_opt.clone();
                        }
                    }
                    if let Some(m) = metadata {
                        g.metadata = Some(m.clone());
                    }
                }
            }
            DesignEventType::FeatureGroupDeleted { id } => {
                // Cascading delete for sub-groups
                let child_group_ids: Vec<Arc<str>> = self
                    .feature_groups
                    .iter()
                    .filter(|g| g.parent_id.as_ref() == Some(id))
                    .map(|g| g.id.clone())
                    .collect();
                for cgid in child_group_ids {
                    self.apply_event_internal(
                        &DesignEventType::FeatureGroupDeleted { id: cgid },
                        update_spatial,
                    );
                }

                // Cascading delete for features
                let feature_ids: Vec<Arc<str>> = self
                    .features
                    .iter()
                    .filter(|f| f.group_id.as_deref() == Some(id))
                    .map(|f| f.id.clone())
                    .collect();
                for fid in feature_ids {
                    self.apply_event_internal(
                        &DesignEventType::FeatureDeleted { id: fid },
                        update_spatial,
                    );
                }

                self.feature_groups.remove(id);
            }

            // Feature
            DesignEventType::FeatureCreated {
                id,
                layer_id,
                group_id,
                name,
                geom_type,
                is_visible,
                note,
                metadata,
                bbox,
                coordinates,
                properties,
            } => {
                // Determine actual layer_id (support old data missing layer_id)
                let mut final_layer_id = layer_id.clone();
                if final_layer_id.is_empty() {
                    // Try to inherit from group if available
                    if let Some(gid) = group_id {
                        if let Some(group) = self.feature_groups.get(gid) {
                            final_layer_id = group.layer_id.clone();
                        }
                    }

                    // Fallback to the first available layer if still empty
                    if final_layer_id.is_empty() {
                        if let Some(first_layer_ref) = self.layers.iter().next() {
                            final_layer_id = first_layer_ref.key().clone();
                        }
                    }
                }

                let final_coords = coordinates
                    .as_str()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                    .unwrap_or_else(|| coordinates.clone());

                let final_props = properties
                    .as_str()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                    .unwrap_or_else(|| properties.clone());

                self.features.insert(
                    id.clone(),
                    FeatureState {
                        id: id.clone(),
                        layer_id: final_layer_id,
                        group_id: group_id.clone(),
                        name: name.clone(),
                        geom_type: geom_type.clone(),
                        is_visible: *is_visible,
                        note: note.clone(),
                        metadata: metadata.clone(),
                        bbox: bbox.clone(),
                        coordinates: final_coords,
                        properties: final_props,
                        area: None,
                        length: None,
                    },
                );
                if update_spatial {
                    self.update_spatial_index(id);
                }
                self.dirty_ids.insert(id.clone(), true);
            }
            DesignEventType::FeatureUpdated {
                id,
                name,
                geom_type,
                is_visible,
                note,
                metadata,
                bbox,
                coordinates,
                properties,
                layer_id,
                group_id,
            } => {
                if let Some(mut f) = self.features.get_mut(id) {
                    if let Some(n) = name {
                        f.name = n.clone();
                    }
                    if let Some(g) = geom_type {
                        f.geom_type = g.clone();
                    }
                    if let Some(v) = is_visible {
                        f.is_visible = *v;
                    }
                    if let Some(nt) = note {
                        f.note = nt.clone();
                    }
                    if let Some(m) = metadata {
                        f.metadata = m.clone();
                    }
                    if let Some(bb) = bbox {
                        f.bbox = Some(bb.clone());
                    }
                    if let Some(c) = coordinates {
                        f.coordinates = c
                            .as_str()
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                            .unwrap_or_else(|| c.clone());
                    }
                    if let Some(p) = properties {
                        f.properties = p
                            .as_str()
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                            .unwrap_or_else(|| p.clone());
                    }
                    if let Some(lid_val) = layer_id {
                        if let Some(lid_str) = lid_val.as_str() {
                            f.layer_id = lid_str.into();
                        }
                    }
                    if let Some(gid_opt) = group_id {
                        if gid_opt.as_deref() == Some("") {
                            f.group_id = None;
                        } else {
                            f.group_id = gid_opt.clone();
                        }
                    }
                    if update_spatial && (geom_type.is_some() || coordinates.is_some()) {
                        self.update_spatial_index(id);
                    }
                    self.dirty_ids.insert(id.clone(), true);
                }
            }
            DesignEventType::FeatureDeleted { id } => {
                self.features.remove(id);
                if update_spatial {
                    self.remove_from_spatial_index(id);
                }
                self.dirty_ids.insert(id.clone(), true);
            }

            // Global Settings
            DesignEventType::SettingsUpdated { settings } => {
                self.settings.store(Arc::new(settings.clone()));
            }
        }
    }

    pub fn rebuild_spatial_index(&self) {
        let start_time = std::time::Instant::now();

        let mut spatial_vec = Vec::new();
        let mut road_vec = Vec::new();

        // 1. Collect all spatial data in a single pass (CPU intensive, so we do it first)
        for kv in self.features.iter() {
            let f = kv.value();
            if let Some(spatial) = SpatialFeature::from_feature(f) {
                spatial_vec.push(spatial.clone());
                self.spatial_map.insert(kv.key().clone(), spatial);
            }

            if f.is_road() {
                let mut segments = Vec::new();
                let geom_type = f.geom_type.to_lowercase();
                if geom_type == "linestring" || geom_type == "polyline" {
                    if let Some(arr) = f.coordinates.as_array() {
                        self.extract_segments(f.id.clone(), arr, &mut segments);
                    }
                } else if geom_type == "multilinestring" || geom_type == "multipolyline" {
                    if let Some(multi_arr) = f.coordinates.as_array() {
                        for line_arr in multi_arr {
                            if let Some(arr) = line_arr.as_array() {
                                self.extract_segments(f.id.clone(), arr, &mut segments);
                            }
                        }
                    }
                }

                for segment in &segments {
                    road_vec.push(segment.clone());
                }
                self.road_map.insert(f.id.clone(), segments);
            }
        }

        // 2. Clear and bulk load RTrees with a single write lock (Minimize lock duration)
        {
            let mut writer = self.spatial_index.write();
            *writer = RTree::bulk_load(spatial_vec);
        }

        {
            let mut writer = self.road_segments.write();
            *writer = RTree::bulk_load(road_vec);
        }

        if start_time.elapsed().as_millis() > 100 {
            println!(
                "[Performance] rebuild_spatial_index for {} features took {:?}",
                self.features.len(),
                start_time.elapsed()
            );
        }
    }

    pub fn update_spatial_index(&self, feature_id: &str) {
        if let Some((_, old_spatial)) = self.spatial_map.remove(feature_id) {
            self.spatial_index.write().remove(&old_spatial);
        }
        if let Some((_, old_roads)) = self.road_map.remove(feature_id) {
            let mut writer = self.road_segments.write();
            for segment in old_roads {
                writer.remove(&segment);
            }
        }

        if let Some(f) = self.features.get(feature_id) {
            let f_ref = f.value();
            // General Spatial Index
            if let Some(new_spatial) = SpatialFeature::from_feature(f_ref) {
                self.spatial_index.write().insert(new_spatial.clone());
                self.spatial_map.insert(feature_id.into(), new_spatial);
            }

            // Road Specific Index
            if f_ref.is_road() {
                let mut segments = Vec::new();
                let geom_type = f_ref.geom_type.to_lowercase();
                if geom_type == "linestring" || geom_type == "polyline" {
                    if let Some(arr) = f_ref.coordinates.as_array() {
                        self.extract_segments(f_ref.id.clone(), arr, &mut segments);
                    }
                } else if geom_type == "multilinestring" || geom_type == "multipolyline" {
                    if let Some(multi_arr) = f_ref.coordinates.as_array() {
                        for line_arr in multi_arr {
                            if let Some(arr) = line_arr.as_array() {
                                self.extract_segments(f_ref.id.clone(), arr, &mut segments);
                            }
                        }
                    }
                }

                {
                    let mut writer = self.road_segments.write();
                    for segment in &segments {
                        writer.insert(segment.clone());
                    }
                }
                self.road_map.insert(feature_id.into(), segments.clone());
            }
        }
    }

    fn extract_segments(
        &self,
        feature_id: Arc<str>,
        coords: &[serde_json::Value],
        output: &mut Vec<SpatialSegment>,
    ) {
        let points: Vec<GPoint> = coords
            .iter()
            .filter_map(|pj| {
                let a = pj.as_array()?;
                if a.len() >= 2 {
                    Some(GPoint::new(a[0].as_f64()?, a[1].as_f64()?))
                } else {
                    None
                }
            })
            .collect();

        for window in points.windows(2) {
            if window.len() == 2 {
                let seg = GSegment::new(window[0], window[1]);
                output.push(SpatialSegment::new(feature_id.clone(), seg));
            }
        }
    }

    fn remove_from_spatial_index(&self, feature_id: &str) {
        if let Some((_, old_spatial)) = self.spatial_map.remove(feature_id) {
            self.spatial_index.write().remove(&old_spatial);
        }
        if let Some((_, old_roads)) = self.road_map.remove(feature_id) {
            let mut writer = self.road_segments.write();
            for segment in old_roads {
                writer.remove(&segment);
            }
        }
    }

    pub fn rebuild_from_events(events: &[DesignEventType]) -> Self {
        let state = MapState::default();
        for ev in events {
            state.apply_event(ev);
        }
        state.dirty_ids.clear();
        state
    }

    pub fn to_map_data(&self) -> shared_models::MapData {
        let mut entities = Vec::new();
        for feature in self.features.iter() {
            entities.extend(self.feature_to_entities(feature.value()));
        }
        shared_models::MapData { entities }
    }

    pub fn to_delta_map_data(&self) -> shared_models::DeltaMapData {
        let mut upsert_entities = Vec::new();
        let mut delete_ids = Vec::new();

        let dirty_keys: Vec<Arc<str>> = self.dirty_ids.iter().map(|kv| kv.key().clone()).collect();
        for feature_id in dirty_keys {
            self.dirty_ids.remove(&feature_id);
            if let Some(feature) = self.features.get(&feature_id) {
                upsert_entities.extend(self.feature_to_entities(feature.value()));
            } else {
                delete_ids.push(feature_id.to_string());
            }
        }

        shared_models::DeltaMapData {
            upsert_entities,
            delete_ids,
        }
    }

    fn feature_to_entities(&self, feature: &FeatureState) -> Vec<shared_models::Entity> {
        use shared_models::{Color, Entity, EntityType, Point};
        let mut entities = Vec::new();
        let geom_type = feature.geom_type.to_lowercase();
        let coords = &feature.coordinates;

        if geom_type == "point" {
            if let Some(arr) = coords.as_array() {
                if arr.len() >= 2 {
                    let x = arr[0].as_f64().unwrap_or(0.0) as f32;
                    let y = arr[1].as_f64().unwrap_or(0.0) as f32;
                    entities.push(Entity {
                        id: feature.id.to_string(),
                        entity_type: EntityType::Circle {
                            center: Point { x, y },
                            radius: 2.0,
                        },
                        color: Color {
                            r: 1.0,
                            g: 1.0,
                            b: 0.0,
                            a: 1.0,
                        },
                        stroke_width: 1.0,
                    });
                }
            }
        } else if geom_type == "linestring" || geom_type == "polyline" {
            if let Some(arr) = coords.as_array() {
                for i in 0..arr.len().saturating_sub(1) {
                    let p1 = &arr[i];
                    let p2 = &arr[i + 1];
                    if let (Some(c1), Some(c2)) = (p1.as_array(), p2.as_array()) {
                        if c1.len() >= 2 && c2.len() >= 2 {
                            entities.push(Entity {
                                id: format!("{}_seg_{}", feature.id, i),
                                entity_type: EntityType::Line {
                                    start: Point {
                                        x: c1[0].as_f64().unwrap_or(0.0) as f32,
                                        y: c1[1].as_f64().unwrap_or(0.0) as f32,
                                    },
                                    end: Point {
                                        x: c2[0].as_f64().unwrap_or(0.0) as f32,
                                        y: c2[1].as_f64().unwrap_or(0.0) as f32,
                                    },
                                },
                                color: Color {
                                    r: 0.0,
                                    g: 1.0,
                                    b: 1.0,
                                    a: 1.0,
                                },
                                stroke_width: 1.0,
                            });
                        }
                    }
                }
            }
        } else if geom_type == "rect" {
            if let Some(obj) = coords.as_object() {
                let x = obj.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let y = obj.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let width = obj.get("width").and_then(|v| v.as_f64()).unwrap_or(10.0) as f32;
                let height = obj.get("height").and_then(|v| v.as_f64()).unwrap_or(10.0) as f32;

                entities.push(Entity {
                    id: feature.id.to_string(),
                    entity_type: EntityType::Rect {
                        top_left: Point { x, y },
                        width,
                        height,
                    },
                    color: Color {
                        r: 0.0,
                        g: 1.0,
                        b: 0.0,
                        a: 1.0,
                    },
                    stroke_width: 1.0,
                });
            }
        }
        entities
    }
}

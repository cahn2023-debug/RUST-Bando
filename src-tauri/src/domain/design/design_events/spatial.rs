use crate::design_events::models::FeatureState;
use crate::geometry::types::{Point as GPoint, Segment as GSegment};
use rstar::{PointDistance, RTreeObject, AABB};
use std::sync::Arc;

/// A wrapper for FeatureState to be used in the R-Tree spatial index.
#[derive(Debug, Clone)]
pub struct SpatialFeature {
    pub id: Arc<str>,
    pub envelope: AABB<[f64; 2]>,
}

impl RTreeObject for SpatialFeature {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

impl PartialEq for SpatialFeature {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl SpatialFeature {
    pub fn from_feature(feature: &FeatureState) -> Option<Self> {
        let epsilon = 1e-9;

        // 1. Try pre-calculated BBox (Optimization)
        if let Some(bbox) = &feature.bbox {
            return Some(Self {
                id: feature.id.clone(),
                envelope: AABB::from_corners(
                    [bbox.min_x - epsilon, bbox.min_y - epsilon],
                    [bbox.max_x + epsilon, bbox.max_y + epsilon],
                ),
            });
        }

        let coords = &feature.coordinates;
        let geom_type = feature.geom_type.to_lowercase();

        // 2. Fallback to geometry matching
        if geom_type == "point" {
            if let Some(arr) = coords.as_array() {
                if arr.len() >= 2 {
                    let x = arr[0].as_f64()?;
                    let y = arr[1].as_f64()?;
                    return Some(Self {
                        id: feature.id.clone(),
                        envelope: AABB::from_corners(
                            [x - epsilon, y - epsilon],
                            [x + epsilon, y + epsilon],
                        ),
                    });
                }
            }
        } else if geom_type == "linestring" || geom_type == "polyline" {
            if let Some(arr) = coords.as_array() {
                let mut min_x = f64::MAX;
                let mut max_x = f64::MIN;
                let mut min_y = f64::MAX;
                let mut max_y = f64::MIN;
                let mut count = 0;
                for p in arr {
                    if let Some(c) = p.as_array() {
                        if c.len() >= 2 {
                            let x = c[0].as_f64()?;
                            let y = c[1].as_f64()?;
                            min_x = min_x.min(x);
                            max_x = max_x.max(x);
                            min_y = min_y.min(y);
                            max_y = max_y.max(y);
                            count += 1;
                        }
                    }
                }
                if count > 0 {
                    return Some(Self {
                        id: feature.id.clone(),
                        envelope: AABB::from_corners(
                            [min_x - epsilon, min_y - epsilon],
                            [max_x + epsilon, max_y + epsilon],
                        ),
                    });
                }
            }
        } else if geom_type == "polygon" {
            if let Some(rings) = coords.as_array() {
                let mut min_x = f64::MAX;
                let mut max_x = f64::MIN;
                let mut min_y = f64::MAX;
                let mut max_y = f64::MIN;
                let mut count = 0;
                for ring in rings {
                    if let Some(arr) = ring.as_array() {
                        for p in arr {
                            if let Some(c) = p.as_array() {
                                if c.len() >= 2 {
                                    let x = c[0].as_f64()?;
                                    let y = c[1].as_f64()?;
                                    min_x = min_x.min(x);
                                    max_x = max_x.max(x);
                                    min_y = min_y.min(y);
                                    max_y = max_y.max(y);
                                    count += 1;
                                }
                            }
                        }
                    }
                }
                if count > 0 {
                    return Some(Self {
                        id: feature.id.clone(),
                        envelope: AABB::from_corners([min_x, min_y], [max_x, max_y]),
                    });
                }
            }
        } else if geom_type == "rect" {
            if let Some(obj) = coords.as_object() {
                let x = obj.get("x")?.as_f64()?;
                let y = obj.get("y")?.as_f64()?;
                let width = obj.get("width")?.as_f64()?;
                let height = obj.get("height")?.as_f64()?;
                return Some(Self {
                    id: feature.id.clone(),
                    envelope: AABB::from_corners([x, y], [x + width, y + height]),
                });
            }
        }

        // 2. Inference: If geom_type is custom (e.g., "Camera"), detect from coordinates array structure
        if let Some(arr) = coords.as_array() {
            if arr.len() == 2 && arr[0].is_number() && arr[1].is_number() {
                // Looks like a point [lng, lat]
                let x = arr[0].as_f64()?;
                let y = arr[1].as_f64()?;
                return Some(Self {
                    id: feature.id.clone(),
                    envelope: AABB::from_corners(
                        [x - epsilon, y - epsilon],
                        [x + epsilon, y + epsilon],
                    ),
                });
            } else if !arr.is_empty() && arr[0].is_array() {
                // Looks like a polyline or polygon [[lng, lat], ...] or [[[lng, lat], ...]]
                // For spatial indexing envelope, we can just flatten and find min/max
                let mut min_x = f64::MAX;
                let mut max_x = f64::MIN;
                let mut min_y = f64::MAX;
                let mut max_y = f64::MIN;
                let mut found = false;

                fn find_bounds(
                    val: &serde_json::Value,
                    min_x: &mut f64,
                    max_x: &mut f64,
                    min_y: &mut f64,
                    max_y: &mut f64,
                    found: &mut bool,
                ) {
                    if let Some(arr) = val.as_array() {
                        if arr.len() >= 2 && arr[0].is_number() && arr[1].is_number() {
                            let x = arr[0].as_f64().unwrap_or(0.0);
                            let y = arr[1].as_f64().unwrap_or(0.0);
                            *min_x = min_x.min(x);
                            *max_x = max_x.max(x);
                            *min_y = min_y.min(y);
                            *max_y = max_y.max(y);
                            *found = true;
                        } else {
                            for item in arr {
                                find_bounds(item, min_x, max_x, min_y, max_y, found);
                            }
                        }
                    }
                }

                find_bounds(
                    coords, &mut min_x, &mut max_x, &mut min_y, &mut max_y, &mut found,
                );

                if found {
                    return Some(Self {
                        id: feature.id.clone(),
                        envelope: AABB::from_corners(
                            [min_x - epsilon, min_y - epsilon],
                            [max_x + epsilon, max_y + epsilon],
                        ),
                    });
                }
            }
        }

        None
    }
}

/// A wrapper for LineString segments to be used in a separate R-Tree.
#[derive(Debug, Clone, PartialEq)]
pub struct SpatialSegment {
    pub feature_id: Arc<str>,
    pub segment: GSegment,
    pub envelope: AABB<[f64; 2]>,
}

impl RTreeObject for SpatialSegment {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        self.envelope
    }
}

impl PointDistance for SpatialSegment {
    fn distance_2(&self, point: &[f64; 2]) -> f64 {
        let p = GPoint::new(point[0], point[1]);
        // Use existing distance logic
        let d = crate::geometry::snapping::point_segment_distance(p, self.segment);
        d * d
    }
}

impl SpatialSegment {
    pub fn new(feature_id: Arc<str>, segment: GSegment) -> Self {
        let min_x = segment.start.x.min(segment.end.x);
        let max_x = segment.start.x.max(segment.end.x);
        let min_y = segment.start.y.min(segment.end.y);
        let max_y = segment.start.y.max(segment.end.y);

        let epsilon = 1e-9;
        Self {
            feature_id,
            segment,
            envelope: AABB::from_corners(
                [min_x - epsilon, min_y - epsilon],
                [max_x + epsilon, max_y + epsilon],
            ),
        }
    }
}
